# Python AI Module - Predictive Maintenance

This module trains the maintenance AI from the sensor data already collected by
the Node backend in MongoDB.

## Data Flow

1. ESP32/Wokwi publishes sensor readings to `cncpulse/sensors`.
2. The backend stores every reading in MongoDB collection `sensordatas`.
3. `build_lstm_dataset.py` exports those Mongo readings to `data/lstm_dataset.csv`.
4. `train_lstm.py` trains the sequence classifier from that CSV.
5. `lstm_inference_service.py` listens to the same MQTT sensor topic and creates:
   - AI alerts in `alerts`
   - maintenance reports in `maintenancereports`
   - maintenance requests in `maintenancerequests`

## Install

```bash
pip install -r python-ai/requirements.txt
```

Copy the env template:

```bash
copy python-ai\.env.example python-ai\.env
```

Important values:

```env
MONGO_URI=mongodb://localhost:27017/cncpulse
MONGO_DB_NAME=cncpulse
MQTT_SENSOR_TOPIC=cncpulse/sensors
DATASET_PATH=data/lstm_dataset.csv
OUTPUT_DATASET_PATH=data/lstm_dataset.csv
```

## Build Dataset From Sensor Data

Run this after the backend has collected sensor readings:

```bash
python python-ai/build_lstm_dataset.py
```

The script reads MongoDB collection `sensordatas` and writes:

```text
python-ai/data/lstm_dataset.csv
python-ai/data/lstm_dataset.metadata.json
```

The dataset labels are:

- `normal`
- `warning`
- `critical`

If a sensor document already has `label`, `aiLabel`, or `maintenanceLabel`, the
script keeps that manual label. Otherwise, it creates labels from current and
vibration thresholds plus a rolling baseline per machine. That means the model
learns from the collected sensor behavior of each machine, not from a static
fake dataset.

## Train Model

```bash
python python-ai/train_lstm.py
```

Outputs:

```text
python-ai/models/lstm_alert_model.pkl
python-ai/models/lstm_scaler.pkl
python-ai/models/lstm_label_encoder.pkl
```

The current model implementation is a `RandomForestClassifier` over flattened
sensor sequences. The filenames still say `lstm_*` for compatibility with the
existing project.

## Run Inference

```bash
python python-ai/lstm_inference_service.py
```

When the model predicts `warning` or `critical`, it creates an AI maintenance
alert, a maintenance report, and an open maintenance request.

## GSM Supervisor

```bash
python python-ai/supervisor.py
```

The supervisor watches unseen alerts and publishes GSM call requests.
