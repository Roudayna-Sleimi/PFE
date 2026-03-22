import json
import os
import time
from datetime import datetime, timedelta, timezone

import paho.mqtt.publish as publish
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/cncpulse")
DB_NAME = os.getenv("MONGO_DB_NAME", "cncpulse")
MQTT_HOST = os.getenv("MQTT_BROKER", "broker.hivemq.com")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_GSM_CALL_TOPIC = os.getenv("MQTT_GSM_CALL_TOPIC", "cncpulse/gsm/call")

UNSEEN_MINUTES = int(os.getenv("UNSEEN_MINUTES", "5"))
POLL_SEC = int(os.getenv("SUPERVISOR_POLL_SEC", "15"))
MAX_ATTEMPTS = int(os.getenv("GSM_MAX_ATTEMPTS", "3"))

mongo_client = MongoClient(MONGO_URI)
db = mongo_client[DB_NAME]


def build_tts_message(alert: dict) -> str:
  machine = alert.get("machineId", "machine inconnue")
  msg = alert.get("message", "alerte")
  return f"Alerte. Probleme detecte sur {machine}. {msg}. Merci de verifier le dashboard immediatement."


def get_active_contact():
  return db.contacts.find_one({"isActive": True}, sort=[("createdAt", -1)])


def find_target_alerts():
  cutoff = datetime.now(timezone.utc) - timedelta(minutes=UNSEEN_MINUTES)
  return db.alerts.find({
    "status": "new",
    "seenAt": None,
    "createdAt": {"$lte": cutoff},
    "callAttempts": {"$lt": MAX_ATTEMPTS}
  }).sort("createdAt", 1)


def enqueue_call(alert: dict, contact: dict, attempt_no: int):
  payload = {
    "alertId": str(alert["_id"]),
    "phoneNumber": contact["phonePrimary"],
    "attemptNo": attempt_no,
    "textToRead": build_tts_message(alert),
    "machineId": alert.get("machineId", "UNKNOWN"),
    "severity": alert.get("severity", "warning")
  }
  publish.single(
    MQTT_GSM_CALL_TOPIC,
    payload=json.dumps(payload),
    hostname=MQTT_HOST,
    port=MQTT_PORT
  )


def process_once():
  contact = get_active_contact()
  if not contact:
    print("[supervisor] no active contact configured")
    return

  for alert in find_target_alerts():
    attempt_no = int(alert.get("callAttempts", 0)) + 1
    enqueue_call(alert, contact, attempt_no)

    db.calllogs.insert_one({
      "alertId": alert["_id"],
      "phoneNumber": contact["phonePrimary"],
      "attemptNo": attempt_no,
      "callStatus": "queued",
      "providerRef": None,
      "calledAt": datetime.now(timezone.utc),
      "endedAt": None,
      "durationSec": None,
      "errorMessage": None,
    })

    db.alerts.update_one(
      {"_id": alert["_id"]},
      {
        "$set": {
          "status": "notified",
          "notifiedAt": datetime.now(timezone.utc),
          "notifiedBy": "gsm-supervisor"
        },
        "$inc": {"callAttempts": 1}
      }
    )
    print(f"[supervisor] call queued for alert {alert['_id']} attempt={attempt_no}")


def main():
  print("[supervisor] started")
  while True:
    try:
      process_once()
    except Exception as exc:
      print(f"[supervisor] error: {exc}")
    time.sleep(POLL_SEC)


if __name__ == "__main__":
  main()