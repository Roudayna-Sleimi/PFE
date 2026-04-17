import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# --- Environment ---
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

INTERVAL_MINUTES = int(os.getenv("AUTO_RULES_INTERVAL_MINUTES", "60"))
RUN_ON_START = os.getenv("AUTO_RULES_RUN_ON_START", "1").strip().lower() in {"1", "true", "yes", "on"}
STOP_ON_ERROR = os.getenv("AUTO_RULES_STOP_ON_ERROR", "0").strip().lower() in {"1", "true", "yes", "on"}

DATASET_SCRIPT = BASE_DIR / "build_lstm_dataset.py"
RULES_SCRIPT = BASE_DIR / "train_lstm.py"


# --- Helpers ---
def utc_now_text() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_script(script_path: Path) -> bool:
    cmd = [sys.executable, str(script_path)]
    result = subprocess.run(cmd, cwd=BASE_DIR)
    return result.returncode == 0


# --- One refresh cycle ---
def run_refresh_cycle() -> bool:
    print(f"[auto-rules] cycle started: {utc_now_text()}")

    if not run_script(DATASET_SCRIPT):
        print("[auto-rules] failed: build_lstm_dataset.py")
        return False

    if not run_script(RULES_SCRIPT):
        print("[auto-rules] failed: train_lstm.py")
        return False

    print("[auto-rules] cycle completed successfully")
    return True


# --- Main scheduler loop ---
def main() -> None:
    if INTERVAL_MINUTES <= 0:
        raise SystemExit("AUTO_RULES_INTERVAL_MINUTES must be > 0")

    print("[auto-rules] scheduler started")
    print(f"[auto-rules] python: {sys.executable}")
    print(f"[auto-rules] interval: {INTERVAL_MINUTES} minute(s)")
    print(f"[auto-rules] run_on_start: {RUN_ON_START}")
    print(f"[auto-rules] stop_on_error: {STOP_ON_ERROR}")

    if RUN_ON_START:
        ok = run_refresh_cycle()
        if not ok and STOP_ON_ERROR:
            raise SystemExit(1)

    while True:
        time.sleep(INTERVAL_MINUTES * 60)
        ok = run_refresh_cycle()
        if not ok and STOP_ON_ERROR:
            raise SystemExit(1)


if __name__ == "__main__":
    main()
