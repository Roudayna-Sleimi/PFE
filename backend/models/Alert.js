const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  machineId: { type: String, default: 'UNKNOWN' },
  node: { type: String, default: 'UNKNOWN' },
  type: { type: String, default: 'system' },
  severity: { type: String, enum: ['warning', 'critical'], default: 'warning' },
  message: { type: String, required: true },
  status: { type: String, enum: ['new', 'seen', 'notified', 'resolved'], default: 'new' },
  createdAt: { type: Date, default: Date.now },
  seenAt: { type: Date, default: null },
  seenBy: { type: String, default: null },
  notifiedAt: { type: Date, default: null },
  notifiedBy: { type: String, default: null },
  callAttempts: { type: Number, default: 0 },
  ai: {
    source: { type: String, default: 'rules' },
    label: { type: String, default: null },
    proba: { type: mongoose.Schema.Types.Mixed, default: null },
    model: { type: String, default: null },
    version: { type: String, default: null },
  },
  sensorSnapshot: {
    vibX: { type: Number, default: null },
    vibY: { type: Number, default: null },
    vibZ: { type: Number, default: null },
    courant: { type: Number, default: null },
    rpm: { type: Number, default: null },
  },
});

module.exports = mongoose.models.Alert || mongoose.model('Alert', alertSchema);
