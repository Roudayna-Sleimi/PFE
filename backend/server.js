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
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

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

// ═══ Socket.IO — Chat ═══
io.on('connection', (socket) => {
  console.log('🖥️ Client connecté:', socket.id);

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

  socket.on('disconnect', () => console.log('🖥️ Client déconnecté:', socket.id));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Serveur démarré sur le port ${PORT}`));