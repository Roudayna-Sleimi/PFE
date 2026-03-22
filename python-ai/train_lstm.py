import os
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
import joblib

SEQ_LEN = int(os.getenv("SEQ_LEN", "10"))
DATASET_PATH = os.getenv("DATASET_PATH", "data/lstm_dataset.csv")
MODEL_PATH = os.getenv("MODEL_PATH", "models/lstm_alert_model.pkl")
SCALER_PATH = os.getenv("SCALER_PATH", "models/lstm_scaler.pkl")
ENCODER_PATH = os.getenv("ENCODER_PATH", "models/lstm_label_encoder.pkl")

FEATURES = ["vibX", "vibY", "vibZ", "courant", "rpm"]


def build_sequences(df: pd.DataFrame):
    X_seq = []
    y_seq = []
    for machine_id in df["machine_id"].unique():
        sub = df[df["machine_id"] == machine_id].copy()
        x_values = sub[FEATURES].values
        y_values = sub["label_encoded"].values
        for i in range(SEQ_LEN, len(sub)):
            # Flatten sequence for RandomForest
            X_seq.append(x_values[i - SEQ_LEN:i].flatten())
            y_seq.append(y_values[i])
    return np.array(X_seq), np.array(y_seq)


def main():
    if not os.path.exists(DATASET_PATH):
        raise FileNotFoundError(f"Dataset not found: {DATASET_PATH}")

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)

    df = pd.read_csv(DATASET_PATH)
    required_cols = ["timestamp", "machine_id", *FEATURES, "label"]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df = df.dropna(subset=["timestamp"]).sort_values(
        ["machine_id", "timestamp"]
    ).reset_index(drop=True)

    encoder = LabelEncoder()
    df["label_encoded"] = encoder.fit_transform(df["label"].astype(str))

    scaler = StandardScaler()
    df[FEATURES] = scaler.fit_transform(df[FEATURES].astype(float))

    X, y = build_sequences(df)
    if len(X) < 50:
        raise ValueError("Not enough data. Collect more sensor data.")

    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    model = RandomForestClassifier(
        n_estimators=100,
        random_state=42,
        class_weight="balanced",
        n_jobs=-1
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_val)
    print("\n=== Classification Report ===")
    print(classification_report(y_val, y_pred, target_names=encoder.classes_))

    joblib.dump(model, MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    joblib.dump(encoder, ENCODER_PATH)

    print(f"\n✅ Training complete!")
    print(f"Model: {MODEL_PATH}")
    print(f"Scaler: {SCALER_PATH}")
    print(f"Encoder: {ENCODER_PATH}")


if __name__ == "__main__":
    main()