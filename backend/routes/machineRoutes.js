const express = require('express');
const machineController = require('../controllers/machineController');

// Title: Create the machines router with injected middlewares.
const createMachineRoutes = ({ authMiddleware, adminMiddleware, machineImageUpload }) => {
  const router = express.Router();
  const requireAdmin = adminMiddleware || ((_req, _res, next) => next());
  const uploadMachineImage = machineImageUpload
    ? machineImageUpload.single('image')
    : ((_req, _res, next) => next());

  router.get('/', authMiddleware, machineController.getMachines);
  router.post('/', authMiddleware, requireAdmin, uploadMachineImage, machineController.createMachine);
  router.delete('/:id', authMiddleware, requireAdmin, machineController.removeMachine);
  router.patch('/:id', authMiddleware, requireAdmin, uploadMachineImage, machineController.patchMachine);

  return router;
};

module.exports = {
  createMachineRoutes,
};
