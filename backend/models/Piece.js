const mongoose = require('mongoose');

const tacheSchema = new mongoose.Schema({
  titre: { type: String, required: true },
  employe: { type: String, required: true },
  statut: { type: String, enum: ['à faire', 'a faire', 'en cours', 'terminée', 'terminee'], default: 'à faire' },
  priorite: { type: String, enum: ['haute', 'moyenne', 'basse'], default: 'moyenne' },
}, { _id: true });

const pieceHistorySchema = new mongoose.Schema({
  machine: { type: String, required: true },
  action: { type: String, enum: ['entered', 'completed'], required: true },
  at: { type: Date, default: Date.now },
  by: { type: String, default: null },
}, { _id: false });

const pieceSchema = new mongoose.Schema({
  ref: { type: String, default: '' },
  fichier: { type: String, default: null },
  nom: { type: String, required: true },
  machine: { type: String, default: 'Rectifieuse' },
  machineChain: { type: [String], default: [] },
  currentStep: { type: Number, default: 0 },
  currentMachine: { type: String, default: null },
  history: { type: [pieceHistorySchema], default: [] },
  employe: { type: String, default: '' },
  quantite: { type: Number, default: 0 },
  quantiteProduite: { type: Number, default: 0 },
  quantiteRuban: { type: Number, default: 0 },
  prix: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['Arrêté', 'Arrete', 'Terminé', 'Termine', 'En cours', 'Contrôle', 'Controle', 'TerminÃ©', 'ContrÃ´le', 'TerminÃƒÂ©', 'ContrÃƒÂ´le'],
    default: 'Arrêté',
  },
  matiere: { type: Boolean, default: true },
  dimension: { type: String, default: '' },
  matiereType: { type: String, default: '' },
  matiereReference: { type: String, default: '' },
  solidworksPath: { type: String, default: null },
  planDocumentId: { type: String, default: '' },
  planPath: { type: String, default: '' },
  planName: { type: String, default: '' },
  planMimeType: { type: String, default: '' },
  taches: { type: [tacheSchema], default: [] },
  stock: { type: Number, default: 0 },
  maxStock: { type: Number, default: 1 },
  seuil: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.Piece || mongoose.model('Piece', pieceSchema);
