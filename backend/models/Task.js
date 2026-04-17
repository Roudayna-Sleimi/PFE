const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  titre: { type: String, required: true },
  description: { type: String, default: '' },
  priorite: { type: String, default: 'moyenne' },
  deadline: { type: Date, default: null },
  assigneA: { type: String, default: null },
  statut: { type: String, default: 'à faire' },
  creePar: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.Task || mongoose.model('Task', taskSchema);
