# Python AI Module (LSTM + GSM Supervisor)

This folder contains the AI workflow for:
- LSTM-based anomaly inference from sensor stream
- Escalation logic: unseen alert for 5 minutes -> GSM call request

## 1) Install

```bash
pip install -r python-ai/requirements.txt
```

Copy env template:

```bash
cp python-ai/.env.example python-ai/.env
```

## 2) Build dataset from Mongo sensor history

```bash
python python-ai/build_lstm_dataset.py
```

## 3) Train LSTM model

```bash
python python-ai/train_lstm.py
```

## 4) Run inference service

```bash
python python-ai/lstm_inference_service.py
```

## 5) Run 5-minute GSM supervisor

```bash
python python-ai/supervisor.py
```

## Expected backend support

Backend should expose:
- `alerts` collection
- `contacts` collection
- `calllogs` collection
- MQTT topics:
  - input: `cncpulse/sensors`
  - output: `cncpulse/gsm/call`
  - result: `cncpulse/gsm/result`
