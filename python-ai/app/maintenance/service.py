"""
Title: LSTM MQTT Inference Service
Explanation: Consumes sensor data, runs centralized LSTM prediction, and publishes results for backend orchestration.
Utility: Makes Python LSTM the primary runtime inference path while keeping backend logic decoupled.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import paho.mqtt.client as mqtt

from app.maintenance.inference import InferenceRuntime, get_prediction
from app.shared.config import AppSettings, load_settings


class MaintenanceInferenceService:
    def __init__(self, settings: AppSettings | None = None):
        self.settings = settings or load_settings()
        self.runtime = InferenceRuntime(self.settings)
        self.model_path: Path = self.settings.paths.model_path
        self.preprocessor_path: Path = self.settings.paths.preprocessor_path
        self.last_model_check_monotonic = 0.0
        self.last_model_signature = self._model_signature()

    def _model_signature(self) -> tuple[float | None, float | None]:
        return (
            self.model_path.stat().st_mtime if self.model_path.exists() else None,
            self.preprocessor_path.stat().st_mtime if self.preprocessor_path.exists() else None,
        )

    def maybe_reload_model(self) -> None:
        reload_sec = self.settings.inference.model_reload_sec
        if reload_sec <= 0:
            return

        now_monotonic = time.monotonic()
        if now_monotonic - self.last_model_check_monotonic < reload_sec:
            return
        self.last_model_check_monotonic = now_monotonic

        new_signature = self._model_signature()
        if new_signature == self.last_model_signature:
            return

        self.runtime.reload_predictor()
        self.last_model_signature = new_signature
        print(f"[model] reloaded: model={self.model_path} preprocessor={self.preprocessor_path}")

    def predict(self, payload: dict) -> dict:
        return get_prediction(payload, self.runtime)


def run_service(settings: AppSettings | None = None) -> None:
    config = settings or load_settings()
    runtime = MaintenanceInferenceService(config)
    client = mqtt.Client()

    def on_message(mqtt_client, _userdata, message):
        try:
            runtime.maybe_reload_model()
            payload = json.loads(message.payload.decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("MQTT payload must be a JSON object")

            prediction = runtime.predict(payload)
            event = {
                "node": str(payload.get("node") or prediction["node"]),
                "machineId": str(payload.get("machineId") or prediction["machineId"]),
                "sensorPayload": payload,
                "prediction": prediction,
                "createdAt": prediction["createdAt"],
            }
            mqtt_client.publish(config.mqtt.prediction_topic, json.dumps(event), qos=0, retain=False)

            print(
                f"[AI] {event['machineId']} -> {prediction['predictedClass']} "
                f"(conf={prediction['confidence']:.2f}, score={prediction['anomalyScore']:.2f})"
            )
        except Exception as exc:
            print(f"[inference] error: {exc}")

    client.on_message = on_message
    client.connect(config.mqtt.broker, config.mqtt.port, 60)
    client.subscribe(config.mqtt.sensor_topic)

    print(f"[AI] Inference service listening on sensor topic: {config.mqtt.sensor_topic}")
    print(f"[AI] Publishing predictions to: {config.mqtt.prediction_topic}")
    print(f"[AI] Model: {config.paths.model_path}")
    print(f"[AI] Preprocessor: {config.paths.preprocessor_path}")
    print(f"[AI] Reload interval: {config.inference.model_reload_sec}s")

    client.loop_forever()


def main() -> None:
    run_service()


if __name__ == "__main__":
    main()
