// Title: Normalize a piece status string for tolerant comparisons.
const normalizeStatus = (value = '') => String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Title: Check if a piece status is considered completed.
const isCompletedStatus = (value = '') => normalizeStatus(value).includes('termine');

// Title: Build demandes workflow and workforce related services.
const createWorkforceService = (deps) => {
  const {
    Demande,
    User,
    Piece,
    MachineEvent,
    Alert,
    bcrypt,
    io,
    normalizeMachineChain,
    computeWorkByMachine,
  } = deps;

  // Title: Create a demand request.
  const createDemande = async (payload = {}) => {
    const { nom, email, poste, telephone } = payload;
    if (!nom || !email || !poste || !telephone) {
      const error = new Error('Tous les champs sont requis');
      error.statusCode = 400;
      throw error;
    }
    const demande = await Demande.create({ nom, email, poste, telephone });
    io.emit('nouvelle-demande', { id: demande._id, nom, email, poste });
    return { message: 'Demande envoyee avec succes' };
  };

  // Title: Return all demandes for admin.
  const listDemandes = async () => {
    return Demande.find().sort({ createdAt: -1 });
  };

  // Title: Approve a demande and create employee account.
  const approveDemande = async (demandeId, payload = {}) => {
    const { username, password } = payload;
    if (!username || !password) {
      const error = new Error('Username et mot de passe requis');
      error.statusCode = 400;
      throw error;
    }

    const demande = await Demande.findById(demandeId);
    if (!demande) {
      const error = new Error('Demande introuvable');
      error.statusCode = 404;
      throw error;
    }
    if (demande.statut !== 'en attente') {
      const error = new Error('Demande deja traitee');
      error.statusCode = 400;
      throw error;
    }

    const exists = await User.findOne({ username });
    if (exists) {
      const error = new Error('Username deja utilise');
      error.statusCode = 409;
      throw error;
    }

    const hashed = await bcrypt.hash(password, 12);
    await User.create({ username, password: hashed, role: 'employe' });
    demande.statut = 'approuvee';
    demande.username = username;
    await demande.save();

    return { message: `Compte cree pour ${username}` };
  };

  // Title: Refuse one demande.
  const refuseDemande = async (demandeId) => {
    const demande = await Demande.findById(demandeId);
    if (!demande) {
      const error = new Error('Demande introuvable');
      error.statusCode = 404;
      throw error;
    }
    demande.statut = 'refusee';
    await demande.save();
    return { message: 'Demande refusee' };
  };

  // Title: Update one demande identity/contact fields.
  const updateDemande = async (demandeId, payload = {}) => {
    const { nom, email, poste, telephone } = payload;
    if (!nom || !email || !poste || !telephone) {
      const error = new Error('Tous les champs sont requis');
      error.statusCode = 400;
      throw error;
    }

    const demande = await Demande.findByIdAndUpdate(
      demandeId,
      {
        nom: String(nom).trim(),
        email: String(email).trim(),
        poste: String(poste).trim(),
        telephone: String(telephone).trim(),
      },
      { returnDocument: 'after' }
    );

    if (!demande) {
      const error = new Error('Demande introuvable');
      error.statusCode = 404;
      throw error;
    }

    return demande;
  };

  // Title: Delete one demande.
  const deleteDemande = async (demandeId) => {
    const demande = await Demande.findByIdAndDelete(demandeId);
    if (!demande) {
      const error = new Error('Demande introuvable');
      error.statusCode = 404;
      throw error;
    }
    return { message: 'Demande supprimee' };
  };

  // Title: List users with lightweight fields.
  const listUsers = async () => {
    return User.find({}, 'username role isOnline lastSeen assignedMachine machineStatus currentActivity machineStatusUpdatedAt');
  };

  // Title: Assign a machine to an employee.
  const assignEmployeMachine = async (userId, payload = {}) => {
    const { assignedMachine } = payload;
    if (!assignedMachine) {
      const error = new Error('Machine assignee requise');
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findOneAndUpdate(
      { _id: userId, role: 'employe' },
      { assignedMachine },
      { returnDocument: 'after' }
    ).select('username assignedMachine machineStatus currentActivity machineStatusUpdatedAt isOnline');

    if (!user) {
      const error = new Error('Employe introuvable');
      error.statusCode = 404;
      throw error;
    }

    io.emit('employee-machine-updated', user);
    return user;
  };

  // Title: Return admin overview for all employees.
  const employesOverview = async () => {
    return User.find({ role: 'employe' })
      .select('username assignedMachine currentPieceName currentPieceId machineStatus currentActivity machineStatusUpdatedAt connectedAt isOnline lastSeen')
      .sort({ username: 1 });
  };

  // Title: Return one employee detailed history.
  const employeHistory = async (username, query = {}) => {
    const { limit = 50 } = query;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [events, pieces, user] = await Promise.all([
      MachineEvent.find({ username }).sort({ createdAt: -1 }).limit(Number(limit)).lean(),
      Piece.find({ employe: username }).lean(),
      User.findOne({ username }).select('connectedAt isOnline assignedMachine currentPieceName machineStatus machineStatusUpdatedAt').lean(),
    ]);

    const todayEvents = [...events].filter((event) => new Date(event.createdAt) >= todayStart);
    const totalPieces = pieces.reduce((sum, piece) => sum + (piece.quantite || 0), 0);
    const totalSessions = events.filter((event) => event.action === 'started').length;
    const totalPausees = events.filter((event) => event.action === 'paused').length;
    const totalTerminees = events.filter((event) => event.action === 'stopped').length;
    const piecesProduites = events.filter((event) => event.action === 'stopped').reduce((sum, event) => sum + (event.pieceCount || 0), 0);
    const piecesAujourd = todayEvents.filter((event) => event.action === 'stopped').reduce((sum, event) => sum + (event.pieceCount || 0), 0);

    let workSeconds = 0;
    let pauseSeconds = 0;
    let lastStart = null;
    let lastPause = null;
    const sortedToday = [...todayEvents].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    for (const event of sortedToday) {
      if (event.action === 'started') {
        if (lastPause) {
          pauseSeconds += (new Date(event.createdAt) - lastPause) / 1000;
          lastPause = null;
        }
        lastStart = new Date(event.createdAt);
      }

      if (event.action === 'paused') {
        if (lastStart) {
          workSeconds += (new Date(event.createdAt) - lastStart) / 1000;
          lastStart = null;
        }
        lastPause = new Date(event.createdAt);
      }

      if (event.action === 'stopped') {
        if (lastStart) {
          workSeconds += (new Date(event.createdAt) - lastStart) / 1000;
          lastStart = null;
        }
      }
    }

    if (lastStart) {
      workSeconds += (Date.now() - lastStart.getTime()) / 1000;
    }

    return {
      user,
      events,
      pieces,
      stats: {
        totalPieces,
        totalSessions,
        totalPausees,
        totalTerminees,
        piecesProduites,
        piecesAujourd,
        workSecondsToday: Math.round(workSeconds),
        pauseSecondsToday: Math.round(pauseSeconds),
      },
    };
  };

  // Title: Build employee dashboard payload for current user.
  const employeDashboard = async (username) => {
    const me = await User.findOne({ username }).select('username assignedMachine machineStatus currentActivity machineStatusUpdatedAt role');
    if (!me) {
      const error = new Error('Utilisateur introuvable');
      error.statusCode = 404;
      throw error;
    }

    const machine = me.assignedMachine || 'Rectifieuse';
    const pieces = await Piece.find({
      $or: [{ currentMachine: machine }, { machine }],
      status: { $ne: 'Termine' },
    }).sort({ createdAt: -1 });

    return { user: me, machine, pieces };
  };

  // Title: Save one machine action emitted by an employee.
  const employeMachineAction = async (username, payload = {}) => {
    const { action, activity = '', pieceId = null, pieceCount = null, machineName = null } = payload;
    if (!['started', 'paused', 'stopped'].includes(action)) {
      const error = new Error('Action invalide');
      error.statusCode = 400;
      throw error;
    }
    if (action === 'stopped' && !pieceId) {
      const error = new Error('pieceId requis pour terminer');
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findOne({ username });
    if (!user) {
      const error = new Error('Utilisateur introuvable');
      error.statusCode = 404;
      throw error;
    }

    if (machineName && action === 'started') {
      user.assignedMachine = machineName;
    }

    const machine = machineName || user.assignedMachine || 'Inconnue';
    let piece = null;

    user.machineStatus = action;
    user.currentActivity = activity;
    user.machineStatusUpdatedAt = new Date();

    if (action === 'started' && pieceId) {
      const currentPiece = await Piece.findById(pieceId).lean();
      if (currentPiece) {
        user.currentPieceName = currentPiece.nom;
        user.currentPieceId = String(pieceId);
      }
    }

    if (action === 'stopped') {
      user.currentPieceName = null;
      user.currentPieceId = null;
    }

    await user.save();

    if (action === 'stopped' && pieceId) {
      piece = await Piece.findById(pieceId);
      if (!piece) {
        const error = new Error('Piece introuvable');
        error.statusCode = 404;
        throw error;
      }

      const chain = normalizeMachineChain(piece.machine, piece.machineChain);
      const currentStep = Math.min(Math.max(piece.currentStep || 0, 0), Math.max(chain.length - 1, 0));
      const currentMachine = chain[currentStep];
      piece.history = piece.history || [];
      piece.history.push({ machine: currentMachine, action: 'completed', by: username });

      if (currentStep >= chain.length - 1) {
        piece.status = 'Termine';
        piece.currentStep = chain.length - 1;
        piece.currentMachine = chain[chain.length - 1] || currentMachine || null;
      } else {
        const nextStep = currentStep + 1;
        piece.currentStep = nextStep;
        piece.currentMachine = chain[nextStep];
        piece.status = 'En cours';
        piece.history.push({ machine: chain[nextStep], action: 'entered', by: username });
      }

      piece.quantiteProduite = (piece.quantiteProduite || 0) + Number(pieceCount || 0);
      if (piece.quantite > 0 && piece.quantiteProduite >= piece.quantite) {
        piece.status = 'Termine';
      }
      await piece.save();
      io.emit('piece-progressed', piece);
    }

    const event = await MachineEvent.create({
      username: user.username,
      machine,
      action,
      activity,
      pieceId: piece?._id || null,
      pieceName: piece?.nom || null,
      pieceCount: action === 'stopped' ? Number(pieceCount || 0) : null,
    });

    const response = {
      username: user.username,
      machine,
      assignedMachine: machine,
      machineStatus: action,
      currentActivity: activity,
      currentPieceName: user.currentPieceName || null,
      currentPieceId: user.currentPieceId || null,
      machineStatusUpdatedAt: user.machineStatusUpdatedAt,
      connectedAt: user.connectedAt,
      pieceId: piece?._id || null,
      pieceName: piece?.nom || null,
      pieceCount: action === 'stopped' ? Number(pieceCount || 0) : null,
      createdAt: event.createdAt,
    };

    io.emit('employee-machine-updated', response);
    io.emit('dashboard-refresh', { username: user.username, action, machine });
    return response;
  };

  // Title: Compute aggregated dashboard statistics.
  const dashboardStats = async () => {
    const last7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [pieces, events, alerts, employes] = await Promise.all([
      Piece.find({}).lean(),
      MachineEvent.find({ createdAt: { $gte: last7 } }).sort({ createdAt: 1 }).lean(),
      Alert.find({ status: { $ne: 'resolved' } }).lean(),
      User.find({ role: 'employe' }).select('username assignedMachine machineStatus currentActivity isOnline').lean(),
    ]);

    const totalPcs = pieces.reduce((sum, piece) => sum + (piece.quantite || 0), 0);
    const totalRevenu = pieces.reduce((sum, piece) => sum + (piece.quantite || 0) * (piece.prix || 0), 0);
    const enCours = pieces.filter((piece) => normalizeStatus(piece.status) === 'en cours').length;
    const totalPieces = pieces.length;

    const prodParJour = [];
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const label = date.toLocaleDateString('fr-FR', { weekday: 'short' });
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      const dayEvents = events.filter((event) => new Date(event.createdAt) >= dayStart && new Date(event.createdAt) <= dayEnd && event.action === 'stopped');
      const pcs = dayEvents.reduce((sum, event) => sum + (event.pieceCount || 0), 0);
      prodParJour.push({ label, pcs });
    }

    const activeMachineMap = {};
    for (const employe of employes.filter((row) => row.machineStatus === 'started' && row.assignedMachine)) {
      activeMachineMap[employe.assignedMachine] = (activeMachineMap[employe.assignedMachine] || 0) + 1;
    }

    const machineMap = Object.keys(activeMachineMap).length > 0 ? activeMachineMap : {};
    if (Object.keys(machineMap).length === 0) {
      for (const piece of pieces) {
        const machine = piece.machine || 'Inconnue';
        machineMap[machine] = (machineMap[machine] || 0) + (piece.quantite || 0);
      }
    }

    const repartition = Object.entries(machineMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const tempsMachines = computeWorkByMachine(events);
    const totalFonction = tempsMachines.reduce((sum, machine) => sum + machine.seconds, 0);

    const sortedEvents = [...events].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const pauseSessions = new Map();
    let totalPauseMs = 0;
    for (const event of sortedEvents) {
      const key = event.username;
      if (event.action === 'paused') pauseSessions.set(key, new Date(event.createdAt).getTime());
      if (event.action === 'started' && pauseSessions.has(key)) {
        totalPauseMs += new Date(event.createdAt).getTime() - pauseSessions.get(key);
        pauseSessions.delete(key);
      }
    }
    for (const pausedAt of pauseSessions.values()) {
      totalPauseMs += Math.max(0, Date.now() - pausedAt);
    }
    const totalPauseSeconds = Math.round(totalPauseMs / 1000);

    const activiteEmployes = employes.map((employe) => {
      const empEvents = events.filter((event) => event.username === employe.username);
      const sessions = empEvents.filter((event) => event.action === 'started').length;
      const pcs = empEvents.filter((event) => event.action === 'stopped').reduce((sum, event) => sum + (event.pieceCount || 0), 0);
      return {
        username: employe.username,
        machineStatus: employe.machineStatus,
        assignedMachine: employe.assignedMachine,
        sessions,
        pcs,
        pauseMs: 0,
      };
    });

    const machinesActives = employes
      .filter((row) => row.machineStatus === 'started')
      .map((row) => ({ machine: row.assignedMachine, username: row.username }));

    return {
      kpi: { totalPcs, totalRevenu, enCours, totalPieces, alertesActives: alerts.length },
      prodParJour,
      repartition,
      tempsMachines,
      totalFonctionSeconds: totalFonction,
      totalPauseSeconds,
      activiteEmployes,
      machinesActives,
      employes: {
        total: employes.length,
        actifs: employes.filter((row) => row.machineStatus === 'started').length,
        enPause: employes.filter((row) => row.machineStatus === 'paused').length,
        enligne: employes.filter((row) => row.isOnline).length,
      },
    };
  };

  // Title: Build reports overview payload.
  const reportsOverview = async () => {
    const [pieces, events, alerts, employes] = await Promise.all([
      Piece.find({}).lean(),
      MachineEvent.find({}).sort({ createdAt: 1 }).lean(),
      Alert.find({ createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }).lean(),
      User.find({ role: 'employe' }).lean(),
    ]);

    const piecesTraitees = pieces
      .filter((piece) => isCompletedStatus(piece.status))
      .reduce((sum, piece) => sum + (piece.quantite || 0), 0);
    const pauses = events.filter((event) => event.action === 'paused').length;
    const anomalies = alerts.filter((alert) => alert.severity === 'critical' || alert.type === 'sensor').length;
    const tempsMachine = computeWorkByMachine(events);

    const performanceEmployes = employes.map((employe) => {
      const piecesEmploye = pieces.filter((piece) => piece.employe === employe.username);
      return {
        username: employe.username,
        totalPieces: piecesEmploye.reduce((sum, piece) => sum + (piece.quantite || 0), 0),
        completedPieces: piecesEmploye.filter((piece) => isCompletedStatus(piece.status)).length,
        assignedMachine: employe.assignedMachine || null,
      };
    });

    const logs = events
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 300)
      .map((event) => ({
        machine: event.machine,
        action: event.action,
        at: event.createdAt,
        username: event.username,
        pieceCount: event.action === 'stopped' ? (event.pieceCount || 0) : null,
        pieceName: event.pieceName || null,
      }));

    return {
      piecesTraitees,
      pauses,
      anomalies,
      tempsMachine,
      performanceEmployes,
      logs,
    };
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
  createWorkforceService,
};
