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
require('dotenv').config();

const app    = express();
const server = http.createServer(app);

// ── Multer ──
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

// ═══ Security ═══
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'Trop de requêtes, réessayez dans 15 minutes.' }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Trop de tentatives, réessayez dans 15 minutes.' }
});
app.use('/api/auth/', authLimiter);

// ═══ MongoDB ═══
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
    console.log('✅ MongoDB connecté');
    mongoConnected = true;
    await maybeStartWatcher();
  })
  .catch(err => console.error('❌ MongoDB:', err));

// ═══ Schemas ═══
const userSchema = new mongoose.Schema({
  username:  { type: String, required: true, unique: true },
  password:  { type: String, required: true },
  role:      { type: String, default: 'user' },
  assignedMachine: { type: String, default: null },
  currentPieceName: { type: String, default: null },
  currentPieceId:   { type: String, default: null },
  machineStatus: { type: String, enum: ['stopped', 'started', 'paused'], default: 'stopped' },
  currentActivity: { type: String, default: '' },
  machineStatusUpdatedAt: { type: Date, default: null },
  connectedAt: { type: Date, default: null },
  isOnline:  { type: Boolean, default: false },
  lastSeen:  { type: Date, default: null },
  socketId:  { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const machineEventSchema = new mongoose.Schema({
  username: { type: String, required: true },
  machine: { type: String, required: true },
  action: { type: String, enum: ['started', 'paused', 'stopped'], required: true },
  activity: { type: String, default: '' },
  pieceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Piece', default: null },
  pieceName: { type: String, default: null },
  pieceCount: { type: Number, default: null },
  createdAt: { type: Date, default: Date.now }
});
const MachineEvent = mongoose.model('MachineEvent', machineEventSchema);

// ── Machine Model ──
const machineSchema = new mongoose.Schema({
  id:         { type: String, required: true, unique: true },
  name:       { type: String, required: true },
  model:      { type: String, default: '' },
  hasSensors: { type: Boolean, default: false },
  node:       { type: String, default: null },
  icon:       { type: String, default: 'gear', enum: ['gear', 'wrench', 'bolt', 'drill'] },
  status:     { type: String, default: 'Arrêt', enum: ['En marche', 'Avertissement', 'Arrêt', 'En maintenance'] },
  protocol:   { type: String, default: 'MQTT' },
  broker:     { type: String, default: 'localhost' },
  latence:    { type: String, default: '—' },
  uptime:     { type: String, default: '—' },
  chipModel:  { type: String, default: '—' },
  sante:      { type: Number, default: 100 },
  production: { type: Number, default: 0 },
  objectif:   { type: Number, default: 0 },
  isBase:     { type: Boolean, default: false },
  createdAt:  { type: Date, default: Date.now },
});
const MachineModel = mongoose.model('Machine', machineSchema);

const demandeSchema = new mongoose.Schema({
  nom:        { type: String, required: true },
  email:      { type: String, required: true },
  poste:      { type: String, required: true },
  telephone:  { type: String, required: true },
  statut:     { type: String, default: 'en attente' },
  username:   { type: String, default: null },
  createdAt:  { type: Date, default: Date.now }
});
const Demande = mongoose.model('Demande', demandeSchema);

const taskSchema = new mongoose.Schema({
  titre:       { type: String, required: true },
  description: { type: String, default: '' },
  priorite:    { type: String, default: 'moyenne' },
  deadline:    { type: Date,   default: null },
  assigneA:    { type: String, default: null },
  statut:      { type: String, default: 'à faire' },
  creePar:     { type: String, required: true },
  createdAt:   { type: Date,   default: Date.now }
});
const Task = mongoose.model('Task', taskSchema);

const directMessageSchema = new mongoose.Schema({
  from:      { type: String, required: true },
  fromRole:  { type: String, required: true },
  to:        { type: String, required: true },
  text:      { type: String, required: true },
  read:      { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 }
});
const DirectMessage = mongoose.model('DirectMessage', directMessageSchema);

const sensorSchema = new mongoose.Schema({
  node: String, courant: Number,
  vibX: Number, vibY: Number, vibZ: Number, rpm: Number,
  createdAt: { type: Date, default: Date.now }
});
const SensorData = mongoose.model('SensorData', sensorSchema);

const messageSchema = new mongoose.Schema({
  username:  { type: String, required: true },
  role:      { type: String, default: 'user' },
  text:      { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 86400 }
});
const Message = mongoose.model('Message', messageSchema);

const alertSchema = new mongoose.Schema({
  machineId:    { type: String, default: 'UNKNOWN' },
  node:         { type: String, default: 'UNKNOWN' },
  type:         { type: String, default: 'system' },
  severity:     { type: String, enum: ['warning', 'critical'], default: 'warning' },
  message:      { type: String, required: true },
  status:       { type: String, enum: ['new', 'seen', 'notified', 'resolved'], default: 'new' },
  createdAt:    { type: Date, default: Date.now },
  seenAt:       { type: Date, default: null },
  seenBy:       { type: String, default: null },
  notifiedAt:   { type: Date, default: null },
  notifiedBy:   { type: String, default: null },
  callAttempts: { type: Number, default: 0 },
  ai: {
    source:  { type: String, default: 'rules' },
    label:   { type: String, default: null },
    proba:   { type: mongoose.Schema.Types.Mixed, default: null },
    model:   { type: String, default: null },
    version: { type: String, default: null },
  },
  sensorSnapshot: {
    vibX:    { type: Number, default: null },
    vibY:    { type: Number, default: null },
    vibZ:    { type: Number, default: null },
    courant: { type: Number, default: null },
    rpm:     { type: Number, default: null },
  },
});
const Alert = mongoose.model('Alert', alertSchema);

const contactSchema = new mongoose.Schema({
  role:         { type: String, default: 'responsable' },
  name:         { type: String, required: true },
  phonePrimary: { type: String, required: true },
  phoneBackup:  { type: String, default: null },
  isActive:     { type: Boolean, default: true },
  createdAt:    { type: Date, default: Date.now }
});
const Contact = mongoose.model('Contact', contactSchema);

const callLogSchema = new mongoose.Schema({
  alertId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Alert', required: true },
  phoneNumber:  { type: String, required: true },
  attemptNo:    { type: Number, required: true },
  callStatus:   { type: String, default: 'queued' },
  providerRef:  { type: String, default: null },
  audioFilePath:{ type: String, default: null },
  audioFormat:  { type: String, default: null },
  audioBase64:  { type: String, default: null },
  calledAt:     { type: Date, default: Date.now },
  endedAt:      { type: Date, default: null },
  durationSec:  { type: Number, default: null },
  errorMessage: { type: String, default: null },
});
const CallLog = mongoose.model('CallLog', callLogSchema);

// ── Schema Tâche (sous-document) ──
const tacheSchema = new mongoose.Schema({
  titre:    { type: String, required: true },
  employe:  { type: String, required: true },
  statut:   { type: String, enum: ['à faire', 'en cours', 'terminée'], default: 'à faire' },
  priorite: { type: String, enum: ['haute', 'moyenne', 'basse'], default: 'moyenne' },
}, { _id: true });

// ── Schema Pièce ──
const pieceSchema = new mongoose.Schema({
  ref:            { type: String, default: '' },
  fichier:        { type: String, default: null },
  nom:            { type: String, required: true },
  machine:        { type: String, default: 'Rectifieuse' },
  machineChain:   { type: [String], default: [] },
  currentStep:    { type: Number, default: 0 },
  currentMachine: { type: String, default: null },
  history:        { type: [new mongoose.Schema({
    machine: { type: String, required: true },
    action: { type: String, enum: ['entered', 'completed'], required: true },
    at: { type: Date, default: Date.now },
    by: { type: String, default: null }
  }, { _id: false })], default: [] },
  employe:        { type: String, default: '' },
  quantite:       { type: Number, default: 0 },
  quantiteProduite: { type: Number, default: 0 },
  prix:           { type: Number, default: 0 },
  status:         { type: String, enum: ['Terminé', 'En cours', 'Contrôle'], default: 'En cours' },
  matiere:        { type: Boolean, default: true },
  dimension:      { type: String, default: '' },
  matiereType:    { type: String, default: '' },
  matiereReference:{ type: String, default: '' },
  solidworksPath: { type: String, default: null },
  taches:         { type: [tacheSchema], default: [] },
  stock:          { type: Number, default: 0 },
  maxStock:       { type: Number, default: 1 },
  seuil:          { type: Number, default: 1 },
  createdAt:      { type: Date, default: Date.now }
});
const Piece = mongoose.model('Piece', pieceSchema);

const dossierSchema = new mongoose.Schema({
  originalName:   { type: String, required: true },
  storedFilename: { type: String, required: true },
  filePath:       { type: String, required: true },
  publicPath:     { type: String, required: true },
  mimeType:       { type: String, default: 'application/pdf' },
  size:           { type: Number, default: 0 },
  clientLastName: { type: String, default: '' },
  clientFirstName:{ type: String, default: '' },
  projectName:    { type: String, default: '' },
  pieceName:      { type: String, default: '' },
  batchId:        { type: String, default: '' },
  storageDate:    { type: Date, required: true },
  searchableText: { type: String, default: '' },
  uploadedBy:     { type: String, default: null },
  createdAt:      { type: Date, default: Date.now }
});
const Dossier = mongoose.model('Dossier', dossierSchema);

// Mark model as ready and attempt starting the watcher (if Mongo is already connected).
dossierModelRef = Dossier;
maybeStartWatcher();

// ═══ Middlewares ═══
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

const slugify = (value = '') => {
  return String(value)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};

const machineMeta = (name) => {
  const n = String(name || '');
  const isRect = /rectifi/i.test(n);
  const isComp = /compresse/i.test(n);
  if (isRect) return { id: 'rectifieuse', hasSensors: true, node: 'ESP32-NODE-03' };
  if (isComp) return { id: 'compresseur', hasSensors: true, node: 'compresseur' };
  return { id: slugify(n) || `machine-${Date.now()}`, hasSensors: false, node: null };
};

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

const normalizeReportMachineName = (value = '') => {
  const name = String(value || '').trim();
  if (/rectifi/i.test(name)) return 'Rectifieuse';
  if (/agie cut/i.test(name)) return 'Agie Cut';
  if (/agie drill/i.test(name)) return 'Agie Drill';
  if (/haas/i.test(name)) return 'HAAS CNC';
  if (/mazak|tour cnc/i.test(name)) return 'Tour CNC';
  if (/compresse/i.test(name)) return 'Compresseur ABAC';
  return name || 'Inconnue';
};

const estimateMachinePowerKw = (machineName = '') => {
  const normalized = normalizeReportMachineName(machineName);
  const powerMap = {
    'Rectifieuse': 5.5,
    'Agie Cut': 7.5,
    'Agie Drill': 6.5,
    'HAAS CNC': 12,
    'Tour CNC': 9,
    'Compresseur ABAC': 7.5,
    'Inconnue': 5,
  };
  return powerMap[normalized] || 5;
};

const computeRuntimeByGroup = (events = [], groupBy = 'machine', activeUserState = new Map()) => {
  const sorted = [...events].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const activeSessions = new Map();
  const totals = {};
  const now = Date.now();

  for (const ev of sorted) {
    const normalizedMachine = normalizeReportMachineName(ev.machine);
    const sessionKey = `${ev.username}:${normalizedMachine}`;
    const eventTime = new Date(ev.createdAt).getTime();

    if (ev.action === 'started') {
      activeSessions.set(sessionKey, {
        startedAt: eventTime,
        username: ev.username || 'Inconnu',
        machine: normalizedMachine,
      });
      continue;
    }

    if (ev.action === 'paused' || ev.action === 'stopped') {
      const session = activeSessions.get(sessionKey);
      if (!session) continue;
      const durationMs = Math.max(0, eventTime - session.startedAt);
      const groupKey = groupBy === 'employee' ? session.username : session.machine;
      totals[groupKey] = (totals[groupKey] || 0) + durationMs;
      activeSessions.delete(sessionKey);
    }
  }

  for (const session of activeSessions.values()) {
    const userState = activeUserState.get(session.username);
    const isStillRunning =
      userState?.machineStatus === 'started' &&
      normalizeReportMachineName(userState?.assignedMachine) === session.machine;
    if (!isStillRunning) continue;
    const durationMs = Math.max(0, now - session.startedAt);
    const groupKey = groupBy === 'employee' ? session.username : session.machine;
    totals[groupKey] = (totals[groupKey] || 0) + durationMs;
  }

  return Object.entries(totals).map(([label, durationMs]) => ({
    label,
    seconds: Math.round(durationMs / 1000),
  }));
};

const computeRuntimeByEmployeeMachine = (events = [], activeUserState = new Map()) => {
  const sorted = [...events].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const activeSessions = new Map();
  const totals = {};
  const now = Date.now();

  for (const ev of sorted) {
    const normalizedMachine = normalizeReportMachineName(ev.machine);
    const sessionKey = `${ev.username}:${normalizedMachine}`;
    const eventTime = new Date(ev.createdAt).getTime();

    if (ev.action === 'started') {
      activeSessions.set(sessionKey, {
        startedAt: eventTime,
        username: ev.username || 'Inconnu',
        machine: normalizedMachine,
      });
      continue;
    }

    if (ev.action === 'paused' || ev.action === 'stopped') {
      const session = activeSessions.get(sessionKey);
      if (!session) continue;
      const durationMs = Math.max(0, eventTime - session.startedAt);
      totals[sessionKey] = (totals[sessionKey] || 0) + durationMs;
      activeSessions.delete(sessionKey);
    }
  }

  for (const [sessionKey, session] of activeSessions.entries()) {
    const userState = activeUserState.get(session.username);
    const isStillRunning =
      userState?.machineStatus === 'started' &&
      normalizeReportMachineName(userState?.assignedMachine) === session.machine;
    if (!isStillRunning) continue;
    const durationMs = Math.max(0, now - session.startedAt);
    totals[sessionKey] = (totals[sessionKey] || 0) + durationMs;
  }

  return Object.entries(totals).map(([key, durationMs]) => {
    const [username, machine] = key.split(':');
    return {
      username,
      machine,
      seconds: Math.round(durationMs / 1000),
    };
  });
};

// ═══ Auth Routes ═══
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Champs requis manquants' });
    const exists = await User.findOne({ username });
    if (exists) return res.status(409).json({ message: 'Utilisateur déjà existant' });
    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({ username, password: hashed });
    res.status(201).json({ message: '✅ Utilisateur créé', userId: user._id });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ message: 'Identifiants incorrects' });
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token, username: user.username, role: user.role });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// ═══ Demandes ═══
app.post('/api/demandes', async (req, res) => {
  try {
    const { nom, email, poste, telephone } = req.body;
    if (!nom || !email || !poste || !telephone)
      return res.status(400).json({ message: 'Tous les champs sont requis' });
    const demande = await Demande.create({ nom, email, poste, telephone });
    io.emit('nouvelle-demande', { id: demande._id, nom, email, poste });
    res.status(201).json({ message: '✅ Demande envoyée avec succès' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.get('/api/demandes', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const demandes = await Demande.find().sort({ createdAt: -1 });
    res.json(demandes);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

app.post('/api/demandes/:id/approuver', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username et mot de passe requis' });
    const demande = await Demande.findById(req.params.id);
    if (!demande) return res.status(404).json({ message: 'Demande introuvable' });
    if (demande.statut !== 'en attente') return res.status(400).json({ message: 'Demande déjà traitée' });
    const exists = await User.findOne({ username });
    if (exists) return res.status(409).json({ message: 'Username déjà utilisé' });
    const hashed = await bcrypt.hash(password, 12);
    await User.create({ username, password: hashed, role: 'employe' });
    demande.statut   = 'approuvée';
    demande.username = username;
    await demande.save();
    res.json({ message: `✅ Compte créé pour ${username}` });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.post('/api/demandes/:id/refuser', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const demande = await Demande.findById(req.params.id);
    if (!demande) return res.status(404).json({ message: 'Demande introuvable' });
    demande.statut = 'refusée';
    await demande.save();
    res.json({ message: '❌ Demande refusée' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// ═══ Users ═══
app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const users = await User.find({}, 'username role isOnline lastSeen assignedMachine machineStatus currentActivity machineStatusUpdatedAt');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

app.patch('/api/admin/employes/:userId/assign-machine', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { assignedMachine } = req.body;
    if (!assignedMachine) return res.status(400).json({ message: 'Machine assignee requise' });
    const user = await User.findOneAndUpdate(
      { _id: req.params.userId, role: 'employe' },
      { assignedMachine },
      { new: true }
    ).select('username assignedMachine machineStatus currentActivity machineStatusUpdatedAt isOnline');
    if (!user) return res.status(404).json({ message: 'Employe introuvable' });
    io.emit('employee-machine-updated', user);
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.get('/api/admin/employes-overview', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const employes = await User.find({ role: 'employe' })
      .select('username assignedMachine currentPieceName currentPieceId machineStatus currentActivity machineStatusUpdatedAt connectedAt isOnline lastSeen')
      .sort({ username: 1 });
    res.json(employes);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.get('/api/admin/employes/:username/historique', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username } = req.params;
    const { limit = 50 } = req.query;
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);

    const [events, pieces, user] = await Promise.all([
      MachineEvent.find({ username }).sort({ createdAt: -1 }).limit(Number(limit)).lean(),
      Piece.find({ employe: username }).lean(),
      User.findOne({ username }).select('connectedAt isOnline assignedMachine currentPieceName machineStatus machineStatusUpdatedAt').lean(),
    ]);

    const todayEvents = [...events].filter(e => new Date(e.createdAt) >= todayStart);
    const totalPieces     = pieces.reduce((s, p) => s + (p.quantite || 0), 0);
    const totalSessions   = events.filter(e => e.action === 'started').length;
    const totalPausees    = events.filter(e => e.action === 'paused').length;
    const totalTerminees  = events.filter(e => e.action === 'stopped').length;
    const piecesProduites = events.filter(e => e.action === 'stopped').reduce((s, e) => s + (e.pieceCount || 0), 0);
    const piecesAujourd   = todayEvents.filter(e => e.action === 'stopped').reduce((s, e) => s + (e.pieceCount || 0), 0);

    // Compute work/pause time today
    const sortedToday = [...todayEvents].sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    let workSeconds = 0, pauseSeconds = 0, lastStart = null, lastPause = null;
    for (const ev of sortedToday) {
      if (ev.action === 'started') {
        if (lastPause) { pauseSeconds += (new Date(ev.createdAt) - lastPause) / 1000; lastPause = null; }
        lastStart = new Date(ev.createdAt);
      }
      if (ev.action === 'paused') {
        if (lastStart) { workSeconds += (new Date(ev.createdAt) - lastStart) / 1000; lastStart = null; }
        lastPause = new Date(ev.createdAt);
      }
      if (ev.action === 'stopped') {
        if (lastStart) { workSeconds += (new Date(ev.createdAt) - lastStart) / 1000; lastStart = null; }
      }
    }
    if (lastStart) workSeconds += (Date.now() - lastStart.getTime()) / 1000;

    res.json({
      user,
      events,
      pieces,
      stats: {
        totalPieces, totalSessions, totalPausees, totalTerminees,
        piecesProduites, piecesAujourd,
        workSecondsToday: Math.round(workSeconds),
        pauseSecondsToday: Math.round(pauseSeconds),
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.get('/api/employe/me/dashboard', authMiddleware, async (req, res) => {
  try {
    const me = await User.findOne({ username: req.user.username })
      .select('username assignedMachine machineStatus currentActivity machineStatusUpdatedAt role');
    if (!me) return res.status(404).json({ message: 'Utilisateur introuvable' });

    const pieces = await Piece.find({
      $and: [
        { status: { $ne: 'Terminé' } },
        {
          $or: [
            { employe: req.user.username },
            { 'taches.employe': req.user.username },
          ],
        },
      ],
    }).sort({ createdAt: -1 });
    res.json({
      user: me,
      machine: me.assignedMachine || null,
      canUseAllMachines: true,
      pieces,
    });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.post('/api/employe/machine/action', authMiddleware, async (req, res) => {
  try {
    const { action, activity = '', pieceId = null, pieceCount = null, machineName = null } = req.body;
    if (!['started', 'paused', 'stopped'].includes(action))
      return res.status(400).json({ message: 'Action invalide' });
    if (action === 'stopped' && !pieceId)
      return res.status(400).json({ message: 'pieceId requis pour terminer' });

    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

    // Update assignedMachine if provided
    if (machineName && action === 'started') {
      user.assignedMachine = machineName;
    }
    const machine = machineName || user.assignedMachine || 'Inconnue';
    let piece = null;

    user.machineStatus = action;
    user.currentActivity = activity;
    user.machineStatusUpdatedAt = new Date();

    // Track current piece
    if (action === 'started' && pieceId) {
      const p = await Piece.findById(pieceId).lean();
      if (p) { user.currentPieceName = p.nom; user.currentPieceId = String(pieceId); }
    }
    if (action === 'stopped') {
      user.currentPieceName = null;
      user.currentPieceId = null;
    }
    await user.save();

    if (action === 'stopped' && pieceId) {
      piece = await Piece.findById(pieceId);
      if (!piece) return res.status(404).json({ message: 'Piece introuvable' });
      const chain = normalizeMachineChain(piece.machine, piece.machineChain);
      const currentStep = Math.min(Math.max(piece.currentStep || 0, 0), Math.max(chain.length - 1, 0));
      const currentMachine = chain[currentStep];
      piece.history = piece.history || [];
      piece.history.push({ machine: currentMachine, action: 'completed', by: req.user.username });

      if (currentStep >= chain.length - 1) {
        piece.status = 'Terminé';
        piece.currentStep = chain.length - 1;
        piece.currentMachine = chain[chain.length - 1] || currentMachine || null;
      } else {
        const nextStep = currentStep + 1;
        piece.currentStep = nextStep;
        piece.currentMachine = chain[nextStep];
        piece.status = 'En cours';
        piece.history.push({ machine: chain[nextStep], action: 'entered', by: req.user.username });
      }
      piece.quantiteProduite = (piece.quantiteProduite || 0) + Number(pieceCount);
      // Update status based on produced vs required
      if (piece.quantiteProduite >= piece.quantite && piece.quantite > 0) {
        piece.status = 'Terminé';
      }
      await piece.save();
      io.emit('piece-progressed', piece);
    }

    const event = await MachineEvent.create({
      username: user.username,
      machine,
      action,
      activity,
      pieceId: piece?._id || null,
      pieceName: piece?.nom || null,
      pieceCount: action === 'stopped' ? Number(pieceCount) : null,
    });

    const payload = {
      username: user.username,
      machine,
      assignedMachine: machine,
      machineStatus: action,
      currentActivity: activity,
      currentPieceName: user.currentPieceName || null,
      currentPieceId: user.currentPieceId || null,
      machineStatusUpdatedAt: user.machineStatusUpdatedAt,
      connectedAt: user.connectedAt,
      pieceId: piece?._id || null,
      pieceName: piece?.nom || null,
      pieceCount: action === 'stopped' ? Number(pieceCount) : null,
      createdAt: event.createdAt,
    };
    io.emit('employee-machine-updated', payload);
    io.emit('dashboard-refresh', { username: user.username, action, machine });
    res.json(payload);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.get('/api/dashboard/stats', authMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const last7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [pieces, events, alerts, employes] = await Promise.all([
      Piece.find({}).lean(),
      MachineEvent.find({ createdAt: { $gte: last7 } }).sort({ createdAt: 1 }).lean(),
      Alert.find({ status: { $ne: 'resolved' } }).lean(),
      User.find({ role: 'employe' }).select('username assignedMachine machineStatus currentActivity isOnline').lean(),
    ]);

    // KPIs
    const totalPcs      = pieces.reduce((s, p) => s + (p.quantite || 0), 0);
    const totalRevenu   = pieces.reduce((s, p) => s + (p.quantite || 0) * (p.prix || 0), 0);
    const enCours       = pieces.filter(p => p.status === 'En cours').length;
    const totalPieces   = pieces.length;

    // Production par jour (7 derniers jours)
    const prodParJour = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const label = d.toLocaleDateString('fr-FR', { weekday: 'short' });
      const dayStart = new Date(d); dayStart.setHours(0,0,0,0);
      const dayEnd   = new Date(d); dayEnd.setHours(23,59,59,999);
      const dayEvents = events.filter(e => new Date(e.createdAt) >= dayStart && new Date(e.createdAt) <= dayEnd && e.action === 'stopped');
      const pcs = dayEvents.reduce((s, e) => s + (e.pieceCount || 0), 0);
      prodParJour.push({ label, pcs });
    }

    // Répartition par machine — machines actives (started) seulement
    const activeMachineMap = {};
    for (const e of employes.filter(e => e.machineStatus === 'started' && e.assignedMachine)) {
      activeMachineMap[e.assignedMachine] = (activeMachineMap[e.assignedMachine] || 0) + 1;
    }
    // Fallback: si aucune active, montrer répartition pièces
    const machineMap = Object.keys(activeMachineMap).length > 0 ? activeMachineMap : {};
    if (Object.keys(machineMap).length === 0) {
      for (const p of pieces) {
        const m = p.machine || 'Inconnue';
        machineMap[m] = (machineMap[m] || 0) + (p.quantite || 0);
      }
    }
    const repartition = Object.entries(machineMap).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 5);

    // Temps machines (7 derniers jours) — réel par action
    const tempsMachines = computeWorkByMachine(events);
    const totalFonction = tempsMachines.reduce((s, m) => s + m.seconds, 0);

    // Temps en pause (started→paused sessions)
    const computePauseTime = (evts) => {
      const sorted = [...evts].sort((a,b) => new Date(a.createdAt)-new Date(b.createdAt));
      const sessions = new Map();
      let totalPauseMs = 0;
      for (const ev of sorted) {
        const key = ev.username;
        if (ev.action === 'paused') sessions.set(key, new Date(ev.createdAt).getTime());
        if (ev.action === 'started' && sessions.has(key)) {
          totalPauseMs += new Date(ev.createdAt).getTime() - sessions.get(key);
          sessions.delete(key);
        }
      }
      return Math.round(totalPauseMs / 1000);
    };
    const totalPauseSeconds = computePauseTime(events);

    // Activité employés
    const activiteEmployes = employes.map(e => {
      const empEvents = events.filter(ev => ev.username === e.username);
      const sessions  = empEvents.filter(ev => ev.action === 'started').length;
      const pcsEmp    = empEvents.filter(ev => ev.action === 'stopped').reduce((s, ev) => s + (ev.pieceCount || 0), 0);
      const pauseMs   = 0; // simplified
      return { username: e.username, machineStatus: e.machineStatus, assignedMachine: e.assignedMachine, sessions, pcs: pcsEmp, pauseMs };
    });

    // Machines actives (celles qui ont au moins 1 started aujourd'hui sans stopped après)
    const machinesActives = employes.filter(e => e.machineStatus === 'started').map(e => ({ machine: e.assignedMachine, username: e.username }));

    res.json({
      kpi: { totalPcs, totalRevenu, enCours, totalPieces, alertesActives: alerts.length },
      prodParJour,
      repartition,
      tempsMachines,
      totalFonctionSeconds: totalFonction,
      totalPauseSeconds,
      activiteEmployes,
      machinesActives,
      employes: {
        total: employes.length,
        actifs: employes.filter(e => e.machineStatus === 'started').length,
        enPause: employes.filter(e => e.machineStatus === 'paused').length,
        enligne: employes.filter(e => e.isOnline).length,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});


app.get('/api/reports/overview', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [pieces, events, alerts, employes] = await Promise.all([
      Piece.find({}).lean(),
      MachineEvent.find({}).sort({ createdAt: 1 }).lean(),
      Alert.find({ createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }).lean(),
      User.find({ role: 'employe' }).lean(),
    ]);

    const activeUserState = new Map(
      employes.map((employe) => [employe.username, {
        machineStatus: employe.machineStatus,
        assignedMachine: employe.assignedMachine || null,
      }])
    );

    const piecesTraitees = pieces.filter((piece) => piece.status === 'Terminé').reduce((sum, piece) => sum + (piece.quantite || 0), 0);
    const pauses = events.filter((event) => event.action === 'paused').length;
    const anomalies = alerts.filter((alert) => alert.severity === 'critical' || alert.type === 'sensor').length;
    const tempsMachine = computeWorkByMachine(events);
    const stoppedEvents = events.filter((event) => event.action === 'stopped');
    const runtimeByMachine = computeRuntimeByGroup(events, 'machine', activeUserState);
    const runtimeByEmployee = computeRuntimeByGroup(events, 'employee', activeUserState);
    const runtimeByEmployeeMachine = computeRuntimeByEmployeeMachine(events, activeUserState);

    const piecesProducedByMachine = stoppedEvents.reduce((acc, event) => {
      const machine = normalizeReportMachineName(event.machine);
      acc[machine] = (acc[machine] || 0) + Number(event.pieceCount || 0);
      return acc;
    }, {});

    const piecesProducedByEmployee = stoppedEvents.reduce((acc, event) => {
      const username = event.username || 'Inconnu';
      acc[username] = (acc[username] || 0) + Number(event.pieceCount || 0);
      return acc;
    }, {});

    const energyByMachine = runtimeByMachine.reduce((acc, item) => {
      const energyKwh = Number(((item.seconds / 3600) * estimateMachinePowerKw(item.label)).toFixed(2));
      acc[item.label] = energyKwh;
      return acc;
    }, {});

    const energyByEmployee = runtimeByEmployeeMachine.reduce((acc, item) => {
      const energyKwh = (item.seconds / 3600) * estimateMachinePowerKw(item.machine);
      acc[item.username] = Number(((acc[item.username] || 0) + energyKwh).toFixed(2));
      return acc;
    }, {});

    const runtimeByMachineMap = runtimeByMachine.reduce((acc, item) => {
      acc[item.label] = Number(item.seconds || 0);
      return acc;
    }, {});

    const runtimeByEmployeeMap = runtimeByEmployee.reduce((acc, item) => {
      acc[item.label] = Number(item.seconds || 0);
      return acc;
    }, {});

    const machineLabels = new Set([
      ...runtimeByMachine.map((item) => item.label),
      ...Object.keys(piecesProducedByMachine),
      ...events.map((event) => normalizeReportMachineName(event.machine)),
      ...pieces.flatMap((piece) => {
        const chain = normalizeMachineChain(piece.machine, piece.machineChain);
        const normalizedChain = chain.map((name) => normalizeReportMachineName(name));
        const currentMachine = piece.currentMachine ? [normalizeReportMachineName(piece.currentMachine)] : [];
        return [...normalizedChain, ...currentMachine];
      }),
      ...employes
        .map((employe) => employe.assignedMachine ? normalizeReportMachineName(employe.assignedMachine) : null)
        .filter(Boolean),
    ]);

    const reportByMachine = Array.from(machineLabels)
      .filter(Boolean)
      .map((machine) => ({
        machine,
        piecesProduced: Number(piecesProducedByMachine[machine] || 0),
        machiningSeconds: Number(runtimeByMachineMap[machine] || 0),
        energyKwh: Number(energyByMachine[machine] || 0),
      }))
      .sort((a, b) => (b.machiningSeconds - a.machiningSeconds) || (b.piecesProduced - a.piecesProduced));

    const employeeLabels = new Set([
      ...runtimeByEmployee.map((item) => item.label),
      ...Object.keys(piecesProducedByEmployee),
      ...events.map((event) => event.username || 'Inconnu'),
      ...employes.map((employe) => employe.username),
    ]);

    const reportByEmployee = Array.from(employeeLabels)
      .filter(Boolean)
      .map((username) => {
        const employe = employes.find((entry) => entry.username === username);
        return {
          username,
          piecesProduced: Number(piecesProducedByEmployee[username] || 0),
          machiningSeconds: Number(runtimeByEmployeeMap[username] || 0),
          energyKwh: Number(energyByEmployee[username] || 0),
          assignedMachine: employe?.assignedMachine || null,
        };
      })
      .sort((a, b) => (b.machiningSeconds - a.machiningSeconds) || (b.piecesProduced - a.piecesProduced));

    const totalEnergyKwh = Number(reportByMachine.reduce((sum, item) => sum + item.energyKwh, 0).toFixed(2));
    const totalMachiningSeconds = reportByMachine.reduce((sum, item) => sum + item.machiningSeconds, 0);
    const totalPiecesProduced = reportByMachine.reduce((sum, item) => sum + item.piecesProduced, 0);

    const performanceEmployes = employes.map((employe) => {
      const piecesEmploye = pieces.filter((piece) => piece.employe === employe.username);
      const totalPieces = piecesEmploye.reduce((sum, piece) => sum + (piece.quantite || 0), 0);
      const completed = piecesEmploye.filter((piece) => piece.status === 'Terminé').length;
      return {
        username: employe.username,
        totalPieces,
        completedPieces: completed,
        assignedMachine: employe.assignedMachine || null,
      };
    });

    const logs = events
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 300)
      .map((event) => ({
        machine: event.machine,
        action: event.action,
        at: event.createdAt,
        username: event.username,
        pieceCount: event.action === 'stopped' ? (event.pieceCount || 0) : null,
        pieceName: event.pieceName || null,
      }));

    res.json({
      piecesTraitees,
      pauses,
      anomalies,
      tempsMachine,
      totalEnergyKwh,
      totalMachiningSeconds,
      totalPiecesProduced,
      reportByMachine,
      reportByEmployee,
      energyEstimated: true,
      performanceEmployes,
      logs,
    });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// ═══ Tasks ═══
app.post('/api/tasks', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { titre, description, priorite, deadline, assigneA } = req.body;
    if (!titre) return res.status(400).json({ message: 'Titre requis' });
    const task = await Task.create({ titre, description, priorite, deadline, assigneA, creePar: req.user.username });
    io.emit('nouvelle-task', task);
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.get('/api/tasks', authMiddleware, async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { assigneA: req.user.username };
    const tasks  = await Task.find(filter).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

app.patch('/api/tasks/:id', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task introuvable' });
    if (req.user.role !== 'admin' && task.assigneA !== req.user.username)
      return res.status(403).json({ message: 'Accès refusé' });
    const allowed = ['titre', 'description', 'priorite', 'deadline', 'assigneA', 'statut'];
    allowed.forEach(f => { if (req.body[f] !== undefined) task[f] = req.body[f]; });
    await task.save();
    io.emit('task-updated', task);
    res.json(task);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.delete('/api/tasks/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    io.emit('task-deleted', { id: req.params.id });
    res.json({ message: '✅ Task supprimée' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// ═══ Messages ═══
app.get('/api/messages/:targetUsername', authMiddleware, async (req, res) => {
  try {
    const { username } = req.user;
    const { targetUsername } = req.params;
    const messages = await DirectMessage.find({
      $or: [{ from: username, to: targetUsername }, { from: targetUsername, to: username }]
    }).sort({ createdAt: 1 }).limit(100);
    await DirectMessage.updateMany({ from: targetUsername, to: username, read: false }, { read: true });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

app.get('/api/messages/unread/counts', authMiddleware, async (req, res) => {
  try {
    const { username } = req.user;
    const unread = await DirectMessage.aggregate([
      { $match: { to: username, read: false } },
      { $group: { _id: '$from', count: { $sum: 1 } } }
    ]);
    const counts = {};
    unread.forEach(u => { counts[u._id] = u.count; });
    res.json(counts);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ═══ Sensors ═══
app.get('/api/sensors/history', authMiddleware, async (req, res) => {
  try {
    const data = await SensorData.find().sort({ createdAt: -1 }).limit(50);
    res.json(data.reverse());
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ═══ Alerts ═══
app.get('/api/alerts', authMiddleware, async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const alerts = await Alert.find(filter).sort({ createdAt: -1 }).limit(Number(limit));
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.get('/api/alerts/pending', serviceKeyMiddleware, async (req, res) => {
  try {
    const maxAgeMinutes = Number(req.query.maxAgeMinutes || 5);
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    const alerts = await Alert.find({ status: 'new', seenAt: null, createdAt: { $lte: cutoff } }).sort({ createdAt: 1 }).limit(200);
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.post('/api/alerts', authMiddleware, async (req, res) => {
  try {
    const { machineId, node, type, severity, message, sensorSnapshot, ai } = req.body;
    if (!message) return res.status(400).json({ message: 'Message requis' });
    const alert = await Alert.create({
      machineId: machineId || 'UNKNOWN', node: node || 'UNKNOWN',
      type: type || 'manual', severity: sanitizeSeverity(severity), message,
      sensorSnapshot: sensorSnapshot || {}, ai: ai || { source: 'manual' }
    });
    io.emit('alert', alert);
    res.status(201).json(alert);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.patch('/api/alerts/:id/seen', authMiddleware, async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);
    if (!alert) return res.status(404).json({ message: 'Alerte introuvable' });
    if (alert.status !== 'resolved') {
      alert.status = 'seen'; alert.seenAt = new Date(); alert.seenBy = req.user.username;
      await alert.save();
    }
    res.json(alert);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.patch('/api/alerts/:id/resolve', authMiddleware, async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);
    if (!alert) return res.status(404).json({ message: 'Alerte introuvable' });
    alert.status = 'resolved';
    if (!alert.seenAt) { alert.seenAt = new Date(); alert.seenBy = req.user.username; }
    await alert.save();
    res.json(alert);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.patch('/api/alerts/:id/notified', serviceKeyMiddleware, async (req, res) => {
  try {
    const { notifiedBy = 'gsm-supervisor' } = req.body || {};
    const alert = await Alert.findById(req.params.id);
    if (!alert) return res.status(404).json({ message: 'Alerte introuvable' });
    alert.status = 'notified'; alert.notifiedAt = new Date();
    alert.notifiedBy = notifiedBy; alert.callAttempts = (alert.callAttempts || 0) + 1;
    await alert.save();
    res.json(alert);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// ═══ Contacts ═══
app.get('/api/contacts', authMiddleware, async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.get('/api/contacts/active', serviceKeyMiddleware, async (req, res) => {
  try {
    const contact = await Contact.findOne({ isActive: true }).sort({ createdAt: -1 });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.post('/api/contacts', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { role, name, phonePrimary, phoneBackup, isActive = true } = req.body;
    if (!name || !phonePrimary) return res.status(400).json({ message: 'Nom et numero requis' });
    const contact = await Contact.create({ role, name, phonePrimary, phoneBackup, isActive });
    res.status(201).json(contact);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.patch('/api/contacts/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const updates = ['role', 'name', 'phonePrimary', 'phoneBackup', 'isActive']
      .reduce((acc, key) => { if (req.body[key] !== undefined) acc[key] = req.body[key]; return acc; }, {});
    const contact = await Contact.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!contact) return res.status(404).json({ message: 'Contact introuvable' });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// ═══ Call Logs ═══
app.post('/api/call-logs', serviceKeyMiddleware, async (req, res) => {
  try {
    const { alertId, phoneNumber, attemptNo, callStatus, providerRef, durationSec, errorMessage, audioFilePath, audioFormat, audioBase64 } = req.body;
    if (!alertId || !phoneNumber || !attemptNo)
      return res.status(400).json({ message: 'alertId, phoneNumber, attemptNo requis' });
    const log = await CallLog.create({
      alertId, phoneNumber, attemptNo,
      callStatus: callStatus || 'queued', providerRef: providerRef || null,
      durationSec: durationSec || null, errorMessage: errorMessage || null,
      audioFilePath: audioFilePath || null, audioFormat: audioFormat || null, audioBase64: audioBase64 || null
    });
    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.get('/api/call-logs/:alertId', authMiddleware, async (req, res) => {
  try {
    const logs = await CallLog.find({ alertId: req.params.alertId }).sort({ calledAt: -1 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// ═══════════════════════════════════════
// ═══ Pièces Production ═══
// ═══════════════════════════════════════

// GET toutes les pièces
app.get('/api/pieces', authMiddleware, async (req, res) => {
  try {
    const { machine, status } = req.query;
    const filter = {};
    if (machine) filter.machine = machine;
    if (status)  filter.status  = status;
    const pieces = await Piece.find(filter).sort({ createdAt: -1 });
    res.json(pieces);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST créer une pièce — FIX: détecte JSON vs FormData automatiquement
app.get('/api/production/pieces-tracking', authMiddleware, async (req, res) => {
  try {
    const pieces = await Piece.find({}).sort({ createdAt: -1 });
    const mapped = pieces.map((piece) => {
      const chain = normalizeMachineChain(piece.machine, piece.machineChain);
      const step = Math.min(Math.max(piece.currentStep || 0, 0), Math.max(chain.length - 1, 0));
      return {
        _id: piece._id,
        nom: piece.nom,
        quantite: piece.quantite,
        status: piece.status,
        chain,
        currentStep: step,
        currentMachine: piece.currentMachine || chain[step] || null,
        history: piece.history || [],
        employe: piece.employe || '',
      };
    });
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.post('/api/pieces/:id/progress', authMiddleware, async (req, res) => {
  try {
    const { action = 'next' } = req.body || {};
    const piece = await Piece.findById(req.params.id);
    if (!piece) return res.status(404).json({ message: 'Pièce introuvable' });

    const chain = normalizeMachineChain(piece.machine, piece.machineChain);
    const currentStep = Math.min(Math.max(piece.currentStep || 0, 0), Math.max(chain.length - 1, 0));
    const currentMachine = chain[currentStep];
    piece.history = piece.history || [];
    piece.history.push({ machine: currentMachine, action: 'completed', by: req.user.username });

    if (action === 'complete' || currentStep >= chain.length - 1) {
      piece.status = 'Terminé';
      piece.currentStep = chain.length - 1;
      piece.currentMachine = chain[chain.length - 1] || currentMachine || null;
    } else {
      const nextStep = currentStep + 1;
      piece.currentStep = nextStep;
      piece.currentMachine = chain[nextStep];
      piece.status = 'En cours';
      piece.history.push({ machine: chain[nextStep], action: 'entered', by: req.user.username });
    }

    await piece.save();
    io.emit('piece-progressed', piece);
    io.emit('dashboard-refresh', { pieceId: piece._id, action: 'updated' });
    res.json(piece);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.post('/api/pieces', authMiddleware, adminMiddleware, (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  // Si c'est du JSON → pas de multer
  if (contentType.includes('application/json')) return next();
  // Si c'est du FormData → multer
  upload.single('fichier')(req, res, next);
}, async (req, res) => {
  try {
    const { nom, machine, machineChain, employe, quantite, prix, status, matiere, dimension, matiereType, matiereReference, solidworksPath, ref } = req.body;
    if (!nom) return res.status(400).json({ message: 'Nom requis' });
    const chain = normalizeMachineChain(machine, machineChain);

    const piece = await Piece.create({
      ref:            ref            || '',
      nom,
      machine:        machine        || 'Rectifieuse',
      machineChain:   chain,
      currentStep:    0,
      currentMachine: chain[0] || machine || 'Rectifieuse',
      history:        [{ machine: chain[0] || machine || 'Rectifieuse', action: 'entered', by: req.user.username }],
      employe:        employe        || '',
      quantite:       Number(quantite)  || 0,
      prix:           Number(prix)      || 0,
      status:         status         || 'En cours',
      // FIX: gère boolean depuis JSON et string depuis FormData
      matiere:        typeof matiere === 'boolean' ? matiere : matiere !== 'false',
      dimension:      dimension || '',
      matiereType:    matiereType || '',
      matiereReference: matiereReference || '',
      solidworksPath: solidworksPath || null,
      fichier:        req.file ? req.file.filename : null,
      taches:         [],
    });
    res.status(201).json(piece);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// PATCH modifier une pièce
app.patch('/api/pieces/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const allowed = ['nom', 'machine', 'machineChain', 'employe', 'quantite', 'prix', 'status', 'matiere', 'dimension', 'matiereType', 'matiereReference', 'solidworksPath', 'ref', 'stock', 'maxStock', 'seuil', 'currentStep', 'currentMachine'];
    const updates = allowed.reduce((acc, key) => {
      if (req.body[key] !== undefined) acc[key] = req.body[key];
      return acc;
    }, {});
    if (updates.machineChain || updates.machine) {
      const existing = await Piece.findById(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Pièce introuvable' });
      const nextChain = normalizeMachineChain(updates.machine || existing.machine, updates.machineChain || existing.machineChain);
      updates.machineChain = nextChain;
      const safeStep = Math.min(Math.max(Number(updates.currentStep ?? existing.currentStep ?? 0), 0), Math.max(nextChain.length - 1, 0));
      updates.currentStep = safeStep;
      updates.currentMachine = nextChain[safeStep] || null;
    }
    const piece = await Piece.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (piece) {
      io.emit('piece-progressed', piece);
      io.emit('dashboard-refresh', { pieceId: piece._id, action: 'updated' });
    }
    if (!piece) return res.status(404).json({ message: 'Pièce introuvable' });
    res.json(piece);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// DELETE supprimer une pièce
app.delete('/api/pieces/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await Piece.findByIdAndDelete(req.params.id);
    res.json({ message: '✅ Pièce supprimée' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// GET télécharger le fichier d'une pièce
app.get('/api/pieces/:id/download', authMiddleware, async (req, res) => {
  try {
    const piece = await Piece.findById(req.params.id);
    if (!piece || !piece.fichier) return res.status(404).json({ message: 'Fichier introuvable' });
    const filePath = path.join(__dirname, 'uploads', piece.fichier);
    res.download(filePath, piece.fichier);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// ── Tâches d'une pièce ──

// POST ajouter une tâche
app.post('/api/pieces/:id/taches', authMiddleware, async (req, res) => {
  try {
    const { titre, employe, priorite } = req.body;
    if (!titre || !employe) return res.status(400).json({ message: 'Titre et employé requis' });
    const piece = await Piece.findById(req.params.id);
    if (!piece) return res.status(404).json({ message: 'Pièce introuvable' });
    piece.taches.push({ titre, employe, priorite: priorite || 'moyenne', statut: 'à faire' });
    await piece.save();
    res.status(201).json(piece);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// PATCH modifier le statut d'une tâche
app.patch('/api/pieces/:id/taches/:tacheId', authMiddleware, async (req, res) => {
  try {
    const piece = await Piece.findById(req.params.id);
    if (!piece) return res.status(404).json({ message: 'Pièce introuvable' });
    const tache = piece.taches.id(req.params.tacheId);
    if (!tache) return res.status(404).json({ message: 'Tâche introuvable' });
    const allowed = ['titre', 'employe', 'statut', 'priorite'];
    allowed.forEach(f => { if (req.body[f] !== undefined) tache[f] = req.body[f]; });
    await piece.save();
    res.json(piece);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// DELETE supprimer une tâche
app.delete('/api/pieces/:id/taches/:tacheId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const piece = await Piece.findById(req.params.id);
    if (!piece) return res.status(404).json({ message: 'Pièce introuvable' });
    piece.taches.pull({ _id: req.params.tacheId });
    await piece.save();
    res.json(piece);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// ═══ MQTT ═══
app.get('/api/machines', authMiddleware, async (req, res) => {
  try {
    const BASE_MACHINES = [
      { id: 'rectifieuse',  name: 'Rectifieuse',       hasSensors: true,  node: 'ESP32-NODE-03', isBase: true },
      { id: 'agie-cut',     name: 'Agie Cut',           hasSensors: false, node: null, isBase: true },
      { id: 'agie-drill',   name: 'Agie Drill',         hasSensors: false, node: null, isBase: true },
      { id: 'haas-cnc',     name: 'HAAS CNC',           hasSensors: false, node: null, isBase: true },
      { id: 'tour-cnc',     name: 'Tour CNC',           hasSensors: false, node: null, isBase: true },
      { id: 'compresseur',  name: 'Compresseur ABAC',   hasSensors: true,  node: 'compresseur', isBase: true },
    ];

    // Get custom machines from DB
    const dbMachines = await MachineModel.find({ isBase: false }).lean();

    const [pieceMachines, assignedMachines] = await Promise.all([
      Piece.distinct('machine', { machine: { $ne: '' } }),
      User.distinct('assignedMachine', { assignedMachine: { $ne: null } }),
    ]);

    const names = [...pieceMachines, ...assignedMachines]
      .map((v) => String(v || '').trim())
      .filter(Boolean);

    const allKnownNames = [
      ...BASE_MACHINES.map(m => m.name.toLowerCase()),
      ...dbMachines.map(m => m.name.toLowerCase()),
    ];

    const extra = Array.from(new Set(names))
      .filter((name) => !allKnownNames.includes(name.toLowerCase()))
      .map((name) => {
        const meta = machineMeta(name);
        return { id: meta.id, name, hasSensors: meta.hasSensors, node: meta.node, isBase: false };
      });

    const machines = [...BASE_MACHINES, ...dbMachines, ...extra].sort((a, b) => a.name.localeCompare(b.name));
    res.json(machines);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.post('/api/machines', authMiddleware, async (req, res) => {
  try {
    const { name, model, icon, status, hasSensors, node, objectif } = req.body;
    if (!name) return res.status(400).json({ message: 'Nom requis' });
    const id = slugify(name) || `machine-${Date.now()}`;
    const exists = await MachineModel.findOne({ $or: [{ id }, { name: { $regex: new RegExp(`^${name}$`, 'i') } }] });
    if (exists) return res.status(409).json({ message: 'Machine déjà existante' });
    const machine = await MachineModel.create({
      id, name, model: model || '', icon: icon || 'gear',
      status: status || 'Arrêt', hasSensors: hasSensors || false,
      node: node || null, objectif: objectif || 0, isBase: false,
    });
    res.status(201).json(machine);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.delete('/api/machines/:id', authMiddleware, async (req, res) => {
  try {
    const machine = await MachineModel.findOneAndDelete({ id: req.params.id, isBase: false });
    if (!machine) return res.status(404).json({ message: 'Machine introuvable ou machine de base non supprimable' });
    res.json({ message: 'Machine supprimée' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.patch('/api/machines/:id', authMiddleware, async (req, res) => {
  try {
    const { name, model, icon, status, objectif } = req.body;
    const machine = await MachineModel.findOneAndUpdate(
      { id: req.params.id, isBase: false },
      { $set: { name, model, icon, status, objectif } },
      { new: true }
    );
    if (!machine) return res.status(404).json({ message: 'Machine introuvable ou non modifiable' });
    res.json(machine);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.get('/api/dossiers/watcher-status', authMiddleware, async (req, res) => {
  try {
    const exists = fs.existsSync(WATCH_DIR);
    const indexedCount = await Dossier.countDocuments({});
    if (!dossierWatcherHandle) {
      return res.status(503).json({ running: false, watchDir: WATCH_DIR, exists, mongoConnected, indexedCount, message: 'Watcher non demarre' });
    }
    res.json({ running: true, watchDir: dossierWatcherHandle.rootAbs || WATCH_DIR, exists, mongoConnected, indexedCount });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.post('/api/dossiers/rescan', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!dossierWatcherHandle) {
      return res.status(503).json({ message: 'Watcher non demarre' });
    }
    await dossierWatcherHandle.rescan('manual-rescan');
    res.json({ message: 'Rescan termine' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.get('/api/dossiers', authMiddleware, async (req, res) => {
  try {
    const { client, piece, date, from, to, q, type, project, batchId } = req.query;
    const filter = {};

    if (batchId) filter.batchId = String(batchId);
    if (client) {
      const pattern = { $regex: escapeRegex(String(client)), $options: 'i' };
      filter.$or = [
        { clientLastName: pattern },
        { clientFirstName: pattern },
        { searchableText: { $regex: escapeRegex(String(client).toLowerCase()), $options: 'i' } }
      ];
    }
    if (piece) filter.pieceName = { $regex: escapeRegex(String(piece)), $options: 'i' };
    if (project) filter.projectName = { $regex: escapeRegex(String(project)), $options: 'i' };
    if (q) filter.searchableText = { $regex: escapeRegex(String(q).toLowerCase()), $options: 'i' };

    const buildRange = (start, end) => {
      if (!start && !end) return null;
      const range = {};
      if (start) range.$gte = start;
      if (end) range.$lte = end;
      return Object.keys(range).length ? range : null;
    };

    // Single-day exact filter (legacy)
    if (date && !from && !to) {
      const parsedDate = parseStorageDate(String(date));
      if (parsedDate) {
        const start = new Date(parsedDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(parsedDate);
        end.setHours(23, 59, 59, 999);
        filter.storageDate = buildRange(start, end);
      }
    }

    // Range filter
    if (from || to) {
      const start = parseStorageDate(String(from || ''));
      const endBase = parseStorageDate(String(to || ''));
      const end = endBase ? new Date(endBase) : null;
      if (end) end.setHours(23, 59, 59, 999);
      const range = buildRange(start, end);
      if (range) filter.storageDate = range;
    }

    if (type) {
      const t = String(type);
      if (t === 'pdf') filter.mimeType = 'application/pdf';
      else if (t === 'image') filter.mimeType = { $regex: '^image\\/' };
      else if (t === 'cad') filter.originalName = { $regex: '\\.(step|stp|iges|igs|sldprt|sldasm|slddrw|dxf|dwg)$', $options: 'i' };
    }

    const dossiers = await Dossier.find(filter).sort({ createdAt: -1 });
    res.json(dossiers);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.post('/api/dossiers', authMiddleware, (req, res, next) => {
  dossierUpload.array('documents', 20)(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Upload invalide' });
    next();
  });
}, async (req, res) => {
  try {
    const { clientLastName, clientFirstName, pieceName, storageDate, projectName, batchId } = req.body;
    const parsedStorageDate = parseStorageDate(storageDate);
    const files = Array.isArray(req.files) ? req.files : [];
    if (!clientLastName || !clientFirstName || !pieceName || !parsedStorageDate)
      return res.status(400).json({ message: 'Nom, prenom, date de stockage et nom de la piece sont requis' });
    if (files.length === 0) return res.status(400).json({ message: 'Aucun fichier recu' });

    const savedDocuments = [];

    for (const file of files) {
      const publicPath = `/uploads/dossiers/${file.filename}`;
      const searchableText = [
        String(clientLastName).toLowerCase(),
        String(clientFirstName).toLowerCase(),
        String(projectName || '').toLowerCase(),
        String(pieceName).toLowerCase(),
        String(file.originalname).toLowerCase(),
        String(batchId || '').toLowerCase(),
      ].join(' ');

      const dossier = await Dossier.create({
        originalName: file.originalname,
        storedFilename: file.filename,
        filePath: file.path,
        publicPath,
        mimeType: file.mimetype,
        size: file.size,
        clientLastName: String(clientLastName).trim(),
        clientFirstName: String(clientFirstName).trim(),
        projectName: String(projectName || '').trim(),
        pieceName: String(pieceName).trim(),
        batchId: String(batchId || '').trim(),
        storageDate: parsedStorageDate,
        searchableText,
        uploadedBy: req.user?.username || null,
      });

      savedDocuments.push(dossier);
    }

    res.status(201).json(savedDocuments);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.get('/api/dossiers/clients', authMiddleware, async (req, res) => {
  try {
    const docs = await Dossier.find({}).select('clientLastName clientFirstName -_id').lean();
    const uniq = new Set();
    for (const d of docs) {
      const name = `${(d.clientLastName || '').trim()} ${(d.clientFirstName || '').trim()}`.trim();
      if (name) uniq.add(name);
    }
    res.json(Array.from(uniq).sort((a, b) => a.localeCompare(b)));
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.get('/api/dossiers/projects', authMiddleware, async (req, res) => {
  try {
    const names = await Dossier.distinct('projectName', { projectName: { $ne: '' } });
    const sorted = names.sort((a, b) => a.localeCompare(b));
    res.json(sorted);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.get('/api/dossiers/piece-names', authMiddleware, async (req, res) => {
  try {
    const names = await Dossier.distinct('pieceName', { pieceName: { $ne: '' } });
    const sorted = names.sort((a, b) => a.localeCompare(b));
    res.json(sorted);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.get('/api/dossiers/batches', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 30), 1), 100);
    const rows = await Dossier.aggregate([
      { $match: { batchId: { $exists: true, $ne: '' } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$batchId',
          createdAt: { $first: '$createdAt' },
          storageDate: { $first: '$storageDate' },
          clientLastName: { $first: '$clientLastName' },
          clientFirstName: { $first: '$clientFirstName' },
          projectName: { $first: '$projectName' },
          count: { $sum: 1 },
          totalSize: { $sum: '$size' },
        }
      },
      { $sort: { createdAt: -1 } },
      { $limit: limit },
    ]);

    res.json(rows.map((r) => ({
      batchId: r._id,
      createdAt: r.createdAt,
      storageDate: r.storageDate,
      clientLastName: r.clientLastName,
      clientFirstName: r.clientFirstName,
      projectName: r.projectName,
      count: r.count,
      totalSize: r.totalSize,
    })));
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.get('/api/dossiers/:id/download', authMiddleware, async (req, res) => {
  try {
    const dossier = await Dossier.findById(req.params.id);
    if (!dossier) return res.status(404).json({ message: 'Document introuvable' });
    if (!fs.existsSync(dossier.filePath)) return res.status(404).json({ message: 'Fichier introuvable sur le disque' });
    res.download(dossier.filePath, dossier.originalName);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.delete('/api/dossiers/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const dossier = await Dossier.findById(req.params.id);
    if (!dossier) return res.status(404).json({ message: 'Document introuvable' });
    if (fs.existsSync(dossier.filePath)) fs.unlinkSync(dossier.filePath);
    await dossier.deleteOne();
    res.json({ message: 'Document supprime avec succes' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.put('/api/dossiers/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const dossier = await Dossier.findById(req.params.id);
    if (!dossier) return res.status(404).json({ message: 'Document introuvable' });

    const { clientLastName, clientFirstName, projectName, pieceName, storageDate } = req.body || {};

    if (typeof clientLastName === 'string') dossier.clientLastName = clientLastName.trim();
    if (typeof clientFirstName === 'string') dossier.clientFirstName = clientFirstName.trim();
    if (typeof projectName === 'string') dossier.projectName = projectName.trim();
    if (typeof pieceName === 'string') dossier.pieceName = pieceName.trim();

    if (typeof storageDate === 'string') {
      const parsed = parseStorageDate(storageDate);
      if (!parsed) return res.status(400).json({ message: 'Date de stockage invalide' });
      dossier.storageDate = parsed;
    }

    dossier.searchableText = [
      String(dossier.clientLastName || '').toLowerCase(),
      String(dossier.clientFirstName || '').toLowerCase(),
      String(dossier.projectName || '').toLowerCase(),
      String(dossier.pieceName || '').toLowerCase(),
      String(dossier.originalName || '').toLowerCase(),
    ].join(' ');

    await dossier.save();
    res.json(dossier);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

const mqttClient = mqtt.connect('mqtt://broker.hivemq.com:1883');

mqttClient.on('connect', () => {
  mqttClient.subscribe('cncpulse/gsm/result', err => { if (!err) console.log('Subscribed: cncpulse/gsm/result'); });
  console.log('✅ MQTT connecté à HiveMQ');
  mqttClient.subscribe('cncpulse/sensors', err => { if (!err) console.log('📡 Abonné au topic: cncpulse/sensors'); });
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
    await SensorData.create(data);
    io.emit('sensor-data', data);
    const alerts = [];
    if (data.courant > 20)       alerts.push({ severity: 'critical', message: 'Current critical: ' + data.courant + 'A', node: data.node, type: 'sensor' });
    else if (data.courant > 15)  alerts.push({ severity: 'warning',  message: 'Current elevated: ' + data.courant + 'A', node: data.node, type: 'sensor' });
    if (data.vibX > 3 || data.vibY > 3 || data.vibZ > 3)        alerts.push({ severity: 'critical', message: 'Vibration critique detectee', node: data.node, type: 'sensor' });
    else if (data.vibX > 2 || data.vibY > 2 || data.vibZ > 2)   alerts.push({ severity: 'warning',  message: 'Vibration elevee',            node: data.node, type: 'sensor' });
    for (const alert of alerts) {
      const savedAlert = await Alert.create({
        machineId: data.machineId || data.node || 'UNKNOWN',
        node: data.node || 'UNKNOWN', type: alert.type || 'sensor',
        severity: sanitizeSeverity(alert.severity), message: alert.message,
        ai: { source: 'rules', label: alert.severity || 'warning' },
        sensorSnapshot: { vibX: data.vibX, vibY: data.vibY, vibZ: data.vibZ, courant: data.courant, rpm: data.rpm }
      });
      io.emit('alert', savedAlert);
    }
  } catch (err) {
    console.error('❌ Erreur MQTT:', err.message);
  }
});

// ═══ Socket.IO ═══
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('🖥️ Client connecté:', socket.id);

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
    } catch (err) { console.error('❌ Erreur DM:', err.message); }
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
    } catch (err) { console.error('❌ Erreur get-history:', err.message); }
  });

  socket.on('send-message', async ({ username, role, text }) => {
    try {
      if (!text?.trim() || !username) return;
      const msg = await Message.create({ username, role: role || 'user', text: text.trim() });
      io.emit('new-message', { _id: msg._id, username: msg.username, role: msg.role, text: msg.text, createdAt: msg.createdAt });
    } catch (err) { console.error('❌ Erreur chat:', err.message); }
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
            activity: 'Déconnexion automatique',
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
    console.log('🖥️ Client déconnecté:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Serveur démarré sur le port ${PORT}`));
