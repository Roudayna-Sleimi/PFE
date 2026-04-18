import csv
import json
import os
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# --- Environment ---
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

DATASET_PATH = os.getenv("DATASET_PATH", "data/lstm_dataset.csv")
RULES_PATH = os.getenv("RULES_PATH", "models/maintenance_rules.json")

THRESHOLD_CURRENT_WARNING = float(os.getenv("THRESHOLD_CURRENT_WARNING", "15"))
THRESHOLD_CURRENT_CRITICAL = float(os.getenv("THRESHOLD_CURRENT_CRITICAL", "20"))
THRESHOLD_VIB_WARNING = float(os.getenv("THRESHOLD_VIB_WARNING", "2"))
THRESHOLD_VIB_CRITICAL = float(os.getenv("THRESHOLD_VIB_CRITICAL", "3"))
THRESHOLD_PRESSURE_WARNING_LOW = float(os.getenv("THRESHOLD_PRESSURE_WARNING_LOW", "4.5"))
THRESHOLD_PRESSURE_WARNING_HIGH = float(os.getenv("THRESHOLD_PRESSURE_WARNING_HIGH", "10"))
THRESHOLD_PRESSURE_CRITICAL_LOW = float(os.getenv("THRESHOLD_PRESSURE_CRITICAL_LOW", "3.5"))
THRESHOLD_PRESSURE_CRITICAL_HIGH = float(os.getenv("THRESHOLD_PRESSURE_CRITICAL_HIGH", "11"))
BASELINE_MIN_POINTS = int(os.getenv("BASELINE_MIN_POINTS", "20"))
WARNING_ZSCORE = float(os.getenv("WARNING_ZSCORE", "3.0"))
CRITICAL_ZSCORE = float(os.getenv("CRITICAL_ZSCORE", "4.0"))

FEATURES = ["vibX", "vibY", "vibZ", "courant", "rpm"]
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


def normalize_label(value: str) -> str | None:
    label = str(value or "").strip().lower()
    return label if label in LABEL_ORDER else None


def strongest(*labels: str) -> str:
    return max(labels, key=lambda label: LABEL_ORDER[label])


# --- Labeling ---
def threshold_label(row: dict) -> str:
    vib_x = to_float(row.get("vibX"))
    vib_y = to_float(row.get("vibY"))
    vib_z = to_float(row.get("vibZ"))
    courant = to_float(row.get("courant"))
    pression_raw = row.get("pression")
    pression = to_float(pression_raw, None) if pression_raw not in (None, "") else None

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


def row_machine_id(row: dict) -> str:
    return str(row.get("machine_id") or row.get("machineId") or row.get("node") or "UNKNOWN")


def pick_label(row: dict) -> str:
    manual = (
        normalize_label(row.get("label"))
        or normalize_label(row.get("aiLabel"))
        or normalize_label(row.get("maintenanceLabel"))
    )
    return manual or threshold_label(row)


# --- Dataset loading ---
def read_dataset(path: Path) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")

    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)

    if not rows:
        raise RuntimeError("Dataset is empty. Build dataset first.")
    return rows


# --- Baseline stats ---
def compute_baselines(rows: list[dict]) -> dict:
    values_by_machine: dict[str, dict[str, list[float]]] = defaultdict(
        lambda: {feature: [] for feature in FEATURES}
    )

    label_counts = {"normal": 0, "warning": 0, "critical": 0}
    for row in rows:
        label = pick_label(row)
        label_counts[label] += 1

        if label != "normal":
            continue

        machine_id = row_machine_id(row)
        for feature in FEATURES:
            values_by_machine[machine_id][feature].append(to_float(row.get(feature)))

    baselines = {}
    for machine_id, feature_map in values_by_machine.items():
        machine_stats = {}
        for feature, samples in feature_map.items():
            count = len(samples)
            if count == 0:
                continue
            mean = sum(samples) / count
            variance = sum((value - mean) ** 2 for value in samples) / count
            std = variance ** 0.5
            machine_stats[feature] = {
                "count": count,
                "mean": round(mean, 6),
                "std": round(std, 6),
                "min": round(min(samples), 6),
                "max": round(max(samples), 6),
            }
        if machine_stats:
            baselines[machine_id] = machine_stats

    return {"baselines": baselines, "label_counts": label_counts}


# --- Output file ---
def build_rules_payload(stats: dict, dataset_path: Path) -> dict:
    return {
        "version": "simple-rules-v1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset_path": str(dataset_path),
        "features": FEATURES,
        "thresholds": {
            "current_warning": THRESHOLD_CURRENT_WARNING,
            "current_critical": THRESHOLD_CURRENT_CRITICAL,
            "vibration_warning": THRESHOLD_VIB_WARNING,
            "vibration_critical": THRESHOLD_VIB_CRITICAL,
            "pressure_warning_low": THRESHOLD_PRESSURE_WARNING_LOW,
            "pressure_warning_high": THRESHOLD_PRESSURE_WARNING_HIGH,
            "pressure_critical_low": THRESHOLD_PRESSURE_CRITICAL_LOW,
            "pressure_critical_high": THRESHOLD_PRESSURE_CRITICAL_HIGH,
            "baseline_min_points": BASELINE_MIN_POINTS,
            "warning_zscore": WARNING_ZSCORE,
            "critical_zscore": CRITICAL_ZSCORE,
        },
        "label_counts": stats["label_counts"],
        "machine_baselines": stats["baselines"],
    }


# --- Main ---
def main() -> None:
    dataset_path = resolve_path(DATASET_PATH)
    rules_path = resolve_path(RULES_PATH)
    rules_path.parent.mkdir(parents=True, exist_ok=True)

    rows = read_dataset(dataset_path)
    stats = compute_baselines(rows)
    payload = build_rules_payload(stats, dataset_path)

    rules_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    machine_count = len(payload["machine_baselines"])
    print("[rules] Build complete.")
    print(f"[rules] Dataset: {dataset_path} ({len(rows)} rows)")
    print(f"[rules] Baselines: {machine_count} machine(s)")
    print(f"[rules] Output: {rules_path}")
    print(f"[rules] Label counts: {payload['label_counts']}")


if __name__ == "__main__":
    main()
