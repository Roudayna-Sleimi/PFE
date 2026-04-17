const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  role: { type: String, default: 'responsable' },
  name: { type: String, required: true },
  phonePrimary: { type: String, required: true },
  phoneBackup: { type: String, default: null },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.Contact || mongoose.model('Contact', contactSchema);
