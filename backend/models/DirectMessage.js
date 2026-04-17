const mongoose = require('mongoose');

const directMessageSchema = new mongoose.Schema({
  from: { type: String, required: true },
  fromRole: { type: String, required: true },
  to: { type: String, required: true },
  text: { type: String, required: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
});

module.exports = mongoose.models.DirectMessage || mongoose.model('DirectMessage', directMessageSchema);
