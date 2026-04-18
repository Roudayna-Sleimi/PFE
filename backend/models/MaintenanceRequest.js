const mongoose = require('mongoose');

const maintenanceRequestSchema = new mongoose.Schema({
  machineId: { type: String, required: true, index: true },
  machineName: { type: String, default: '' },
  node: { type: String, default: 'UNKNOWN', index: true },
  alertId: { type: mongoose.Schema.Types.ObjectId, ref: 'Alert', default: null },
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'MaintenanceReport', default: null },
  lastReportId: { type: mongoose.Schema.Types.ObjectId, ref: 'MaintenanceReport', default: null },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  priority: { type: String, enum: ['medium', 'high', 'critical'], default: 'medium' },
  status: { type: String, enum: ['open', 'in_progress', 'done', 'cancelled'], default: 'open' },
  requestedBy: { type: String, default: 'ai-maintenance' },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.models.MaintenanceRequest || mongoose.model('MaintenanceRequest', maintenanceRequestSchema);
