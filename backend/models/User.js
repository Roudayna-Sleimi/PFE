const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' },
  assignedMachine: { type: String, default: null },
  currentPieceName: { type: String, default: null },
  currentPieceId: { type: String, default: null },
  machineStatus: { type: String, enum: ['stopped', 'started', 'paused'], default: 'stopped' },
  currentActivity: { type: String, default: '' },
  machineStatusUpdatedAt: { type: Date, default: null },
  connectedAt: { type: Date, default: null },
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: null },
  socketId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
