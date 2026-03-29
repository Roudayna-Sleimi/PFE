const express    = require('express');
const mongoose   = require('mongoose');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const mqtt       = require('mqtt');
const http       = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');


const app    = express();
const server = http.createServer(app);

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
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connecté'))
  .catch(err => console.error('❌ MongoDB:', err));

// ═══ Schemas ═══
const userSchema = new mongoose.Schema({
  username:  { type: String, required: true, unique: true },
  password:  { type: String, required: true },
  role:      { type: String, default: 'user' },
  isOnline:  { type: Boolean, default: false },
  lastSeen:  { type: Date, default: null },
  socketId:  { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// ═══ Schema Demande d'accès ═══
const demandeSchema = new mongoose.Schema({
  nom:        { type: String, required: true },
  email:      { type: String, required: true },
  poste:      { type: String, required: true },
  telephone:  { type: String, required: true },
  statut:     { type: String, default: 'en attente' }, // 'en attente' | 'approuvée' | 'refusée'
  username:   { type: String, default: null },          // attribué par admin
  createdAt:  { type: Date, default: Date.now }
});
const Demande = mongoose.model('Demande', demandeSchema);

// ═══ Schema Tasks ═══
const taskSchema = new mongoose.Schema({
  titre:       { type: String, required: true },
  description: { type: String, default: '' },
  priorite:    { type: String, default: 'moyenne' }, // 'haute' | 'moyenne' | 'basse'
  deadline:    { type: Date,   default: null },
  assigneA:    { type: String, default: null },       // username de l'employé
  statut:      { type: String, default: 'à faire' },  // 'à faire' | 'en cours' | 'terminée'
  creePar:     { type: String, required: true },       // username admin
  createdAt:   { type: Date,   default: Date.now }
});
const Task = mongoose.model('Task', taskSchema);

// Direct Messages (1:1) — TTL 30 jours
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
    source:   { type: String, default: 'rules' },
    label:    { type: String, default: null },
    proba:    { type: mongoose.Schema.Types.Mixed, default: null },
    model:    { type: String, default: null },
    version:  { type: String, default: null },
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
  calledAt:     { type: Date, default: Date.now },
  endedAt:      { type: Date, default: null },
  durationSec:  { type: Number, default: null },
  errorMessage: { type: String, default: null },
});
const CallLog = mongoose.model('CallLog', callLogSchema);

// ═══ Auth Middleware ═══
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

// ═══ Auth Routes ═══
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'Champs requis manquants' });
    const exists = await User.findOne({ username });
    if (exists)
      return res.status(409).json({ message: 'Utilisateur déjà existant' });
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

// ═══ Demandes d'accès ═══

// Employé soumet une demande (public — pas besoin de token)
app.post('/api/demandes', async (req, res) => {
  try {
    const { nom, email, poste, telephone } = req.body;
    if (!nom || !email || !poste || !telephone)
      return res.status(400).json({ message: 'Tous les champs sont requis' });
    const demande = await Demande.create({ nom, email, poste, telephone });
    // Notifier l'admin via socket
    io.emit('nouvelle-demande', { id: demande._id, nom, email, poste });
    res.status(201).json({ message: '✅ Demande envoyée avec succès' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// Admin: voir toutes les demandes
app.get('/api/demandes', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const demandes = await Demande.find().sort({ createdAt: -1 });
    res.json(demandes);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Admin: approuver une demande + créer le compte
app.post('/api/demandes/:id/approuver', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'Username et mot de passe requis' });

    const demande = await Demande.findById(req.params.id);
    if (!demande) return res.status(404).json({ message: 'Demande introuvable' });
    if (demande.statut !== 'en attente')
      return res.status(400).json({ message: 'Demande déjà traitée' });

    // Vérifier si username déjà pris
    const exists = await User.findOne({ username });
    if (exists) return res.status(409).json({ message: 'Username déjà utilisé' });

    // Créer le compte employé
    const hashed = await bcrypt.hash(password, 12);
    await User.create({ username, password: hashed, role: 'employe' });

    // Mettre à jour la demande
    demande.statut   = 'approuvée';
    demande.username = username;
    await demande.save();

    res.json({ message: `✅ Compte créé pour ${username}` });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// Admin: refuser une demande
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

// ═══ Users List ═══
app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const users = await User.find({}, 'username role isOnline lastSeen');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ═══ Tasks ═══

// Créer une task (admin)
app.post('/api/tasks', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { titre, description, priorite, deadline, assigneA } = req.body;
    if (!titre) return res.status(400).json({ message: 'Titre requis' });
    const task = await Task.create({
      titre, description, priorite, deadline, assigneA,
      creePar: req.user.username
    });
    // Notifier en temps réel
    io.emit('nouvelle-task', task);
    res.status(201).json(task);
  } catch (err) {
    console.error('❌ Erreur création task:', err.message);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// Voir les tasks
// Admin → toutes | Employé → ses tasks
app.get('/api/tasks', authMiddleware, async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { assigneA: req.user.username };
    const tasks  = await Task.find(filter).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Modifier statut (employé ou admin)
app.patch('/api/tasks/:id', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task introuvable' });
    // Employé ne peut modifier que ses propres tasks
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

// Supprimer (admin)
app.delete('/api/tasks/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    io.emit('task-deleted', { id: req.params.id });
    res.json({ message: '✅ Task supprimée' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// ═══ Direct Messages ═══
app.get('/api/messages/:targetUsername', authMiddleware, async (req, res) => {
  try {
    const { username } = req.user;
    const { targetUsername } = req.params;
    const messages = await DirectMessage.find({
      $or: [
        { from: username, to: targetUsername },
        { from: targetUsername, to: username }
      ]
    }).sort({ createdAt: 1 }).limit(100);
    await DirectMessage.updateMany(
      { from: targetUsername, to: username, read: false },
      { read: true }
    );
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

// ═══ Sensor History ═══
app.get('/api/sensors/history', authMiddleware, async (req, res) => {
  try {
    const data = await SensorData.find().sort({ createdAt: -1 }).limit(50);
    res.json(data.reverse());
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

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
    const alerts = await Alert.find({
      status: 'new',
      seenAt: null,
      createdAt: { $lte: cutoff }
    }).sort({ createdAt: 1 }).limit(200);
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
      machineId: machineId || 'UNKNOWN',
      node: node || 'UNKNOWN',
      type: type || 'manual',
      severity: sanitizeSeverity(severity),
      message,
      sensorSnapshot: sensorSnapshot || {},
      ai: ai || { source: 'manual' }
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
      alert.status = 'seen';
      alert.seenAt = new Date();
      alert.seenBy = req.user.username;
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
    if (!alert.seenAt) {
      alert.seenAt = new Date();
      alert.seenBy = req.user.username;
    }
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
    alert.status = 'notified';
    alert.notifiedAt = new Date();
    alert.notifiedBy = notifiedBy;
    alert.callAttempts = (alert.callAttempts || 0) + 1;
    await alert.save();
    res.json(alert);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

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
      .reduce((acc, key) => {
        if (req.body[key] !== undefined) acc[key] = req.body[key];
        return acc;
      }, {});
    const contact = await Contact.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!contact) return res.status(404).json({ message: 'Contact introuvable' });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.post('/api/call-logs', serviceKeyMiddleware, async (req, res) => {
  try {
    const { alertId, phoneNumber, attemptNo, callStatus, providerRef, durationSec, errorMessage } = req.body;
    if (!alertId || !phoneNumber || !attemptNo)
      return res.status(400).json({ message: 'alertId, phoneNumber, attemptNo requis' });
    const log = await CallLog.create({
      alertId,
      phoneNumber,
      attemptNo,
      callStatus: callStatus || 'queued',
      providerRef: providerRef || null,
      durationSec: durationSec || null,
      errorMessage: errorMessage || null
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

// ═══ MQTT ═══
const mqttClient = mqtt.connect('mqtt://broker.hivemq.com:1883');

mqttClient.on('connect', () => {
  mqttClient.subscribe('cncpulse/gsm/result', err => {
    if (!err) console.log('Subscribed: cncpulse/gsm/result');
  });
  console.log('✅ MQTT connecté à HiveMQ');
  mqttClient.subscribe('cncpulse/sensors', err => {
    if (!err) console.log('📡 Abonné au topic: cncpulse/sensors');
  });
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
        alertId,
        phoneNumber: phoneNumber || 'unknown',
        attemptNo: nextAttempt,
        callStatus: status || 'unknown',
        providerRef: providerRef || null,
        durationSec: durationSec || null,
        errorMessage: errorMessage || null,
      });
      if (status === 'success') {
        alert.status = 'notified';
        alert.notifiedAt = new Date();
        alert.notifiedBy = 'gsm';
      }
      alert.callAttempts = nextAttempt;
      await alert.save();
      io.emit('gsm-result', { alertId, status: status || 'unknown' });
      return;
    }
    await SensorData.create(data);
    io.emit('sensor-data', data);
    const alerts = [];
    if (data.courant > 20)
      alerts.push({ severity: 'critical', message: 'Current critical: ' + data.courant + 'A', node: data.node, type: 'sensor' });
    else if (data.courant > 15)
      alerts.push({ severity: 'warning', message: 'Current elevated: ' + data.courant + 'A', node: data.node, type: 'sensor' });
    if (data.vibX > 3 || data.vibY > 3 || data.vibZ > 3)
      alerts.push({ severity: 'critical', message: 'Vibration critique detectee', node: data.node, type: 'sensor' });
    else if (data.vibX > 2 || data.vibY > 2 || data.vibZ > 2)
      alerts.push({ severity: 'warning', message: 'Vibration elevee', node: data.node, type: 'sensor' });
    for (const alert of alerts) {
      const savedAlert = await Alert.create({
        machineId: data.machineId || data.node || 'UNKNOWN',
        node: data.node || 'UNKNOWN',
        type: alert.type || 'sensor',
        severity: sanitizeSeverity(alert.severity),
        message: alert.message,
        ai: { source: 'rules', label: alert.severity || 'warning' },
        sensorSnapshot: {
          vibX: data.vibX,
          vibY: data.vibY,
          vibZ: data.vibZ,
          courant: data.courant,
          rpm: data.rpm,
        }
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
    await User.updateOne({ username }, { isOnline: true, socketId: socket.id });
    io.emit('user-status', { username, isOnline: true });
  });

  socket.on('send-direct-message', async ({ from, fromRole, to, text }) => {
    try {
      if (!text?.trim()) return;
      const msg = await DirectMessage.create({ from, fromRole, to, text: text.trim() });
      const msgData = msg.toObject();
      const recipientEntry = [...connectedUsers.entries()].find(([, u]) => u.username === to);
      if (recipientEntry) io.to(recipientEntry[0]).emit('direct-message', msgData);
      socket.emit('direct-message', msgData);
    } catch (err) {
      console.error('❌ Erreur DM:', err.message);
    }
  });

  socket.on('mark-read', async ({ from, to }) => {
    await DirectMessage.updateMany({ from, to, read: false }, { read: true });
    socket.emit('messages-read', { from });
  });

  socket.on('get-history', async () => {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const messages = await Message.find({ createdAt: { $gte: since } })
        .sort({ createdAt: 1 }).limit(100);
      socket.emit('chat-history', messages);
    } catch (err) {
      console.error('❌ Erreur get-history:', err.message);
    }
  });

  socket.on('send-message', async ({ username, role, text }) => {
    try {
      if (!text?.trim() || !username) return;
      const msg = await Message.create({ username, role: role || 'user', text: text.trim() });
      io.emit('new-message', {
        _id: msg._id, username: msg.username,
        role: msg.role, text: msg.text, createdAt: msg.createdAt
      });
    } catch (err) {
      console.error('❌ Erreur chat:', err.message);
    }
  });

  socket.on('disconnect', async () => {
    const userData = connectedUsers.get(socket.id);
    if (userData) {
      connectedUsers.delete(socket.id);
      await User.updateOne({ username: userData.username }, { isOnline: false, lastSeen: new Date(), socketId: null });
      io.emit('user-status', { username: userData.username, isOnline: false, lastSeen: new Date().toISOString() });
    }
    console.log('🖥️ Client déconnecté:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Serveur démarré sur le port ${PORT}`));