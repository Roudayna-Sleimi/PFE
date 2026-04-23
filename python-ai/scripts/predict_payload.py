"""
Titre: Script Prediction JSON
Explication: Ce script lit un JSON capteur et renvoie la prediction LSTM (label + probabilites).
Utilite: Permet de tester rapidement le modele sans lancer le service MQTT complet.
"""

import argparse
import json
import sys
from pathlib import Path

PYTHON_AI_DIR = Path(__file__).resolve().parents[1]
if str(PYTHON_AI_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_AI_DIR))

from app.maintenance.predictor import MaintenanceLSTMPredictor
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


def emit_result(raw_result: dict) -> None:
    payload = {
        "machine_id": raw_result["machine_id"],
        "label": raw_result["label"],
        "confidence": round(float(raw_result["confidence"]), 4),
        "probability": raw_result["proba"][raw_result["label"]],
        "proba": raw_result["proba"],
        "history_size": raw_result["history_size"],
        "sequence_length": raw_result["sequence_length"],
    }
    print(json.dumps(payload, ensure_ascii=False))


def run_single(predictor: MaintenanceLSTMPredictor, machine_id: str, payload_text: str) -> int:
    try:
        payload = json.loads(payload_text)
        if not isinstance(payload, dict):
            raise ValueError("JSON payload must be an object")
        result = predictor.predict(machine_id=machine_id, payload=payload)
        emit_result(result)
        return 0
    except Exception as exc:
        print(f"[predict] invalid input: {exc}", file=sys.stderr)
        return 1


def run_stream(predictor: MaintenanceLSTMPredictor, machine_id: str) -> int:
    print("[predict] Enter one JSON sensor object per line (Ctrl+D to stop).", file=sys.stderr)
    code = 0
    for line in sys.stdin:
        text = line.strip()
        if not text:
            continue
        code = run_single(predictor, machine_id, text)
    return code


def main() -> int:
    args = parse_args()
    predictor = MaintenanceLSTMPredictor(
        model_path=args.model_path,
        preprocessor_path=args.preprocessor_path,
    )
    if args.input_json:
        return run_single(predictor, args.machine_id, args.input_json)
    return run_stream(predictor, args.machine_id)


if __name__ == "__main__":
    raise SystemExit(main())

