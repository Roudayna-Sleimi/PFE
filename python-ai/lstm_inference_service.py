import json
import os
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from pymongo import MongoClient

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/cncpulse")
DB_NAME = os.getenv("MONGO_DB_NAME", "cncpulse")
MQTT_BROKER = os.getenv("MQTT_BROKER", "broker.hivemq.com")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
SENSOR_TOPIC = os.getenv("MQTT_SENSOR_TOPIC", "cncpulse/sensors")

MODEL_PATH = os.getenv("MODEL_PATH", "models/lstm_alert_model.pkl")
SCALER_PATH = os.getenv("SCALER_PATH", "models/lstm_scaler.pkl")
ENCODER_PATH = os.getenv("ENCODER_PATH", "models/lstm_label_encoder.pkl")

SEQ_LEN = int(os.getenv("SEQ_LEN", "10"))
THRESHOLD_WARNING = float(os.getenv("THRESHOLD_WARNING", "0.65"))
THRESHOLD_CRITICAL = float(os.getenv("THRESHOLD_CRITICAL", "0.70"))
ALERT_COOLDOWN_SEC = int(os.getenv("ALERT_COOLDOWN_SEC", "60"))

FEATURES = ["vibX", "vibY", "vibZ", "courant", "rpm"]


def resolve_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else BASE_DIR / path


def to_float(value, default=0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


mongo_client = MongoClient(MONGO_URI)
db = mongo_client[DB_NAME]

model = joblib.load(resolve_path(MODEL_PATH))
scaler = joblib.load(resolve_path(SCALER_PATH))
encoder = joblib.load(resolve_path(ENCODER_PATH))

buffers = defaultdict(lambda: deque(maxlen=SEQ_LEN))
last_alert_at = defaultdict(lambda: datetime.min.replace(tzinfo=timezone.utc))


def should_emit_alert(machine_id: str) -> bool:
    elapsed = (datetime.now(timezone.utc) - last_alert_at[machine_id]).total_seconds()
    return elapsed >= ALERT_COOLDOWN_SEC


def sensor_snapshot(data: dict) -> dict:
    snapshot = {feature: to_float(data.get(feature)) for feature in FEATURES}
    if data.get("pression") is not None:
        snapshot["pression"] = to_float(data.get("pression"))
    return snapshot


def create_ai_alert(data: dict, label: str, probabilities: np.ndarray) -> None:
    machine_id = data.get("machineId") or data.get("node") or "UNKNOWN"
    severity = "critical" if label == "critical" else "warning"

    if label == "normal":
        return
    if severity == "critical" and float(np.max(probabilities)) < THRESHOLD_CRITICAL:
        return
    if severity == "warning" and float(np.max(probabilities)) < THRESHOLD_WARNING:
        return
    if not should_emit_alert(machine_id):
        return

    proba_dict = {
        str(cls): float(probabilities[idx])
        for idx, cls in enumerate(encoder.classes_)
    }
    confidence = float(max(proba_dict.values()))
    created_at = datetime.now(timezone.utc)

    alert_doc = {
        "machineId": machine_id,
        "node": data.get("node", "UNKNOWN"),
        "type": "maintenance-ai",
        "severity": severity,
        "message": f"AI maintenance: {severity} risk detected on {machine_id}",
        "status": "new",
        "createdAt": created_at,
        "seenAt": None,
        "seenBy": None,
        "notifiedAt": None,
        "notifiedBy": None,
        "callAttempts": 0,
        "ai": {
            "source": "sensor_dataset_random_forest",
            "label": label,
            "proba": proba_dict,
            "model": "RandomForestSequence",
            "version": "sensor-dataset-v1",
        },
        "sensorSnapshot": sensor_snapshot(data),
    }

    result = db.alerts.insert_one(alert_doc)
    create_maintenance_report(data, result.inserted_id, severity, label, confidence)
    last_alert_at[machine_id] = created_at
    print(f"[AI] {severity.upper()} alert - {machine_id} - {label} ({confidence:.2f})")


def create_maintenance_report(data: dict, alert_id, severity: str, label: str, confidence: float) -> None:
    machine_id = data.get("machineId") or data.get("node") or "UNKNOWN"
    snapshot = sensor_snapshot(data)
    anomaly_score = int(round(confidence * 100))
    prediction = {
        "label": "Panne probable" if severity == "critical" else "Risque de panne",
        "eta": "moins de 24h" if severity == "critical" else "24-72h",
        "confidence": anomaly_score,
    }
    recommended_action = (
        "Arreter la machine et verifier vibration, courant et roulements."
        if severity == "critical"
        else "Planifier inspection maintenance et suivre les prochaines mesures."
    )

    report = {
        "machineId": machine_id,
        "machineName": machine_id,
        "node": data.get("node", "UNKNOWN"),
        "alertId": alert_id,
        "source": "sensor-dataset-rf",
        "severity": severity,
        "anomalyScore": anomaly_score,
        "prediction": prediction,
        "recommendedAction": recommended_action,
        "contributors": [
            {
                "metric": "model",
                "label": f"Prediction {label}",
                "value": anomaly_score,
                "expected": "score bas / comportement normal",
                "level": severity,
            }
        ],
        "sensorSnapshot": snapshot,
        "status": "open",
        "createdAt": datetime.now(timezone.utc),
    }
    report_id = db.maintenancereports.insert_one(report).inserted_id

    existing_request = db.maintenancerequests.find_one({
        "machineId": machine_id,
        "status": {"$in": ["open", "in_progress"]},
    })
    if existing_request:
        db.maintenancereports.update_one({"_id": report_id}, {"$set": {"requestId": existing_request["_id"]}})
        db.maintenancerequests.update_one(
            {"_id": existing_request["_id"]},
            {"$set": {"lastReportId": report_id, "updatedAt": datetime.now(timezone.utc)}},
        )
        return

    request_doc = {
        "machineId": machine_id,
        "machineName": machine_id,
        "node": data.get("node", "UNKNOWN"),
        "alertId": alert_id,
        "reportId": report_id,
        "lastReportId": report_id,
        "title": f"Maintenance predictive - {machine_id}",
        "description": recommended_action,
        "priority": "critical" if severity == "critical" else "high",
        "status": "open",
        "requestedBy": "ai-maintenance",
        "createdAt": datetime.now(timezone.utc),
        "resolvedAt": None,
        "resolvedBy": None,
    }
    request_id = db.maintenancerequests.insert_one(request_doc).inserted_id
    db.maintenancereports.update_one({"_id": report_id}, {"$set": {"requestId": request_id}})


def on_message(_client, _userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
        machine_id = payload.get("machineId") or payload.get("node") or "UNKNOWN"
        row = [to_float(payload.get(feature)) for feature in FEATURES]
        buffers[machine_id].append(row)

        if len(buffers[machine_id]) < SEQ_LEN:
            print(f"[AI] Buffering {len(buffers[machine_id])}/{SEQ_LEN}")
            return

        seq = np.array(buffers[machine_id], dtype=np.float32)
        seq_scaled = scaler.transform(seq)
        x_value = seq_scaled.flatten().reshape(1, -1)

        probabilities = model.predict_proba(x_value)[0]
        pred_idx = int(np.argmax(probabilities))
        label = str(encoder.inverse_transform([pred_idx])[0])

        print(f"[AI] {machine_id} -> {label} ({max(probabilities):.2f})")
        create_ai_alert(payload, label, probabilities)

    except Exception as exc:
        print(f"[inference] error: {exc}")


def main():
    client = mqtt.Client()
    client.on_message = on_message
    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    client.subscribe(SENSOR_TOPIC)
    print(f"[AI] Inference service listening on {SENSOR_TOPIC}")
    client.loop_forever()


if __name__ == "__main__":
    main()
