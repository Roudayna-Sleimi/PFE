const { createMonitoringService } = require('../services/monitoringService');

// Title: Send a consistent error payload for monitoring endpoints.
const handleError = (res, err) => {
  const statusCode = Number(err?.statusCode) || 500;
  return res.status(statusCode).json({
    message: statusCode >= 500 ? 'Erreur serveur' : (err?.message || 'Requete invalide'),
    error: err?.message || null,
  });
};

// Title: Build monitoring controllers with injected dependencies.
const createMonitoringController = (deps) => {
  const service = createMonitoringService(deps);

  // Title: Handle sensors history endpoint.
  const sensorsHistory = async (_req, res) => {
    try {
      const data = await service.sensorsHistory();
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle alerts listing endpoint.
  const listAlerts = async (req, res) => {
    try {
      const alerts = await service.listAlerts(req.query || {});
      return res.json(alerts);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle pending alerts endpoint.
  const pendingAlerts = async (req, res) => {
    try {
      const alerts = await service.pendingAlerts(req.query || {});
      return res.json(alerts);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle create alert endpoint.
  const createAlert = async (req, res) => {
    try {
      const alert = await service.createAlert(req.body || {});
      return res.status(201).json(alert);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle mark alert seen endpoint.
  const markAlertSeen = async (req, res) => {
    try {
      const alert = await service.markAlertSeen(req.params.id, req.user.username);
      return res.json(alert);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle resolve alert endpoint.
  const resolveAlert = async (req, res) => {
    try {
      const alert = await service.resolveAlert(req.params.id, req.user.username);
      return res.json(alert);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle mark alert notified endpoint.
  const markAlertNotified = async (req, res) => {
    try {
      const alert = await service.markAlertNotified(req.params.id, req.body || {});
      return res.json(alert);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle contacts listing endpoint.
  const listContacts = async (_req, res) => {
    try {
      const contacts = await service.listContacts();
      return res.json(contacts);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle active contact endpoint.
  const activeContact = async (_req, res) => {
    try {
      const contact = await service.activeContact();
      return res.json(contact);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle create contact endpoint.
  const createContact = async (req, res) => {
    try {
      const contact = await service.createContact(req.body || {});
      return res.status(201).json(contact);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle patch contact endpoint.
  const patchContact = async (req, res) => {
    try {
      const contact = await service.patchContact(req.params.id, req.body || {});
      return res.json(contact);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle create call log endpoint.
  const createCallLog = async (req, res) => {
    try {
      const log = await service.createCallLog(req.body || {});
      return res.status(201).json(log);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle list call logs endpoint.
  const listCallLogs = async (req, res) => {
    try {
      const logs = await service.listCallLogs(req.params.alertId);
      return res.json(logs);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle maintenance reports endpoint.
  const maintenanceReports = async (req, res) => {
    try {
      const reports = await service.maintenanceReports(req.query || {});
      return res.json(reports);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle maintenance requests endpoint.
  const maintenanceRequests = async (req, res) => {
    try {
      const requests = await service.maintenanceRequests(req.query || {});
      return res.json(requests);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle maintenance overview endpoint.
  const maintenanceOverview = async (_req, res) => {
    try {
      const data = await service.maintenanceOverview();
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle maintenance analyze endpoint.
  const maintenanceAnalyze = async (req, res) => {
    try {
      const data = await service.maintenanceAnalyze(req.body || {});
      const statusCode = data?.alert ? 201 : 200;
      return res.status(statusCode).json(data);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle patch maintenance request endpoint.
  const patchMaintenanceRequest = async (req, res) => {
    try {
      const request = await service.patchMaintenanceRequest(req.params.id, req.body || {}, req.user?.username || null);
      return res.json(request);
    } catch (err) {
      return handleError(res, err);
    }
  };

  return {
    sensorsHistory,
    listAlerts,
    pendingAlerts,
    createAlert,
    markAlertSeen,
    resolveAlert,
    markAlertNotified,
    listContacts,
    activeContact,
    createContact,
    patchContact,
    createCallLog,
    listCallLogs,
    maintenanceReports,
    maintenanceRequests,
    maintenanceOverview,
    maintenanceAnalyze,
    patchMaintenanceRequest,
  };
};

module.exports = {
  createMonitoringController,
};
