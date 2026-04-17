import csv
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

# --- Environment ---
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/cncpulse")
DB_NAME = os.getenv("MONGO_DB_NAME", "cncpulse")
OUTPUT_PATH = os.getenv("OUTPUT_DATASET_PATH") or os.getenv("DATASET_PATH", "data/lstm_dataset.csv")

THRESHOLD_CURRENT_WARNING = float(os.getenv("THRESHOLD_CURRENT_WARNING", "15"))
THRESHOLD_CURRENT_CRITICAL = float(os.getenv("THRESHOLD_CURRENT_CRITICAL", "20"))
THRESHOLD_VIB_WARNING = float(os.getenv("THRESHOLD_VIB_WARNING", "2"))
THRESHOLD_VIB_CRITICAL = float(os.getenv("THRESHOLD_VIB_CRITICAL", "3"))
THRESHOLD_PRESSURE_WARNING_LOW = float(os.getenv("THRESHOLD_PRESSURE_WARNING_LOW", "4.5"))
THRESHOLD_PRESSURE_WARNING_HIGH = float(os.getenv("THRESHOLD_PRESSURE_WARNING_HIGH", "10"))
THRESHOLD_PRESSURE_CRITICAL_LOW = float(os.getenv("THRESHOLD_PRESSURE_CRITICAL_LOW", "3.5"))
THRESHOLD_PRESSURE_CRITICAL_HIGH = float(os.getenv("THRESHOLD_PRESSURE_CRITICAL_HIGH", "11"))

LABEL_ORDER = {"normal": 0, "warning": 1, "critical": 2}


# --- Helpers ---
def resolve_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else BASE_DIR / path


def to_float(value, default=0.0) -> float:
    try:
        if value is None or value == "":
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


def normalize_label(value: str) -> str | None:
    label = str(value or "").strip().lower()
    return label if label in LABEL_ORDER else None


def strongest(*labels: str) -> str:
    return max(labels, key=lambda label: LABEL_ORDER[label])


# --- Labeling ---
def threshold_label(vib_x: float, vib_y: float, vib_z: float, courant: float, pression) -> str:
    max_vib = max(abs(vib_x), abs(vib_y), abs(vib_z))
    label = "normal"

    if courant >= THRESHOLD_CURRENT_CRITICAL or max_vib >= THRESHOLD_VIB_CRITICAL:
        label = "critical"
    elif courant >= THRESHOLD_CURRENT_WARNING or max_vib >= THRESHOLD_VIB_WARNING:
        label = "warning"

    if pression is not None:
        if pression <= THRESHOLD_PRESSURE_CRITICAL_LOW or pression >= THRESHOLD_PRESSURE_CRITICAL_HIGH:
            label = strongest(label, "critical")
        elif pression <= THRESHOLD_PRESSURE_WARNING_LOW or pression >= THRESHOLD_PRESSURE_WARNING_HIGH:
            label = strongest(label, "warning")

    return label


# --- Main ---
def main() -> None:
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    sensors = list(db.sensordatas.find({}))
    if not sensors:
        raise RuntimeError("No sensor data found in MongoDB collection sensordatas.")

    sensors.sort(
        key=lambda item: (
            str(item.get("machineId") or item.get("node") or "UNKNOWN"),
            item.get("createdAt") if isinstance(item.get("createdAt"), datetime) else datetime.min,
        )
    )

    output_path = resolve_path(OUTPUT_PATH)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = [
        "timestamp",
        "machine_id",
        "node",
        "vibX",
        "vibY",
        "vibZ",
        "courant",
        "rpm",
        "pression",
        "label",
        "label_source",
    ]

    label_counts = {"normal": 0, "warning": 0, "critical": 0}
    label_source_counts = {"manual": 0, "threshold": 0}
    machine_ids = set()

    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()

        for item in sensors:
            machine_id = str(item.get("machineId") or item.get("node") or "UNKNOWN")
            node = str(item.get("node") or machine_id)
            machine_ids.add(machine_id)

            vib_x = to_float(item.get("vibX"))
            vib_y = to_float(item.get("vibY"))
            vib_z = to_float(item.get("vibZ"))
            courant = to_float(item.get("courant"))
            rpm = to_float(item.get("rpm"))
            pression = to_float(item.get("pression"), None) if item.get("pression") is not None else None

            manual = (
                normalize_label(item.get("label"))
                or normalize_label(item.get("aiLabel"))
                or normalize_label(item.get("maintenanceLabel"))
            )
            label = manual or threshold_label(vib_x, vib_y, vib_z, courant, pression)
            source = "manual" if manual else "threshold"

            writer.writerow(
                {
                    "timestamp": normalize_timestamp(item.get("createdAt")),
                    "machine_id": machine_id,
                    "node": node,
                    "vibX": vib_x,
                    "vibY": vib_y,
                    "vibZ": vib_z,
                    "courant": courant,
                    "rpm": rpm,
                    "pression": "" if pression is None else pression,
                    "label": label,
                    "label_source": source,
                }
            )

            label_counts[label] = label_counts.get(label, 0) + 1
            label_source_counts[source] = label_source_counts.get(source, 0) + 1

    metadata = {
        "rows": len(sensors),
        "machines": len(machine_ids),
        "labels": label_counts,
        "label_sources": label_source_counts,
        "source_collection": "sensordatas",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "thresholds": {
            "current_warning": THRESHOLD_CURRENT_WARNING,
            "current_critical": THRESHOLD_CURRENT_CRITICAL,
            "vibration_warning": THRESHOLD_VIB_WARNING,
            "vibration_critical": THRESHOLD_VIB_CRITICAL,
            "pressure_warning_low": THRESHOLD_PRESSURE_WARNING_LOW,
            "pressure_warning_high": THRESHOLD_PRESSURE_WARNING_HIGH,
            "pressure_critical_low": THRESHOLD_PRESSURE_CRITICAL_LOW,
            "pressure_critical_high": THRESHOLD_PRESSURE_CRITICAL_HIGH,
        },
    }

    metadata_path = output_path.with_suffix(".metadata.json")
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    print(f"Dataset saved: {output_path}")
    print(f"Metadata saved: {metadata_path}")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
