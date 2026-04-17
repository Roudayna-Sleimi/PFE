const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema({
  alertId: { type: mongoose.Schema.Types.ObjectId, ref: 'Alert', required: true },
  phoneNumber: { type: String, required: true },
  attemptNo: { type: Number, required: true },
  callStatus: { type: String, default: 'queued' },
  providerRef: { type: String, default: null },
  audioFilePath: { type: String, default: null },
  audioFormat: { type: String, default: null },
  audioBase64: { type: String, default: null },
  calledAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
  durationSec: { type: Number, default: null },
  errorMessage: { type: String, default: null },
});

module.exports = mongoose.models.CallLog || mongoose.model('CallLog', callLogSchema);
