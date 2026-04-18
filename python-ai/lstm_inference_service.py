import json
import os
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from pymongo import MongoClient

# --- Environment ---
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/cncpulse")
DB_NAME = os.getenv("MONGO_DB_NAME", "cncpulse")
MQTT_BROKER = os.getenv("MQTT_BROKER", "broker.hivemq.com")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
SENSOR_TOPIC = os.getenv("MQTT_SENSOR_TOPIC", "cncpulse/sensors")
RULES_PATH = os.getenv("RULES_PATH", "models/maintenance_rules.json")
ALERT_COOLDOWN_SEC = int(os.getenv("ALERT_COOLDOWN_SEC", "60"))
RULES_RELOAD_SEC = int(os.getenv("RULES_RELOAD_SEC", "15"))

FEATURES = ["vibX", "vibY", "vibZ", "courant", "rpm"]
LABEL_ORDER = {"normal": 0, "warning": 1, "critical": 2}

DEFAULT_THRESHOLDS = {
    "current_warning": float(os.getenv("THRESHOLD_CURRENT_WARNING", "15")),
    "current_critical": float(os.getenv("THRESHOLD_CURRENT_CRITICAL", "20")),
    "vibration_warning": float(os.getenv("THRESHOLD_VIB_WARNING", "2")),
    "vibration_critical": float(os.getenv("THRESHOLD_VIB_CRITICAL", "3")),
    "pressure_warning_low": float(os.getenv("THRESHOLD_PRESSURE_WARNING_LOW", "4.5")),
    "pressure_warning_high": float(os.getenv("THRESHOLD_PRESSURE_WARNING_HIGH", "10")),
    "pressure_critical_low": float(os.getenv("THRESHOLD_PRESSURE_CRITICAL_LOW", "3.5")),
    "pressure_critical_high": float(os.getenv("THRESHOLD_PRESSURE_CRITICAL_HIGH", "11")),
    "baseline_min_points": int(os.getenv("BASELINE_MIN_POINTS", "20")),
    "warning_zscore": float(os.getenv("WARNING_ZSCORE", "3.0")),
    "critical_zscore": float(os.getenv("CRITICAL_ZSCORE", "4.0")),
}


# --- Helpers ---
def resolve_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else BASE_DIR / path


def to_float(value, default=0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def strongest(*labels: str) -> str:
    return max(labels, key=lambda label: LABEL_ORDER[label])


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


# --- Rules loading ---
def load_rules(path: Path) -> dict:
    payload = {
        "version": "simple-rules-v1",
        "thresholds": dict(DEFAULT_THRESHOLDS),
        "machine_baselines": {},
    }

    if not path.exists():
        print(f"[rules] file not found, using env defaults: {path}")
        return payload

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data.get("thresholds"), dict):
            payload["thresholds"].update(data["thresholds"])
        if isinstance(data.get("machine_baselines"), dict):
            payload["machine_baselines"] = data["machine_baselines"]
        payload["version"] = str(data.get("version") or payload["version"])
        return payload
    except Exception as exc:
        print(f"[rules] cannot read {path}, using defaults: {exc}")
        return payload


# --- Sensor assessment ---
def sensor_snapshot(data: dict) -> dict:
    snapshot = {feature: to_float(data.get(feature)) for feature in FEATURES}
    if data.get("pression") is not None:
        snapshot["pression"] = to_float(data.get("pression"))
    return snapshot


def threshold_assessment(snapshot: dict, thresholds: dict) -> tuple[str, list[dict]]:
    contributors = []
    label = "normal"

    max_vib = max(abs(snapshot["vibX"]), abs(snapshot["vibY"]), abs(snapshot["vibZ"]))
    current = snapshot["courant"]

    if current >= thresholds["current_critical"]:
        contributors.append(
            {
                "metric": "courant",
                "label": "Current critical",
                "value": round(current, 3),
                "expected": f"< {thresholds['current_critical']}",
                "level": "critical",
            }
        )
        label = strongest(label, "critical")
    elif current >= thresholds["current_warning"]:
        contributors.append(
            {
                "metric": "courant",
                "label": "Current warning",
                "value": round(current, 3),
                "expected": f"< {thresholds['current_warning']}",
                "level": "warning",
            }
        )
        label = strongest(label, "warning")

    if max_vib >= thresholds["vibration_critical"]:
        contributors.append(
            {
                "metric": "vibration",
                "label": "Vibration critical",
                "value": round(max_vib, 3),
                "expected": f"< {thresholds['vibration_critical']}",
                "level": "critical",
            }
        )
        label = strongest(label, "critical")
    elif max_vib >= thresholds["vibration_warning"]:
        contributors.append(
            {
                "metric": "vibration",
                "label": "Vibration warning",
                "value": round(max_vib, 3),
                "expected": f"< {thresholds['vibration_warning']}",
                "level": "warning",
            }
        )
        label = strongest(label, "warning")

    pressure = snapshot.get("pression")
    if pressure is not None:
        if pressure <= thresholds["pressure_critical_low"] or pressure >= thresholds["pressure_critical_high"]:
            contributors.append(
                {
                    "metric": "pression",
                    "label": "Pressure critical",
                    "value": round(pressure, 3),
                    "expected": (
                        f"{thresholds['pressure_critical_low']} - {thresholds['pressure_critical_high']}"
                    ),
                    "level": "critical",
                }
            )
            label = strongest(label, "critical")
        elif pressure <= thresholds["pressure_warning_low"] or pressure >= thresholds["pressure_warning_high"]:
            contributors.append(
                {
                    "metric": "pression",
                    "label": "Pressure warning",
                    "value": round(pressure, 3),
                    "expected": (
                        f"{thresholds['pressure_warning_low']} - {thresholds['pressure_warning_high']}"
                    ),
                    "level": "warning",
                }
            )
            label = strongest(label, "warning")

    return label, contributors


def baseline_assessment(machine_id: str, snapshot: dict, rules: dict) -> tuple[str, list[dict]]:
    machine_stats = rules["machine_baselines"].get(machine_id)
    if not machine_stats:
        return "normal", []

    thresholds = rules["thresholds"]
    contributors = []
    label = "normal"

    for feature in FEATURES:
        stats = machine_stats.get(feature)
        if not isinstance(stats, dict):
            continue

        count = int(to_float(stats.get("count"), 0))
        if count < int(thresholds["baseline_min_points"]):
            continue

        mean = to_float(stats.get("mean"))
        std = to_float(stats.get("std"))
        if std < 1e-6:
            continue

        zscore = abs((snapshot[feature] - mean) / std)
        if zscore >= thresholds["critical_zscore"]:
            contributors.append(
                {
                    "metric": feature,
                    "label": f"{feature} far from baseline",
                    "value": round(snapshot[feature], 3),
                    "expected": f"{round(mean, 3)} +/- {round(std, 3)}",
                    "level": "critical",
                }
            )
            label = strongest(label, "critical")
        elif zscore >= thresholds["warning_zscore"]:
            contributors.append(
                {
                    "metric": feature,
                    "label": f"{feature} out of baseline",
                    "value": round(snapshot[feature], 3),
                    "expected": f"{round(mean, 3)} +/- {round(std, 3)}",
                    "level": "warning",
                }
            )
            label = strongest(label, "warning")

    return label, contributors


def confidence_from_label(label: str, contributors: list[dict]) -> float:
    if label == "normal":
        return 0.20
    if label == "warning":
        return min(0.89, 0.65 + 0.03 * len(contributors))
    return min(0.98, 0.85 + 0.02 * len(contributors))


def probabilities_from_label(label: str, confidence: float) -> dict:
    if label == "normal":
        return {"normal": 0.90, "warning": 0.08, "critical": 0.02}

    residual = max(0.0, 1.0 - confidence)
    if label == "warning":
        return {
            "normal": round(residual * 0.6, 4),
            "warning": round(confidence, 4),
            "critical": round(residual * 0.4, 4),
        }
    return {
        "normal": round(residual * 0.2, 4),
        "warning": round(residual * 0.8, 4),
        "critical": round(confidence, 4),
    }


def assess_payload(data: dict, rules: dict) -> dict:
    snapshot = sensor_snapshot(data)
    machine_id = str(data.get("machineId") or data.get("node") or "UNKNOWN")

    threshold_label, threshold_contributors = threshold_assessment(snapshot, rules["thresholds"])
    baseline_label, baseline_contributors = baseline_assessment(machine_id, snapshot, rules)
    label = strongest(threshold_label, baseline_label)

    contributors = threshold_contributors + baseline_contributors
    confidence = confidence_from_label(label, contributors)
    probabilities = probabilities_from_label(label, confidence)

    return {
        "machine_id": machine_id,
        "label": label,
        "severity": "critical" if label == "critical" else "warning",
        "confidence": confidence,
        "proba": probabilities,
        "contributors": contributors,
        "snapshot": snapshot,
    }


# --- Mongo integration ---
mongo_client = MongoClient(MONGO_URI)
db = mongo_client[DB_NAME]
rules_path = resolve_path(RULES_PATH)
rules = load_rules(rules_path)
rules_mtime = rules_path.stat().st_mtime if rules_path.exists() else None
last_rules_check_monotonic = 0.0
last_alert_at = defaultdict(lambda: datetime.min.replace(tzinfo=timezone.utc))


def maybe_reload_rules() -> None:
    global rules, rules_mtime, last_rules_check_monotonic

    if RULES_RELOAD_SEC <= 0:
        return

    now_monotonic = time.monotonic()
    if now_monotonic - last_rules_check_monotonic < RULES_RELOAD_SEC:
        return
    last_rules_check_monotonic = now_monotonic

    new_mtime = rules_path.stat().st_mtime if rules_path.exists() else None
    if new_mtime == rules_mtime:
        return

    rules = load_rules(rules_path)
    rules_mtime = new_mtime
    print(f"[rules] reloaded from {rules_path}")


def should_emit_alert(machine_id: str) -> bool:
    elapsed = (now_utc() - last_alert_at[machine_id]).total_seconds()
    return elapsed >= ALERT_COOLDOWN_SEC


def create_maintenance_report(data: dict, alert_id, result: dict) -> None:
    machine_id = result["machine_id"]
    severity = result["severity"]
    score = int(round(result["confidence"] * 100))

    prediction = {
        "label": "Panne probable" if severity == "critical" else "Risque de panne",
        "eta": "moins de 24h" if severity == "critical" else "24-72h",
        "confidence": score,
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
        "source": "simple-rule-engine",
        "severity": severity,
        "anomalyScore": score,
        "prediction": prediction,
        "recommendedAction": recommended_action,
        "contributors": result["contributors"],
        "sensorSnapshot": result["snapshot"],
        "status": "open",
        "createdAt": now_utc(),
    }
    report_id = db.maintenancereports.insert_one(report).inserted_id

    existing_request = db.maintenancerequests.find_one(
        {
            "machineId": machine_id,
            "status": {"$in": ["open", "in_progress"]},
        }
    )
    if existing_request:
        db.maintenancereports.update_one(
            {"_id": report_id},
            {"$set": {"requestId": existing_request["_id"]}},
        )
        db.maintenancerequests.update_one(
            {"_id": existing_request["_id"]},
            {"$set": {"lastReportId": report_id, "updatedAt": now_utc()}},
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
        "createdAt": now_utc(),
        "resolvedAt": None,
        "resolvedBy": None,
    }
    request_id = db.maintenancerequests.insert_one(request_doc).inserted_id
    db.maintenancereports.update_one({"_id": report_id}, {"$set": {"requestId": request_id}})


def create_ai_alert(data: dict, result: dict) -> None:
    machine_id = result["machine_id"]
    label = result["label"]
    severity = result["severity"]
    confidence = result["confidence"]

    if label == "normal":
        return
    if not should_emit_alert(machine_id):
        return

    created_at = now_utc()
    alert_doc = {
        "machineId": machine_id,
        "node": data.get("node", "UNKNOWN"),
        "type": "maintenance-ai",
        "severity": severity,
        "message": f"Maintenance risk {severity} detected on {machine_id}",
        "status": "new",
        "createdAt": created_at,
        "seenAt": None,
        "seenBy": None,
        "notifiedAt": None,
        "notifiedBy": None,
        "callAttempts": 0,
        "ai": {
            "source": "rule-engine",
            "label": label,
            "proba": result["proba"],
            "model": "SimpleThresholdBaseline",
            "version": rules.get("version", "simple-rules-v1"),
        },
        "sensorSnapshot": result["snapshot"],
    }

    alert_id = db.alerts.insert_one(alert_doc).inserted_id
    create_maintenance_report(data, alert_id, result)
    last_alert_at[machine_id] = created_at
    print(f"[AI] {severity.upper()} alert - {machine_id} - {label} ({confidence:.2f})")


# --- MQTT callback ---
def on_message(_client, _userdata, msg):
    try:
        maybe_reload_rules()
        payload = json.loads(msg.payload.decode("utf-8"))
        result = assess_payload(payload, rules)
        print(
            f"[AI] {result['machine_id']} -> {result['label']} "
            f"({result['confidence']:.2f}) [rule-engine]"
        )
        create_ai_alert(payload, result)
    except Exception as exc:
        print(f"[inference] error: {exc}")


def main():
    client = mqtt.Client()
    client.on_message = on_message
    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    client.subscribe(SENSOR_TOPIC)
    print(f"[AI] Inference service listening on {SENSOR_TOPIC}")
    print(f"[AI] Rules: {rules_path}")
    print(f"[AI] Rules reload every {RULES_RELOAD_SEC}s")
    client.loop_forever()


if __name__ == "__main__":
    main()
