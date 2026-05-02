const express    = require('express');
const mongoose   = require('mongoose');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const mqtt       = require('mqtt');
const http       = require('http');
const { Server } = require('socket.io');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const { startDossierWatcher } = require('./dossierWatcher');
const { slugify } = require('./utils/slugify');
const { createAuthRoutes } = require('./routes/authRoutes');
const { createWorkforceRoutes } = require('./routes/workforceRoutes');
const { createTaskMessageRoutes } = require('./routes/taskMessageRoutes');
const { createMonitoringRoutes } = require('./routes/monitoringRoutes');
const { createPieceRoutes } = require('./routes/pieceRoutes');
const { createDossierRoutes } = require('./routes/dossierRoutes');
const { createMachineRoutes } = require('./routes/machineRoutes');
require('dotenv').config();

const app    = express();
const server = http.createServer(app);

// â”€â”€ Multer â”€â”€
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const dossierUploadDir = path.join(uploadDir, 'dossiers');
if (!fs.existsSync(dossierUploadDir)) fs.mkdirSync(dossierUploadDir);
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
app.use('/uploads', express.static(uploadDir));

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.json());
app.use(cors({ origin: '*' }));

// â•â•â• Security â•â•â•
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'Trop de requÃªtes, rÃ©essayez dans 15 minutes.' }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Trop de tentatives, rÃ©essayez dans 15 minutes.' }
});
app.use('/api/auth/', authLimiter);

// â•â•â• MongoDB â•â•â•
// Start the folder watcher only after MongoDB + the Dossier model are ready,
// otherwise the initial scan can fail to persist (or the model is not registered yet).
let dossierWatcherHandle = null;
let mongoConnected = false;
let dossierModelRef = null;
const WATCH_DIR = process.env.DOSSIER_WATCH_DIR || 'C:\\data CNC CONCEPT';
const maybeStartWatcher = async () => {
  if (dossierWatcherHandle) return;
  if (!mongoConnected) return;
  if (!dossierModelRef) return;
  try {
    dossierWatcherHandle = await startDossierWatcher({ rootDir: WATCH_DIR, Dossier: dossierModelRef, logger: console });
  } catch (err) {
    console.error('[dossier-watcher] failed to start:', err?.message || err);
  }
};
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('âœ… MongoDB connectÃ©');
    mongoConnected = true;
    await maybeStartWatcher();
  })
  .catch(err => console.error('âŒ MongoDB:', err));

// â•â•â• Models â•â•â•
const User = require('./models/User');
const MachineEvent = require('./models/MachineEvent');
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

// â•â•â• Middlewares â•â•â•
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

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseStorageDate = (value) => {
  if (!value) return null;
  const parsed = new Date(`${String(value)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeMachineChain = (machine, machineChain) => {
  const normalizedChain = Array.isArray(machineChain) ? machineChain.filter(Boolean) : [];
  if (normalizedChain.length > 0) return normalizedChain;
  return machine ? [machine] : ['Rectifieuse'];
};

const computeWorkByMachine = (events = []) => {
  const sorted = [...events].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const activeSessions = new Map();
  const totals = {};

  for (const ev of sorted) {
    const key = `${ev.username}:${ev.machine}`;
    const eventTime = new Date(ev.createdAt).getTime();
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

  return Object.entries(totals).map(([machine, durationMs]) => ({
    machine,
    seconds: Math.round(durationMs / 1000),
  }));
};

const MAINTENANCE_FEATURES = ['vibX', 'vibY', 'vibZ', 'courant', 'rpm'];
const MAINTENANCE_REPORT_COOLDOWN_MIN = Number(process.env.MAINTENANCE_REPORT_COOLDOWN_MIN || 15);
const PREDICTION_CONFIDENCE_THRESHOLD = Number(process.env.PRIMARY_CONFIDENCE_THRESHOLD || 0.7);
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883';
const MQTT_SENSOR_TOPIC = process.env.MQTT_SENSOR_TOPIC || 'cncpulse/sensors';
const MQTT_PREDICTION_TOPIC = process.env.MQTT_PREDICTION_TOPIC || 'cncpulse/maintenance/predictions';
const MQTT_GSM_RESULT_TOPIC = process.env.MQTT_GSM_RESULT_TOPIC || 'cncpulse/gsm/result';

const resolveMachineIdentity = (data = {}) => {
  const node = String(data.node || data.machineId || 'UNKNOWN');
  const rawMachine = String(data.machineId || data.machine || '');
  if (/compresseur|compress/i.test(rawMachine) || /compresseur|compress/i.test(node)) {
    return { machineId: 'compresseur', machineName: 'Compresseur ABAC', node };
  }
  if (/rectifi/i.test(rawMachine) || /ESP32-NODE-03/i.test(node) || /ESP32-NODE-01/i.test(node)) {
    return { machineId: 'rectifieuse', machineName: 'Rectifieuse', node };
  }
  const machineId = rawMachine ? slugify(rawMachine) : node;
  return { machineId: machineId || 'UNKNOWN', machineName: rawMachine || node, node };
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

const predictionLabelFromClass = (predictedClass) => {
  if (predictedClass === 'critical') return 'Panne probable';
  if (predictedClass === 'warning') return 'Risque de panne';
  return 'Comportement normal';
};

const etaFromClass = (predictedClass) => {
  if (predictedClass === 'critical') return 'moins de 24h';
  if (predictedClass === 'warning') return '24-72h';
  return 'aucune panne prevue';
};

const recommendedActionFromClass = (predictedClass) => {
  if (predictedClass === 'critical') {
    return 'Arreter la machine, verifier les roulements, le courant et les fixations avant reprise.';
  }
  if (predictedClass === 'warning') {
    return 'Planifier une inspection maintenance et surveiller les prochaines mesures.';
  }
  return 'Continuer la surveillance automatique.';
};

const normalizeModelPrediction = (prediction = {}) => {
  const parsedClass = String(prediction.predictedClass || prediction.label || 'normal').toLowerCase();
  const predictedClass = ['normal', 'warning', 'critical'].includes(parsedClass) ? parsedClass : 'normal';
  const anomalyScoreRaw = Number(prediction.anomalyScore);
  const confidenceRaw = Number(prediction.confidence);
  const anomalyScore = Number.isFinite(anomalyScoreRaw) ? Math.min(1, Math.max(0, anomalyScoreRaw)) : 0;
  const confidence = Number.isFinite(confidenceRaw) ? Math.min(1, Math.max(0, confidenceRaw)) : 0;
  return {
    predictedClass,
    confidence,
    anomalyScore,
    proba: prediction.proba && typeof prediction.proba === 'object' ? prediction.proba : null,
    modelName: prediction.modelName || null,
    modelVersion: prediction.modelVersion || null,
    historySize: Number(prediction.historySize || 0),
    sequenceLength: Number(prediction.sequenceLength || 0),
  };
};

const buildRuleFallbackAssessment = (data = {}, history = []) => {
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

  return {
    severity: strongestMaintenanceSeverity(...contributors.map(item => item.level)),
    contributors,
    sensorSnapshot: snapshot,
  };
};

const buildMaintenanceAssessment = (data = {}, history = [], modelPrediction = null) => {
  const identity = resolveMachineIdentity(data);
  const fallback = buildRuleFallbackAssessment(data, history);
  const model = normalizeModelPrediction(modelPrediction);
  const useModel = model.confidence > PREDICTION_CONFIDENCE_THRESHOLD;
  const predictedClass = useModel ? model.predictedClass : fallback.severity;
  const severity = predictedClass;
  const anomalyScore = Math.round(model.anomalyScore * 100);
  const prediction = {
    label: predictionLabelFromClass(predictedClass),
    eta: etaFromClass(predictedClass),
    confidence: Math.round(model.confidence * 100),
  };

  return {
    ...identity,
    severity,
    predictedClass,
    anomalyScore,
    prediction,
    contributors: useModel ? [] : fallback.contributors,
    sensorSnapshot: fallback.sensorSnapshot,
    recommendedAction: recommendedActionFromClass(predictedClass),
    message: severity === 'normal'
      ? `Maintenance AI: comportement normal sur ${identity.machineName}`
      : `Maintenance AI: ${prediction.label} sur ${identity.machineName} (${anomalyScore}%).`,
    decisionSource: useModel ? 'lstm-primary' : 'backend-rules-fallback',
    modelPrediction: model,
    fallbackSeverity: fallback.severity,
  };
};

const assessMaintenanceRisk = async (data = {}, modelPrediction = null) => {
  const identity = resolveMachineIdentity(data);
  const history = await SensorData.find({ node: identity.node }).sort({ createdAt: -1 }).limit(120).lean();
  return buildMaintenanceAssessment(data, history, modelPrediction);
};

const createMaintenanceCase = async (data = {}, alert = null, assessment = null, source = 'predictive-maintenance-hybrid') => {
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
      priority: result.severity === 'critical' ? 'critical' : 'high',
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

// â•â•â• Auth Routes â•â•â•
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â MVC Routes Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
app.use('/api/auth', createAuthRoutes({
  User,
  bcrypt,
  jwt,
  jwtSecret: process.env.JWT_SECRET,
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
  io,
  sanitizeSeverity,
  resolveMachineIdentity,
  buildMaintenanceAssessment,
  assessMaintenanceRisk,
  createMaintenanceCase,
  getLatestPrediction,
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

app.use('/api/machines', createMachineRoutes({ authMiddleware }));

app.use('/api', createDossierRoutes({
  authMiddleware,
  adminMiddleware,
  dossierUpload,
  Dossier,
  fs,
  watchDir: WATCH_DIR,
  getDossierWatcherHandle: () => dossierWatcherHandle,
  isMongoConnected: () => mongoConnected,
  parseStorageDate,
  escapeRegex,
}));

const latestPredictions = new Map();
const rememberPrediction = (event = {}) => {
  const node = String(event.node || event?.prediction?.node || event?.sensorPayload?.node || 'UNKNOWN');
  const machineId = String(event.machineId || event?.prediction?.machineId || event?.sensorPayload?.machineId || node);
  const normalized = {
    node,
    machineId,
    prediction: event.prediction || null,
    createdAt: Date.now(),
  };
  latestPredictions.set(`node:${node}`, normalized);
  latestPredictions.set(`machine:${machineId}`, normalized);
};
const getLatestPrediction = ({ node, machineId } = {}) => {
  const now = Date.now();
  const maxAgeMs = 10 * 60 * 1000;
  const fromNode = node ? latestPredictions.get(`node:${node}`) : null;
  const fromMachine = machineId ? latestPredictions.get(`machine:${machineId}`) : null;
  const found = fromNode || fromMachine;
  if (!found) return null;
  if ((now - Number(found.createdAt || 0)) > maxAgeMs) return null;
  return found.prediction || null;
};

const mqttClient = mqtt.connect(MQTT_BROKER_URL);

mqttClient.on('connect', () => {
  mqttClient.subscribe(MQTT_GSM_RESULT_TOPIC, err => { if (!err) console.log(`Subscribed: ${MQTT_GSM_RESULT_TOPIC}`); });
  mqttClient.subscribe(MQTT_SENSOR_TOPIC, err => { if (!err) console.log(`Subscribed: ${MQTT_SENSOR_TOPIC}`); });
  mqttClient.subscribe(MQTT_PREDICTION_TOPIC, err => { if (!err) console.log(`Subscribed: ${MQTT_PREDICTION_TOPIC}`); });
  console.log(`MQTT connected: ${MQTT_BROKER_URL}`);
});

mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    if (topic === MQTT_GSM_RESULT_TOPIC) {
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

    if (topic === MQTT_SENSOR_TOPIC) {
      await SensorData.create(data);
      io.emit('sensor-data', data);
      return;
    }

    if (topic === MQTT_PREDICTION_TOPIC) {
      rememberPrediction(data);
      const sensorPayload = data?.sensorPayload && typeof data.sensorPayload === 'object'
        ? data.sensorPayload
        : data;
      const assessment = await assessMaintenanceRisk(sensorPayload, data?.prediction || null);
      if (assessment.severity === 'normal') return;

      const alert = await Alert.create({
        machineId: assessment.machineId,
        node: assessment.node,
        type: 'maintenance-ai',
        severity: sanitizeSeverity(assessment.severity),
        message: assessment.message,
        ai: {
          source: assessment.decisionSource,
          label: assessment.predictedClass,
          proba: assessment.modelPrediction?.proba || null,
          model: assessment.modelPrediction?.modelName || 'MaintenanceLSTMClassifier',
          version: assessment.modelPrediction?.modelVersion || 'lstm-v1',
        },
        sensorSnapshot: assessment.sensorSnapshot,
      });
      io.emit('alert', alert);

      await createMaintenanceCase(sensorPayload, alert, assessment, assessment.decisionSource);
      return;
    }
  } catch (err) {
    console.error('âŒ Erreur MQTT:', err.message);
  }
});

// â•â•â• Socket.IO â•â•â•
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('ðŸ–¥ï¸ Client connectÃ©:', socket.id);

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
    } catch (err) { console.error('âŒ Erreur DM:', err.message); }
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
    } catch (err) { console.error('âŒ Erreur get-history:', err.message); }
  });

  socket.on('send-message', async ({ username, role, text }) => {
    try {
      if (!text?.trim() || !username) return;
      const msg = await Message.create({ username, role: role || 'user', text: text.trim() });
      io.emit('new-message', { _id: msg._id, username: msg.username, role: msg.role, text: msg.text, createdAt: msg.createdAt });
    } catch (err) { console.error('âŒ Erreur chat:', err.message); }
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
            activity: 'DÃ©connexion automatique',
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
    console.log('ðŸ–¥ï¸ Client dÃ©connectÃ©:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => console.log(`ðŸš€ Serveur dÃ©marrÃ© sur le port ${PORT}`));
