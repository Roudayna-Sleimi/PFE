# Python AI Backend

Clean runtime for predictive maintenance with:

- one primary LSTM inference path
- one unified prediction contract
- conditional retraining with model version snapshots

## Runtime Pipeline

```text
MongoDB sensordatas
  -> dataset builder (scripts/build_dataset.py)
  -> trainer (scripts/train_model.py)
  -> LSTM inference service (scripts/run_maintenance_inference.py)
  -> MQTT prediction topic (cncpulse/maintenance/predictions)
  -> Node backend orchestration
```

## Folder Structure

```text
python-ai/
  app/
    db/mongo.py
    shared/config.py
    maintenance/
      dataset.py
      trainer.py
      predictor.py
      inference.py
      service.py
      scheduler.py
    gsm/service.py
  scripts/
    build_dataset.py
    train_model.py
    run_maintenance_inference.py
    run_retraining_scheduler.py
    run_gsm_supervisor.py
    predict_payload.py
  data/
  models/
  runtime/
```

## Unified Prediction Contract

`app/maintenance/inference.py` exposes `get_prediction(data)` and returns:

```json
{
  "anomalyScore": 0.0,
  "predictedClass": "normal",
  "confidence": 0.0
}
```

Extra metadata is included for observability (`proba`, `modelVersion`, `historySize`, `createdAt`).

## Key Behaviors

- `service.py` subscribes to sensor topic and publishes predictions to `MQTT_PREDICTION_TOPIC`.
- `scheduler.py` retrains only when source data growth exceeds `AUTO_TRAIN_MIN_GROWTH_RATIO` (default `0.2`).
- after each successful retrain, model artifacts are snapshotted under `MODEL_VERSIONS_DIR`.

## Commands

```bash
python -m pip install -r python-ai/requirements.txt

python python-ai/scripts/build_dataset.py
python python-ai/scripts/train_model.py
python python-ai/scripts/run_maintenance_inference.py
python python-ai/scripts/run_retraining_scheduler.py --once
python python-ai/scripts/run_retraining_scheduler.py
python python-ai/scripts/run_gsm_supervisor.py
python python-ai/scripts/predict_payload.py --machine-id M1 --input-json "{\"vibX\":0.3,\"vibY\":0.2,\"vibZ\":0.1,\"courant\":8.5,\"rpm\":1400,\"pression\":6.2}"
```

## Environment

Use `python-ai/.env.example` as reference.
Important variables:

- `MQTT_SENSOR_TOPIC`
- `MQTT_PREDICTION_TOPIC`
- `MODEL_PATH`
- `PREPROCESSOR_PATH`
- `MODEL_RELOAD_SEC`
- `AUTO_TRAIN_INTERVAL_MINUTES`
- `AUTO_TRAIN_MIN_GROWTH_RATIO`
- `MODEL_VERSIONS_DIR`
- `RETRAIN_STATE_PATH`
