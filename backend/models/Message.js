const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  username: { type: String, required: true },
  role: { type: String, default: 'user' },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 86400 },
});

module.exports = mongoose.models.Message || mongoose.model('Message', messageSchema);
