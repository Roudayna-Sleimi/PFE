const machineService = require('../services/machineService');

// Title: Send a consistent JSON error response.
const handleError = (res, err) => {
  const statusCode = Number(err?.statusCode) || 500;
  return res.status(statusCode).json({
    message: statusCode >= 500 ? 'Erreur serveur' : (err?.message || 'Requete invalide'),
    error: err?.message || null,
  });
};

// Title: Return all machines for the dashboard listing.
const getMachines = async (_req, res) => {
  try {
    const machines = await machineService.listMachines();
    return res.json(machines);
  } catch (err) {
    return handleError(res, err);
  }
};

// Title: Create a new custom machine.
const createMachine = async (req, res) => {
  try {
    const machine = await machineService.createMachine(req.body || {});
    return res.status(201).json(machine);
  } catch (err) {
    return handleError(res, err);
  }
};

// Title: Delete one custom machine.
const removeMachine = async (req, res) => {
  try {
    const machine = await machineService.deleteMachine(req.params.id);
    if (!machine) {
      return res.status(404).json({ message: 'Machine introuvable ou machine de base non supprimable' });
    }
    return res.json({ message: 'Machine supprimee' });
  } catch (err) {
    return handleError(res, err);
  }
};

// Title: Update one custom machine.
const patchMachine = async (req, res) => {
  try {
    const machine = await machineService.updateMachine(req.params.id, req.body || {});
    if (!machine) {
      return res.status(404).json({ message: 'Machine introuvable ou non modifiable' });
    }
    return res.json(machine);
  } catch (err) {
    return handleError(res, err);
  }
};

module.exports = {
  getMachines,
  createMachine,
  removeMachine,
  patchMachine,
};
