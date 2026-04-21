const express = require('express');
const { createPieceController } = require('../controllers/pieceController');

// Title: Build conditional upload middleware for pieces endpoint.
const createPieceUploadMiddleware = (upload) => {
  return (req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json')) return next();
    return upload.single('fichier')(req, res, next);
  };
};

// Title: Create pieces routes.
const createPieceRoutes = (deps) => {
  const { authMiddleware, adminMiddleware, upload } = deps;
  const router = express.Router();
  const controller = createPieceController(deps);
  const pieceUploadMiddleware = createPieceUploadMiddleware(upload);

  router.get('/pieces', authMiddleware, controller.listPieces);
  router.get('/production/pieces-tracking', authMiddleware, controller.piecesTracking);
  router.post('/pieces/:id/progress', authMiddleware, controller.progressPiece);
  router.post('/pieces', authMiddleware, adminMiddleware, pieceUploadMiddleware, controller.createPiece);
  router.patch('/pieces/:id', authMiddleware, controller.patchPiece);
  router.delete('/pieces/:id', authMiddleware, adminMiddleware, controller.deletePiece);
  router.get('/pieces/:id/download', authMiddleware, controller.downloadPiece);

  router.post('/pieces/:id/taches', authMiddleware, controller.addPieceTask);
  router.patch('/pieces/:id/taches/:tacheId', authMiddleware, controller.patchPieceTask);
  router.delete('/pieces/:id/taches/:tacheId', authMiddleware, adminMiddleware, controller.deletePieceTask);

  return router;
};

module.exports = {
  createPieceRoutes,
};
