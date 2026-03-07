const express    = require('express');
const mongoose   = require('mongoose');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const mqtt       = require('mqtt');
const http       = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app    = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: 'http://localhost:5173', methods: ['GET', 'POST'] }
});

app.use(express.json());
app.use(cors({ origin: 'http://localhost:5173' }));

// ═══ MongoDB ═══
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connecté'))
  .catch(err => console.error('❌ MongoDB:', err));

// ═══ Schemas ═══
const userSchema = new mongoose.Schema({
  username:  { type: String, required: true, unique: true },
  password:  { type: String, required: true },
  role:      { type: String, default: 'admin' },
  isOnline:  { type: Boolean, default: false },
  lastSeen:  { type: Date, default: null },
  socketId:  { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

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

// ═══ Chat Schema — TTL 24h ═══
const messageSchema = new mongoose.Schema({
  username:  { type: String, required: true },
  role:      { type: String, default: "user" },
  text:      { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 86400 }
});
const Message = mongoose.model('Message', messageSchema);

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

// ═══ Users List ═══
app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const users = await User.find({}, 'username role isOnline lastSeen');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
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

// ═══ MQTT ═══
const mqttClient = mqtt.connect('mqtt://broker.hivemq.com:1883');

mqttClient.on('connect', () => {
  console.log('✅ MQTT connecté à HiveMQ');
  mqttClient.subscribe('cncpulse/sensors', err => {
    if (!err) console.log('📡 Abonné au topic: cncpulse/sensors');
  });
});

mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    await SensorData.create(data);
    io.emit('sensor-data', data);

    // Alertes automatiques
    const alerts = [];
    if (data.courant > 20)
      alerts.push({ type: 'critical', message: `⚡ Courant critique: ${data.courant}A`, node: data.node });
    else if (data.courant > 15)
      alerts.push({ type: 'warning', message: `⚡ Courant élevé: ${data.courant}A`, node: data.node });
    if (data.vibX > 3 || data.vibY > 3 || data.vibZ > 3)
      alerts.push({ type: 'critical', message: `📳 Vibration critique détectée!`, node: data.node });
    else if (data.vibX > 2 || data.vibY > 2 || data.vibZ > 2)
      alerts.push({ type: 'warning', message: `📳 Vibration élevée`, node: data.node });

    alerts.forEach(alert => io.emit('alert', alert));
  } catch (err) {
    console.error('❌ Erreur MQTT:', err.message);
  }
});

// ═══ Socket.IO ═══
const connectedUsers = new Map(); // socketId -> { username, role }

io.on('connection', (socket) => {
  console.log('🖥️ Client connecté:', socket.id);

  // User comes online
  socket.on('user-online', async ({ username, role }) => {
    connectedUsers.set(socket.id, { username, role });
    await User.updateOne({ username }, { isOnline: true, socketId: socket.id });
    io.emit('user-status', { username, isOnline: true });
  });

  // ─── Direct Messages ───
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

  // Historique sur demande — messages des 24 dernières heures
  socket.on('get-history', async () => {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const messages = await Message.find({ createdAt: { $gte: since } })
        .sort({ createdAt: 1 })
        .limit(100);
      socket.emit('chat-history', messages);
    } catch (err) {
      console.error('❌ Erreur get-history:', err.message);
    }
  });

  // Nouveau message
  socket.on('send-message', async ({ username, role, text }) => {
    try {
      if (!text?.trim() || !username) return;
      const msg = await Message.create({ username, role: role || 'user', text: text.trim() });
      io.emit('new-message', {
        _id:       msg._id,
        username:  msg.username,
        role:      msg.role,
        text:      msg.text,
        createdAt: msg.createdAt
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
server.listen(PORT, () => console.log(`🚀 Serveur démarré sur le port ${PORT}`));