const mongoose = require('mongoose');

const dossierSchema = new mongoose.Schema({
  originalName: { type: String, required: true },
  storedFilename: { type: String, required: true },
  filePath: { type: String, required: true },
  publicPath: { type: String, required: true },
  mimeType: { type: String, default: 'application/pdf' },
  size: { type: Number, default: 0 },
  clientLastName: { type: String, default: '' },
  clientFirstName: { type: String, default: '' },
  projectName: { type: String, default: '' },
  pieceName: { type: String, default: '' },
  batchId: { type: String, default: '' },
  storageDate: { type: Date, required: true },
  searchableText: { type: String, default: '' },
  uploadedBy: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.Dossier || mongoose.model('Dossier', dossierSchema);
