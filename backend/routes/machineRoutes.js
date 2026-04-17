const express = require('express');
const machineController = require('../controllers/machineController');

// Title: Create the machines router with injected middlewares.
const createMachineRoutes = ({ authMiddleware }) => {
  const router = express.Router();

  router.get('/', authMiddleware, machineController.getMachines);
  router.post('/', authMiddleware, machineController.createMachine);
  router.delete('/:id', authMiddleware, machineController.removeMachine);
  router.patch('/:id', authMiddleware, machineController.patchMachine);

  return router;
};

module.exports = {
  createMachineRoutes,
};
