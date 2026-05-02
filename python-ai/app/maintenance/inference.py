"""
Title: Unified LSTM Inference
Explanation: Centralizes runtime prediction in a single `get_prediction(data)` function.
Utility: Ensures one production inference contract shared by MQTT runtime and CLI/tests.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from app.maintenance.predictor import MaintenanceLSTMPredictor
from app.shared.config import AppSettings, load_settings


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def machine_id_from_payload(data: dict) -> str:
    return str(data.get("machineId") or data.get("node") or "UNKNOWN")


class InferenceRuntime:
    def __init__(
        self,
        settings: AppSettings | None = None,
        model_path: str | Path | None = None,
        preprocessor_path: str | Path | None = None,
    ):
        self.settings = settings or load_settings()
        self.model_path: Path = Path(model_path) if model_path is not None else self.settings.paths.model_path
        self.preprocessor_path: Path = (
            Path(preprocessor_path) if preprocessor_path is not None else self.settings.paths.preprocessor_path
        )
        self.predictor = MaintenanceLSTMPredictor(self.model_path, self.preprocessor_path)

    def reload_predictor(self) -> None:
        self.predictor = MaintenanceLSTMPredictor(self.model_path, self.preprocessor_path)


def _risk_score_from_proba(proba: dict) -> float:
    normal = float(proba.get("normal", 0.0))
    return max(0.0, min(1.0, 1.0 - normal))


_DEFAULT_RUNTIME: InferenceRuntime | None = None


def _get_default_runtime() -> InferenceRuntime:
    global _DEFAULT_RUNTIME  # pylint: disable=global-statement
    if _DEFAULT_RUNTIME is None:
        _DEFAULT_RUNTIME = InferenceRuntime()
    return _DEFAULT_RUNTIME


def get_prediction(data: dict, runtime: InferenceRuntime | None = None) -> dict:
    """
    Returns the unified runtime contract:
    {
      anomalyScore: float (0-1),
      predictedClass: normal|warning|critical,
      confidence: float (0-1)
    }
    """
    active_runtime = runtime or _get_default_runtime()
    machine_id = machine_id_from_payload(data)
    raw = active_runtime.predictor.predict(machine_id=machine_id, payload=data)
    anomaly_score = _risk_score_from_proba(raw.get("proba", {}))
    predicted_class = str(raw.get("label", "normal")).lower()
    if predicted_class not in {"normal", "warning", "critical"}:
        predicted_class = "normal"
    confidence = max(0.0, min(1.0, float(raw.get("confidence", 0.0))))

    return {
        "machineId": machine_id,
        "node": str(data.get("node") or machine_id),
        "anomalyScore": round(anomaly_score, 6),
        "predictedClass": predicted_class,
        "confidence": round(confidence, 6),
        "proba": raw.get("proba", {}),
        "historySize": int(raw.get("history_size") or 0),
        "sequenceLength": int(raw.get("sequence_length") or 0),
        "modelName": str(raw.get("model_name") or "MaintenanceLSTMClassifier"),
        "modelVersion": str(raw.get("model_version") or "lstm-v1"),
        "snapshot": raw.get("snapshot", {}),
        "createdAt": now_utc_iso(),
    }
