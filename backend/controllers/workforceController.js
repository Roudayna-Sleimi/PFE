const { createWorkforceService } = require('../services/workforceService');

// Title: Send a consistent error payload for workforce endpoints.
const handleError = (res, err) => {
  const statusCode = Number(err?.statusCode) || 500;
  return res.status(statusCode).json({
    message: statusCode >= 500 ? 'Erreur serveur' : (err?.message || 'Requete invalide'),
    error: err?.message || null,
  });
};

// Title: Build workforce controllers with injected dependencies.
const createWorkforceController = (deps) => {
  const service = createWorkforceService(deps);

  // Title: Handle demand creation.
  const createDemande = async (req, res) => {
    try {
      const result = await service.createDemande(req.body || {});
      return res.status(201).json(result);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle demandes listing for admin.
  const listDemandes = async (_req, res) => {
    try {
      const demandes = await service.listDemandes();
      return res.json(demandes);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle demande approval.
  const approveDemande = async (req, res) => {
    try {
      const result = await service.approveDemande(req.params.id, req.body || {});
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle demande refusal.
  const refuseDemande = async (req, res) => {
    try {
      const result = await service.refuseDemande(req.params.id);
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle demande update.
  const updateDemande = async (req, res) => {
    try {
      const demande = await service.updateDemande(req.params.id, req.body || {});
      return res.json(demande);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle demande deletion.
  const deleteDemande = async (req, res) => {
    try {
      const result = await service.deleteDemande(req.params.id);
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle users listing.
  const listUsers = async (_req, res) => {
    try {
      const users = await service.listUsers();
      return res.json(users);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle employee machine assignment.
  const assignEmployeMachine = async (req, res) => {
    try {
      const user = await service.assignEmployeMachine(req.params.userId, req.body || {});
      return res.json(user);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle employee overview listing.
  const employesOverview = async (_req, res) => {
    try {
      const overview = await service.employesOverview();
      return res.json(overview);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle employee history lookup.
  const employeHistory = async (req, res) => {
    try {
      const result = await service.employeHistory(req.params.username, req.query || {});
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle employee dashboard lookup.
  const employeDashboard = async (req, res) => {
    try {
      const result = await service.employeDashboard(req.user.username);
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle employee machine action updates.
  const employeMachineAction = async (req, res) => {
    try {
      const result = await service.employeMachineAction(req.user.username, req.body || {});
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle dashboard statistics endpoint.
  const dashboardStats = async (_req, res) => {
    try {
      const result = await service.dashboardStats();
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle reports overview endpoint.
  const reportsOverview = async (_req, res) => {
    try {
      const result = await service.reportsOverview();
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  };

  return {
    createDemande,
    listDemandes,
    approveDemande,
    refuseDemande,
    updateDemande,
    deleteDemande,
    listUsers,
    assignEmployeMachine,
    employesOverview,
    employeHistory,
    employeDashboard,
    employeMachineAction,
    dashboardStats,
    reportsOverview,
  };
};

module.exports = {
  createWorkforceController,
};
