const mongoose = require('mongoose');

const sensorSchema = new mongoose.Schema({
  machineId: String,
  node: String,
  courant: Number,
  vibX: Number,
  vibY: Number,
  vibZ: Number,
  rpm: Number,
  pression: Number,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.SensorData || mongoose.model('SensorData', sensorSchema);
