const express    = require('express');
const mongoose   = require('mongoose');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const mqtt       = require('mqtt');
const nodemailer = require('nodemailer');
const http       = require('http');
const { Server } = require('socket.io');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const dotenv     = require('dotenv');
const { startDossierWatcher } = require('./dossierWatcher');
const { ensureBaseMachines } = require('./services/machineCatalog');
const { slugify } = require('./utils/slugify');
const {
  isRectifieuseNode,
  isCompresseurNode,
  nodeAliasesForMachine,
} = require('./utils/liveMachineNodes');
const { createAuthRoutes } = require('./routes/authRoutes');
const { createPasswordResetMailer } = require('./services/passwordResetMailer');
const { createWorkforceRoutes } = require('./routes/workforceRoutes');
const { createTaskMessageRoutes } = require('./routes/taskMessageRoutes');
const { createMonitoringRoutes } = require('./routes/monitoringRoutes');
const { createPieceRoutes } = require('./routes/pieceRoutes');
const { createDossierRoutes } = require('./routes/dossierRoutes');
const { createMachineRoutes } = require('./routes/machineRoutes');

const backendEnvPath = path.resolve(__dirname, '.env');
const rootEnvPath = path.resolve(__dirname, '..', '.env');
const resolvedEnvPath = [backendEnvPath, rootEnvPath].find((candidate) => fs.existsSync(candidate));

if (resolvedEnvPath) {
  dotenv.config({ path: resolvedEnvPath });
} else {
  dotenv.config();
}

const validateEnv = () => {
  const missingEnv = ['MONGO_URI', 'JWT_SECRET'].filter((key) => !process.env[key]);
  if (missingEnv.length === 0) return;

  throw new Error(
    `Variables d'environnement manquantes: ${missingEnv.join(', ')}. `
    + `Le backend charge d'abord ${backendEnvPath} puis ${rootEnvPath}.`,
  );
};

const app    = express();
const server = http.createServer(app);
const frontendDistDir = path.resolve(__dirname, '..', 'dist');
const runtimeDataDir = process.env.CNC_PULSE_DATA_DIR
  ? path.resolve(process.env.CNC_PULSE_DATA_DIR)
  : __dirname;
const watchSettingsPath = path.join(runtimeDataDir, 'watch-settings.json');

const readStoredWatchDir = () => {
  try {
    if (!fs.existsSync(watchSettingsPath)) return '';
    const parsed = JSON.parse(fs.readFileSync(watchSettingsPath, 'utf8'));
    return typeof parsed?.watchDir === 'string' ? parsed.watchDir.trim() : '';
  } catch {
    return '';
  }
};

const writeStoredWatchDir = (watchDir) => {
  fs.writeFileSync(watchSettingsPath, JSON.stringify({ watchDir }, null, 2));
};

const resolveInitialWatchDir = () => {
  const stored = readStoredWatchDir();
  const fallback = process.env.DOSSIER_WATCH_DIR || 'C:\\data CNC CONCEPT';
  return path.resolve(stored || fallback);
};

const canSelectWatchDir = () => typeof global.__cncPulseDesktop?.selectWatchDir === 'function';

const selectWatchDirFromDesktop = async (preferredDir) => {
  if (!canSelectWatchDir()) {
    const error = new Error('Selection de dossier disponible uniquement dans la version desktop Electron');
    error.statusCode = 501;
    throw error;
  }

  return global.__cncPulseDesktop.selectWatchDir(preferredDir);
};

// Multer
if (!fs.existsSync(runtimeDataDir)) fs.mkdirSync(runtimeDataDir, { recursive: true });
const uploadDir = path.join(runtimeDataDir, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const dossierUploadDir = path.join(uploadDir, 'dossiers');
if (!fs.existsSync(dossierUploadDir)) fs.mkdirSync(dossierUploadDir, { recursive: true });
const machineUploadDir = path.join(uploadDir, 'machines');
if (!fs.existsSync(machineUploadDir)) fs.mkdirSync(machineUploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename:    (_, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({ storage });
const dossierStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, dossierUploadDir),
  filename:    (_, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
});
const dossierUpload = multer({
  storage: dossierStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
  // Accept all file types. Preview is handled on the frontend (PDF/images),
  // other types remain downloadable.
});
const machineImageStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, machineUploadDir),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
});
const machineImageUpload = multer({
  storage: machineImageStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (String(file.mimetype || '').startsWith('image/')) return cb(null, true);
    return cb(new Error('Veuillez choisir une image valide.'));
  },
});
app.use('/uploads', express.static(uploadDir));

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.json());
app.use(cors({ origin: '*' }));
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mongoConnected,
    port: Number(process.env.PORT || 5000),
    runtimeDataDir,
    watchDir: currentWatchDir,
  });
});

// MongoDB
// Start the folder watcher only after MongoDB + the Dossier model are ready,
// otherwise the initial scan can fail to persist (or the model is not registered yet).
let dossierWatcherHandle = null;
let mongoConnected = false;
let dossierModelRef = null;
let mqttClientRef = null;
let startupPromise = null;
let currentWatchDir = resolveInitialWatchDir();

const stopDossierWatcher = async () => {
  const activeHandle = dossierWatcherHandle;
  dossierWatcherHandle = null;

  if (activeHandle?.watcher?.close) {
    await activeHandle.watcher.close();
  }
};

const clearWatchedDossiers = async () => {
  if (!dossierModelRef) return;
  await dossierModelRef.deleteMany({ publicPath: { $in: ['', null] } });
};

const maybeStartWatcher = async ({ suppressErrors = true } = {}) => {
  if (dossierWatcherHandle) return dossierWatcherHandle;
  if (!mongoConnected) return;
  if (!dossierModelRef) return;
  try {
    dossierWatcherHandle = await startDossierWatcher({ rootDir: currentWatchDir, Dossier: dossierModelRef, logger: console });
    return dossierWatcherHandle;
  } catch (err) {
    dossierWatcherHandle = null;
    if (suppressErrors) {
      console.error('[dossier-watcher] failed to start:', err?.message || err);
      return null;
    }
    throw err;
  }
};

const setWatchDir = async (nextWatchDir, options = {}) => {
  const rawWatchDir = String(nextWatchDir || '').trim();
  if (!rawWatchDir) {
    const error = new Error('Chemin dossier vide');
    error.statusCode = 400;
    throw error;
  }

  const resolvedWatchDir = path.resolve(rawWatchDir);
  if (!fs.existsSync(resolvedWatchDir)) {
    const error = new Error('Le dossier selectionne est introuvable');
    error.statusCode = 400;
    throw error;
  }

  if (!fs.statSync(resolvedWatchDir).isDirectory()) {
    const error = new Error('Le chemin selectionne doit etre un dossier');
    error.statusCode = 400;
    throw error;
  }

  const shouldRestartWatcher = resolvedWatchDir !== currentWatchDir || !dossierWatcherHandle;
  currentWatchDir = resolvedWatchDir;
  process.env.DOSSIER_WATCH_DIR = resolvedWatchDir;
  writeStoredWatchDir(resolvedWatchDir);

  if (!shouldRestartWatcher) {
    return { watchDir: currentWatchDir, running: true, restarted: false };
  }

  await stopDossierWatcher();

  if (options.clearIndexed !== false) {
    await clearWatchedDossiers();
  }

  if (mongoConnected && dossierModelRef) {
    await maybeStartWatcher({ suppressErrors: false });
  }

  return {
    watchDir: currentWatchDir,
    running: Boolean(dossierWatcherHandle),
    restarted: true,
  };
};

// Models
const User = require('./models/User');
const MachineEvent = require('./models/MachineEvent');
const MachineModel = require('./models/Machine');
const Demande = require('./models/Demande');
const Task = require('./models/Task');
const DirectMessage = require('./models/DirectMessage');
const SensorData = require('./models/SensorData');
const Message = require('./models/Message');
const Alert = require('./models/Alert');
const Contact = require('./models/Contact');
const CallLog = require('./models/CallLog');
const MaintenanceReport = require('./models/MaintenanceReport');
const MaintenanceRequest = require('./models/MaintenanceRequest');
const Piece = require('./models/Piece');
const Dossier = require('./models/Dossier');

// Mark model as ready and attempt starting the watcher (if Mongo is already connected).
dossierModelRef = Dossier;
maybeStartWatcher();

// Middlewares
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token manquant' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Token invalide' });
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Acces refuse' });
  next();
};

const serviceKeyMiddleware = (req, res, next) => {
  const expected = process.env.AI_SERVICE_KEY;
  if (!expected) return res.status(500).json({ message: 'AI_SERVICE_KEY non configuree' });
  const received = req.headers['x-service-key'];
  if (received !== expected) return res.status(403).json({ message: 'Service key invalide' });
  next();
};

const sanitizeSeverity = (value) => value === 'critical' ? 'critical' : 'warning';
const parseBooleanEnv = (value = false) => ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseStorageDate = (value) => {
  if (!value) return null;
  const parsed = new Date(`${String(value)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeMachineChain = (machine, machineChain) => {
  const normalizedChain = Array.isArray(machineChain) ? machineChain.filter(Boolean) : [];
  if (normalizedChain.length > 0) return normalizedChain;
  return machine ? [machine] : [];
};

const computeWorkByMachine = (events = []) => {
  const sorted = [...events].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const activeSessions = new Map();
  const totals = {};
  const now = Date.now();

  for (const ev of sorted) {
    if (!ev.machine) continue;
    const key = `${ev.username}:${ev.machine}`;
    const eventTime = new Date(ev.createdAt).getTime();
    if (Number.isNaN(eventTime)) continue;

    if (ev.action === 'started') {
      activeSessions.set(key, eventTime);
      continue;
    }
    if (ev.action === 'paused' || ev.action === 'stopped') {
      const start = activeSessions.get(key);
      if (start) {
        const durationMs = Math.max(0, eventTime - start);
        totals[ev.machine] = (totals[ev.machine] || 0) + durationMs;
        activeSessions.delete(key);
      }
    }
  }

  for (const [key, startedAt] of activeSessions.entries()) {
    const machine = key.split(':').slice(1).join(':');
    totals[machine] = (totals[machine] || 0) + Math.max(0, now - startedAt);
  }

  return Object.entries(totals)
    .map(([machine, durationMs]) => ({
      machine,
      seconds: Math.round(durationMs / 1000),
    }))
    .sort((a, b) => b.seconds - a.seconds);
};

const MAINTENANCE_FEATURES = ['vibX', 'vibY', 'vibZ', 'courant', 'rpm'];
const MAINTENANCE_REPORT_COOLDOWN_MIN = Number(process.env.MAINTENANCE_REPORT_COOLDOWN_MIN || 15);
const SENSOR_ALERT_COOLDOWN_SEC = Number(process.env.SENSOR_ALERT_COOLDOWN_SEC || 20);

const resolveMachineIdentity = (data = {}) => {
  const node = String(data.node || data.machineId || 'UNKNOWN').trim() || 'UNKNOWN';
  const rawMachine = String(data.machineId || data.machine || '');
  if (/compresseur|compress/i.test(rawMachine) || isCompresseurNode(node)) {
    return { machineId: 'compresseur', machineName: 'Compresseur ABAC', node };
  }
  if (/rectifi/i.test(rawMachine) || isRectifieuseNode(node)) {
    return { machineId: 'rectifieuse', machineName: 'Rectifieuse', node };
  }
  const machineId = rawMachine ? slugify(rawMachine) : node;
  return { machineId: machineId || 'UNKNOWN', machineName: rawMachine || node, node };
};

const buildSensorHistoryFilter = (identity = {}) => {
  const aliases = nodeAliasesForMachine(identity.machineId, identity.node);
  const filters = [];

  if (aliases.length === 1) filters.push({ node: aliases[0] });
  else if (aliases.length > 1) filters.push({ node: { $in: aliases } });

  if (identity.machineId) filters.push({ machineId: identity.machineId });

  if (!filters.length) return {};
  return filters.length === 1 ? filters[0] : { $or: filters };
};

const sensorNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sensorSnapshot = (data = {}) => ({
  vibX: sensorNumber(data.vibX),
  vibY: sensorNumber(data.vibY),
  vibZ: sensorNumber(data.vibZ),
  courant: sensorNumber(data.courant),
  rpm: sensorNumber(data.rpm),
  pression: data.pression === undefined ? null : sensorNumber(data.pression),
});

const strongestMaintenanceSeverity = (...levels) => {
  const rank = { normal: 0, warning: 1, critical: 2 };
  return levels.reduce((best, level) => rank[level] > rank[best] ? level : best, 'normal');
};

const buildMaintenanceAssessment = (data = {}, history = []) => {
  const identity = resolveMachineIdentity(data);
  const snapshot = sensorSnapshot(data);
  const maxAxisVibration = Math.max(Math.abs(snapshot.vibX), Math.abs(snapshot.vibY), Math.abs(snapshot.vibZ));
  const vibration = Math.sqrt(snapshot.vibX ** 2 + snapshot.vibY ** 2 + snapshot.vibZ ** 2);
  const contributors = [];

  const addContributor = (metric, label, value, expected, level) => {
    contributors.push({ metric, label, value, expected, level });
  };

  if (snapshot.courant > 20) {
    addContributor('courant', 'Courant critique', snapshot.courant, '<= 20 A', 'critical');
  } else if (snapshot.courant > 15) {
    addContributor('courant', 'Courant eleve', snapshot.courant, '<= 15 A', 'warning');
  }

  if (maxAxisVibration > 3) {
    addContributor('vibration', 'Vibration critique', Number(vibration.toFixed(2)), '<= 3 g par axe', 'critical');
  } else if (maxAxisVibration > 2) {
    addContributor('vibration', 'Vibration elevee', Number(vibration.toFixed(2)), '<= 2 g par axe', 'warning');
  }

  if (snapshot.pression !== null) {
    if (snapshot.pression > 11 || snapshot.pression < 3.5) {
      addContributor('pression', 'Pression critique', snapshot.pression, '4.5 - 10 bar', 'critical');
    } else if (snapshot.pression > 10 || snapshot.pression < 4.5) {
      addContributor('pression', 'Pression hors zone', snapshot.pression, '4.5 - 10 bar', 'warning');
    }
  }

  const usableHistory = history
    .map(sensorSnapshot)
    .filter(row => MAINTENANCE_FEATURES.every(feature => Number.isFinite(row[feature])));

  if (usableHistory.length >= 20) {
    for (const feature of MAINTENANCE_FEATURES) {
      const samples = usableHistory.map(row => row[feature]);
      const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      const variance = samples.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / samples.length;
      const std = Math.sqrt(variance);
      if (std < 0.0001) continue;
      const zscore = Math.abs((snapshot[feature] - mean) / std);
      if (zscore >= 4) {
        addContributor(feature, `${feature} tres loin du comportement habituel`, Number(snapshot[feature].toFixed(2)), `${mean.toFixed(2)} +/- ${std.toFixed(2)}`, 'critical');
      } else if (zscore >= 3) {
        addContributor(feature, `${feature} anormal vs baseline`, Number(snapshot[feature].toFixed(2)), `${mean.toFixed(2)} +/- ${std.toFixed(2)}`, 'warning');
      }
    }
  }

  const severity = strongestMaintenanceSeverity(...contributors.map(item => item.level));
  const scoreFromContributors = contributors.reduce((score, item) => score + (item.level === 'critical' ? 38 : 22), 0);
  const anomalyScore = severity === 'normal' ? 0 : Math.min(100, Math.max(severity === 'critical' ? 76 : 48, scoreFromContributors));
  const prediction = severity === 'critical'
    ? { label: 'Panne probable', eta: 'moins de 24h', confidence: anomalyScore }
    : severity === 'warning'
      ? { label: 'Risque de panne', eta: '24-72h', confidence: anomalyScore }
      : { label: 'Comportement normal', eta: 'aucune panne prevue', confidence: 100 - anomalyScore };

  const recommendedAction = severity === 'critical'
    ? 'Arreter la machine, verifier les roulements, le courant et les fixations avant reprise.'
    : severity === 'warning'
      ? 'Planifier une inspection maintenance et surveiller les prochaines mesures.'
      : 'Continuer la surveillance automatique.';

  return {
    ...identity,
    severity,
    anomalyScore,
    prediction,
    contributors,
    sensorSnapshot: snapshot,
    recommendedAction,
    message: severity === 'normal'
      ? `Maintenance AI: comportement normal sur ${identity.machineName}`
      : `Maintenance AI: ${prediction.label} sur ${identity.machineName} (${anomalyScore}%).`,
  };
};

const buildSensorRuleAlerts = (data = {}) => {
  const snapshot = sensorSnapshot(data);
  const maxAxisVibration = Math.max(
    Math.abs(snapshot.vibX),
    Math.abs(snapshot.vibY),
    Math.abs(snapshot.vibZ),
  );
  const alerts = [];

  if (snapshot.courant > 20) {
    alerts.push({
      severity: 'critical',
      message: `Courant critique detecte (${snapshot.courant.toFixed(1)} A)`,
      node: data.node,
      type: 'sensor',
      trigger: 'current-threshold',
    });
  } else if (snapshot.courant > 15) {
    alerts.push({
      severity: 'warning',
      message: `Courant eleve detecte (${snapshot.courant.toFixed(1)} A)`,
      node: data.node,
      type: 'sensor',
      trigger: 'current-threshold',
    });
  }

  if (maxAxisVibration > 3) {
    alerts.push({
      severity: 'critical',
      message: 'Vibration critique detectee',
      node: data.node,
      type: 'sensor',
      trigger: 'vibration-threshold',
    });
  } else if (maxAxisVibration > 2) {
    alerts.push({
      severity: 'warning',
      message: 'Vibration elevee',
      node: data.node,
      type: 'sensor',
      trigger: 'vibration-threshold',
    });
  }

  if (snapshot.pression !== null) {
    if (snapshot.pression > 11 || snapshot.pression < 3.5) {
      alerts.push({
        severity: 'critical',
        message: `Pression critique detectee (${snapshot.pression.toFixed(1)} bar)`,
        node: data.node,
        type: 'sensor',
        trigger: 'pressure-threshold',
      });
    } else if (snapshot.pression > 10 || snapshot.pression < 4.5) {
      alerts.push({
        severity: 'warning',
        message: `Pression hors zone (${snapshot.pression.toFixed(1)} bar)`,
        node: data.node,
        type: 'sensor',
        trigger: 'pressure-threshold',
      });
    }
  }

  return alerts;
};

const buildAlertAiPayload = (assessment = {}, ruleAlert = {}) => ({
  source: 'rules',
  label: assessment?.severity || 'normal',
  score: Number.isFinite(Number(assessment?.anomalyScore)) ? Number(assessment.anomalyScore) : null,
  summary: assessment?.prediction?.label || null,
  contributor: Array.isArray(assessment?.contributors) && assessment.contributors[0]?.label
    ? assessment.contributors[0].label
    : null,
  trigger: ruleAlert?.trigger || null,
  model: 'backend-maintenance-assessment',
  version: 'rules-v2',
});

const mapDeviceAlertPayload = (payload = {}) => {
  const alertCode = String(payload.alert || '').trim().toUpperCase();
  if (!alertCode) return null;

  if (alertCode === 'RPM_HIGH') {
    return {
      severity: 'warning',
      type: 'sensor',
      message: payload.msg || 'RPM eleve detecte',
      ai: {
        source: 'manual',
        label: 'warning',
        summary: 'Seuil RPM depasse',
        contributor: 'Capteur RPM ESP32',
        trigger: 'rpm-threshold',
        model: 'esp32-device-alert',
        version: 'mqtt-v1',
      },
    };
  }

  if (alertCode === 'RPM_STOP') {
    return {
      severity: 'critical',
      type: 'sensor',
      message: payload.msg || 'Arret machine detecte',
      ai: {
        source: 'manual',
        label: 'critical',
        summary: 'Rotation stoppee',
        contributor: 'Capteur RPM ESP32',
        trigger: 'rpm-stop',
        model: 'esp32-device-alert',
        version: 'mqtt-v1',
      },
    };
  }

  return null;
};

const upsertSensorAlert = async ({ identity, payload, ruleAlert, assessment }) => {
  const severity = sanitizeSeverity(ruleAlert.severity);
  const snapshot = sensorSnapshot(payload);
  const ai = buildAlertAiPayload(assessment, ruleAlert);
  const now = new Date();

  if (SENSOR_ALERT_COOLDOWN_SEC > 0) {
    const cutoff = new Date(now.getTime() - (SENSOR_ALERT_COOLDOWN_SEC * 1000));
    const existing = await Alert.findOne({
      machineId: identity.machineId,
      node: payload.node || 'UNKNOWN',
      type: ruleAlert.type || 'sensor',
      severity,
      message: ruleAlert.message,
      status: { $ne: 'resolved' },
      lastObservedAt: { $gte: cutoff },
    }).sort({ lastObservedAt: -1 });

    if (existing) {
      existing.lastObservedAt = now;
      existing.occurrenceCount = (existing.occurrenceCount || 1) + 1;
      existing.sensorSnapshot = snapshot;
      existing.ai = { ...(existing.ai?.toObject ? existing.ai.toObject() : existing.ai), ...ai };
      await existing.save();
      io.emit('alert-updated', existing);
      return { alert: existing, isNew: false };
    }
  }

  const created = await Alert.create({
    machineId: identity.machineId,
    node: payload.node || 'UNKNOWN',
    type: ruleAlert.type || 'sensor',
    severity,
    message: ruleAlert.message,
    lastObservedAt: now,
    occurrenceCount: 1,
    ai,
    sensorSnapshot: snapshot,
  });
  io.emit('alert', created);
  return { alert: created, isNew: true };
};

const upsertDeviceAlert = async (payload = {}) => {
  const mapped = mapDeviceAlertPayload(payload);
  if (!mapped) return null;

  const identity = resolveMachineIdentity(payload);
  const now = new Date();
  const cutoff = new Date(now.getTime() - (SENSOR_ALERT_COOLDOWN_SEC * 1000));
  const snapshot = sensorSnapshot(payload);

  const existing = await Alert.findOne({
    machineId: identity.machineId,
    node: identity.node || payload.node || 'UNKNOWN',
    type: mapped.type,
    severity: sanitizeSeverity(mapped.severity),
    message: mapped.message,
    status: { $ne: 'resolved' },
    lastObservedAt: { $gte: cutoff },
  }).sort({ lastObservedAt: -1 });

  if (existing) {
    existing.lastObservedAt = now;
    existing.occurrenceCount = (existing.occurrenceCount || 1) + 1;
    existing.sensorSnapshot = { ...(existing.sensorSnapshot?.toObject ? existing.sensorSnapshot.toObject() : existing.sensorSnapshot), ...snapshot };
    existing.ai = { ...(existing.ai?.toObject ? existing.ai.toObject() : existing.ai), ...mapped.ai };
    await existing.save();
    io.emit('alert-updated', existing);
    return existing;
  }

  const created = await Alert.create({
    machineId: identity.machineId,
    node: identity.node || payload.node || 'UNKNOWN',
    type: mapped.type,
    severity: sanitizeSeverity(mapped.severity),
    message: mapped.message,
    lastObservedAt: now,
    occurrenceCount: 1,
    ai: mapped.ai,
    sensorSnapshot: snapshot,
  });
  io.emit('alert', created);
  return created;
};

const assessMaintenanceRisk = async (data = {}) => {
  const identity = resolveMachineIdentity(data);
  const history = await SensorData.find(buildSensorHistoryFilter(identity)).sort({ createdAt: -1 }).limit(120).lean();
  return buildMaintenanceAssessment(data, history);
};

const createMaintenanceCase = async (data = {}, alert = null, assessment = null, source = 'predictive-maintenance') => {
  const result = assessment || await assessMaintenanceRisk(data);
  if (!result || result.severity === 'normal') return null;

  const cooldownDate = new Date(Date.now() - MAINTENANCE_REPORT_COOLDOWN_MIN * 60 * 1000);
  const recentReport = await MaintenanceReport.findOne({
    machineId: result.machineId,
    status: { $ne: 'resolved' },
    createdAt: { $gte: cooldownDate },
  }).sort({ createdAt: -1 });
  if (recentReport) return { report: recentReport, request: null, reused: true };

  const report = await MaintenanceReport.create({
    machineId: result.machineId,
    machineName: result.machineName,
    node: result.node,
    alertId: alert?._id || null,
    source,
    severity: result.severity,
    anomalyScore: result.anomalyScore,
    prediction: result.prediction,
    recommendedAction: result.recommendedAction,
    contributors: result.contributors,
    sensorSnapshot: result.sensorSnapshot,
    status: 'open',
  });

  let request = await MaintenanceRequest.findOne({
    machineId: result.machineId,
    status: { $in: ['open', 'in_progress'] },
  }).sort({ createdAt: -1 });

  if (request) {
    request.lastReportId = report._id;
    await request.save();
  } else {
    request = await MaintenanceRequest.create({
      machineId: result.machineId,
      machineName: result.machineName,
      node: result.node,
      alertId: alert?._id || null,
      reportId: report._id,
      lastReportId: report._id,
      title: `Maintenance predictive - ${result.machineName}`,
      description: result.recommendedAction,
      priority: result.severity === 'critical' ? 'critical' : result.anomalyScore >= 65 ? 'high' : 'medium',
      status: 'open',
      requestedBy: 'ai-maintenance',
    });
  }

  report.requestId = request._id;
  await report.save();
  io.emit('maintenance-report', report);
  io.emit('maintenance-request', request);
  return { report, request, reused: false };
};

const passwordResetMailer = createPasswordResetMailer({
  nodemailer,
  config: {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    secure: process.env.SMTP_SECURE,
    from: process.env.MAIL_FROM,
  },
  logger: console,
});

// Auth Routes
// MVC Routes
app.use('/api/auth', createAuthRoutes({
  User,
  Demande,
  bcrypt,
  jwt,
  jwtSecret: process.env.JWT_SECRET,
  passwordResetMailer,
  passwordResetConfig: {
    ttlMs: Number(process.env.PASSWORD_RESET_TTL_MINUTES || 15) * 60 * 1000,
    cooldownMs: Number(process.env.PASSWORD_RESET_COOLDOWN_SECONDS || 60) * 1000,
    debugCode: parseBooleanEnv(process.env.PASSWORD_RESET_DEBUG_CODE),
  },
}));

app.use('/api', createWorkforceRoutes({
  authMiddleware,
  adminMiddleware,
  Demande,
  User,
  Piece,
  MachineEvent,
  Alert,
  bcrypt,
  io,
  normalizeMachineChain,
  computeWorkByMachine,
}));

app.use('/api', createTaskMessageRoutes({
  authMiddleware,
  adminMiddleware,
  Task,
  DirectMessage,
  io,
}));

app.use('/api', createMonitoringRoutes({
  authMiddleware,
  adminMiddleware,
  serviceKeyMiddleware,
  SensorData,
  Alert,
  Contact,
  CallLog,
  MaintenanceReport,
  MaintenanceRequest,
  MachineModel,
  io,
  sanitizeSeverity,
  resolveMachineIdentity,
  buildMaintenanceAssessment,
  assessMaintenanceRisk,
  createMaintenanceCase,
}));

app.use('/api', createPieceRoutes({
  authMiddleware,
  adminMiddleware,
  Piece,
  io,
  normalizeMachineChain,
  uploadsDir: uploadDir,
  upload,
}));

app.use('/api/machines', createMachineRoutes({ authMiddleware, adminMiddleware, machineImageUpload }));

app.use('/api', createDossierRoutes({
  authMiddleware,
  adminMiddleware,
  dossierUpload,
  Dossier,
  fs,
  getWatchDir: () => currentWatchDir,
  setWatchDir,
  selectWatchDir: selectWatchDirFromDesktop,
  canSelectWatchDir,
  getDossierWatcherHandle: () => dossierWatcherHandle,
  isMongoConnected: () => mongoConnected,
  parseStorageDate,
  escapeRegex,
}));

// Return a clean client error when a request body is not valid JSON.
app.use((err, _req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && Object.prototype.hasOwnProperty.call(err, 'body')) {
    return res.status(400).json({
      message: 'JSON invalide',
      error: 'Le corps de la requete doit etre un JSON valide.',
    });
  }
  return next(err);
});

if (fs.existsSync(frontendDistDir)) {
  app.use(express.static(frontendDistDir));
  app.get(/^\/(?!api(?:\/|$)|uploads(?:\/|$)|socket\.io(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(frontendDistDir, 'index.html'));
  });
}

const setupMqttClient = () => {
  if (mqttClientRef) return mqttClientRef;
  const mqttClient = mqtt.connect('mqtt://broker.hivemq.com:1883');

  mqttClient.on('connect', () => {
    mqttClient.subscribe('cncpulse/gsm/result', err => { if (!err) console.log('Subscribed: cncpulse/gsm/result'); });
    console.log('MQTT connecte a HiveMQ');
    mqttClient.subscribe('cncpulse/sensors', err => { if (!err) console.log('Abonne au topic: cncpulse/sensors'); });
    mqttClient.subscribe('cncpulse/alerts', err => { if (!err) console.log('Abonne au topic: cncpulse/alerts'); });
  });

  mqttClient.on('message', async (topic, message) => {
    try {
      const data = JSON.parse(message.toString());
      if (topic === 'cncpulse/gsm/result') {
        const { alertId, status, phoneNumber, providerRef, durationSec, errorMessage } = data;
        if (!alertId) return;
        const alert = await Alert.findById(alertId);
        if (!alert) return;
        const nextAttempt = (alert.callAttempts || 0) + 1;
        await CallLog.create({
          alertId, phoneNumber: phoneNumber || 'unknown', attemptNo: nextAttempt,
          callStatus: status || 'unknown', providerRef: providerRef || null,
          durationSec: durationSec || null, errorMessage: errorMessage || null,
        });
        if (status === 'success') { alert.status = 'notified'; alert.notifiedAt = new Date(); alert.notifiedBy = 'gsm'; }
        alert.callAttempts = nextAttempt;
        await alert.save();
        io.emit('gsm-result', { alertId, status: status || 'unknown' });
        return;
      }
      if (topic === 'cncpulse/alerts') {
        await upsertDeviceAlert(data);
        return;
      }
      const savedSensor = await SensorData.create(data);
      const sensorPayload = savedSensor.toObject ? savedSensor.toObject() : data;
      io.emit('sensor-data', sensorPayload);
      const assessment = await assessMaintenanceRisk(sensorPayload);
      const alerts = buildSensorRuleAlerts(sensorPayload);
      const identity = resolveMachineIdentity(sensorPayload);
      let primaryAlert = null;
      for (const alert of alerts) {
        const { alert: savedAlert } = await upsertSensorAlert({
          identity,
          payload: sensorPayload,
          ruleAlert: alert,
          assessment,
        });
        if (!primaryAlert && savedAlert) primaryAlert = savedAlert;
      }
      if (assessment.severity !== 'normal') {
        await createMaintenanceCase(sensorPayload, primaryAlert, assessment, 'backend-predictive-maintenance');
      }
    } catch (err) {
      console.error('Erreur MQTT:', err.message);
    }
  });

  mqttClientRef = mqttClient;
  return mqttClient;
};

// Socket.IO
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('Client connecte:', socket.id);

  socket.on('user-online', async ({ username, role }) => {
    connectedUsers.set(socket.id, { username, role });
    await User.updateOne({ username }, { isOnline: true, socketId: socket.id, connectedAt: new Date() });
    io.emit('user-status', { username, isOnline: true });
    if (role === 'employe') {
      const emp = await User.findOne({ username }).select('username assignedMachine currentPieceName machineStatus currentActivity machineStatusUpdatedAt connectedAt isOnline').lean();
      if (emp) io.emit('employee-machine-updated', { ...emp, isOnline: true });
    }
  });

  socket.on('send-direct-message', async ({ from, fromRole, to, text }) => {
    try {
      if (!text?.trim()) return;
      const msg = await DirectMessage.create({ from, fromRole, to, text: text.trim() });
      const msgData = msg.toObject();
      const recipientEntry = [...connectedUsers.entries()].find(([, u]) => u.username === to);
      if (recipientEntry) io.to(recipientEntry[0]).emit('direct-message', msgData);
      socket.emit('direct-message', msgData);
    } catch (err) { console.error('Erreur DM:', err.message); }
  });

  socket.on('mark-read', async ({ from, to }) => {
    await DirectMessage.updateMany({ from, to, read: false }, { read: true });
    socket.emit('messages-read', { from });
  });

  socket.on('get-history', async () => {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const messages = await Message.find({ createdAt: { $gte: since } }).sort({ createdAt: 1 }).limit(100);
      socket.emit('chat-history', messages);
    } catch (err) { console.error('Erreur get-history:', err.message); }
  });

  socket.on('send-message', async ({ username, role, text }) => {
    try {
      if (!text?.trim() || !username) return;
      const msg = await Message.create({ username, role: role || 'user', text: text.trim() });
      io.emit('new-message', { _id: msg._id, username: msg.username, role: msg.role, text: msg.text, createdAt: msg.createdAt });
    } catch (err) { console.error('Erreur chat:', err.message); }
  });

  socket.on('disconnect', async () => {
    const userData = connectedUsers.get(socket.id);
    if (userData) {
      connectedUsers.delete(socket.id);
      // Auto-stop machine if employee was working
      const user = await User.findOne({ username: userData.username });
      if (user && user.role === 'employe') {
        const wasActive = user.machineStatus === 'started' || user.machineStatus === 'paused';
        await User.updateOne(
          { username: userData.username },
          { isOnline: false, lastSeen: new Date(), socketId: null, machineStatus: 'stopped', currentActivity: '' }
        );
        if (wasActive) {
          // Log a stop event
          await MachineEvent.create({
            username: userData.username,
            machine: user.assignedMachine || 'Inconnue',
            action: 'stopped',
            activity: 'Deconnexion automatique',
          }).catch(() => {});
        }
        io.emit('employee-machine-updated', {
          username: userData.username,
          isOnline: false,
          machineStatus: 'stopped',
          currentActivity: '',
          assignedMachine: user.assignedMachine,
          lastSeen: new Date().toISOString(),
        });
      } else {
        await User.updateOne({ username: userData.username }, { isOnline: false, lastSeen: new Date(), socketId: null });
      }
      io.emit('user-status', { username: userData.username, isOnline: false, lastSeen: new Date().toISOString() });
    }
    console.log('Client deconnecte:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;

const listenHttpServer = () => new Promise((resolve, reject) => {
  if (server.listening) {
    resolve();
    return;
  }

  const handleError = (err) => {
    server.off('listening', handleListening);
    reject(err);
  };

  const handleListening = () => {
    server.off('error', handleError);
    console.log(`Serveur demarre sur le port ${PORT}`);
    resolve();
  };

  server.once('error', handleError);
  server.once('listening', handleListening);
  server.listen(PORT, '0.0.0.0');
});

const startServer = async () => {
  if (server.listening) return { app, server, port: Number(PORT) };
  if (startupPromise) return startupPromise;

  startupPromise = (async () => {
    validateEnv();

    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('MongoDB connecte');
    }

    mongoConnected = true;
    await ensureBaseMachines({ MachineModel, logger: console });
    setupMqttClient();
    await listenHttpServer();
    void maybeStartWatcher();

    return { app, server, port: Number(PORT) };
  })();

  try {
    return await startupPromise;
  } catch (err) {
    startupPromise = null;
    throw err;
  }
};

module.exports = {
  app,
  server,
  startServer,
};

if (require.main === module) {
  startServer().catch((err) => {
    if (err?.code === 'EADDRINUSE') {
      console.error(`Le port ${PORT} est deja utilise. Un autre serveur tourne deja sur cette machine.`);
      process.exit(1);
    }

    console.error('Erreur au demarrage du backend:', err);
    process.exit(1);
  });
}
