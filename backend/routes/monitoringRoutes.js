const express = require('express');
const { createMonitoringController } = require('../controllers/monitoringController');

// Title: Create monitoring, alerts, contacts, and maintenance routes.
const createMonitoringRoutes = (deps) => {
  const { authMiddleware, adminMiddleware, serviceKeyMiddleware } = deps;
  const router = express.Router();
  const controller = createMonitoringController(deps);

  router.get('/sensors/history', authMiddleware, controller.sensorsHistory);

  router.get('/alerts', authMiddleware, controller.listAlerts);
  router.get('/alerts/pending', serviceKeyMiddleware, controller.pendingAlerts);
  router.post('/alerts', authMiddleware, controller.createAlert);
  router.patch('/alerts/:id/seen', authMiddleware, controller.markAlertSeen);
  router.patch('/alerts/:id/resolve', authMiddleware, controller.resolveAlert);
  router.patch('/alerts/:id/notified', serviceKeyMiddleware, controller.markAlertNotified);

  router.get('/contacts', authMiddleware, controller.listContacts);
  router.get('/contacts/active', serviceKeyMiddleware, controller.activeContact);
  router.post('/contacts', authMiddleware, adminMiddleware, controller.createContact);
  router.patch('/contacts/:id', authMiddleware, adminMiddleware, controller.patchContact);

  router.post('/call-logs', serviceKeyMiddleware, controller.createCallLog);
  router.get('/call-logs/:alertId', authMiddleware, controller.listCallLogs);

  router.get('/maintenance/reports', authMiddleware, controller.maintenanceReports);
  router.get('/maintenance/requests', authMiddleware, controller.maintenanceRequests);
  router.get('/maintenance/overview', authMiddleware, controller.maintenanceOverview);
  router.post('/maintenance/analyze', authMiddleware, controller.maintenanceAnalyze);
  router.patch('/maintenance/requests/:id', authMiddleware, controller.patchMaintenanceRequest);

  return router;
};

module.exports = {
  createMonitoringRoutes,
};
