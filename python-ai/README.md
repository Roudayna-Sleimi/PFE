# Python AI Module (LSTM + GSM Supervisor)

This folder contains the AI workflow for:
- LSTM-based anomaly inference from sensor stream
- Escalation logic: unseen alert for 5 minutes -> GSM call request
- Optional local TTS generation (WAV) for GSM playback payload

## 1) Install

```bash
pip install -r python-ai/requirements.txt
```

Copy env template:

```bash
cp python-ai/.env.example python-ai/.env
```

TTS-related env options:

```env
ENABLE_TTS=1
AUDIO_OUTPUT_DIR=python-ai/audio
TTS_RATE=165
TTS_VOLUME=1.0
EMBED_AUDIO_BASE64=1
MAX_AUDIO_INLINE_BYTES=500000
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

When `ENABLE_TTS=1`, supervisor tries to generate a local `.wav` file per call
attempt and includes `audioFilePath` + `audioFormat` in the MQTT payload.
When `EMBED_AUDIO_BASE64=1`, it also embeds `audioBase64` (size-limited by
`MAX_AUDIO_INLINE_BYTES`) so GSM consumers can play audio without shared disk.
If TTS fails, the system still sends `textToRead` and continues escalation.

## Expected backend support

Backend should expose:
- `alerts` collection
- `contacts` collection
- `calllogs` collection
- MQTT topics:
  - input: `cncpulse/sensors`
  - output: `cncpulse/gsm/call`
  - result: `cncpulse/gsm/result`
