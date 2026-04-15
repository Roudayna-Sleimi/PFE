import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

SEQ_LEN = int(os.getenv("SEQ_LEN", "10"))
DATASET_PATH = os.getenv("DATASET_PATH", "data/lstm_dataset.csv")
MODEL_PATH = os.getenv("MODEL_PATH", "models/lstm_alert_model.pkl")
SCALER_PATH = os.getenv("SCALER_PATH", "models/lstm_scaler.pkl")
ENCODER_PATH = os.getenv("ENCODER_PATH", "models/lstm_label_encoder.pkl")

FEATURES = ["vibX", "vibY", "vibZ", "courant", "rpm"]


def resolve_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else BASE_DIR / path


def build_sequences(df: pd.DataFrame):
    x_seq = []
    y_seq = []
    for machine_id in df["machine_id"].unique():
        sub = df[df["machine_id"] == machine_id].copy()
        x_values = sub[FEATURES].values
        y_values = sub["label_encoded"].values
        for i in range(SEQ_LEN, len(sub)):
            x_seq.append(x_values[i - SEQ_LEN:i].flatten())
            y_seq.append(y_values[i])
    return np.array(x_seq), np.array(y_seq)


def main():
    dataset_path = resolve_path(DATASET_PATH)
    model_path = resolve_path(MODEL_PATH)
    scaler_path = resolve_path(SCALER_PATH)
    encoder_path = resolve_path(ENCODER_PATH)

    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")

    model_path.parent.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(dataset_path)

    required_cols = ["timestamp", "machine_id", *FEATURES, "label"]
    missing = [col for col in required_cols if col not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df = df.dropna(subset=["timestamp"]).sort_values(
        ["machine_id", "timestamp"]
    ).reset_index(drop=True)

    encoder = LabelEncoder()
    df["label_encoded"] = encoder.fit_transform(df["label"].astype(str))
    if len(encoder.classes_) < 2:
        raise ValueError(
            "Dataset contains only one label. Collect more abnormal sensor data "
            "or add manual labels: normal, warning, critical."
        )

    scaler = StandardScaler()
    df[FEATURES] = scaler.fit_transform(df[FEATURES].astype(float))

    x_data, y_data = build_sequences(df)
    if len(x_data) < 50:
        raise ValueError("Not enough sequence data. Collect more sensor readings.")

    label_counts = pd.Series(y_data).value_counts()
    stratify = y_data if label_counts.min() >= 2 else None
    x_train, x_val, y_train, y_val = train_test_split(
        x_data,
        y_data,
        test_size=0.2,
        random_state=42,
        stratify=stratify,
    )

    model = RandomForestClassifier(
        n_estimators=100,
        random_state=42,
        class_weight="balanced",
        n_jobs=-1,
    )
    model.fit(x_train, y_train)

    y_pred = model.predict(x_val)
    labels = np.arange(len(encoder.classes_))
    print("\n=== Classification Report ===")
    print(classification_report(
        y_val,
        y_pred,
        labels=labels,
        target_names=encoder.classes_,
        zero_division=0,
    ))

    joblib.dump(model, model_path)
    joblib.dump(scaler, scaler_path)
    joblib.dump(encoder, encoder_path)

    print("\nTraining complete!")
    print(f"Dataset: {dataset_path}")
    print(f"Model: {model_path}")
    print(f"Scaler: {scaler_path}")
    print(f"Encoder: {encoder_path}")


if __name__ == "__main__":
    main()
