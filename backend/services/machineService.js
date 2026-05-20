const mongoose = require('mongoose');
const MachineModel = require('../models/Machine');
const MachineEvent = require('../models/MachineEvent');
const Piece = require('../models/Piece');
const User = require('../models/User');
const Alert = require('../models/Alert');
const SensorData = require('../models/SensorData');
const MaintenanceReport = require('../models/MaintenanceReport');
const MaintenanceRequest = require('../models/MaintenanceRequest');
const { BASE_MACHINE_CATALOG, buildDerivedMachine } = require('./machineCatalog');
const { machineMeta } = require('../utils/machineMeta');
const { slugify } = require('../utils/slugify');
const {
  isRectifieuseNode,
  isCompresseurNode,
  canonicalNodeForMachine,
  nodeAliasesForMachine,
} = require('../utils/liveMachineNodes');

// Title: Escape regex special characters before using a text query.
const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeMetricKey = (value = '') => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const normalizeMachineOperation = (value = '') => {
  const normalized = normalizeMetricKey(value);
  if (!normalized) return 'Fraisage';
  if (normalized.includes('rectif')) return 'Rectification';
  if (normalized.includes('electro') || normalized.includes('edm') || normalized.includes('agie')) return 'Électroérosion';
  if (normalized.includes('controle') || normalized.includes('qualite') || normalized.includes('quality')) return 'Contrôle qualité';
  if (normalized.includes('tour') || normalized.includes('tournage')) return 'Tournage';
  if (normalized.includes('taraud')) return 'Taraudage';
  if (normalized.includes('perca') || normalized.includes('drill')) return 'Perçage';
  return 'Fraisage';
};

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
  controle: [
    { title: 'Contrôle dimensionnel', desc: 'Vérification des dimensions et tolérances.' },
    { title: 'Contrôle qualité', desc: 'Validation de la conformité des pièces.' },
    { title: 'Rapport de contrôle', desc: 'Suivi des mesures et résultats de contrôle.' },
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
  if (haystack.includes('controle') || haystack.includes('qualite') || haystack.includes('quality')) return machineFunctionPresets.controle;
  if (haystack.includes('rectif')) return machineFunctionPresets.rectification;
  if (haystack.includes('agie drill') || haystack.includes('percage edm') || haystack.includes('edm drill')) return machineFunctionPresets.edmDrill;
  if (haystack.includes('agie cut') || haystack.includes('electroerosion') || haystack.includes('edm cut')) return machineFunctionPresets.edmCut;
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

const matchesEmployeeSpecialite = (machine = {}, specialite = '') => {
  const normalizedSpecialite = normalizeMetricKey(specialite);
  if (!normalizedSpecialite) return true;
  if (normalizeMetricKey(machine.name).includes('compresseur')) return false;

  const operation = normalizeMachineOperation(`${machine.type || ''} ${machine.name || ''} ${machine.model || ''}`);
  return normalizeMetricKey(operation) === normalizedSpecialite;
};

const uniqueStrings = (values = []) => Array.from(
  new Set(
    values
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )
);

const buildMachineAliasContext = async (machineId, context = {}) => {
  const dbMachine = await MachineModel.findOne({ id: machineId, deletedAt: null }).lean();
  const baseMachine = BASE_MACHINE_CATALOG.find((machine) => machine.id === machineId);
  const inferredMeta = machineMeta(context.name || dbMachine?.name || baseMachine?.name || machineId);

  return uniqueStrings([
    machineId,
    context.name,
    context.node,
    canonicalNodeForMachine(machineId, context.node),
    ...nodeAliasesForMachine(machineId, context.node),
    context.machId,
    baseMachine?.id,
    baseMachine?.name,
    baseMachine?.node,
    ...nodeAliasesForMachine(machineId, baseMachine?.node),
    baseMachine?.machId,
    dbMachine?.id,
    dbMachine?.name,
    dbMachine?.node,
    ...nodeAliasesForMachine(machineId, dbMachine?.node),
    dbMachine?.machId,
    inferredMeta?.id,
    inferredMeta?.node,
    ...nodeAliasesForMachine(machineId, inferredMeta?.node),
  ]);
};

const buildExactMatchRegexes = (values = []) => uniqueStrings(values)
  .map((value) => new RegExp(`^${escapeRegex(value)}$`, 'i'));

const hasAliasMatch = (values, normalizedAliases) => {
  const entries = Array.isArray(values) ? values : [values];
  return entries.some((value) => {
    const normalizedValue = normalizeMetricKey(value);
    if (!normalizedValue) return false;
    if (normalizedAliases.has(normalizedValue)) return true;
    for (const alias of normalizedAliases) {
      if (alias.includes(normalizedValue) || normalizedValue.includes(alias)) return true;
    }
    return false;
  });
};

const severityFromPriority = (priority = '') => {
  if (priority === 'critical') return 'critical';
  if (priority === 'high') return 'warning';
  return null;
};

const actionLabel = (action = '') => {
  if (action === 'started') return 'Machine demarree';
  if (action === 'paused') return 'Machine mise en pause';
  if (action === 'stopped') return 'Machine arretee';
  return 'Action machine';
};

const pieceHistoryLabel = (action = '') => {
  if (action === 'entered') return 'Piece entree sur la machine';
  if (action === 'completed') return 'Operation terminee sur la machine';
  return 'Transition piece';
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

const LIVE_SENSOR_MACHINE_IDS = new Set(['rectifieuse', 'compresseur']);

// Title: Resolve one sensor payload to a live machine id used by the UI.
const resolveLiveSensorMachineId = (sensor = {}) => {
  const node = String(sensor.node || sensor.machineId || '').trim();
  const rawMachine = String(sensor.machineId || sensor.machine || '').trim();

  if (/compresseur|compress/i.test(rawMachine) || isCompresseurNode(node)) return 'compresseur';
  if (/rectifi/i.test(rawMachine) || isRectifieuseNode(node)) return 'rectifieuse';
  return null;
};

// Title: Build UI-ready machine metrics from one raw sensor row.
const buildLiveSensorMetrics = (sensor = null) => {
  if (!sensor) return null;

  const vibX = Number(sensor.vibX || 0);
  const vibY = Number(sensor.vibY || 0);
  const vibZ = Number(sensor.vibZ || 0);
  const vibration = Number(Math.sqrt(vibX ** 2 + vibY ** 2 + vibZ ** 2).toFixed(2));
  const courant = Number(Number(sensor.courant || 0).toFixed(2));
  const rpm = Number(Number(sensor.rpm || 0).toFixed(0));
  const pression = sensor.pression === undefined || sensor.pression === null
    ? null
    : Number(Number(sensor.pression).toFixed(2));

  return {
    node: String(sensor.node || '').trim() || null,
    vibration,
    courant,
    rpm,
    pression,
    sante: Number(Math.max(0, Math.min(100, 100 - vibration * 5)).toFixed(1)),
    sensorUpdatedAt: sensor.createdAt || null,
    hasSensorData: true,
  };
};

// Title: Read the latest real sensor row per monitored live machine.
const getLatestSensorsByMachineId = async () => {
  const latestRows = await SensorData.aggregate([
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$node', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
  ]);

  const latestByMachineId = new Map();

  for (const sensor of latestRows) {
    const machineId = resolveLiveSensorMachineId(sensor);
    if (!machineId) continue;

    const current = latestByMachineId.get(machineId);
    if (!current || new Date(sensor.createdAt || 0).getTime() > new Date(current.createdAt || 0).getTime()) {
      latestByMachineId.set(machineId, sensor);
    }
  }

  return latestByMachineId;
};

// Title: Build the full machines list from base, DB custom rows, and inferred names.
const listMachines = async (options = {}) => {
  const currentUser = options.currentUser || null;
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
  const [metrics, latestSensorsByMachineId] = await Promise.all([
    computeMachineMetrics(machines),
    getLatestSensorsByMachineId(),
  ]);

  const hydratedMachines = machines.map((machine) => {
    const baseMachine = {
      ...machine,
      ...metrics.get(machine.id),
      objectif: 0,
      node: canonicalNodeForMachine(machine.id, machine.node),
      type: machine.id === 'compresseur' ? machine.type : normalizeMachineOperation(`${machine.type || ''} ${machine.name || ''} ${machine.model || ''}`),
      fonctions: functionsForMachine(machine),
    };

    if (!LIVE_SENSOR_MACHINE_IDS.has(machine.id)) {
      return {
        ...baseMachine,
        hasSensorData: false,
        sensorUpdatedAt: null,
      };
    }

    const liveMetrics = buildLiveSensorMetrics(latestSensorsByMachineId.get(machine.id));
    if (!liveMetrics) {
      return {
        ...baseMachine,
        temperature: null,
        courant: 0,
        vibration: 0,
        rpm: 0,
        pression: machine.id === 'compresseur' ? null : 0,
        sante: 0,
        hasSensorData: false,
        sensorUpdatedAt: null,
      };
    }

    return {
      ...baseMachine,
      ...liveMetrics,
      node: canonicalNodeForMachine(machine.id, liveMetrics.node),
      temperature: null,
    };
  });

  if (currentUser?.role !== 'employe') return hydratedMachines;

  const user = await User.findOne({ username: currentUser.username }).select('specialite').lean();
  const specialite = user?.specialite || '';
  return hydratedMachines.filter((machine) => matchesEmployeeSpecialite(machine, specialite));
};

// Title: Create one custom machine row after validation.
const createMachine = async (payload = {}) => {
  const { name, model, marque, type, ip, imageUrl, icon, status, hasSensors, node } = payload;
  const normalizedType = normalizeMachineOperation(type);
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
            model: model || normalizedType || '',
            marque: marque || '',
            type: normalizedType,
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
    model: model || normalizedType || '',
    marque: marque || '',
    type: normalizedType,
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
  if (type !== undefined) updates.type = normalizeMachineOperation(type);
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

// Title: Build one chronological history feed for a machine.
const getMachineHistory = async (machineId, context = {}) => {
  const aliases = await buildMachineAliasContext(machineId, context);
  const regexAliases = buildExactMatchRegexes(aliases);
  const normalizedAliases = new Set(aliases.map(normalizeMetricKey).filter(Boolean));
  const limit = Math.min(Math.max(Number(context.limit) || 80, 10), 200);

  const [
    machineEvents,
    pieces,
    alerts,
    reports,
    requests,
    sensorRows,
  ] = await Promise.all([
    MachineEvent.find({ machine: { $in: regexAliases } }).sort({ createdAt: -1 }).limit(limit).lean(),
    Piece.find({
      $or: [
        { machine: { $in: regexAliases } },
        { currentMachine: { $in: regexAliases } },
        { machineChain: { $in: regexAliases } },
        { 'history.machine': { $in: regexAliases } },
      ],
    }).sort({ createdAt: -1 }).limit(limit).lean(),
    Alert.find({
      $or: [
        { machineId: { $in: regexAliases } },
        { node: { $in: regexAliases } },
      ],
    }).sort({ createdAt: -1 }).limit(limit).lean(),
    MaintenanceReport.find({
      $or: [
        { machineId: { $in: regexAliases } },
        { node: { $in: regexAliases } },
      ],
    }).sort({ createdAt: -1 }).limit(limit).lean(),
    MaintenanceRequest.find({
      $or: [
        { machineId: { $in: regexAliases } },
        { node: { $in: regexAliases } },
      ],
    }).sort({ createdAt: -1 }).limit(limit).lean(),
    SensorData.find({
      $or: [
        { machineId: { $in: regexAliases } },
        { node: { $in: regexAliases } },
      ],
    }).sort({ createdAt: -1 }).limit(Math.min(limit, 12)).lean(),
  ]);

  const pieceEntries = pieces.flatMap((piece) => {
    const history = Array.isArray(piece.history) ? piece.history : [];
    return history
      .filter((entry) => hasAliasMatch(entry?.machine, normalizedAliases))
      .map((entry, index) => ({
        id: `${piece._id}-piece-${index}-${entry.at || piece.createdAt}`,
        type: 'piece',
        title: pieceHistoryLabel(entry.action),
        description: piece.nom || 'Piece sans nom',
        status: entry.action,
        severity: null,
        createdAt: entry.at || piece.createdAt,
        actor: entry.by || piece.employe || null,
        metadata: [
          { label: 'Piece', value: piece.nom || '-' },
          { label: 'Statut', value: piece.status || '-' },
          { label: 'Quantite produite', value: Number(piece.quantiteProduite || 0) },
        ],
      }));
  });

  const eventEntries = machineEvents.map((event) => ({
    id: String(event._id),
    type: 'machine-event',
    title: actionLabel(event.action),
    description: event.activity || event.pieceName || 'Evenement machine',
    status: event.action,
    severity: null,
    createdAt: event.createdAt,
    actor: event.username || null,
    metadata: [
      { label: 'Operateur', value: event.username || '-' },
      { label: 'Piece', value: event.pieceName || '-' },
      { label: 'Quantite', value: event.pieceCount ?? '-' },
      { label: 'Pieces rebutees', value: event.rubanQuantity ?? '-' },
    ],
  }));

  const alertEntries = alerts
    .filter((alert) => hasAliasMatch([alert.machineId, alert.node], normalizedAliases))
    .map((alert) => ({
      id: String(alert._id),
      type: 'alert',
      title: alert.message || 'Alerte machine',
      description: `Alerte ${alert.severity}${alert.ai?.source ? ` · ${alert.ai.source}` : ''}`,
      status: alert.status,
      severity: alert.severity || null,
      createdAt: alert.createdAt,
      actor: alert.seenBy || alert.notifiedBy || null,
      metadata: [
        { label: 'Occurrences', value: Number(alert.occurrenceCount || 1) },
        { label: 'Derniere detection', value: alert.lastObservedAt ? new Date(alert.lastObservedAt).toISOString() : '-' },
      ],
    }));

  const reportEntries = reports
    .filter((report) => hasAliasMatch([report.machineId, report.node], normalizedAliases))
    .map((report) => ({
      id: String(report._id),
      type: 'maintenance-report',
      title: report.prediction?.label || 'Rapport de maintenance',
      description: report.recommendedAction || 'Diagnostic de maintenance predictive',
      status: report.status,
      severity: report.severity || null,
      createdAt: report.createdAt,
      actor: report.reviewedBy || null,
      metadata: [
        { label: 'Score anomalie', value: Number(report.anomalyScore || 0) },
        { label: 'Confiance', value: `${Number(report.prediction?.confidence || 0)}%` },
        { label: 'ETA', value: report.prediction?.eta || '-' },
      ],
    }));

  const requestEntries = requests
    .filter((request) => hasAliasMatch([request.machineId, request.node], normalizedAliases))
    .map((request) => ({
      id: String(request._id),
      type: 'maintenance-request',
      title: request.title || 'Demande de maintenance',
      description: request.description || 'Intervention planifiee pour la machine',
      status: request.status,
      severity: severityFromPriority(request.priority),
      createdAt: request.createdAt,
      actor: request.resolvedBy || request.requestedBy || null,
      metadata: [
        { label: 'Priorite', value: request.priority || '-' },
        { label: 'Demandeur', value: request.requestedBy || '-' },
        { label: 'Resolution', value: request.resolvedAt ? new Date(request.resolvedAt).toISOString() : '-' },
      ],
    }));

  const sensorEntries = sensorRows
    .filter((sensor) => hasAliasMatch([sensor.machineId, sensor.node], normalizedAliases))
    .map((sensor) => {
      const metrics = buildLiveSensorMetrics(sensor);
      const pressure = typeof metrics?.pression === 'number' ? metrics.pression : null;
      const vibration = typeof metrics?.vibration === 'number' ? metrics.vibration : null;
      const severity = pressure !== null && (pressure > 11 || pressure < 3.5)
        ? 'critical'
        : (pressure !== null && (pressure > 10 || pressure < 4.5)) || (vibration !== null && vibration > 2)
          ? 'warning'
          : 'normal';

      return {
        id: `${sensor._id}-sensor`,
        type: 'sensor',
        title: 'Mesure capteurs',
        description: sensor.node || sensor.machineId || 'Lecture capteur',
        status: severity,
        severity,
        createdAt: sensor.createdAt,
        actor: null,
        metadata: [
          { label: 'Node', value: sensor.node || '-' },
          { label: 'Pression', value: pressure === null ? null : `${pressure.toFixed(1)} bar` },
          { label: 'Vibration', value: vibration === null ? null : `${vibration.toFixed(2)} mm/s` },
          { label: 'Courant', value: metrics ? `${metrics.courant.toFixed(1)} A` : null },
          { label: 'RPM', value: metrics ? metrics.rpm : null },
        ],
      };
    });

  const timeline = [
    ...eventEntries,
    ...pieceEntries,
    ...alertEntries,
    ...reportEntries,
    ...requestEntries,
    ...sensorEntries,
  ]
    .filter((entry) => entry.createdAt)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, limit)
    .map((entry) => ({
      ...entry,
      metadata: (entry.metadata || []).filter((item) => item.value !== null && item.value !== undefined && item.value !== ''),
    }));

  return {
    machine: {
      id: machineId,
      aliases,
    },
    summary: {
      totalEvents: timeline.length,
      machineActions: eventEntries.length,
      pieceTransitions: pieceEntries.length,
      alerts: alertEntries.length,
      sensorReadings: sensorEntries.length,
      maintenanceActions: reportEntries.length + requestEntries.length,
      activeAlerts: alertEntries.filter((entry) => entry.status !== 'resolved').length,
      openRequests: requestEntries.filter((entry) => ['open', 'in_progress'].includes(entry.status)).length,
      lastEventAt: timeline[0]?.createdAt || null,
    },
    timeline,
  };
};

module.exports = {
  listMachines,
  createMachine,
  deleteMachine,
  updateMachine,
  getMachineHistory,
  matchesEmployeeSpecialite,
};
