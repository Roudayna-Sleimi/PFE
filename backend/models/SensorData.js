const mongoose = require('mongoose');

const sensorSchema = new mongoose.Schema({
  node: String,
  courant: Number,
  vibX: Number,
  vibY: Number,
  vibZ: Number,
  rpm: Number,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.SensorData || mongoose.model('SensorData', sensorSchema);
