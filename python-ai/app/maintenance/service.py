"""
Titre: Service Maintenance Temps Reel
Explication: Ce service ecoute MQTT, applique le modele LSTM et enregistre alertes/rapports dans MongoDB.
Utilite: Il regroupe l'inference et la persistance metier dans un seul module clair pour le runtime.
"""

from __future__ import annotations

import json
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import paho.mqtt.client as mqtt

from app.db.mongo import get_database
from app.maintenance.predictor import MaintenanceLSTMPredictor
from app.shared.config import AppSettings, load_settings


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def machine_id_from_payload(data: dict) -> str:
    return str(data.get("machineId") or data.get("node") or "UNKNOWN")


class MaintenanceService:
    def __init__(self, settings: AppSettings | None = None):
        self.settings = settings or load_settings()
        self.db = get_database(self.settings)
        self.model_path: Path = self.settings.paths.model_path
        self.preprocessor_path: Path = self.settings.paths.preprocessor_path
        self.predictor = MaintenanceLSTMPredictor(self.model_path, self.preprocessor_path)
        self.last_model_check_monotonic = 0.0
        self.last_model_signature = self._model_signature()
        self.last_alert_at = defaultdict(lambda: datetime.min.replace(tzinfo=timezone.utc))

    def _model_signature(self):
        return (
            self.model_path.stat().st_mtime if self.model_path.exists() else None,
            self.preprocessor_path.stat().st_mtime if self.preprocessor_path.exists() else None,
        )

    def _should_emit_alert(self, machine_id: str) -> bool:
        elapsed = (now_utc() - self.last_alert_at[machine_id]).total_seconds()
        return elapsed >= self.settings.inference.alert_cooldown_sec

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

        self.predictor = MaintenanceLSTMPredictor(self.model_path, self.preprocessor_path)
        self.last_model_signature = new_signature
        print(f"[model] reloaded: model={self.model_path} preprocessor={self.preprocessor_path}")

    def _create_maintenance_report(self, payload: dict, alert_id, result: dict) -> None:
        machine_id = result["machine_id"]
        severity = result["severity"]
        confidence_pct = int(round(result["confidence"] * 100))

        prediction = {
            "label": "Panne probable" if severity == "critical" else "Risque de panne",
            "eta": "moins de 24h" if severity == "critical" else "24-72h",
            "confidence": confidence_pct,
        }
        recommended_action = (
            "Arreter la machine et verifier vibration, courant, alignement et roulements."
            if severity == "critical"
            else "Planifier inspection maintenance et surveiller les prochaines mesures."
        )

        report = {
            "machineId": machine_id,
            "machineName": machine_id,
            "node": payload.get("node", "UNKNOWN"),
            "alertId": alert_id,
            "source": "lstm-inference",
            "severity": severity,
            "anomalyScore": confidence_pct,
            "prediction": prediction,
            "recommendedAction": recommended_action,
            "contributors": result["contributors"],
            "sensorSnapshot": result["snapshot"],
            "status": "open",
            "createdAt": now_utc(),
        }
        report_id = self.db.maintenancereports.insert_one(report).inserted_id

        existing_request = self.db.maintenancerequests.find_one(
            {"machineId": machine_id, "status": {"$in": ["open", "in_progress"]}}
        )
        if existing_request:
            self.db.maintenancereports.update_one(
                {"_id": report_id},
                {"$set": {"requestId": existing_request["_id"]}},
            )
            self.db.maintenancerequests.update_one(
                {"_id": existing_request["_id"]},
                {"$set": {"lastReportId": report_id, "updatedAt": now_utc()}},
            )
            return

        request_doc = {
            "machineId": machine_id,
            "machineName": machine_id,
            "node": payload.get("node", "UNKNOWN"),
            "alertId": alert_id,
            "reportId": report_id,
            "lastReportId": report_id,
            "title": f"Maintenance predictive - {machine_id}",
            "description": recommended_action,
            "priority": "critical" if severity == "critical" else "high",
            "status": "open",
            "requestedBy": "ai-maintenance",
            "createdAt": now_utc(),
            "resolvedAt": None,
            "resolvedBy": None,
        }
        request_id = self.db.maintenancerequests.insert_one(request_doc).inserted_id
        self.db.maintenancereports.update_one({"_id": report_id}, {"$set": {"requestId": request_id}})

    def _persist_prediction(self, payload: dict, result: dict) -> bool:
        machine_id = result["machine_id"]
        label = result["label"]
        history_size = int(result.get("history_size") or 0)
        if label == "normal":
            return False
        if history_size < self.settings.inference.min_history_for_alert:
            return False
        if not self._should_emit_alert(machine_id):
            return False

        created_at = now_utc()
        alert_doc = {
            "machineId": machine_id,
            "node": payload.get("node", "UNKNOWN"),
            "type": "maintenance-ai",
            "severity": result["severity"],
            "message": f"Maintenance risk {result['severity']} detected on {machine_id}",
            "status": "new",
            "createdAt": created_at,
            "seenAt": None,
            "seenBy": None,
            "notifiedAt": None,
            "notifiedBy": None,
            "callAttempts": 0,
            "ai": {
                "source": "lstm-inference",
                "label": label,
                "proba": result["proba"],
                "model": result.get("model_name", "MaintenanceLSTMClassifier"),
                "version": result.get("model_version", "lstm-v1"),
            },
            "sensorSnapshot": result["snapshot"],
        }
        alert_id = self.db.alerts.insert_one(alert_doc).inserted_id
        self._create_maintenance_report(payload, alert_id, result)
        self.last_alert_at[machine_id] = created_at
        return True

    def handle_message(self, payload: dict) -> None:
        machine_id = machine_id_from_payload(payload)
        result = self.predictor.predict(machine_id=machine_id, payload=payload)
        print(
            f"[AI] {machine_id} -> {result['label']} "
            f"({result['confidence']:.2f}) [lstm history={result['history_size']}]"
        )
        created = self._persist_prediction(payload=payload, result=result)
        if created:
            print(
                f"[AI] {result['severity'].upper()} alert - {machine_id} - "
                f"{result['label']} ({result['confidence']:.2f})"
            )


def run_service(settings: AppSettings | None = None) -> None:
    config = settings or load_settings()
    runtime = MaintenanceService(config)
    client = mqtt.Client()

    def on_message(_client, _userdata, message):
        try:
            runtime.maybe_reload_model()
            payload = json.loads(message.payload.decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("MQTT payload must be a JSON object")
            runtime.handle_message(payload)
        except Exception as exc:
            print(f"[inference] error: {exc}")

    client.on_message = on_message
    client.connect(config.mqtt.broker, config.mqtt.port, 60)
    client.subscribe(config.mqtt.sensor_topic)

    print(f"[AI] Inference service listening on {config.mqtt.sensor_topic}")
    print(f"[AI] Model: {config.paths.model_path}")
    print(f"[AI] Preprocessor: {config.paths.preprocessor_path}")
    print(f"[AI] Reload interval: {config.inference.model_reload_sec}s")
    print(f"[AI] Minimum history before alerts: {config.inference.min_history_for_alert} points")

    client.loop_forever()


def main() -> None:
    run_service()


if __name__ == "__main__":
    main()

