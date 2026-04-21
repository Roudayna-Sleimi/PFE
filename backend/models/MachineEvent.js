const mongoose = require('mongoose');

const machineEventSchema = new mongoose.Schema({
  username: { type: String, required: true },
  machine: { type: String, required: true },
  action: { type: String, enum: ['started', 'paused', 'stopped'], required: true },
  activity: { type: String, default: '' },
  pieceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Piece', default: null },
  pieceName: { type: String, default: null },
  pieceCount: { type: Number, default: null },
  rubanQuantity: { type: Number, default: null },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.MachineEvent || mongoose.model('MachineEvent', machineEventSchema);
