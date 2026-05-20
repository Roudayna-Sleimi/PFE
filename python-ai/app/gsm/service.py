"""
Titre: Service GSM Unifie
Explication: Ce module gere en un seul endroit la recuperation des alertes, la generation TTS et la publication MQTT des appels.
Utilite: Il simplifie la partie GSM avec un fichier unique et des responsabilites directes.
"""

from __future__ import annotations

import base64
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import paho.mqtt.publish as publish

from app.db.mongo import get_database
from app.shared.config import AppSettings, load_settings

try:
    import pyttsx3
except Exception:
    pyttsx3 = None


def build_tts_message(alert: dict) -> str:
    machine = alert.get("machineId", "machine inconnue")
    message = alert.get("message", "alerte")
    return f"Alerte. Probleme detecte sur {machine}. {message}. Merci de verifier le dashboard immediatement."


def generate_audio(
    text: str,
    alert_id: str,
    attempt_no: int,
    audio_output_dir: Path,
    enabled: bool,
    rate: int,
    volume: float,
) -> dict | None:
    if not enabled:
        return None
    if pyttsx3 is None:
        print("[supervisor] pyttsx3 not available, sending text only")
        return None

    audio_output_dir.mkdir(parents=True, exist_ok=True)
    output_file = audio_output_dir / f"alert_{alert_id}_attempt_{attempt_no}.wav"
    try:
        engine = pyttsx3.init()
        engine.setProperty("rate", int(rate))
        engine.setProperty("volume", max(0.0, min(1.0, float(volume))))
        engine.save_to_file(text, str(output_file))
        engine.runAndWait()
        engine.stop()

        if not output_file.exists():
            print(f"[supervisor] tts generation failed for alert {alert_id}")
            return None
        return {"path": str(output_file.resolve()), "format": "wav"}
    except Exception as exc:
        print(f"[supervisor] tts error: {exc}")
        return None


def maybe_inline_audio(file_path: str, enabled: bool, max_inline_bytes: int) -> str | None:
    if not enabled or not file_path:
        return None

    path = Path(file_path)
    try:
        if not path.exists():
            return None
        file_size = path.stat().st_size
        if file_size > max_inline_bytes:
            print(f"[supervisor] audio too large to inline ({file_size} bytes), using file path only")
            return None
        return base64.b64encode(path.read_bytes()).decode("ascii")
    except Exception as exc:
        print(f"[supervisor] audio base64 error: {exc}")
        return None


class GsmSupervisorService:
    def __init__(self, settings: AppSettings | None = None):
        self.settings = settings or load_settings()
        self.db = get_database(self.settings)

    def _get_active_contact(self):
        return self.db.contacts.find_one({"isActive": True}, sort=[("createdAt", -1)])

    def _find_pending_alerts(self):
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=max(1, self.settings.gsm.unseen_minutes))
        return self.db.alerts.find(
            {
                "status": "new",
                "seenAt": None,
                "createdAt": {"$lte": cutoff},
                "callAttempts": {"$lt": max(1, self.settings.gsm.max_attempts)},
            }
        ).sort("createdAt", 1)

    def _publish_call(
        self,
        alert: dict,
        contact: dict,
        attempt_no: int,
        text_to_read: str,
        audio_info: dict | None,
        audio_base64: str | None,
    ) -> None:
        payload = {
            "alertId": str(alert["_id"]),
            "phoneNumber": contact["phonePrimary"],
            "attemptNo": attempt_no,
            "textToRead": text_to_read,
            "machineId": alert.get("machineId", "UNKNOWN"),
            "severity": alert.get("severity", "warning"),
            "audioFilePath": audio_info["path"] if audio_info else None,
            "audioFormat": audio_info["format"] if audio_info else None,
            "audioBase64": audio_base64,
        }
        publish.single(
            self.settings.mqtt.gsm_call_topic,
            payload=json.dumps(payload),
            hostname=self.settings.mqtt.broker,
            port=self.settings.mqtt.port,
        )

    def _insert_call_log(self, alert: dict, phone_number: str, attempt_no: int, audio_info: dict | None) -> None:
        self.db.calllogs.insert_one(
            {
                "alertId": alert["_id"],
                "phoneNumber": phone_number,
                "attemptNo": attempt_no,
                "callStatus": "queued",
                "providerRef": None,
                "audioFilePath": audio_info["path"] if audio_info else None,
                "audioFormat": audio_info["format"] if audio_info else None,
                "calledAt": datetime.now(timezone.utc),
                "endedAt": None,
                "durationSec": None,
                "errorMessage": None,
            }
        )

    def _mark_alert_notified(self, alert_id) -> None:
        self.db.alerts.update_one(
            {"_id": alert_id},
            {
                "$set": {
                    "status": "notified",
                    "notifiedAt": datetime.now(timezone.utc),
                    "notifiedBy": "gsm-supervisor",
                },
                "$inc": {"callAttempts": 1},
            },
        )

    def process_once(self) -> None:
        contact = self._get_active_contact()
        if not contact:
            print("[supervisor] no active contact configured")
            return

        for alert in self._find_pending_alerts():
            attempt_no = int(alert.get("callAttempts", 0)) + 1
            text_to_read = build_tts_message(alert)
            audio_info = generate_audio(
                text=text_to_read,
                alert_id=str(alert["_id"]),
                attempt_no=attempt_no,
                audio_output_dir=self.settings.paths.runtime_audio_dir,
                enabled=self.settings.gsm.enable_tts,
                rate=self.settings.gsm.tts_rate,
                volume=self.settings.gsm.tts_volume,
            )
            audio_base64 = maybe_inline_audio(
                file_path=audio_info["path"] if audio_info else "",
                enabled=self.settings.gsm.embed_audio_base64,
                max_inline_bytes=self.settings.gsm.max_audio_inline_bytes,
            )

            self._publish_call(
                alert=alert,
                contact=contact,
                attempt_no=attempt_no,
                text_to_read=text_to_read,
                audio_info=audio_info,
                audio_base64=audio_base64,
            )
            self._insert_call_log(
                alert=alert,
                phone_number=contact["phonePrimary"],
                attempt_no=attempt_no,
                audio_info=audio_info,
            )
            self._mark_alert_notified(alert["_id"])
            print(f"[supervisor] call queued for alert {alert['_id']} attempt={attempt_no}")

    def run_forever(self) -> None:
        print("[supervisor] started")
        while True:
            try:
                self.process_once()
            except Exception as exc:
                print(f"[supervisor] error: {exc}")
            time.sleep(self.settings.gsm.poll_sec)


def main() -> None:
    GsmSupervisorService().run_forever()


if __name__ == "__main__":
    main()

