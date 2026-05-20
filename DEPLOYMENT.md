# CNC Pulse Deployment

This project uses two ports only during development:

- `5173` for the Vite frontend dev server
- `5000` for the backend API, Socket.IO, and production frontend hosting

For deployment, the recommended setup is one public port only: `5000`.

## Scripts

From the project root:

```powershell
npm run dev:web
npm run dev:backend
npm run dev:desktop
npm run build:web
npm run start:web
npm run build:desktop
npm run install:backend
```

Meaning:

- `npm run dev:web`: frontend Vite on `http://127.0.0.1:5173`
- `npm run dev:backend`: backend only on `http://127.0.0.1:5000`
- `npm run dev:desktop`: backend + Vite + Electron for desktop development
- `npm run build:web`: production frontend build into `dist/`
- `npm run start:web`: production web mode on one port only, `5000`
- `npm run build:desktop`: builds the frontend, then packages the Electron app
- `npm run install:backend`: installs the nested backend dependencies

## Recommended web deployment

Use one Windows machine or one server:

- frontend build served by the backend on `http://SERVER_IP:5000`
- Node backend on port `5000`
- MongoDB on the same machine or reachable on the network
- Python AI services only if you need predictive maintenance and GSM automation

## 1. Install prerequisites

- Node.js 20+ or 22+
- MongoDB
- Python 3.11

## 2. Configure environment files

### Frontend

If the backend serves the frontend, you usually do not need a custom frontend env file.

Optional file: `.env.production`

```env
VITE_BACKEND_URL=http://SERVER_IP:5000
VITE_SOCKET_URL=http://SERVER_IP:5000
```

Use that only if the frontend is hosted separately from the backend.

### Backend

Copy `backend/.env.example` to `backend/.env` and set at least:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/cncpulse
JWT_SECRET=replace-with-a-real-secret
AI_SERVICE_KEY=replace-with-a-real-service-key
DOSSIER_WATCH_DIR=C:\data CNC CONCEPT
```

Mail variables are optional unless you want password reset emails.

### Python AI

Copy `python-ai/.env.example` to `python-ai/.env` and adapt it if the machine does not use local MongoDB.

## 3. Install dependencies

From the project root:

```powershell
npm install
npm run install:backend
python -m pip install -r python-ai/requirements.txt
```

## 4. Deploy the web app on one port

From the project root:

```powershell
npm run build:web
npm run start:web
```

Then open:

```text
http://SERVER_IP:5000
```

The backend serves both:

- the API
- Socket.IO
- the built frontend

## 5. Deploy the Electron app

From the project root:

```powershell
npm install
npm run install:backend
npm run build:desktop
```

The packaged Electron app uses the built frontend and starts the embedded backend on local port `5000` when needed.

## 6. Optional AI services

Run these only if your deployment needs them:

```powershell
python python-ai/scripts/run_maintenance_inference.py
python python-ai/scripts/run_gsm_supervisor.py
python python-ai/scripts/run_retraining_scheduler.py
```

## 7. Minimum checklist

- `MongoDB` is running
- `backend/.env` exists
- `npm run build:web` succeeds
- `npm run start:web` starts without error
- `http://SERVER_IP:5000/api/health` returns `ok: true`
- `http://SERVER_IP:5000` opens from another machine on the same network
- ESP32 / MQTT data is available if you want live sensor visuals
- Python services are running only if the deployment needs AI alerts or GSM calls
