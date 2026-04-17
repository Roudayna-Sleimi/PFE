const mongoose = require('mongoose');

const demandeSchema = new mongoose.Schema({
  nom: { type: String, required: true },
  email: { type: String, required: true },
  poste: { type: String, required: true },
  telephone: { type: String, required: true },
  statut: { type: String, default: 'en attente' },
  username: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.Demande || mongoose.model('Demande', demandeSchema);
