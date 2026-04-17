const mongoose = require('mongoose');
const MachineModel = require('../models/Machine');
const { machineMeta } = require('../utils/machineMeta');
const { slugify } = require('../utils/slugify');

const BASE_MACHINES = [
  { id: 'rectifieuse', name: 'Rectifieuse', hasSensors: true, node: 'ESP32-NODE-03', isBase: true },
  { id: 'agie-cut', name: 'Agie Cut', hasSensors: false, node: null, isBase: true },
  { id: 'agie-drill', name: 'Agie Drill', hasSensors: false, node: null, isBase: true },
  { id: 'haas-cnc', name: 'HAAS CNC', hasSensors: false, node: null, isBase: true },
  { id: 'tour-cnc', name: 'Tour CNC', hasSensors: false, node: null, isBase: true },
  { id: 'compresseur', name: 'Compresseur ABAC', hasSensors: true, node: 'compresseur', isBase: true },
];

// Title: Escape regex special characters before using a text query.
const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Title: Read distinct values directly from a Mongo collection.
const readDistinct = async (collectionName, field, filter = {}) => {
  const db = mongoose.connection?.db;
  if (!db) return [];
  try {
    return await db.collection(collectionName).distinct(field, filter);
  } catch {
    return [];
  }
};

// Title: Build the full machines list from base, DB custom rows, and inferred names.
const listMachines = async () => {
  const dbMachines = await MachineModel.find({ isBase: false }).lean();
  const [pieceMachines, assignedMachines] = await Promise.all([
    readDistinct('pieces', 'machine', { machine: { $ne: '' } }),
    readDistinct('users', 'assignedMachine', { assignedMachine: { $ne: null } }),
  ]);

  const names = [...pieceMachines, ...assignedMachines]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const allKnownNames = [
    ...BASE_MACHINES.map((machine) => machine.name.toLowerCase()),
    ...dbMachines.map((machine) => machine.name.toLowerCase()),
  ];

  const extra = Array.from(new Set(names))
    .filter((name) => !allKnownNames.includes(name.toLowerCase()))
    .map((name) => {
      const meta = machineMeta(name);
      return { id: meta.id, name, hasSensors: meta.hasSensors, node: meta.node, isBase: false };
    });

  return [...BASE_MACHINES, ...dbMachines, ...extra].sort((a, b) => a.name.localeCompare(b.name));
};

// Title: Create one custom machine row after validation.
const createMachine = async (payload = {}) => {
  const { name, model, icon, status, hasSensors, node, objectif } = payload;
  if (!name) {
    const error = new Error('Nom requis');
    error.statusCode = 400;
    throw error;
  }

  const id = slugify(name) || `machine-${Date.now()}`;
  const exists = await MachineModel.findOne({
    $or: [{ id }, { name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') } }],
  });

  if (exists) {
    const error = new Error('Machine déjà existante');
    error.statusCode = 409;
    throw error;
  }

  return MachineModel.create({
    id,
    name,
    model: model || '',
    icon: icon || 'gear',
    status: status || 'Arrêt',
    hasSensors: Boolean(hasSensors),
    node: node || null,
    objectif: Number.isFinite(Number(objectif)) ? Number(objectif) : 0,
    isBase: false,
  });
};

// Title: Delete one custom machine by id.
const deleteMachine = async (machineId) => {
  return MachineModel.findOneAndDelete({ id: machineId, isBase: false });
};

// Title: Update one custom machine by id.
const updateMachine = async (machineId, payload = {}) => {
  const { name, model, icon, status, objectif } = payload;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (model !== undefined) updates.model = model;
  if (icon !== undefined) updates.icon = icon;
  if (status !== undefined) updates.status = status;
  if (objectif !== undefined) {
    updates.objectif = Number.isFinite(Number(objectif)) ? Number(objectif) : 0;
  }

  return MachineModel.findOneAndUpdate(
    { id: machineId, isBase: false },
    { $set: updates },
    { new: true }
  );
};

module.exports = {
  listMachines,
  createMachine,
  deleteMachine,
  updateMachine,
};
