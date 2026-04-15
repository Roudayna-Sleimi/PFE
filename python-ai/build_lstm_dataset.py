import json
import os
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from pymongo import MongoClient

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/cncpulse")
DB_NAME = os.getenv("MONGO_DB_NAME", "cncpulse")
OUTPUT_PATH = os.getenv("OUTPUT_DATASET_PATH") or os.getenv("DATASET_PATH", "data/lstm_dataset.csv")

BASELINE_WINDOW = int(os.getenv("BASELINE_WINDOW", "80"))
BASELINE_MIN_POINTS = int(os.getenv("BASELINE_MIN_POINTS", "20"))
WARNING_ZSCORE = float(os.getenv("WARNING_ZSCORE", "3.0"))
CRITICAL_ZSCORE = float(os.getenv("CRITICAL_ZSCORE", "4.0"))

FEATURES = ["vibX", "vibY", "vibZ", "courant", "rpm"]
LABEL_RANK = {"normal": 0, "warning": 1, "critical": 2}


def resolve_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else BASE_DIR / path


def to_float(value, default=0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def normalize_timestamp(value) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()
    return datetime.now(timezone.utc).isoformat()


def sanitize_label(value):
    label = str(value or "").strip().lower()
    return label if label in LABEL_RANK else None


def strongest(*labels: str) -> str:
    return max(labels, key=lambda label: LABEL_RANK[label])


def threshold_label(values: dict) -> str:
    max_vib = max(abs(values["vibX"]), abs(values["vibY"]), abs(values["vibZ"]))
    courant = values["courant"]
    pression = values.get("pression")

    label = "normal"
    if courant > 20 or max_vib > 3:
        label = "critical"
    elif courant > 15 or max_vib > 2:
        label = "warning"

    if pression is not None:
        if pression > 11 or pression < 3.5:
            label = strongest(label, "critical")
        elif pression > 10 or pression < 4.5:
            label = strongest(label, "warning")

    return label


def baseline_label(values: dict, history: dict) -> str:
    if not history["courant"] or len(history["courant"]) < BASELINE_MIN_POINTS:
        return "normal"

    label = "normal"
    for feature in FEATURES:
        samples = list(history[feature])
        if len(samples) < BASELINE_MIN_POINTS:
            continue
        mean = sum(samples) / len(samples)
        variance = sum((sample - mean) ** 2 for sample in samples) / len(samples)
        std = variance ** 0.5
        if std < 0.0001:
            continue

        zscore = abs((values[feature] - mean) / std)
        if zscore >= CRITICAL_ZSCORE:
            label = strongest(label, "critical")
        elif zscore >= WARNING_ZSCORE:
            label = strongest(label, "warning")

    return label


def auto_label(values: dict, history: dict) -> tuple[str, str]:
    threshold = threshold_label(values)
    baseline = baseline_label(values, history)
    label = strongest(threshold, baseline)
    source = "baseline" if LABEL_RANK[baseline] > LABEL_RANK[threshold] else "threshold"
    return label, source


def update_history(history: dict, values: dict, label: str) -> None:
    # Keep the baseline close to normal behavior; early rows are still used so
    # a machine can build its first reference window.
    if label != "normal" and len(history["courant"]) >= BASELINE_MIN_POINTS:
        return
    for feature in FEATURES:
        history[feature].append(values[feature])


def main():
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    sensors = list(db.sensordatas.find({}))
    if not sensors:
        raise RuntimeError("No sensor data found in MongoDB collection sensordatas.")

    sensors.sort(key=lambda item: (
        str(item.get("machineId") or item.get("node") or "UNKNOWN"),
        item.get("createdAt") if isinstance(item.get("createdAt"), datetime) else datetime.min,
    ))

    history_by_machine = defaultdict(lambda: {feature: deque(maxlen=BASELINE_WINDOW) for feature in FEATURES})
    rows = []

    for item in sensors:
        machine_id = str(item.get("machineId") or item.get("node") or "UNKNOWN")
        values = {
            "vibX": to_float(item.get("vibX")),
            "vibY": to_float(item.get("vibY")),
            "vibZ": to_float(item.get("vibZ")),
            "courant": to_float(item.get("courant")),
            "rpm": to_float(item.get("rpm")),
            "pression": to_float(item.get("pression"), None) if item.get("pression") is not None else None,
        }

        manual_label = sanitize_label(item.get("label") or item.get("aiLabel") or item.get("maintenanceLabel"))
        if manual_label:
            label, label_source = manual_label, "manual"
        else:
            label, label_source = auto_label(values, history_by_machine[machine_id])

        vibration = (values["vibX"] ** 2 + values["vibY"] ** 2 + values["vibZ"] ** 2) ** 0.5
        rows.append({
            "timestamp": normalize_timestamp(item.get("createdAt")),
            "machine_id": machine_id,
            "node": item.get("node") or machine_id,
            "vibX": values["vibX"],
            "vibY": values["vibY"],
            "vibZ": values["vibZ"],
            "vibration": round(vibration, 6),
            "courant": values["courant"],
            "rpm": values["rpm"],
            "pression": values["pression"],
            "label": label,
            "label_source": label_source,
        })
        update_history(history_by_machine[machine_id], values, label)

    df = pd.DataFrame(rows)
    output_path = resolve_path(OUTPUT_PATH)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)

    summary = {
        "rows": int(len(df)),
        "machines": int(df["machine_id"].nunique()),
        "labels": df["label"].value_counts().to_dict(),
        "label_sources": df["label_source"].value_counts().to_dict(),
        "features": FEATURES,
        "source_collection": "sensordatas",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    metadata_path = output_path.with_suffix(".metadata.json")
    metadata_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"Dataset saved: {output_path} ({len(df)} rows)")
    print(f"Metadata saved: {metadata_path}")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
