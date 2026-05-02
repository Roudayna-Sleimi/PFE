"""
Title: Conditional Retraining Scheduler
Explanation: Retrains only when dataset growth exceeds a configured ratio and snapshots model versions.
Utility: Avoids costly retrains on each update while preserving versioned artifacts for rollback/audit.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from app.db.mongo import get_database
from app.shared.config import AppSettings, load_settings


def utc_now_text() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def run_script(script_path: Path, working_dir: Path) -> bool:
    result = subprocess.run([sys.executable, str(script_path)], cwd=working_dir)
    return result.returncode == 0


def count_sensor_rows(config: AppSettings) -> int:
    db = get_database(config)
    return int(db.sensordatas.count_documents({}))


def read_last_trained_rows(config: AppSettings) -> int:
    state = read_json(config.paths.retrain_state_path)
    if isinstance(state.get("last_trained_rows"), int):
        return int(state["last_trained_rows"])

    metadata_path = config.paths.output_dataset_path.with_suffix(".metadata.json")
    metadata = read_json(metadata_path)
    if isinstance(metadata.get("rows"), int):
        return int(metadata["rows"])

    metrics = read_json(config.paths.train_metrics_path)
    train_size = metrics.get("train_size")
    test_size = metrics.get("test_size")
    if isinstance(train_size, int) and isinstance(test_size, int):
        return int(train_size + test_size)

    return 0


def snapshot_model_version(config: AppSettings, trained_rows: int) -> str:
    version_id = datetime.now(timezone.utc).strftime("v%Y%m%d_%H%M%S")
    versions_dir = config.paths.model_versions_dir
    version_dir = versions_dir / version_id
    version_dir.mkdir(parents=True, exist_ok=True)

    artifacts = [
        config.paths.model_path,
        config.paths.preprocessor_path,
        config.paths.train_metrics_path,
        config.paths.training_curve_path,
        config.paths.confusion_matrix_path,
    ]

    copied = []
    for artifact in artifacts:
        if artifact.exists():
            target = version_dir / artifact.name
            shutil.copy2(artifact, target)
            copied.append(target.name)

    manifest = {
        "version": version_id,
        "created_at": utc_now_text(),
        "trained_rows": int(trained_rows),
        "artifacts": copied,
    }
    write_json(version_dir / "manifest.json", manifest)

    registry_path = versions_dir / "registry.json"
    registry = read_json(registry_path)
    entries = registry.get("versions")
    if not isinstance(entries, list):
        entries = []
    entries.append(manifest)
    write_json(registry_path, {"versions": entries, "latest": version_id})
    return version_id


def update_retrain_state(config: AppSettings, trained_rows: int, version: str, source_rows: int) -> None:
    payload = {
        "updated_at": utc_now_text(),
        "last_trained_rows": int(trained_rows),
        "last_source_rows": int(source_rows),
        "last_model_version": version,
    }
    write_json(config.paths.retrain_state_path, payload)


def should_retrain(config: AppSettings, source_rows: int, baseline_rows: int) -> tuple[bool, float]:
    if baseline_rows <= 0:
        return True, 1.0
    if source_rows <= baseline_rows:
        return False, 0.0
    growth = (source_rows - baseline_rows) / float(baseline_rows)
    return growth > config.scheduler.min_dataset_growth_ratio, growth


def run_refresh_cycle(config: AppSettings, working_dir: Path) -> bool:
    try:
        source_rows = count_sensor_rows(config)
        baseline_rows = read_last_trained_rows(config)
        do_train, growth = should_retrain(config, source_rows, baseline_rows)

        print(
            "[auto-train] check: "
            f"source_rows={source_rows} baseline_rows={baseline_rows} "
            f"growth={growth:.2%} threshold={config.scheduler.min_dataset_growth_ratio:.2%}"
        )
        if not do_train:
            print("[auto-train] skipped: growth threshold not reached")
            return True

        dataset_script = working_dir / "scripts" / "build_dataset.py"
        train_script = working_dir / "scripts" / "train_model.py"

        print(f"[auto-train] cycle started: {utc_now_text()}")
        if not run_script(dataset_script, working_dir):
            print("[auto-train] failed: build_dataset.py")
            return False
        if not run_script(train_script, working_dir):
            print("[auto-train] failed: train_model.py")
            return False

        dataset_metadata = read_json(config.paths.output_dataset_path.with_suffix(".metadata.json"))
        trained_rows = int(dataset_metadata.get("rows") or source_rows)
        version = snapshot_model_version(config, trained_rows)
        update_retrain_state(config, trained_rows, version, source_rows)

        print(f"[auto-train] cycle completed successfully (version={version})")
        return True
    except Exception as exc:
        print(f"[auto-train] cycle error: {exc}")
        return False


def run_scheduler(settings: AppSettings | None = None, run_once: bool = False) -> None:
    config = settings or load_settings()
    interval = config.scheduler.interval_minutes
    if interval <= 0:
        raise SystemExit("AUTO_TRAIN_INTERVAL_MINUTES must be > 0")

    working_dir = Path(__file__).resolve().parents[2]
    print("[auto-train] scheduler started")
    print(f"[auto-train] python: {sys.executable}")
    print(f"[auto-train] interval: {interval} minute(s)")
    print(f"[auto-train] run_on_start: {config.scheduler.run_on_start}")
    print(f"[auto-train] stop_on_error: {config.scheduler.stop_on_error}")
    print(f"[auto-train] min growth ratio: {config.scheduler.min_dataset_growth_ratio:.2%}")

    if config.scheduler.run_on_start or run_once:
        ok = run_refresh_cycle(config, working_dir)
        if not ok and config.scheduler.stop_on_error:
            raise SystemExit(1)
        if run_once:
            return

    while True:
        time.sleep(interval * 60)
        ok = run_refresh_cycle(config, working_dir)
        if not ok and config.scheduler.stop_on_error:
            raise SystemExit(1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run conditional retraining scheduler for maintenance LSTM."
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single conditional check/retrain cycle and exit.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    run_scheduler(run_once=bool(args.once))


if __name__ == "__main__":
    main()
