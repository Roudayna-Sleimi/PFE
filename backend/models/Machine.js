const mongoose = require('mongoose');

const machineSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  model: { type: String, default: '' },
  hasSensors: { type: Boolean, default: false },
  node: { type: String, default: null },
  icon: { type: String, default: 'gear', enum: ['gear', 'wrench', 'bolt', 'drill'] },
  status: { type: String, default: 'Arrêt', enum: ['En marche', 'Avertissement', 'Arrêt', 'En maintenance'] },
  protocol: { type: String, default: 'MQTT' },
  broker: { type: String, default: 'localhost' },
  latence: { type: String, default: '—' },
  uptime: { type: String, default: '—' },
  chipModel: { type: String, default: '—' },
  sante: { type: Number, default: 100 },
  production: { type: Number, default: 0 },
  objectif: { type: Number, default: 0 },
  isBase: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.Machine || mongoose.model('Machine', machineSchema);
