"""
Titre: Planificateur Re-entrainement
Explication: Ce module execute periodiquement la reconstruction du dataset puis l'entrainement du modele LSTM.
Utilite: Il garde le modele a jour sans intervention manuelle.
"""

from __future__ import annotations

import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from app.shared.config import AppSettings, load_settings


def utc_now_text() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_script(script_path: Path, working_dir: Path) -> bool:
    result = subprocess.run([sys.executable, str(script_path)], cwd=working_dir)
    return result.returncode == 0


def run_refresh_cycle(config: AppSettings, working_dir: Path) -> bool:
    dataset_script = working_dir / "scripts" / "build_dataset.py"
    train_script = working_dir / "scripts" / "train_model.py"

    print(f"[auto-train] cycle started: {utc_now_text()}")
    if not run_script(dataset_script, working_dir):
        print("[auto-train] failed: build_dataset.py")
        return False
    if not run_script(train_script, working_dir):
        print("[auto-train] failed: train_model.py")
        return False

    print("[auto-train] cycle completed successfully")
    return True


def run_scheduler(settings: AppSettings | None = None) -> None:
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

    if config.scheduler.run_on_start:
        ok = run_refresh_cycle(config, working_dir)
        if not ok and config.scheduler.stop_on_error:
            raise SystemExit(1)

    while True:
        time.sleep(interval * 60)
        ok = run_refresh_cycle(config, working_dir)
        if not ok and config.scheduler.stop_on_error:
            raise SystemExit(1)


def main() -> None:
    run_scheduler()


if __name__ == "__main__":
    main()

