const mongoose = require('mongoose');
const MachineModel = require('../models/Machine');
const MachineEvent = require('../models/MachineEvent');
const Piece = require('../models/Piece');
const { BASE_MACHINE_CATALOG, buildDerivedMachine } = require('./machineCatalog');
const { machineMeta } = require('../utils/machineMeta');
const { slugify } = require('../utils/slugify');

// Title: Escape regex special characters before using a text query.
const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeMetricKey = (value = '') => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const machineFunctionPresets = {
  fraisage: [
    { title: 'Fraisage CNC', desc: 'Usinage de poches, contours et surfaces planes.' },
    { title: 'Perçage coordonné', desc: 'Perçage précis selon les coordonnées de la pièce.' },
    { title: 'Finition', desc: 'Passe de finition pour améliorer l’état de surface.' },
  ],
  tournage: [
    { title: 'Tournage extérieur', desc: 'Chariotage et dressage des pièces cylindriques.' },
    { title: 'Filetage', desc: 'Réalisation de filetages internes et externes.' },
    { title: 'Alésage', desc: 'Usinage intérieur avec contrôle du diamètre.' },
  ],
  percage: [
    { title: 'Perçage', desc: 'Création de trous simples ou profonds.' },
    { title: 'Pointage', desc: 'Préparation des positions avant perçage.' },
    { title: 'Chanfreinage', desc: 'Finition des entrées de trous.' },
  ],
  taraudage: [
    { title: 'Taraudage', desc: 'Création de filetages internes.' },
    { title: 'Contrôle filetage', desc: 'Vérification de la conformité des pas.' },
    { title: 'Pré-perçage', desc: 'Préparation du diamètre avant taraudage.' },
  ],
  rectification: [
    { title: 'Rectification plane', desc: 'Surfaçage de pièces métalliques avec haute précision.' },
    { title: 'Rectification cylindrique', desc: 'Finition de surfaces cylindriques internes et externes.' },
    { title: 'Dressage de meule', desc: 'Reconditionnement de la meule abrasive.' },
  ],
  edmCut: [
    { title: 'Découpe fil EDM', desc: 'Découpe de formes complexes par électroérosion à fil.' },
    { title: 'Contour de précision', desc: 'Usinage précis des profils et matrices.' },
    { title: 'Pièces trempées', desc: 'Découpe de matières dures sans effort mécanique.' },
  ],
  edmDrill: [
    { title: 'Perçage EDM', desc: 'Perçage par électroérosion sur matières dures.' },
    { title: 'Micro-perçage', desc: 'Réalisation de petits diamètres avec précision.' },
    { title: 'Trou de départ', desc: 'Préparation des trous pour la découpe fil.' },
  ],
  compresseur: [
    { title: 'Air comprimé', desc: 'Alimentation pneumatique de l’atelier.' },
    { title: 'Régulation pression', desc: 'Maintien de la pression réseau.' },
    { title: 'Surveillance énergie', desc: 'Suivi du courant, vibration et pression.' },
  ],
};

const functionsForMachine = (machine = {}) => {
  if (Array.isArray(machine.fonctions) && machine.fonctions.length > 0) return machine.fonctions;

  const haystack = normalizeMetricKey(`${machine.name || ''} ${machine.marque || ''} ${machine.type || ''} ${machine.model || ''}`);
  if (haystack.includes('compresseur')) return machineFunctionPresets.compresseur;
  if (haystack.includes('rectif')) return machineFunctionPresets.rectification;
  if (haystack.includes('agie cut') || haystack.includes('electroerosion a fil') || haystack.includes('edm cut')) return machineFunctionPresets.edmCut;
  if (haystack.includes('agie drill') || haystack.includes('percage edm') || haystack.includes('edm drill')) return machineFunctionPresets.edmDrill;
  if (haystack.includes('tour') || haystack.includes('tournage')) return machineFunctionPresets.tournage;
  if (haystack.includes('perca') || haystack.includes('drill')) return machineFunctionPresets.percage;
  if (haystack.includes('taraud')) return machineFunctionPresets.taraudage;
  return machineFunctionPresets.fraisage;
};

const buildAliasMap = (machines = []) => {
  const aliases = new Map();
  for (const machine of machines) {
    [machine.id, machine.name, machine.marque, machine.model, machine.type, machine.machId]
      .map(normalizeMetricKey)
      .filter(Boolean)
      .forEach((alias) => aliases.set(alias, machine.id));
  }
  return aliases;
};

const resolveMachineId = (value, aliasMap) => {
  const key = normalizeMetricKey(value);
  if (!key) return null;
  if (aliasMap.has(key)) return aliasMap.get(key);

  for (const [alias, id] of aliasMap.entries()) {
    if (alias && (key.includes(alias) || alias.includes(key))) return id;
  }
  return null;
};

const computeMachineMetrics = async (machines = []) => {
  if (!machines.length) return new Map();

  const aliasMap = buildAliasMap(machines);
  const stats = new Map(machines.map((machine) => [machine.id, {
    production: 0,
    fallbackProduction: 0,
    planned: 0,
    workMs: 0,
    started: 0,
    stopped: 0,
    hasActiveSession: false,
  }]));

  const [events, pieces] = await Promise.all([
    MachineEvent.find({}).sort({ createdAt: 1 }).lean(),
    Piece.find({}).lean(),
  ]);

  const activeSessions = new Map();
  for (const event of events) {
    const machineId = resolveMachineId(event.machine, aliasMap);
    if (!machineId || !stats.has(machineId)) continue;

    const machineStats = stats.get(machineId);
    const eventTime = new Date(event.createdAt).getTime();
    const sessionKey = `${event.username}:${machineId}`;

    if (event.action === 'started') {
      activeSessions.set(sessionKey, { machineId, startedAt: eventTime });
      machineStats.started += 1;
      continue;
    }

    if (event.action === 'paused' || event.action === 'stopped') {
      const activeSession = activeSessions.get(sessionKey);
      if (activeSession) {
        machineStats.workMs += Math.max(0, eventTime - activeSession.startedAt);
        activeSessions.delete(sessionKey);
      }
    }

    if (event.action === 'stopped') {
      machineStats.production += Number(event.pieceCount || 0);
      machineStats.stopped += 1;
    }
  }

  for (const activeSession of activeSessions.values()) {
    const machineStats = stats.get(activeSession.machineId);
    if (machineStats) {
      machineStats.workMs += Math.max(0, Date.now() - activeSession.startedAt);
      machineStats.hasActiveSession = true;
    }
  }

  for (const piece of pieces) {
    const machineNames = [
      piece.machine,
      piece.currentMachine,
      ...(Array.isArray(piece.machineChain) ? piece.machineChain : []),
    ];
    const machineIds = new Set(machineNames.map((name) => resolveMachineId(name, aliasMap)).filter(Boolean));

    for (const machineId of machineIds) {
      const machineStats = stats.get(machineId);
      if (!machineStats) continue;
      machineStats.planned += Number(piece.quantite || 0);
      machineStats.fallbackProduction += Number(piece.quantiteProduite || 0);
    }
  }

  return new Map([...stats.entries()].map(([machineId, machineStats]) => {
    const production = machineStats.production || machineStats.fallbackProduction;
    const hasProductionData = machineStats.production > 0 || machineStats.fallbackProduction > 0;
    const hasWorkData = machineStats.started > 0 || machineStats.workMs > 0 || machineStats.hasActiveSession;
    const hasEfficiencyData = hasProductionData && (machineStats.planned > 0 || machineStats.started > 0);
    const efficacite = machineStats.planned > 0
      ? Math.min(100, (production / machineStats.planned) * 100)
      : (machineStats.started > 0 ? Math.min(100, (machineStats.stopped / machineStats.started) * 100) : 0);

    return [machineId, {
      production,
      efficacite: Number(efficacite.toFixed(1)),
      heures: Number((machineStats.workMs / 3600000).toFixed(1)),
      hasProductionData,
      hasEfficiencyData,
      hasWorkData,
    }];
  }));
};

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
  const dbRows = await MachineModel.find({}).lean();
  const dbMachines = dbRows.filter((machine) => !machine.deletedAt);
  const dbMachineIds = new Set(dbRows.map((machine) => machine.id));
  const deletedIds = new Set(dbRows.filter((machine) => machine.deletedAt).map((machine) => machine.id));
  const fallbackBaseMachines = BASE_MACHINE_CATALOG.filter((machine) => !dbMachineIds.has(machine.id));
  const [pieceMachines, assignedMachines] = await Promise.all([
    readDistinct('pieces', 'machine', { machine: { $ne: '' } }),
    readDistinct('users', 'assignedMachine', { assignedMachine: { $ne: null } }),
  ]);

  const names = [...pieceMachines, ...assignedMachines]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const allKnownNames = [
    ...fallbackBaseMachines.map((machine) => machine.name.toLowerCase()),
    ...dbMachines.map((machine) => machine.name.toLowerCase()),
  ];

  const extra = Array.from(new Set(names))
    .filter((name) => !deletedIds.has(machineMeta(name).id))
    .filter((name) => !allKnownNames.includes(name.toLowerCase()))
    .map((name) => {
      const meta = machineMeta(name);
      return buildDerivedMachine({ id: meta.id, name, hasSensors: meta.hasSensors, node: meta.node });
    });

  const machines = [...fallbackBaseMachines, ...dbMachines, ...extra].sort((a, b) => a.name.localeCompare(b.name));
  const metrics = await computeMachineMetrics(machines);

  return machines.map((machine) => ({
    ...machine,
    ...metrics.get(machine.id),
    objectif: 0,
    fonctions: functionsForMachine(machine),
  }));
};

// Title: Create one custom machine row after validation.
const createMachine = async (payload = {}) => {
  const { name, model, marque, type, ip, imageUrl, icon, status, hasSensors, node } = payload;
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
    if (exists.deletedAt) {
      return MachineModel.findOneAndUpdate(
        { _id: exists._id },
        {
          $set: {
            id,
            name,
            model: model || type || '',
            marque: marque || '',
            type: type || '',
            ip: ip || '',
            imageUrl: imageUrl || '',
            icon: icon || 'gear',
            status: status || 'Arrêt',
            hasSensors: Boolean(hasSensors),
            node: node || null,
            objectif: 0,
            isBase: false,
            isDerived: false,
            deletedAt: null,
          },
        },
        { returnDocument: 'after' }
      );
    }

    const error = new Error('Machine déjà existante');
    error.statusCode = 409;
    throw error;
  }

  return MachineModel.create({
    id,
    name,
    model: model || type || '',
    marque: marque || '',
    type: type || '',
    ip: ip || '',
    imageUrl: imageUrl || '',
    icon: icon || 'gear',
    status: status || 'Arrêt',
    hasSensors: Boolean(hasSensors),
    node: node || null,
    objectif: 0,
    isBase: false,
    isDerived: false,
    deletedAt: null,
  });
};

// Title: Delete one custom machine by id.
const deleteMachine = async (machineId) => {
  const existing = await MachineModel.findOneAndUpdate(
    { id: machineId },
    { $set: { deletedAt: new Date() } },
    { returnDocument: 'after' }
  );
  if (existing) return existing;

  return MachineModel.create({
    id: machineId,
    name: machineId,
    deletedAt: new Date(),
  });
};

// Title: Update one custom machine by id.
const updateMachine = async (machineId, payload = {}) => {
  const { name, model, marque, type, ip, imageUrl, icon, status } = payload;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (model !== undefined) updates.model = model;
  if (marque !== undefined) updates.marque = marque;
  if (type !== undefined) updates.type = type;
  if (ip !== undefined) updates.ip = ip;
  if (imageUrl !== undefined) updates.imageUrl = imageUrl;
  if (icon !== undefined) updates.icon = icon;
  if (status !== undefined) updates.status = status;
  updates.objectif = 0;
  updates.isDerived = false;
  updates.deletedAt = null;

  return MachineModel.findOneAndUpdate(
    { id: machineId },
    {
      $set: updates,
      $setOnInsert: {
        id: machineId,
        name: updates.name || machineId,
      },
    },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );
};

module.exports = {
  listMachines,
  createMachine,
  deleteMachine,
  updateMachine,
};
