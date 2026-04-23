"""
Titre: Construction Dataset Maintenance
Explication: Ce module extrait les mesures capteurs depuis MongoDB, applique un etiquetage simple et produit le CSV d'apprentissage.
Utilite: Il separe clairement la preparation des donnees de l'entrainement du modele.
"""

from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path

from app.db.mongo import get_database
from app.shared.config import AppSettings, LABEL_TO_INDEX, load_settings, parse_utc_timestamp, to_float


def _timestamp_to_iso(value) -> str:
    parsed = parse_utc_timestamp(value)
    return parsed.astimezone(timezone.utc).isoformat()


def _safe_machine_id(item: dict) -> str:
    return str(item.get("machineId") or item.get("node") or "UNKNOWN")


def normalize_label(value: str) -> str | None:
    label = str(value or "").strip().lower()
    return label if label in LABEL_TO_INDEX else None


def strongest_label(*labels: str) -> str:
    return max(labels, key=lambda item: LABEL_TO_INDEX[item])


def threshold_label(
    vib_x: float,
    vib_y: float,
    vib_z: float,
    courant: float,
    pression: float | None,
    settings: AppSettings,
) -> str:
    thresholds = settings.thresholds
    max_vibration = max(abs(vib_x), abs(vib_y), abs(vib_z))
    label = "normal"

    if courant >= thresholds.current_critical or max_vibration >= thresholds.vibration_critical:
        label = "critical"
    elif courant >= thresholds.current_warning or max_vibration >= thresholds.vibration_warning:
        label = "warning"

    if pression is not None:
        if pression <= thresholds.pressure_critical_low or pression >= thresholds.pressure_critical_high:
            label = strongest_label(label, "critical")
        elif pression <= thresholds.pressure_warning_low or pression >= thresholds.pressure_warning_high:
            label = strongest_label(label, "warning")

    return label


def build_dataset(settings: AppSettings | None = None) -> tuple[Path, Path, dict]:
    config = settings or load_settings()
    db = get_database(config)

    sensors = list(db.sensordatas.find({}))
    if not sensors:
        raise RuntimeError("No sensor data found in MongoDB collection sensordatas.")

    sensors.sort(
        key=lambda item: (
            _safe_machine_id(item),
            item.get("createdAt") if isinstance(item.get("createdAt"), datetime) else datetime.min,
        )
    )

    output_path = config.paths.output_dataset_path
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
            machine_id = _safe_machine_id(item)
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
            label = manual or threshold_label(
                vib_x=vib_x,
                vib_y=vib_y,
                vib_z=vib_z,
                courant=courant,
                pression=pression,
                settings=config,
            )
            source = "manual" if manual else "threshold"

            writer.writerow(
                {
                    "timestamp": _timestamp_to_iso(item.get("createdAt")),
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
            "current_warning": config.thresholds.current_warning,
            "current_critical": config.thresholds.current_critical,
            "vibration_warning": config.thresholds.vibration_warning,
            "vibration_critical": config.thresholds.vibration_critical,
            "pressure_warning_low": config.thresholds.pressure_warning_low,
            "pressure_warning_high": config.thresholds.pressure_warning_high,
            "pressure_critical_low": config.thresholds.pressure_critical_low,
            "pressure_critical_high": config.thresholds.pressure_critical_high,
        },
    }

    metadata_path = output_path.with_suffix(".metadata.json")
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return output_path, metadata_path, metadata


def main() -> None:
    dataset_path, metadata_path, metadata = build_dataset()
    print(f"Dataset saved: {dataset_path}")
    print(f"Metadata saved: {metadata_path}")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()

