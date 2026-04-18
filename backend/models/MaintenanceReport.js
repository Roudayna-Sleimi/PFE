const mongoose = require('mongoose');

const maintenanceReportSchema = new mongoose.Schema({
  machineId: { type: String, required: true, index: true },
  machineName: { type: String, default: '' },
  node: { type: String, default: 'UNKNOWN', index: true },
  alertId: { type: mongoose.Schema.Types.ObjectId, ref: 'Alert', default: null },
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'MaintenanceRequest', default: null },
  source: { type: String, default: 'predictive-maintenance' },
  severity: { type: String, enum: ['normal', 'warning', 'critical'], default: 'warning' },
  anomalyScore: { type: Number, default: 0 },
  prediction: {
    label: { type: String, default: '' },
    eta: { type: String, default: '' },
    confidence: { type: Number, default: 0 },
  },
  recommendedAction: { type: String, default: '' },
  contributors: [{
    metric: { type: String, default: '' },
    label: { type: String, default: '' },
    value: { type: Number, default: null },
    expected: { type: String, default: '' },
    level: { type: String, enum: ['warning', 'critical'], default: 'warning' },
  }],
  sensorSnapshot: {
    vibX: { type: Number, default: null },
    vibY: { type: Number, default: null },
    vibZ: { type: Number, default: null },
    courant: { type: Number, default: null },
    rpm: { type: Number, default: null },
    pression: { type: Number, default: null },
  },
  status: { type: String, enum: ['open', 'reviewed', 'resolved'], default: 'open' },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.models.MaintenanceReport || mongoose.model('MaintenanceReport', maintenanceReportSchema);
