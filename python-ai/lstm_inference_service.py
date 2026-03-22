import json
import os
from collections import defaultdict, deque
from datetime import datetime, timezone

import joblib
import numpy as np
import paho.mqtt.client as mqtt
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()
for key in ["MODEL_PATH", "SCALER_PATH", "ENCODER_PATH"]:
    val = os.getenv(key, "")
    os.environ[key] = val.strip()
MONGO_URI     = os.getenv("MONGO_URI", "mongodb://localhost:27017/cncpulse")
DB_NAME       = os.getenv("MONGO_DB_NAME", "cncpulse")
MQTT_BROKER   = os.getenv("MQTT_BROKER", "broker.hivemq.com")
MQTT_PORT     = int(os.getenv("MQTT_PORT", "1883"))
SENSOR_TOPIC  = os.getenv("MQTT_SENSOR_TOPIC", "cncpulse/sensors")

MODEL_PATH    = "models/lstm_alert_model.pkl"
SCALER_PATH   = "models/lstm_scaler.pkl"
ENCODER_PATH  = "models/lstm_label_encoder.pkl"

SEQ_LEN              = int(os.getenv("SEQ_LEN", "10"))
THRESHOLD_WARNING    = float(os.getenv("THRESHOLD_WARNING", "0.65"))
THRESHOLD_CRITICAL   = float(os.getenv("THRESHOLD_CRITICAL", "0.70"))
ALERT_COOLDOWN_SEC   = int(os.getenv("ALERT_COOLDOWN_SEC", "60"))

FEATURES = ["vibX", "vibY", "vibZ", "courant", "rpm"]

mongo_client = MongoClient(MONGO_URI)
db           = mongo_client[DB_NAME]

model   = joblib.load(MODEL_PATH)
scaler  = joblib.load(SCALER_PATH)
encoder = joblib.load(ENCODER_PATH)

buffers       = defaultdict(lambda: deque(maxlen=SEQ_LEN))
last_alert_at = defaultdict(lambda: datetime.min.replace(tzinfo=timezone.utc))


def should_emit_alert(machine_id: str) -> bool:
    elapsed = (datetime.now(timezone.utc) - last_alert_at[machine_id]).total_seconds()
    return elapsed >= ALERT_COOLDOWN_SEC


def create_ai_alert(data: dict, label: str, probabilities: np.ndarray) -> None:
    machine_id = data.get("machineId") or data.get("node") or "UNKNOWN"
    severity   = "critical" if label == "critical" else "warning"

    if label == "normal":
        return
    if severity == "critical" and float(np.max(probabilities)) < THRESHOLD_CRITICAL:
        return
    if severity == "warning" and float(np.max(probabilities)) < THRESHOLD_WARNING:
        return
    if not should_emit_alert(machine_id):
        return

    proba_dict = {
        cls: float(probabilities[idx])
        for idx, cls in enumerate(encoder.classes_)
    }

    alert_doc = {
        "machineId":  machine_id,
        "node":       data.get("node", "UNKNOWN"),
        "type":       "ai-rf",
        "severity":   severity,
        "message":    f"AI {severity} alert on {machine_id}",
        "status":     "new",
        "createdAt":  datetime.now(timezone.utc),
        "seenAt":     None,
        "seenBy":     None,
        "notifiedAt": None,
        "notifiedBy": None,
        "callAttempts": 0,
        "ai": {
            "source":  "random_forest",
            "label":   label,
            "proba":   proba_dict,
            "model":   "RandomForest",
            "version": "v1"
        },
        "sensorSnapshot": {f: float(data.get(f, 0.0)) for f in FEATURES}
    }

    db.alerts.insert_one(alert_doc)
    last_alert_at[machine_id] = datetime.now(timezone.utc)
    print(f"[AI] ⚠️ {severity.upper()} alert — {machine_id} — {label} ({max(proba_dict.values()):.2f})")


def on_message(_client, _userdata, msg):
    try:
        payload    = json.loads(msg.payload.decode("utf-8"))
        machine_id = payload.get("machineId") or payload.get("node") or "UNKNOWN"
        row        = [float(payload.get(k, 0.0)) for k in FEATURES]
        buffers[machine_id].append(row)

        if len(buffers[machine_id]) < SEQ_LEN:
            print(f"[AI] Buffering {len(buffers[machine_id])}/{SEQ_LEN}")
            return

        seq        = np.array(buffers[machine_id], dtype=np.float32)
        seq_scaled = scaler.transform(seq)
        x          = seq_scaled.flatten().reshape(1, -1)

        probabilities = model.predict_proba(x)[0]
        pred_idx      = int(np.argmax(probabilities))
        label         = str(encoder.inverse_transform([pred_idx])[0])

        print(f"[AI] {machine_id} → {label} ({max(probabilities):.2f})")
        create_ai_alert(payload, label, probabilities)

    except Exception as exc:
        print(f"[inference] error: {exc}")


def main():
    client = mqtt.Client()
    client.on_message = on_message
    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    client.subscribe(SENSOR_TOPIC)
    print(f"[AI] ✅ Inference service listening on {SENSOR_TOPIC}")
    client.loop_forever()


if __name__ == "__main__":
    main()