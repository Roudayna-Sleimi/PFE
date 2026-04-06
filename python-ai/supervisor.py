import json
import os
import time
import base64
from datetime import datetime, timedelta, timezone

import paho.mqtt.publish as publish
from pymongo import MongoClient
from dotenv import load_dotenv
try:
  import pyttsx3
except Exception:
  pyttsx3 = None

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/cncpulse")
DB_NAME = os.getenv("MONGO_DB_NAME", "cncpulse")
MQTT_HOST = os.getenv("MQTT_BROKER", "broker.hivemq.com")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_GSM_CALL_TOPIC = os.getenv("MQTT_GSM_CALL_TOPIC", "cncpulse/gsm/call")

UNSEEN_MINUTES = int(os.getenv("UNSEEN_MINUTES", "5"))
POLL_SEC = int(os.getenv("SUPERVISOR_POLL_SEC", "15"))
MAX_ATTEMPTS = int(os.getenv("GSM_MAX_ATTEMPTS", "3"))
ENABLE_TTS = os.getenv("ENABLE_TTS", "1").strip().lower() in ("1", "true", "yes", "on")
AUDIO_OUTPUT_DIR = os.getenv("AUDIO_OUTPUT_DIR", "python-ai/audio")
TTS_RATE = int(os.getenv("TTS_RATE", "165"))
TTS_VOLUME = float(os.getenv("TTS_VOLUME", "1.0"))
EMBED_AUDIO_BASE64 = os.getenv("EMBED_AUDIO_BASE64", "1").strip().lower() in ("1", "true", "yes", "on")
MAX_AUDIO_INLINE_BYTES = int(os.getenv("MAX_AUDIO_INLINE_BYTES", "500000"))

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
  text_to_read = build_tts_message(alert)
  tts_audio = generate_tts_audio(text_to_read, str(alert["_id"]), attempt_no)
  audio_base64 = maybe_load_audio_base64(tts_audio["path"]) if tts_audio else None
  payload = {
    "alertId": str(alert["_id"]),
    "phoneNumber": contact["phonePrimary"],
    "attemptNo": attempt_no,
    "textToRead": text_to_read,
    "machineId": alert.get("machineId", "UNKNOWN"),
    "severity": alert.get("severity", "warning"),
    "audioFilePath": tts_audio["path"] if tts_audio else None,
    "audioFormat": tts_audio["format"] if tts_audio else None,
    "audioBase64": audio_base64
  }
  publish.single(
    MQTT_GSM_CALL_TOPIC,
    payload=json.dumps(payload),
    hostname=MQTT_HOST,
    port=MQTT_PORT
  )
  return tts_audio


def maybe_load_audio_base64(file_path: str):
  if not EMBED_AUDIO_BASE64 or not file_path:
    return None
  try:
    if not os.path.exists(file_path):
      return None
    file_size = os.path.getsize(file_path)
    if file_size > MAX_AUDIO_INLINE_BYTES:
      print(f"[supervisor] audio too large to inline ({file_size} bytes), using file path only")
      return None
    with open(file_path, "rb") as fh:
      return base64.b64encode(fh.read()).decode("ascii")
  except Exception as exc:
    print(f"[supervisor] audio base64 error: {exc}")
    return None


def generate_tts_audio(text: str, alert_id: str, attempt_no: int):
  if not ENABLE_TTS:
    return None
  if pyttsx3 is None:
    print("[supervisor] pyttsx3 not available, sending text only")
    return None

  os.makedirs(AUDIO_OUTPUT_DIR, exist_ok=True)
  filename = f"alert_{alert_id}_attempt_{attempt_no}.wav"
  file_path = os.path.abspath(os.path.join(AUDIO_OUTPUT_DIR, filename))

  try:
    engine = pyttsx3.init()
    engine.setProperty("rate", TTS_RATE)
    engine.setProperty("volume", max(0.0, min(1.0, TTS_VOLUME)))
    engine.save_to_file(text, file_path)
    engine.runAndWait()
    engine.stop()

    if not os.path.exists(file_path):
      print(f"[supervisor] tts generation failed for alert {alert_id}")
      return None

    return {
      "path": file_path,
      "format": "wav",
    }
  except Exception as exc:
    print(f"[supervisor] tts error: {exc}")
    return None


def process_once():
  contact = get_active_contact()
  if not contact:
    print("[supervisor] no active contact configured")
    return

  for alert in find_target_alerts():
    attempt_no = int(alert.get("callAttempts", 0)) + 1
    tts_audio = enqueue_call(alert, contact, attempt_no)

    db.calllogs.insert_one({
      "alertId": alert["_id"],
      "phoneNumber": contact["phonePrimary"],
      "attemptNo": attempt_no,
      "callStatus": "queued",
      "providerRef": None,
      "audioFilePath": tts_audio["path"] if tts_audio else None,
      "audioFormat": tts_audio["format"] if tts_audio else None,
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
