import os
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.utils.class_weight import compute_class_weight
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.models import Sequential
from tensorflow.keras.utils import to_categorical
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint
import joblib

SEQ_LEN = int(os.getenv("SEQ_LEN", "60"))
DATASET_PATH = os.getenv("DATASET_PATH", "python-ai/data/lstm_dataset.csv")
MODEL_PATH = os.getenv("MODEL_PATH", "python-ai/models/lstm_alert_model.keras")
SCALER_PATH = os.getenv("SCALER_PATH", "python-ai/models/lstm_scaler.pkl")
ENCODER_PATH = os.getenv("ENCODER_PATH", "python-ai/models/lstm_label_encoder.pkl")

FEATURES = ["vibX", "vibY", "vibZ", "courant", "rpm"]


def build_sequences(df: pd.DataFrame):
  X_seq = []
  y_seq = []
  for machine_id in df["machine_id"].unique():
    sub = df[df["machine_id"] == machine_id].copy()
    x_values = sub[FEATURES].values
    y_values = sub["label_encoded"].values
    for i in range(SEQ_LEN, len(sub)):
      X_seq.append(x_values[i - SEQ_LEN:i])
      y_seq.append(y_values[i])
  return np.array(X_seq), np.array(y_seq)


def main():
  if not os.path.exists(DATASET_PATH):
    raise FileNotFoundError(f"Dataset not found: {DATASET_PATH}")

  os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
  os.makedirs(os.path.dirname(SCALER_PATH), exist_ok=True)
  os.makedirs(os.path.dirname(ENCODER_PATH), exist_ok=True)

  df = pd.read_csv(DATASET_PATH)
  required_cols = ["timestamp", "machine_id", *FEATURES, "label"]
  missing = [c for c in required_cols if c not in df.columns]
  if missing:
    raise ValueError(f"Missing required columns: {missing}")

  df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
  df = df.dropna(subset=["timestamp"]).sort_values(["machine_id", "timestamp"]).reset_index(drop=True)

  encoder = LabelEncoder()
  df["label_encoded"] = encoder.fit_transform(df["label"].astype(str))

  scaler = StandardScaler()
  df[FEATURES] = scaler.fit_transform(df[FEATURES].astype(float))

  X, y = build_sequences(df)
  if len(X) < 200:
    raise ValueError("Not enough sequence windows for training. Collect more data.")

  y_categorical = to_categorical(y, num_classes=len(encoder.classes_))
  X_train, X_val, y_train, y_val = train_test_split(
    X, y_categorical, test_size=0.2, random_state=42, stratify=y
  )

  class_values = np.unique(y)
  class_weights = compute_class_weight(class_weight="balanced", classes=class_values, y=y)
  class_weight_dict = {int(i): float(w) for i, w in zip(class_values, class_weights)}

  model = Sequential([
    LSTM(64, return_sequences=True, input_shape=(SEQ_LEN, len(FEATURES))),
    Dropout(0.2),
    LSTM(32),
    Dropout(0.2),
    Dense(32, activation="relu"),
    Dense(len(encoder.classes_), activation="softmax")
  ])
  model.compile(optimizer="adam", loss="categorical_crossentropy", metrics=["accuracy"])

  callbacks = [
    EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True),
    ModelCheckpoint(MODEL_PATH, monitor="val_loss", save_best_only=True)
  ]

  model.fit(
    X_train, y_train,
    validation_data=(X_val, y_val),
    epochs=30,
    batch_size=64,
    class_weight=class_weight_dict,
    callbacks=callbacks,
    verbose=1
  )

  model.save(MODEL_PATH)
  joblib.dump(scaler, SCALER_PATH)
  joblib.dump(encoder, ENCODER_PATH)
  print("Training complete.")
  print(f"Model: {MODEL_PATH}")
  print(f"Scaler: {SCALER_PATH}")
  print(f"Encoder: {ENCODER_PATH}")


if __name__ == "__main__":
  main()
