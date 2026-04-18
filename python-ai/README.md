# Python Maintenance Module (Simple Version)

This folder now uses a simple and clear rule engine.
No TensorFlow, no sklearn model files, no heavy training pipeline.

## Flow

1. `build_lstm_dataset.py`
   - Reads sensor data from MongoDB (`sensordatas`)
   - Creates CSV dataset with labels (`normal`, `warning`, `critical`)

2. `train_lstm.py`
   - Builds simple baseline rules from normal behavior in the CSV
   - Saves one JSON rules file: `models/maintenance_rules.json`

3. `lstm_inference_service.py`
   - Listens to MQTT sensor messages
   - Applies threshold + baseline rules
   - Creates alerts, maintenance reports, and maintenance requests

## Install

```bash
python -m pip install -r python-ai/requirements.txt
copy python-ai\.env.example python-ai\.env
```

## Main Config

```env
DATASET_PATH=data/lstm_dataset.csv
RULES_PATH=models/maintenance_rules.json
RULES_RELOAD_SEC=15

THRESHOLD_CURRENT_WARNING=15
THRESHOLD_CURRENT_CRITICAL=20
THRESHOLD_VIB_WARNING=2
THRESHOLD_VIB_CRITICAL=3
THRESHOLD_PRESSURE_WARNING_LOW=4.5
THRESHOLD_PRESSURE_WARNING_HIGH=10
THRESHOLD_PRESSURE_CRITICAL_LOW=3.5
THRESHOLD_PRESSURE_CRITICAL_HIGH=11
```

## Commands

Build dataset:

```bash
python python-ai/build_lstm_dataset.py
```

Build rules:

```bash
python python-ai/train_lstm.py
```

Run inference:

```bash
python python-ai/lstm_inference_service.py
```

Run automatic rules refresh (scheduler):

```bash
python python-ai/auto_rules_scheduler.py
```

Run GSM supervisor:

```bash
python python-ai/supervisor.py
```

Install Windows auto-start tasks (one time):

```bash
powershell -ExecutionPolicy Bypass -File python-ai/install_windows_tasks.ps1 -RunNow
```

This creates 4 scheduled tasks:
- Backend service
- AI inference service
- AI rules scheduler
- AI supervisor service

Names:
- `PFE_BackendService`
- `PFE_AIInferenceService`
- `PFE_AIRulesScheduler`
- `PFE_AISupervisorService`
