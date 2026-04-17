const express = require('express');
const { createWorkforceController } = require('../controllers/workforceController');

// Title: Create workforce, demandes, and dashboard routes.
const createWorkforceRoutes = (deps) => {
  const { authMiddleware, adminMiddleware } = deps;
  const router = express.Router();
  const controller = createWorkforceController(deps);

  router.post('/demandes', controller.createDemande);
  router.get('/demandes', authMiddleware, adminMiddleware, controller.listDemandes);
  router.post('/demandes/:id/approuver', authMiddleware, adminMiddleware, controller.approveDemande);
  router.post('/demandes/:id/refuser', authMiddleware, adminMiddleware, controller.refuseDemande);

  router.get('/users', authMiddleware, controller.listUsers);
  router.patch('/admin/employes/:userId/assign-machine', authMiddleware, adminMiddleware, controller.assignEmployeMachine);
  router.get('/admin/employes-overview', authMiddleware, adminMiddleware, controller.employesOverview);
  router.get('/admin/employes/:username/historique', authMiddleware, adminMiddleware, controller.employeHistory);

  router.get('/employe/me/dashboard', authMiddleware, controller.employeDashboard);
  router.post('/employe/machine/action', authMiddleware, controller.employeMachineAction);

  router.get('/dashboard/stats', authMiddleware, controller.dashboardStats);
  router.get('/reports/overview', authMiddleware, adminMiddleware, controller.reportsOverview);

  return router;
};

module.exports = {
  createWorkforceRoutes,
};
