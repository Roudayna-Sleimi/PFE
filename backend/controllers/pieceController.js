const { createPieceService } = require('../services/pieceService');

// Title: Send a consistent error payload for piece endpoints.
const handleError = (res, err) => {
  const statusCode = Number(err?.statusCode) || 500;
  return res.status(statusCode).json({
    message: statusCode >= 500 ? 'Erreur serveur' : (err?.message || 'Requete invalide'),
    error: err?.message || null,
  });
};

// Title: Build pieces controllers with injected dependencies.
const createPieceController = (deps) => {
  const service = createPieceService(deps);

  // Title: Handle pieces listing endpoint.
  const listPieces = async (req, res) => {
    try {
      const pieces = await service.listPieces(req.query || {});
      return res.json(pieces);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle pieces tracking endpoint.
  const piecesTracking = async (_req, res) => {
    try {
      const pieces = await service.piecesTracking();
      return res.json(pieces);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle progress piece endpoint.
  const progressPiece = async (req, res) => {
    try {
      const action = (req.body || {}).action || 'next';
      const piece = await service.progressPiece(req.params.id, action, req.user?.username || null);
      return res.json(piece);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle create piece endpoint.
  const createPiece = async (req, res) => {
    try {
      const piece = await service.createPiece(req.body || {}, req.file || null, req.user?.username || null);
      return res.status(201).json(piece);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle patch piece endpoint.
  const patchPiece = async (req, res) => {
    try {
      const piece = await service.patchPiece(req.params.id, req.body || {});
      return res.json(piece);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle delete piece endpoint.
  const deletePiece = async (req, res) => {
    try {
      const result = await service.deletePiece(req.params.id);
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle piece download endpoint.
  const downloadPiece = async (req, res) => {
    try {
      const { filePath, filename } = await service.pieceDownloadMeta(req.params.id);
      return res.download(filePath, filename);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle add piece task endpoint.
  const addPieceTask = async (req, res) => {
    try {
      const piece = await service.addPieceTask(req.params.id, req.body || {});
      return res.status(201).json(piece);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle patch piece task endpoint.
  const patchPieceTask = async (req, res) => {
    try {
      const piece = await service.patchPieceTask(req.params.id, req.params.tacheId, req.body || {});
      return res.json(piece);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle delete piece task endpoint.
  const deletePieceTask = async (req, res) => {
    try {
      const piece = await service.deletePieceTask(req.params.id, req.params.tacheId);
      return res.json(piece);
    } catch (err) {
      return handleError(res, err);
    }
  };

  return {
    listPieces,
    piecesTracking,
    progressPiece,
    createPiece,
    patchPiece,
    deletePiece,
    downloadPiece,
    addPieceTask,
    patchPieceTask,
    deletePieceTask,
  };
};

module.exports = {
  createPieceController,
};
