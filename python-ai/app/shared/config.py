"""
Titre: Configuration et Utilitaires Partages
Explication: Ce fichier centralise les constantes metier, le chargement .env, les parsers simples et toute la configuration applicative.
Utilite: Avoir une seule source de verite rend le projet plus lisible, evite les doublons et simplifie la maintenance.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[2]

FEATURE_COLUMNS = ["vibX", "vibY", "vibZ", "courant", "rpm", "pression"]
CLASS_NAMES = ["normal", "warning", "critical"]
LABEL_TO_INDEX = {name: index for index, name in enumerate(CLASS_NAMES)}
INDEX_TO_LABEL = {index: name for name, index in LABEL_TO_INDEX.items()}


def load_environment() -> None:
    load_dotenv(BASE_DIR / ".env")


def resolve_project_path(value: str | Path) -> Path:
    path = Path(value)
    return path if path.is_absolute() else BASE_DIR / path


def ensure_parent_dir(file_path: str | Path) -> Path:
    resolved = resolve_project_path(file_path)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    return resolved


def to_float(value, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def parse_utc_timestamp(value) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

    text = str(value or "").strip()
    if not text:
        return datetime(1970, 1, 1, tzinfo=timezone.utc)
    text = text.replace("Z", "+00:00")

    try:
        parsed = datetime.fromisoformat(text)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return datetime(1970, 1, 1, tzinfo=timezone.utc)


@dataclass(frozen=True)
class MongoSettings:
    uri: str
    db_name: str


@dataclass(frozen=True)
class MqttSettings:
    broker: str
    port: int
    sensor_topic: str
    gsm_call_topic: str


@dataclass(frozen=True)
class PathSettings:
    dataset_path: Path
    output_dataset_path: Path
    model_path: Path
    preprocessor_path: Path
    train_metrics_path: Path
    training_curve_path: Path
    confusion_matrix_path: Path
    runtime_audio_dir: Path
    runtime_logs_dir: Path


@dataclass(frozen=True)
class ThresholdSettings:
    current_warning: float
    current_critical: float
    vibration_warning: float
    vibration_critical: float
    pressure_warning_low: float
    pressure_warning_high: float
    pressure_critical_low: float
    pressure_critical_high: float


@dataclass(frozen=True)
class TrainingSettings:
    sequence_length: int
    window_stride: int
    test_ratio: float
    random_seed: int
    epochs: int
    batch_size: int
    learning_rate: float
    validation_split: float
    early_stopping_patience: int
    synthetic_target_ratio: float
    synthetic_min_per_class: int
    synthetic_max_per_class: int
    enable_plots: bool


@dataclass(frozen=True)
class InferenceSettings:
    alert_cooldown_sec: int
    model_reload_sec: int
    min_history_for_alert: int


@dataclass(frozen=True)
class SchedulerSettings:
    interval_minutes: int
    run_on_start: bool
    stop_on_error: bool


@dataclass(frozen=True)
class GsmSettings:
    unseen_minutes: int
    poll_sec: int
    max_attempts: int
    enable_tts: bool
    tts_rate: int
    tts_volume: float
    embed_audio_base64: bool
    max_audio_inline_bytes: int


@dataclass(frozen=True)
class AppSettings:
    mongo: MongoSettings
    mqtt: MqttSettings
    paths: PathSettings
    thresholds: ThresholdSettings
    training: TrainingSettings
    inference: InferenceSettings
    scheduler: SchedulerSettings
    gsm: GsmSettings


def load_settings() -> AppSettings:
    load_environment()

    mongo = MongoSettings(
        uri=os.getenv("MONGO_URI", "mongodb://localhost:27017/cncpulse"),
        db_name=os.getenv("MONGO_DB_NAME", "cncpulse"),
    )
    mqtt = MqttSettings(
        broker=os.getenv("MQTT_BROKER", "broker.hivemq.com"),
        port=int(os.getenv("MQTT_PORT", "1883")),
        sensor_topic=os.getenv("MQTT_SENSOR_TOPIC", "cncpulse/sensors"),
        gsm_call_topic=os.getenv("MQTT_GSM_CALL_TOPIC", "cncpulse/gsm/call"),
    )
    paths = PathSettings(
        dataset_path=resolve_project_path(os.getenv("DATASET_PATH", "data/lstm_dataset.csv")),
        output_dataset_path=resolve_project_path(
            os.getenv("OUTPUT_DATASET_PATH", os.getenv("DATASET_PATH", "data/lstm_dataset.csv"))
        ),
        model_path=resolve_project_path(os.getenv("MODEL_PATH", "models/maintenance_lstm.h5")),
        preprocessor_path=resolve_project_path(
            os.getenv("PREPROCESSOR_PATH", "models/lstm_preprocessor.json")
        ),
        train_metrics_path=resolve_project_path(
            os.getenv("TRAIN_METRICS_PATH", "models/lstm_training_metrics.json")
        ),
        training_curve_path=resolve_project_path(
            os.getenv("TRAINING_CURVE_PATH", "models/lstm_training_curves.png")
        ),
        confusion_matrix_path=resolve_project_path(
            os.getenv("CONFUSION_MATRIX_PATH", "models/lstm_confusion_matrix.png")
        ),
        runtime_audio_dir=resolve_project_path(os.getenv("AUDIO_OUTPUT_DIR", "runtime/audio")),
        runtime_logs_dir=resolve_project_path(os.getenv("RUNTIME_LOG_DIR", "runtime/logs")),
    )
    thresholds = ThresholdSettings(
        current_warning=to_float(os.getenv("THRESHOLD_CURRENT_WARNING"), 15.0),
        current_critical=to_float(os.getenv("THRESHOLD_CURRENT_CRITICAL"), 20.0),
        vibration_warning=to_float(os.getenv("THRESHOLD_VIB_WARNING"), 2.0),
        vibration_critical=to_float(os.getenv("THRESHOLD_VIB_CRITICAL"), 3.0),
        pressure_warning_low=to_float(os.getenv("THRESHOLD_PRESSURE_WARNING_LOW"), 4.5),
        pressure_warning_high=to_float(os.getenv("THRESHOLD_PRESSURE_WARNING_HIGH"), 10.0),
        pressure_critical_low=to_float(os.getenv("THRESHOLD_PRESSURE_CRITICAL_LOW"), 3.5),
        pressure_critical_high=to_float(os.getenv("THRESHOLD_PRESSURE_CRITICAL_HIGH"), 11.0),
    )
    training = TrainingSettings(
        sequence_length=int(os.getenv("SEQUENCE_LENGTH", "30")),
        window_stride=int(os.getenv("WINDOW_STRIDE", "1")),
        test_ratio=to_float(os.getenv("TEST_RATIO"), 0.2),
        random_seed=int(os.getenv("RANDOM_SEED", "42")),
        epochs=int(os.getenv("LSTM_EPOCHS", "40")),
        batch_size=int(os.getenv("LSTM_BATCH_SIZE", "64")),
        learning_rate=to_float(os.getenv("LSTM_LEARNING_RATE"), 0.001),
        validation_split=to_float(os.getenv("VALIDATION_SPLIT"), 0.2),
        early_stopping_patience=int(os.getenv("EARLY_STOPPING_PATIENCE", "8")),
        synthetic_target_ratio=to_float(os.getenv("SYNTHETIC_TARGET_RATIO"), 0.6),
        synthetic_min_per_class=int(os.getenv("SYNTHETIC_MIN_PER_CLASS", "300")),
        synthetic_max_per_class=int(os.getenv("SYNTHETIC_MAX_PER_CLASS", "5000")),
        enable_plots=parse_bool(os.getenv("ENABLE_TRAINING_PLOTS", "1"), default=True),
    )
    inference = InferenceSettings(
        alert_cooldown_sec=int(os.getenv("ALERT_COOLDOWN_SEC", "60")),
        model_reload_sec=int(os.getenv("MODEL_RELOAD_SEC", "15")),
        min_history_for_alert=int(os.getenv("MIN_HISTORY_FOR_ALERT", "8")),
    )
    scheduler = SchedulerSettings(
        interval_minutes=int(os.getenv("AUTO_TRAIN_INTERVAL_MINUTES", "60")),
        run_on_start=parse_bool(os.getenv("AUTO_TRAIN_RUN_ON_START", "1"), default=True),
        stop_on_error=parse_bool(os.getenv("AUTO_TRAIN_STOP_ON_ERROR", "0"), default=False),
    )
    gsm = GsmSettings(
        unseen_minutes=int(os.getenv("UNSEEN_MINUTES", "5")),
        poll_sec=int(os.getenv("SUPERVISOR_POLL_SEC", "15")),
        max_attempts=int(os.getenv("GSM_MAX_ATTEMPTS", "3")),
        enable_tts=parse_bool(os.getenv("ENABLE_TTS", "1"), default=True),
        tts_rate=int(os.getenv("TTS_RATE", "165")),
        tts_volume=to_float(os.getenv("TTS_VOLUME"), 1.0),
        embed_audio_base64=parse_bool(os.getenv("EMBED_AUDIO_BASE64", "1"), default=True),
        max_audio_inline_bytes=int(os.getenv("MAX_AUDIO_INLINE_BYTES", "500000")),
    )

    return AppSettings(
        mongo=mongo,
        mqtt=mqtt,
        paths=paths,
        thresholds=thresholds,
        training=training,
        inference=inference,
        scheduler=scheduler,
        gsm=gsm,
    )

