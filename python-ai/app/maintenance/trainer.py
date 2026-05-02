"""
Titre: Entrainement LSTM Maintenance
Explication: Ce module prepare les sequences temporelles, gere l'equilibrage synthetique et entraine le modele LSTM.
Utilite: Il isole toute la chaine d'entrainement hors des services temps reel pour garder un backend clair.
"""

import argparse
import csv
import json
import math
import os
import random
import traceback
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from dotenv import load_dotenv

# --- Constants ---
FEATURE_COLUMNS = ["vibX", "vibY", "vibZ", "courant", "rpm", "pression"]
CLASS_NAMES = ["normal", "warning", "critical"]
LABEL_TO_INDEX = {name: index for index, name in enumerate(CLASS_NAMES)}
INDEX_TO_LABEL = {index: name for name, index in LABEL_TO_INDEX.items()}


# --- Environment and args ---
BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BASE_DIR / ".env")


@dataclass
class TrainingConfig:
    dataset_path: Path
    model_path: Path
    preprocessor_path: Path
    metrics_path: Path
    training_plot_path: Path
    confusion_plot_path: Path
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
    threshold_current_warning: float
    threshold_current_critical: float
    threshold_vibration_warning: float
    threshold_vibration_critical: float
    threshold_pressure_warning_low: float
    threshold_pressure_warning_high: float
    threshold_pressure_critical_low: float
    threshold_pressure_critical_high: float


def resolve_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else BASE_DIR / path


def to_float(value, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def normalize_label(value: str) -> str | None:
    label = str(value or "").strip().lower()
    return label if label in LABEL_TO_INDEX else None


def parse_timestamp(value: str) -> datetime:
    text = str(value or "").strip()
    if not text:
        return datetime(1970, 1, 1, tzinfo=timezone.utc)
    text = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return datetime(1970, 1, 1, tzinfo=timezone.utc)


def parse_args() -> TrainingConfig:
    parser = argparse.ArgumentParser(
        description="Train LSTM model for predictive maintenance anomaly classification."
    )
    parser.add_argument("--dataset-path", default=os.getenv("DATASET_PATH", "data/lstm_dataset.csv"))
    parser.add_argument("--model-path", default=os.getenv("MODEL_PATH", "models/maintenance_lstm.h5"))
    parser.add_argument(
        "--preprocessor-path",
        default=os.getenv("PREPROCESSOR_PATH", "models/lstm_preprocessor.json"),
    )
    parser.add_argument(
        "--metrics-path",
        default=os.getenv("TRAIN_METRICS_PATH", "models/lstm_training_metrics.json"),
    )
    parser.add_argument(
        "--training-plot-path",
        default=os.getenv("TRAINING_CURVE_PATH", "models/lstm_training_curves.png"),
    )
    parser.add_argument(
        "--confusion-plot-path",
        default=os.getenv("CONFUSION_MATRIX_PATH", "models/lstm_confusion_matrix.png"),
    )
    parser.add_argument("--sequence-length", type=int, default=int(os.getenv("SEQUENCE_LENGTH", "30")))
    parser.add_argument("--window-stride", type=int, default=int(os.getenv("WINDOW_STRIDE", "1")))
    parser.add_argument("--test-ratio", type=float, default=float(os.getenv("TEST_RATIO", "0.2")))
    parser.add_argument("--random-seed", type=int, default=int(os.getenv("RANDOM_SEED", "42")))
    parser.add_argument("--epochs", type=int, default=int(os.getenv("LSTM_EPOCHS", "40")))
    parser.add_argument("--batch-size", type=int, default=int(os.getenv("LSTM_BATCH_SIZE", "64")))
    parser.add_argument("--learning-rate", type=float, default=float(os.getenv("LSTM_LEARNING_RATE", "0.001")))
    parser.add_argument("--validation-split", type=float, default=float(os.getenv("VALIDATION_SPLIT", "0.2")))
    parser.add_argument(
        "--early-stopping-patience",
        type=int,
        default=int(os.getenv("EARLY_STOPPING_PATIENCE", "8")),
    )
    parser.add_argument(
        "--synthetic-target-ratio",
        type=float,
        default=float(os.getenv("SYNTHETIC_TARGET_RATIO", "0.6")),
    )
    parser.add_argument(
        "--synthetic-min-per-class",
        type=int,
        default=int(os.getenv("SYNTHETIC_MIN_PER_CLASS", "300")),
    )
    parser.add_argument(
        "--synthetic-max-per-class",
        type=int,
        default=int(os.getenv("SYNTHETIC_MAX_PER_CLASS", "5000")),
    )
    parser.add_argument(
        "--enable-plots",
        action="store_true",
        default=os.getenv("ENABLE_TRAINING_PLOTS", "1").strip().lower() in {"1", "true", "yes", "on"},
    )

    args = parser.parse_args()
    if args.sequence_length < 2:
        raise ValueError("SEQUENCE_LENGTH must be >= 2")
    if args.window_stride < 1:
        raise ValueError("WINDOW_STRIDE must be >= 1")
    if not 0.0 < args.test_ratio < 0.9:
        raise ValueError("TEST_RATIO must be in range (0, 0.9)")
    if not 0.0 <= args.validation_split < 0.5:
        raise ValueError("VALIDATION_SPLIT must be in range [0, 0.5)")

    return TrainingConfig(
        dataset_path=resolve_path(args.dataset_path),
        model_path=resolve_path(args.model_path),
        preprocessor_path=resolve_path(args.preprocessor_path),
        metrics_path=resolve_path(args.metrics_path),
        training_plot_path=resolve_path(args.training_plot_path),
        confusion_plot_path=resolve_path(args.confusion_plot_path),
        sequence_length=args.sequence_length,
        window_stride=args.window_stride,
        test_ratio=args.test_ratio,
        random_seed=args.random_seed,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        validation_split=args.validation_split,
        early_stopping_patience=args.early_stopping_patience,
        synthetic_target_ratio=max(0.0, args.synthetic_target_ratio),
        synthetic_min_per_class=max(0, args.synthetic_min_per_class),
        synthetic_max_per_class=max(1, args.synthetic_max_per_class),
        enable_plots=bool(args.enable_plots),
        threshold_current_warning=float(os.getenv("THRESHOLD_CURRENT_WARNING", "15")),
        threshold_current_critical=float(os.getenv("THRESHOLD_CURRENT_CRITICAL", "20")),
        threshold_vibration_warning=float(os.getenv("THRESHOLD_VIB_WARNING", "2")),
        threshold_vibration_critical=float(os.getenv("THRESHOLD_VIB_CRITICAL", "3")),
        threshold_pressure_warning_low=float(os.getenv("THRESHOLD_PRESSURE_WARNING_LOW", "4.5")),
        threshold_pressure_warning_high=float(os.getenv("THRESHOLD_PRESSURE_WARNING_HIGH", "10")),
        threshold_pressure_critical_low=float(os.getenv("THRESHOLD_PRESSURE_CRITICAL_LOW", "3.5")),
        threshold_pressure_critical_high=float(os.getenv("THRESHOLD_PRESSURE_CRITICAL_HIGH", "11")),
    )


# --- TensorFlow import ---
def import_tensorflow():
    try:
        import tensorflow as tf  # pylint: disable=import-outside-toplevel

        return tf
    except Exception as exc:
        raise RuntimeError(
            "TensorFlow is required. Install dependencies with: "
            "python -m pip install -r python-ai/requirements.txt"
        ) from exc


# --- Dataset loading and preprocessing ---
def read_dataset_rows(dataset_path: Path) -> list[dict]:
    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")

    with dataset_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)

    if not rows:
        raise RuntimeError("Dataset is empty. Run scripts/build_dataset.py first.")

    required_columns = {"timestamp", "label", "machine_id", *FEATURE_COLUMNS}
    missing = sorted(required_columns - set(rows[0].keys()))
    if missing:
        raise RuntimeError(f"Dataset is missing required columns: {missing}")

    return rows


def clean_rows(raw_rows: list[dict]) -> list[dict]:
    cleaned: list[dict] = []
    for row in raw_rows:
        label = normalize_label(row.get("label"))
        if label is None:
            continue

        machine_id = str(
            row.get("machine_id") or row.get("machineId") or row.get("node") or "UNKNOWN"
        ).strip()
        item = {
            "machine_id": machine_id or "UNKNOWN",
            "timestamp": parse_timestamp(row.get("timestamp")),
            "label": label,
            "features": {},
        }

        for feature in FEATURE_COLUMNS:
            raw_value = row.get(feature)
            if raw_value in (None, ""):
                item["features"][feature] = math.nan
            else:
                item["features"][feature] = to_float(raw_value, default=math.nan)
        cleaned.append(item)

    if not cleaned:
        raise RuntimeError("Dataset has no usable rows after cleaning labels.")
    return cleaned


def fill_missing_features(rows: list[dict]) -> None:
    medians: dict[str, float] = {}
    for feature in FEATURE_COLUMNS:
        values = [row["features"][feature] for row in rows if not math.isnan(row["features"][feature])]
        medians[feature] = float(np.median(values)) if values else 0.0

    for row in rows:
        for feature in FEATURE_COLUMNS:
            value = row["features"][feature]
            if math.isnan(value):
                row["features"][feature] = medians[feature]


def estimate_normal_baseline(rows: list[dict]) -> dict:
    normal_rows = [row for row in rows if row["label"] == "normal"]
    source_rows = normal_rows if normal_rows else rows
    baseline = {}

    for feature in FEATURE_COLUMNS:
        values = np.array([row["features"][feature] for row in source_rows], dtype=np.float32)
        if values.size == 0:
            baseline[feature] = {"mean": 0.0, "std": 1.0, "min": 0.0, "max": 0.0}
            continue

        std = float(values.std())
        baseline[feature] = {
            "mean": float(values.mean()),
            "std": std if std > 1e-6 else 1.0,
            "min": float(values.min()),
            "max": float(values.max()),
        }

    return baseline


def sort_rows(rows: list[dict]) -> list[dict]:
    return sorted(rows, key=lambda row: (row["machine_id"], row["timestamp"]))


def build_sliding_windows(
    rows: list[dict],
    sequence_length: int,
    stride: int,
) -> tuple[np.ndarray, np.ndarray]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        grouped[row["machine_id"]].append(row)

    sequences = []
    labels = []

    for machine_rows in grouped.values():
        if len(machine_rows) < sequence_length:
            continue

        feature_matrix = np.array(
            [[row["features"][feature] for feature in FEATURE_COLUMNS] for row in machine_rows],
            dtype=np.float32,
        )
        label_array = np.array([LABEL_TO_INDEX[row["label"]] for row in machine_rows], dtype=np.int32)

        for end_index in range(sequence_length - 1, len(machine_rows), stride):
            start_index = end_index - sequence_length + 1
            sequences.append(feature_matrix[start_index : end_index + 1])
            labels.append(label_array[end_index])

    if not sequences:
        raise RuntimeError(
            "No sequences generated. Increase data volume or decrease SEQUENCE_LENGTH."
        )

    return np.array(sequences, dtype=np.float32), np.array(labels, dtype=np.int32)


def stratified_split(
    x_data: np.ndarray,
    y_data: np.ndarray,
    test_ratio: float,
    seed: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    train_indices: list[int] = []
    test_indices: list[int] = []

    all_indices = np.arange(len(y_data))
    for class_index in range(len(CLASS_NAMES)):
        class_indices = all_indices[y_data == class_index]
        if class_indices.size == 0:
            continue
        rng.shuffle(class_indices)

        if class_indices.size == 1:
            train_indices.extend(class_indices.tolist())
            continue

        test_count = max(1, int(round(class_indices.size * test_ratio)))
        test_count = min(test_count, class_indices.size - 1)
        test_indices.extend(class_indices[:test_count].tolist())
        train_indices.extend(class_indices[test_count:].tolist())

    if not test_indices:
        raise RuntimeError("Not enough data to create test split.")

    rng.shuffle(train_indices)
    rng.shuffle(test_indices)

    return (
        x_data[np.array(train_indices, dtype=np.int32)],
        x_data[np.array(test_indices, dtype=np.int32)],
        y_data[np.array(train_indices, dtype=np.int32)],
        y_data[np.array(test_indices, dtype=np.int32)],
    )


def fit_standardizer(x_train: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    flattened = x_train.reshape(-1, x_train.shape[-1])
    mean = flattened.mean(axis=0)
    std = flattened.std(axis=0)
    std = np.where(std < 1e-6, 1.0, std)
    return mean.astype(np.float32), std.astype(np.float32)


def apply_standardizer(x_data: np.ndarray, mean: np.ndarray, std: np.ndarray) -> np.ndarray:
    return ((x_data - mean) / std).astype(np.float32)


def class_counts(y_data: np.ndarray) -> dict[str, int]:
    counts = {name: 0 for name in CLASS_NAMES}
    for label_index, count in enumerate(np.bincount(y_data, minlength=len(CLASS_NAMES))):
        counts[INDEX_TO_LABEL[label_index]] = int(count)
    return counts


# --- Synthetic balancing ---
def strongest_label(sample: np.ndarray, config: TrainingConfig) -> str:
    vib_x, vib_y, vib_z, courant, _, pression = sample.tolist()
    max_vibration = max(abs(vib_x), abs(vib_y), abs(vib_z))
    label = "normal"

    if courant >= config.threshold_current_critical or max_vibration >= config.threshold_vibration_critical:
        label = "critical"
    elif courant >= config.threshold_current_warning or max_vibration >= config.threshold_vibration_warning:
        label = "warning"

    if pression <= config.threshold_pressure_critical_low or pression >= config.threshold_pressure_critical_high:
        label = "critical"
    elif pression <= config.threshold_pressure_warning_low or pression >= config.threshold_pressure_warning_high:
        label = "warning" if label == "normal" else label

    return label


def smooth_transition(
    start: float,
    end: float,
    curve: np.ndarray,
    oscillation: float,
    phase: float,
    noise_scale: float,
    rng: np.random.Generator,
) -> np.ndarray:
    values = start + (end - start) * curve
    seasonal = oscillation * np.sin((2.0 * np.pi * curve) + phase)
    drift_noise = rng.normal(0.0, noise_scale, size=curve.shape[0]).astype(np.float32)
    return values + seasonal + drift_noise


def generate_progressive_sequence(
    target_label: str,
    baseline: dict,
    sequence_length: int,
    config: TrainingConfig,
    rng: np.random.Generator,
) -> np.ndarray:
    curve = np.linspace(0.0, 1.0, sequence_length, dtype=np.float32) ** 1.8
    sequence = np.zeros((sequence_length, len(FEATURE_COLUMNS)), dtype=np.float32)

    dominant_axis = int(rng.integers(0, 3))
    vib_target = (
        rng.uniform(config.threshold_vibration_warning * 1.05, config.threshold_vibration_critical * 0.92)
        if target_label == "warning"
        else rng.uniform(config.threshold_vibration_critical * 1.05, config.threshold_vibration_critical * 1.9)
    )
    current_target = (
        rng.uniform(config.threshold_current_warning * 1.03, config.threshold_current_critical * 0.92)
        if target_label == "warning"
        else rng.uniform(config.threshold_current_critical * 1.02, config.threshold_current_critical * 1.75)
    )

    for axis_index, feature in enumerate(["vibX", "vibY", "vibZ"]):
        base = baseline[feature]
        start = base["mean"] + rng.normal(0.0, base["std"] * 0.25)
        axis_scale = 1.0 if axis_index == dominant_axis else rng.uniform(0.5, 0.85)
        target = max(0.0, vib_target * axis_scale)
        noise_scale = max(0.002, base["std"] * 0.05)
        sequence[:, axis_index] = smooth_transition(
            start=start,
            end=target,
            curve=curve,
            oscillation=max(0.01, target * 0.04),
            phase=float(rng.uniform(0.0, np.pi)),
            noise_scale=noise_scale,
            rng=rng,
        )
        sequence[:, axis_index] = np.clip(sequence[:, axis_index], 0.0, None)

    current_base = baseline["courant"]
    current_start = current_base["mean"] + rng.normal(0.0, current_base["std"] * 0.3)
    sequence[:, 3] = smooth_transition(
        start=max(0.0, current_start),
        end=current_target,
        curve=curve,
        oscillation=max(0.05, current_target * 0.03),
        phase=float(rng.uniform(0.0, np.pi)),
        noise_scale=max(0.01, current_base["std"] * 0.06),
        rng=rng,
    )
    sequence[:, 3] = np.clip(sequence[:, 3], 0.0, None)

    rpm_base = baseline["rpm"]
    rpm_start = max(0.0, rpm_base["mean"] + rng.normal(0.0, rpm_base["std"] * 0.15))
    if target_label == "warning":
        rpm_end = rpm_start * rng.uniform(0.95, 0.99)
    else:
        rpm_end = rpm_start * rng.uniform(0.82, 0.95)
    sequence[:, 4] = smooth_transition(
        start=rpm_start,
        end=max(0.0, rpm_end),
        curve=curve,
        oscillation=max(0.01, rpm_start * 0.015),
        phase=float(rng.uniform(0.0, np.pi)),
        noise_scale=max(0.002, rpm_base["std"] * 0.03),
        rng=rng,
    )
    sequence[:, 4] = np.clip(sequence[:, 4], 0.0, None)

    pressure_base = baseline["pression"]
    pressure_start = pressure_base["mean"] + rng.normal(0.0, pressure_base["std"] * 0.15)
    pressure_sensor_missing = abs(float(pressure_base["mean"])) < 0.2 and float(pressure_base["max"]) < 0.5
    if pressure_sensor_missing:
        pressure_end = pressure_start + rng.normal(0.0, 0.03)
    elif target_label == "warning":
        if rng.random() < 0.5:
            low = config.threshold_pressure_critical_low + 0.05
            high = config.threshold_pressure_warning_low * 0.98
            pressure_end = rng.uniform(low, high) if high > low else high
        else:
            low = config.threshold_pressure_warning_high * 1.02
            high = config.threshold_pressure_critical_high - 0.05
            pressure_end = rng.uniform(low, high) if high > low else low
    else:
        if rng.random() < 0.5:
            pressure_end = rng.uniform(
                config.threshold_pressure_critical_low * 0.6,
                config.threshold_pressure_critical_low * 0.95,
            )
        else:
            pressure_end = rng.uniform(
                config.threshold_pressure_critical_high * 1.05,
                config.threshold_pressure_critical_high * 1.3,
            )

    sequence[:, 5] = smooth_transition(
        start=pressure_start,
        end=pressure_end,
        curve=curve,
        oscillation=max(0.01, abs(pressure_end - pressure_start) * 0.08),
        phase=float(rng.uniform(0.0, np.pi)),
        noise_scale=max(0.005, pressure_base["std"] * 0.04),
        rng=rng,
    )

    final_sample = sequence[-1]
    final_label = strongest_label(final_sample, config)
    if target_label == "warning" and final_label == "normal":
        sequence[-1, 3] = max(sequence[-1, 3], config.threshold_current_warning * 1.04)
    if target_label == "warning" and final_label == "critical":
        sequence[:, 3] = np.minimum(sequence[:, 3], config.threshold_current_critical * 0.9)
        sequence[:, dominant_axis] = np.minimum(
            sequence[:, dominant_axis],
            config.threshold_vibration_critical * 0.9,
        )
        if not pressure_sensor_missing:
            sequence[:, 5] = np.clip(
                sequence[:, 5],
                config.threshold_pressure_critical_low + 0.05,
                config.threshold_pressure_critical_high - 0.05,
            )
    if target_label == "critical" and final_label != "critical":
        sequence[-1, 3] = max(sequence[-1, 3], config.threshold_current_critical * 1.1)

    return sequence.astype(np.float32)


def create_synthetic_sequences(
    x_train: np.ndarray,
    y_train: np.ndarray,
    baseline: dict,
    config: TrainingConfig,
) -> tuple[np.ndarray, np.ndarray, dict]:
    current_counts = class_counts(y_train)
    majority_count = max(current_counts.values()) if current_counts else 0
    target_per_class = int(
        max(
            config.synthetic_min_per_class,
            round(majority_count * config.synthetic_target_ratio),
        )
    )
    target_per_class = min(target_per_class, config.synthetic_max_per_class)

    rng = np.random.default_rng(config.random_seed + 101)
    synthetic_x = []
    synthetic_y = []
    generated = {"warning": 0, "critical": 0}

    for label in ("warning", "critical"):
        label_index = LABEL_TO_INDEX[label]
        needed = max(0, target_per_class - current_counts.get(label, 0))
        for _ in range(needed):
            synthetic_sequence = generate_progressive_sequence(
                target_label=label,
                baseline=baseline,
                sequence_length=config.sequence_length,
                config=config,
                rng=rng,
            )
            synthetic_x.append(synthetic_sequence)
            synthetic_y.append(label_index)
            generated[label] += 1

    if not synthetic_x:
        summary = {"target_per_class": target_per_class, "generated": generated, "total_generated": 0}
        return x_train, y_train, summary

    augmented_x = np.concatenate([x_train, np.array(synthetic_x, dtype=np.float32)], axis=0)
    augmented_y = np.concatenate([y_train, np.array(synthetic_y, dtype=np.int32)], axis=0)

    summary = {
        "target_per_class": target_per_class,
        "generated": generated,
        "total_generated": int(sum(generated.values())),
    }
    return augmented_x, augmented_y, summary


def compute_class_weights(y_train: np.ndarray) -> dict[int, float]:
    counts = np.bincount(y_train, minlength=len(CLASS_NAMES))
    total = float(counts.sum())
    weights = {}
    for class_index, class_count in enumerate(counts):
        if class_count <= 0:
            continue
        weights[class_index] = total / (len(CLASS_NAMES) * float(class_count))
    return weights


# --- Model ---
def build_lstm_model(tf, config: TrainingConfig):
    model = tf.keras.Sequential(
        [
            tf.keras.layers.Input(shape=(config.sequence_length, len(FEATURE_COLUMNS))),
            tf.keras.layers.LSTM(96, return_sequences=True),
            tf.keras.layers.Dropout(0.25),
            tf.keras.layers.LSTM(48),
            tf.keras.layers.Dropout(0.2),
            tf.keras.layers.Dense(32, activation="relu"),
            tf.keras.layers.Dropout(0.1),
            tf.keras.layers.Dense(len(CLASS_NAMES), activation="softmax"),
        ]
    )
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=config.learning_rate),
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def confusion_matrix(y_true: np.ndarray, y_pred: np.ndarray, num_classes: int) -> np.ndarray:
    matrix = np.zeros((num_classes, num_classes), dtype=np.int32)
    for actual, predicted in zip(y_true, y_pred):
        matrix[int(actual), int(predicted)] += 1
    return matrix


def classification_report_from_confusion(matrix: np.ndarray) -> dict:
    report = {"classes": {}}
    precision_values = []
    recall_values = []
    f1_values = []

    for class_index, class_name in enumerate(CLASS_NAMES):
        tp = float(matrix[class_index, class_index])
        fp = float(matrix[:, class_index].sum() - tp)
        fn = float(matrix[class_index, :].sum() - tp)
        support = int(matrix[class_index, :].sum())

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2.0 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

        precision_values.append(precision)
        recall_values.append(recall)
        f1_values.append(f1)

        report["classes"][class_name] = {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1_score": round(f1, 4),
            "support": support,
        }

    report["macro_avg"] = {
        "precision": round(float(np.mean(precision_values)), 4),
        "recall": round(float(np.mean(recall_values)), 4),
        "f1_score": round(float(np.mean(f1_values)), 4),
    }
    report["accuracy"] = round(float(np.trace(matrix) / max(1, matrix.sum())), 4)
    return report


def maybe_plot_training(history, output_path: Path) -> None:
    try:
        import matplotlib.pyplot as plt  # pylint: disable=import-outside-toplevel
    except Exception as exc:
        print(f"[train] plotting skipped (matplotlib unavailable): {exc}")
        return

    history_data = history.history or {}
    if not history_data:
        print("[train] plotting skipped (no history data)")
        return

    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig, axes = plt.subplots(1, 2, figsize=(12, 4))

    axes[0].plot(history_data.get("loss", []), label="train_loss")
    if "val_loss" in history_data:
        axes[0].plot(history_data.get("val_loss", []), label="val_loss")
    axes[0].set_title("Loss")
    axes[0].set_xlabel("Epoch")
    axes[0].set_ylabel("Loss")
    axes[0].legend()

    axes[1].plot(history_data.get("accuracy", []), label="train_accuracy")
    if "val_accuracy" in history_data:
        axes[1].plot(history_data.get("val_accuracy", []), label="val_accuracy")
    axes[1].set_title("Accuracy")
    axes[1].set_xlabel("Epoch")
    axes[1].set_ylabel("Accuracy")
    axes[1].legend()

    fig.tight_layout()
    fig.savefig(output_path, dpi=160)
    plt.close(fig)


def maybe_plot_confusion(matrix: np.ndarray, output_path: Path) -> None:
    try:
        import matplotlib.pyplot as plt  # pylint: disable=import-outside-toplevel
    except Exception as exc:
        print(f"[train] confusion plot skipped (matplotlib unavailable): {exc}")
        return

    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig, axis = plt.subplots(figsize=(5, 4))
    image = axis.imshow(matrix, cmap="Blues")
    axis.set_xticks(range(len(CLASS_NAMES)))
    axis.set_yticks(range(len(CLASS_NAMES)))
    axis.set_xticklabels(CLASS_NAMES)
    axis.set_yticklabels(CLASS_NAMES)
    axis.set_xlabel("Predicted")
    axis.set_ylabel("Actual")
    axis.set_title("Confusion Matrix")

    for row in range(matrix.shape[0]):
        for col in range(matrix.shape[1]):
            axis.text(col, row, str(matrix[row, col]), ha="center", va="center", color="black")

    fig.colorbar(image, ax=axis, fraction=0.046, pad=0.04)
    fig.tight_layout()
    fig.savefig(output_path, dpi=160)
    plt.close(fig)


# --- Main ---
def main() -> None:
    config = parse_args()
    tf = import_tensorflow()

    random.seed(config.random_seed)
    np.random.seed(config.random_seed)
    tf.keras.utils.set_random_seed(config.random_seed)

    raw_rows = read_dataset_rows(config.dataset_path)
    cleaned_rows = clean_rows(raw_rows)
    fill_missing_features(cleaned_rows)
    ordered_rows = sort_rows(cleaned_rows)
    baseline = estimate_normal_baseline(ordered_rows)

    x_data, y_data = build_sliding_windows(
        rows=ordered_rows,
        sequence_length=config.sequence_length,
        stride=config.window_stride,
    )
    real_distribution = class_counts(y_data)

    x_train, x_test, y_train, y_test = stratified_split(
        x_data=x_data,
        y_data=y_data,
        test_ratio=config.test_ratio,
        seed=config.random_seed,
    )

    train_distribution_before_aug = class_counts(y_train)
    x_train_aug, y_train_aug, synthetic_summary = create_synthetic_sequences(
        x_train=x_train,
        y_train=y_train,
        baseline=baseline,
        config=config,
    )
    train_distribution_after_aug = class_counts(y_train_aug)
    test_distribution = class_counts(y_test)

    scaler_mean, scaler_std = fit_standardizer(x_train_aug)
    x_train_scaled = apply_standardizer(x_train_aug, scaler_mean, scaler_std)
    x_test_scaled = apply_standardizer(x_test, scaler_mean, scaler_std)

    y_train_one_hot = tf.keras.utils.to_categorical(y_train_aug, num_classes=len(CLASS_NAMES))
    y_test_one_hot = tf.keras.utils.to_categorical(y_test, num_classes=len(CLASS_NAMES))
    class_weight = compute_class_weights(y_train_aug)

    model = build_lstm_model(tf, config)

    use_validation = config.validation_split > 0.0 and len(x_train_scaled) >= 20
    callbacks = []
    if use_validation:
        callbacks.append(
            tf.keras.callbacks.EarlyStopping(
                monitor="val_loss",
                patience=config.early_stopping_patience,
                restore_best_weights=True,
            )
        )

    fit_kwargs = {
        "x": x_train_scaled,
        "y": y_train_one_hot,
        "epochs": config.epochs,
        "batch_size": config.batch_size,
        "class_weight": class_weight,
        "callbacks": callbacks,
        "verbose": 2,
        "shuffle": True,
    }
    if use_validation:
        fit_kwargs["validation_split"] = config.validation_split

    history = model.fit(**fit_kwargs)
    test_loss, test_accuracy = model.evaluate(x_test_scaled, y_test_one_hot, verbose=0)
    predicted_proba = model.predict(x_test_scaled, verbose=0)
    predicted_labels = np.argmax(predicted_proba, axis=1)

    matrix = confusion_matrix(y_true=y_test, y_pred=predicted_labels, num_classes=len(CLASS_NAMES))
    report = classification_report_from_confusion(matrix)

    config.model_path.parent.mkdir(parents=True, exist_ok=True)
    config.preprocessor_path.parent.mkdir(parents=True, exist_ok=True)
    config.metrics_path.parent.mkdir(parents=True, exist_ok=True)

    model.save(config.model_path, include_optimizer=False)

    model_version = datetime.now(timezone.utc).strftime("lstm-%Y%m%d-%H%M%S")
    created_at = datetime.now(timezone.utc).isoformat()

    preprocessor_payload = {
        "version": model_version,
        "created_at": created_at,
        "model_path": str(config.model_path),
        "dataset_path": str(config.dataset_path),
        "sequence_length": config.sequence_length,
        "window_stride": config.window_stride,
        "features": FEATURE_COLUMNS,
        "class_names": CLASS_NAMES,
        "label_to_index": LABEL_TO_INDEX,
        "index_to_label": {str(k): v for k, v in INDEX_TO_LABEL.items()},
        "scaler": {"mean": scaler_mean.tolist(), "std": scaler_std.tolist()},
        "normal_baseline": baseline,
        "thresholds": {
            "current_warning": config.threshold_current_warning,
            "current_critical": config.threshold_current_critical,
            "vibration_warning": config.threshold_vibration_warning,
            "vibration_critical": config.threshold_vibration_critical,
            "pressure_warning_low": config.threshold_pressure_warning_low,
            "pressure_warning_high": config.threshold_pressure_warning_high,
            "pressure_critical_low": config.threshold_pressure_critical_low,
            "pressure_critical_high": config.threshold_pressure_critical_high,
        },
    }
    config.preprocessor_path.write_text(json.dumps(preprocessor_payload, indent=2), encoding="utf-8")

    metrics_payload = {
        "created_at": created_at,
        "model_version": model_version,
        "model_path": str(config.model_path),
        "preprocessor_path": str(config.preprocessor_path),
        "train_size": int(len(x_train_aug)),
        "test_size": int(len(x_test)),
        "real_distribution": real_distribution,
        "train_distribution_before_augmentation": train_distribution_before_aug,
        "train_distribution_after_augmentation": train_distribution_after_aug,
        "test_distribution": test_distribution,
        "synthetic_summary": synthetic_summary,
        "history": {key: [float(x) for x in value] for key, value in history.history.items()},
        "evaluation": {
            "loss": float(test_loss),
            "accuracy": float(test_accuracy),
            "confusion_matrix": matrix.tolist(),
            "classification_report": report,
        },
        "training_config": {
            "epochs": config.epochs,
            "batch_size": config.batch_size,
            "learning_rate": config.learning_rate,
            "validation_split": config.validation_split if use_validation else 0.0,
            "class_weight": {str(k): float(v) for k, v in class_weight.items()},
            "sequence_length": config.sequence_length,
            "test_ratio": config.test_ratio,
            "random_seed": config.random_seed,
        },
    }
    config.metrics_path.write_text(json.dumps(metrics_payload, indent=2), encoding="utf-8")

    if config.enable_plots:
        maybe_plot_training(history, config.training_plot_path)
        maybe_plot_confusion(matrix, config.confusion_plot_path)

    print("[train] LSTM training complete.")
    print(f"[train] Dataset: {config.dataset_path}")
    print(f"[train] Model saved: {config.model_path}")
    print(f"[train] Preprocessor saved: {config.preprocessor_path}")
    print(f"[train] Metrics saved: {config.metrics_path}")
    print(f"[train] Test loss: {test_loss:.4f}")
    print(f"[train] Test accuracy: {test_accuracy:.4f}")
    print(f"[train] Confusion matrix: {matrix.tolist()}")
    print(f"[train] Synthetic generated: {synthetic_summary['total_generated']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"[train] failed: {exc}")
        traceback.print_exc()
        raise SystemExit(1) from exc
