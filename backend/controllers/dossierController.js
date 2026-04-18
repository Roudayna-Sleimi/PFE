const { createDossierService } = require('../services/dossierService');

// Title: Send a consistent error payload for dossier endpoints.
const handleError = (res, err) => {
  const statusCode = Number(err?.statusCode) || 500;
  return res.status(statusCode).json({
    message: statusCode >= 500 ? 'Erreur serveur' : (err?.message || 'Requete invalide'),
    error: err?.message || null,
  });
};

// Title: Build dossier controllers with injected dependencies.
const createDossierController = (deps) => {
  const service = createDossierService(deps);

  // Title: Handle watcher status endpoint.
  const watcherStatus = async (_req, res) => {
    try {
      const result = await service.watcherStatus();
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle watcher rescan endpoint.
  const rescan = async (_req, res) => {
    try {
      const result = await service.rescan();
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle dossiers listing endpoint.
  const listDossiers = async (req, res) => {
    try {
      const dossiers = await service.listDossiers(req.query || {});
      return res.json(dossiers);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle create dossiers endpoint.
  const createDossiers = async (req, res) => {
    try {
      const files = Array.isArray(req.files) ? req.files : [];
      const dossiers = await service.createDossiers(req.body || {}, files, req.user?.username || null);
      return res.status(201).json(dossiers);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle clients listing endpoint.
  const listClients = async (_req, res) => {
    try {
      const clients = await service.listClients();
      return res.json(clients);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle projects listing endpoint.
  const listProjects = async (_req, res) => {
    try {
      const projects = await service.listProjects();
      return res.json(projects);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle piece names listing endpoint.
  const listPieceNames = async (_req, res) => {
    try {
      const names = await service.listPieceNames();
      return res.json(names);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle batches listing endpoint.
  const listBatches = async (req, res) => {
    try {
      const batches = await service.listBatches(req.query || {});
      return res.json(batches);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle dossier download endpoint.
  const downloadDossier = async (req, res) => {
    try {
      const { filePath, filename } = await service.dossierDownloadMeta(req.params.id);
      return res.download(filePath, filename);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle delete dossier endpoint.
  const deleteDossier = async (req, res) => {
    try {
      const result = await service.deleteDossier(req.params.id);
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle update dossier endpoint.
  const updateDossier = async (req, res) => {
    try {
      const dossier = await service.updateDossier(req.params.id, req.body || {});
      return res.json(dossier);
    } catch (err) {
      return handleError(res, err);
    }
  };

  return {
    watcherStatus,
    rescan,
    listDossiers,
    createDossiers,
    listClients,
    listProjects,
    listPieceNames,
    listBatches,
    downloadDossier,
    deleteDossier,
    updateDossier,
  };
};

module.exports = {
  createDossierController,
};
