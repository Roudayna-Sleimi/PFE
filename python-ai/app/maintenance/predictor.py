"""
Titre: Predicteur LSTM de Maintenance
Explication: Ce module charge le modele entraine et calcule la prediction de severite a partir d'une fenetre temporelle.
Utilite: Isole l'inference IA pour qu'elle soit reutilisable dans le service MQTT et dans les scripts CLI.
"""

import json
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from app.shared.config import resolve_project_path, to_float


def import_tensorflow():
    try:
        import tensorflow as tf  # pylint: disable=import-outside-toplevel

        return tf
    except Exception as exc:
        raise RuntimeError(
            "TensorFlow is required for inference. Install dependencies with: "
            "python -m pip install -r python-ai/requirements.txt"
        ) from exc


@dataclass
class ModelArtifacts:
    version: str
    sequence_length: int
    features: list[str]
    class_names: list[str]
    scaler_mean: np.ndarray
    scaler_std: np.ndarray
    normal_baseline: dict
    thresholds: dict


def load_model_artifacts(preprocessor_path: Path) -> ModelArtifacts:
    if not preprocessor_path.exists():
        raise FileNotFoundError(f"Preprocessor file not found: {preprocessor_path}")

    payload = json.loads(preprocessor_path.read_text(encoding="utf-8"))
    sequence_length = int(payload.get("sequence_length", 0))
    features = list(payload.get("features", []))
    class_names = list(payload.get("class_names", []))
    scaler = payload.get("scaler", {})

    if sequence_length < 2:
        raise RuntimeError("Invalid preprocessor artifact: sequence_length must be >= 2")
    if not features:
        raise RuntimeError("Invalid preprocessor artifact: features are missing")
    if not class_names:
        raise RuntimeError("Invalid preprocessor artifact: class_names are missing")

    mean = np.array(scaler.get("mean", []), dtype=np.float32)
    std = np.array(scaler.get("std", []), dtype=np.float32)
    if mean.shape[0] != len(features) or std.shape[0] != len(features):
        raise RuntimeError("Invalid preprocessor artifact: scaler shape mismatch")
    std = np.where(std < 1e-6, 1.0, std)

    return ModelArtifacts(
        version=str(payload.get("version") or "lstm-v1"),
        sequence_length=sequence_length,
        features=features,
        class_names=class_names,
        scaler_mean=mean,
        scaler_std=std,
        normal_baseline=payload.get("normal_baseline", {}),
        thresholds=payload.get("thresholds", {}),
    )


class MaintenanceLSTMPredictor:
    def __init__(self, model_path: str | Path, preprocessor_path: str | Path):
        self.model_path = resolve_project_path(model_path)
        self.preprocessor_path = resolve_project_path(preprocessor_path)
        self.artifacts = load_model_artifacts(self.preprocessor_path)

        tf = import_tensorflow()
        if not self.model_path.exists():
            raise FileNotFoundError(f"LSTM model file not found: {self.model_path}")
        self.model = tf.keras.models.load_model(self.model_path, compile=False)
        output_shape = self.model.output_shape
        if isinstance(output_shape, list):
            output_shape = output_shape[0]
        output_units = int(output_shape[-1]) if output_shape else 0
        if output_units != len(self.artifacts.class_names):
            raise RuntimeError(
                "Model output units and class_names mismatch: "
                f"{output_units} vs {len(self.artifacts.class_names)}"
            )

        self.histories: dict[str, deque[np.ndarray]] = defaultdict(
            lambda: deque(maxlen=self.artifacts.sequence_length)
        )

    def _snapshot_from_payload(self, payload: dict) -> dict:
        return {feature: to_float(payload.get(feature), 0.0) for feature in self.artifacts.features}

    def _padded_sequence(self, machine_id: str) -> tuple[np.ndarray, int]:
        history = self.histories[machine_id]
        history_size = len(history)
        if history_size == 0:
            empty = np.zeros((self.artifacts.sequence_length, len(self.artifacts.features)), dtype=np.float32)
            return empty, 0

        sequence = np.array(history, dtype=np.float32)
        if history_size >= self.artifacts.sequence_length:
            return sequence, history_size

        pad_count = self.artifacts.sequence_length - history_size
        padding = np.repeat(sequence[0][np.newaxis, :], repeats=pad_count, axis=0)
        return np.vstack([padding, sequence]).astype(np.float32), history_size

    def _contributors(self, snapshot: dict, label: str) -> list[dict]:
        contributors = []
        for feature_index, feature in enumerate(self.artifacts.features):
            baseline = self.artifacts.normal_baseline.get(feature, {})
            mean = float(baseline.get("mean", self.artifacts.scaler_mean[feature_index]))
            std = max(float(baseline.get("std", self.artifacts.scaler_std[feature_index])), 1e-6)
            value = float(snapshot[feature])
            z_score = abs((value - mean) / std)
            if z_score < 1.5:
                continue

            contributors.append(
                {
                    "metric": feature,
                    "label": f"{feature} deviates from baseline",
                    "value": round(value, 3),
                    "expected": f"{round(mean, 3)} +/- {round(std, 3)}",
                    "level": "critical" if z_score >= 2.8 else "warning",
                    "_priority": z_score,
                }
            )

        contributors.sort(key=lambda item: item["_priority"], reverse=True)
        top_contributors = contributors[:5]
        for item in top_contributors:
            item.pop("_priority", None)

        if not top_contributors and label in {"warning", "critical"}:
            top_contributors.append(
                {
                    "metric": "sequence",
                    "label": "Temporal pattern matches failure progression",
                    "value": None,
                    "expected": "stable trend",
                    "level": "critical" if label == "critical" else "warning",
                }
            )
        return top_contributors

    def predict(self, machine_id: str, payload: dict) -> dict:
        safe_machine_id = str(machine_id or "UNKNOWN")
        snapshot = self._snapshot_from_payload(payload)
        vector = np.array([snapshot[feature] for feature in self.artifacts.features], dtype=np.float32)
        self.histories[safe_machine_id].append(vector)

        sequence, history_size = self._padded_sequence(safe_machine_id)
        scaled = (sequence - self.artifacts.scaler_mean) / self.artifacts.scaler_std
        model_input = np.expand_dims(scaled.astype(np.float32), axis=0)

        probabilities = self.model.predict(model_input, verbose=0)[0]
        probabilities = probabilities / np.clip(probabilities.sum(), a_min=1e-8, a_max=None)
        predicted_index = int(np.argmax(probabilities))
        label = self.artifacts.class_names[predicted_index]
        confidence = float(probabilities[predicted_index])

        proba = {
            class_name: round(float(probabilities[index]), 4)
            for index, class_name in enumerate(self.artifacts.class_names)
        }
        severity = label if label in {"normal", "warning", "critical"} else "warning"
        return {
            "machine_id": safe_machine_id,
            "label": label,
            "severity": severity,
            "confidence": confidence,
            "proba": proba,
            "contributors": self._contributors(snapshot, label),
            "snapshot": snapshot,
            "history_size": history_size,
            "sequence_length": self.artifacts.sequence_length,
            "model_name": "MaintenanceLSTMClassifier",
            "model_version": self.artifacts.version,
        }


# Alias de compatibilite pour l'ancien nom de classe.
LSTMMaintenancePredictor = MaintenanceLSTMPredictor
