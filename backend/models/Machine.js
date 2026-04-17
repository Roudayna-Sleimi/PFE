const mongoose = require('mongoose');

const machineSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  model: { type: String, default: '' },
  type: { type: String, default: '' },
  ip: { type: String, default: '' },
  hasSensors: { type: Boolean, default: false },
  node: { type: String, default: null },
  icon: { type: String, default: 'gear', enum: ['gear', 'wrench', 'bolt', 'drill'] },
  sensors: { type: [String], default: [] },
  protocol: { type: String, default: 'MQTT' },
  broker: { type: String, default: 'localhost' },
  latence: { type: String, default: '—' },
  uptime: { type: String, default: '—' },
  chipModel: { type: String, default: '—' },
  sante: { type: Number, default: 100 },
  production: { type: Number, default: 0 },
  objectif: { type: Number, default: 0 },
  efficacite: { type: Number, default: 0 },
  heures: { type: Number, default: 0 },
  temperature: { type: Number, default: 0 },
  courant: { type: Number, default: 0 },
  vibration: { type: Number, default: 0 },
  rpm: { type: Number, default: 0 },
  pression: { type: Number, default: null },
  machId: { type: String, default: null },
  problems: {
    type: [{
      severity: { type: String, enum: ['critical', 'warning'], default: 'warning' },
      title: { type: String, default: '' },
      desc: { type: String, default: '' },
      time: { type: String, default: '' },
    }],
    default: [],
  },
  fonctions: {
    type: [{
      title: { type: String, default: '' },
      desc: { type: String, default: '' },
    }],
    default: [],
  },
  isBase: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.Machine || mongoose.model('Machine', machineSchema);
