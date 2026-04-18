const express = require('express');
const { createDossierController } = require('../controllers/dossierController');

// Title: Build upload middleware for dossiers endpoint.
const createDossierUploadMiddleware = (dossierUpload) => {
  return (req, res, next) => {
    dossierUpload.array('documents', 20)(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'Upload invalide' });
      return next();
    });
  };
};

// Title: Create dossier routes.
const createDossierRoutes = (deps) => {
  const { authMiddleware, adminMiddleware, dossierUpload } = deps;
  const router = express.Router();
  const controller = createDossierController(deps);
  const uploadMiddleware = createDossierUploadMiddleware(dossierUpload);

  router.get('/dossiers/watcher-status', authMiddleware, controller.watcherStatus);
  router.post('/dossiers/rescan', authMiddleware, adminMiddleware, controller.rescan);

  router.get('/dossiers', authMiddleware, controller.listDossiers);
  router.post('/dossiers', authMiddleware, uploadMiddleware, controller.createDossiers);
  router.get('/dossiers/clients', authMiddleware, controller.listClients);
  router.get('/dossiers/projects', authMiddleware, controller.listProjects);
  router.get('/dossiers/piece-names', authMiddleware, controller.listPieceNames);
  router.get('/dossiers/batches', authMiddleware, controller.listBatches);
  router.get('/dossiers/:id/download', authMiddleware, controller.downloadDossier);
  router.delete('/dossiers/:id', authMiddleware, adminMiddleware, controller.deleteDossier);
  router.put('/dossiers/:id', authMiddleware, adminMiddleware, controller.updateDossier);

  return router;
};

module.exports = {
  createDossierRoutes,
};
