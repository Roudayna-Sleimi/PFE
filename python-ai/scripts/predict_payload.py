"""
Titre: Script Prediction JSON
Explication: Ce script lit un JSON capteur et renvoie la prediction LSTM (label + probabilites).
Utilite: Permet de tester rapidement le modele sans lancer le service MQTT complet.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

PYTHON_AI_DIR = Path(__file__).resolve().parents[1]
if str(PYTHON_AI_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_AI_DIR))

from app.shared.config import load_settings


def parse_args():
    config = load_settings()
    parser = argparse.ArgumentParser(description="Run real-time LSTM inference from JSON payload(s).")
    parser.add_argument("--model-path", default=str(config.paths.model_path))
    parser.add_argument("--preprocessor-path", default=str(config.paths.preprocessor_path))
    parser.add_argument("--machine-id", default="CLI-MACHINE")
    parser.add_argument(
        "--input-json",
        default=None,
        help="Single JSON payload string. If omitted, reads one JSON payload per stdin line.",
    )
    return parser.parse_args()


def emit_result(prediction: dict) -> None:
    print(json.dumps(prediction, ensure_ascii=False))


def run_single(runtime: Any, machine_id: str, payload_text: str, get_prediction_fn) -> int:
    try:
        payload = json.loads(payload_text)
        if not isinstance(payload, dict):
            raise ValueError("JSON payload must be an object")
        payload.setdefault("machineId", machine_id)
        prediction = get_prediction_fn(payload, runtime)
        emit_result(prediction)
        return 0
    except Exception as exc:
        print(f"[predict] invalid input: {exc}", file=sys.stderr)
        return 1


def run_stream(runtime: Any, machine_id: str, get_prediction_fn) -> int:
    print("[predict] Enter one JSON sensor object per line (Ctrl+D to stop).", file=sys.stderr)
    code = 0
    for line in sys.stdin:
        text = line.strip()
        if not text:
            continue
        code = run_single(runtime, machine_id, text, get_prediction_fn)
    return code


def main() -> int:
    args = parse_args()
    from app.maintenance.inference import InferenceRuntime, get_prediction

    runtime = InferenceRuntime(
        model_path=Path(args.model_path) if args.model_path else None,
        preprocessor_path=Path(args.preprocessor_path) if args.preprocessor_path else None,
    )

    if args.input_json:
        return run_single(runtime, args.machine_id, args.input_json, get_prediction)
    return run_stream(runtime, args.machine_id, get_prediction)


if __name__ == "__main__":
    raise SystemExit(main())
