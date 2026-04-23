const path = require('path');

// Title: Build pieces production service.
const createPieceService = (deps) => {
  const { Piece, io, normalizeMachineChain, uploadsDir } = deps;

  const sanitizeMachineName = (value) => String(value || '').trim();

  const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const toBoolean = (value, fallback = false) => {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
  };

  const canEmployeeEditPiece = (piece, username) => {
    if (!piece || !username) return false;
    if (piece.employe === username) return true;
    return Array.isArray(piece.taches) && piece.taches.some((task) => task?.employe === username);
  };

  const resolvePieceStatus = (piece, overrides = {}, explicitStatus = null) => {
    if (explicitStatus !== null && explicitStatus !== undefined) return explicitStatus;
    // Saving the piece form must not advance the workflow on its own.
    // Real status changes are driven by machine actions or an explicit admin status update.
    return overrides.status ?? piece.status;
  };

  // Title: List pieces with optional machine/status filters.
  const listPieces = async (query = {}) => {
    const { machine, status } = query;
    const filter = {};
    if (machine) filter.machine = machine;
    if (status) filter.status = status;
    return Piece.find(filter).sort({ createdAt: -1 });
  };

  // Title: Build tracking view payload for all pieces.
  const piecesTracking = async () => {
    const pieces = await Piece.find({}).sort({ createdAt: -1 });
    return pieces.map((piece) => {
      const chain = normalizeMachineChain(piece.machine, piece.machineChain);
      const step = Math.min(Math.max(piece.currentStep || 0, 0), Math.max(chain.length - 1, 0));
      return {
        _id: piece._id,
        nom: piece.nom,
        quantite: piece.quantite,
        status: piece.status,
        chain,
        currentStep: step,
        currentMachine: piece.currentMachine || chain[step] || null,
        history: piece.history || [],
        employe: piece.employe || '',
      };
    });
  };

  // Title: Progress one piece to the next machine or complete it.
  const progressPiece = async (pieceId, action = 'next', username = null) => {
    const piece = await Piece.findById(pieceId);
    if (!piece) {
      const error = new Error('Piece introuvable');
      error.statusCode = 404;
      throw error;
    }

    const chain = normalizeMachineChain(piece.machine, piece.machineChain);
    const currentStep = Math.min(Math.max(piece.currentStep || 0, 0), Math.max(chain.length - 1, 0));
    const currentMachine = chain[currentStep] || sanitizeMachineName(piece.currentMachine) || sanitizeMachineName(piece.machine) || null;
    if (!currentMachine) {
      const error = new Error('Aucune machine definie pour cette piece');
      error.statusCode = 400;
      throw error;
    }
    piece.history = piece.history || [];
    piece.history.push({ machine: currentMachine, action: 'completed', by: username });

    if (action === 'complete' || currentStep >= chain.length - 1) {
      piece.status = 'Termine';
      piece.currentStep = chain.length - 1;
      piece.currentMachine = chain[chain.length - 1] || currentMachine || null;
    } else {
      const nextStep = currentStep + 1;
      piece.currentStep = nextStep;
      piece.currentMachine = chain[nextStep];
      piece.status = 'Arrêté';
    }

    await piece.save();
    io.emit('piece-progressed', piece);
    io.emit('dashboard-refresh', { pieceId });
    return piece;
  };

  // Title: Create one piece with optional uploaded file.
  const createPiece = async (payload = {}, file = null, username = null) => {
    const {
      nom,
      machine,
      machineChain,
      employe,
      quantite,
      quantiteProduite,
      prix,
      status,
      matiere,
      dimension,
      matiereType,
      matiereReference,
      solidworksPath,
      planDocumentId,
      planPath,
      planName,
      planMimeType,
      ref,
    } = payload;
    if (!nom) {
      const error = new Error('Nom requis');
      error.statusCode = 400;
      throw error;
    }

    const chain = normalizeMachineChain(machine, machineChain);
    const primaryMachine = sanitizeMachineName(machine) || sanitizeMachineName(chain[0]);
    const firstMachine = sanitizeMachineName(chain[0]) || primaryMachine || null;
    const piece = await Piece.create({
      ref: ref || '',
      nom,
      machine: primaryMachine,
      machineChain: chain,
      currentStep: 0,
      currentMachine: firstMachine,
      history: firstMachine ? [{ machine: firstMachine, action: 'entered', by: username }] : [],
      employe: employe || '',
      quantite: toNumber(quantite, 0),
      quantiteProduite: toNumber(quantiteProduite, 0),
      quantiteRuban: 0,
      prix: toNumber(prix, 0),
      status: status || 'Arrêté',
      matiere: toBoolean(matiere, false),
      dimension: dimension || '',
      matiereType: matiereType || '',
      matiereReference: matiereReference || '',
      solidworksPath: solidworksPath || null,
      planDocumentId: planDocumentId || '',
      planPath: planPath || '',
      planName: planName || '',
      planMimeType: planMimeType || '',
      fichier: file ? file.filename : null,
      taches: [],
    });
    io.emit('piece-progressed', piece);
    io.emit('dashboard-refresh', { pieceId: piece._id });
    return piece;
  };

  // Title: Update one piece.
  const patchPiece = async (pieceId, payload = {}, actor = {}) => {
    const piece = await Piece.findById(pieceId);
    if (!piece) {
      const error = new Error('Piece introuvable');
      error.statusCode = 404;
      throw error;
    }

    const isAdmin = actor?.role === 'admin';
    if (!isAdmin && !canEmployeeEditPiece(piece, actor?.username || '')) {
      const error = new Error('Modification non autorisee');
      error.statusCode = 403;
      throw error;
    }

    const adminAllowed = [
      'nom',
      'machine',
      'machineChain',
      'employe',
      'quantite',
      'quantiteProduite',
      'prix',
      'status',
      'dimension',
      'matiereType',
      'matiereReference',
      'solidworksPath',
      'planDocumentId',
      'planPath',
      'planName',
      'planMimeType',
      'ref',
      'stock',
      'maxStock',
      'seuil',
      'currentStep',
      'currentMachine',
    ];
    const employeeAllowed = [
      'ref',
      'quantite',
      'matiere',
      'dimension',
      'matiereType',
      'matiereReference',
    ];
    const allowed = isAdmin ? adminAllowed : employeeAllowed;

    const updates = allowed.reduce((acc, key) => {
      if (payload[key] !== undefined) acc[key] = payload[key];
      return acc;
    }, {});

    ['quantite', 'quantiteProduite', 'prix', 'stock', 'maxStock', 'seuil', 'currentStep'].forEach((key) => {
      if (updates[key] !== undefined) updates[key] = toNumber(updates[key], 0);
    });
    if (updates.matiere !== undefined) {
      updates.matiere = toBoolean(updates.matiere, Boolean(piece.matiere));
    }

    const explicitStatus = payload.status !== undefined ? payload.status : null;

    if (isAdmin && (updates.machineChain || updates.machine)) {
      const nextChain = normalizeMachineChain(updates.machine || piece.machine, updates.machineChain || piece.machineChain);
      updates.machineChain = nextChain;
      const safeStep = Math.min(Math.max(toNumber(updates.currentStep ?? piece.currentStep, 0), 0), Math.max(nextChain.length - 1, 0));
      updates.currentStep = safeStep;
      updates.currentMachine = nextChain[safeStep] || null;
    }

    if (updates.quantite !== undefined || updates.quantiteProduite !== undefined || explicitStatus !== null) {
      updates.status = resolvePieceStatus(piece, updates, explicitStatus);
    }

    const updatedPiece = await Piece.findByIdAndUpdate(pieceId, updates, { returnDocument: 'after' });
    io.emit('piece-progressed', updatedPiece);
    io.emit('dashboard-refresh', { pieceId: updatedPiece._id });
    return updatedPiece;
  };

  // Title: Delete one piece.
  const deletePiece = async (pieceId) => {
    await Piece.findByIdAndDelete(pieceId);
    return { message: 'Piece supprimee' };
  };

  // Title: Resolve piece file download metadata.
  const pieceDownloadMeta = async (pieceId) => {
    const piece = await Piece.findById(pieceId);
    if (!piece || !piece.fichier) {
      const error = new Error('Fichier introuvable');
      error.statusCode = 404;
      throw error;
    }

    return {
      filePath: path.join(uploadsDir, piece.fichier),
      filename: piece.fichier,
    };
  };

  // Title: Add one task to a piece.
  const addPieceTask = async (pieceId, payload = {}) => {
    const { titre, employe, priorite } = payload;
    if (!titre || !employe) {
      const error = new Error('Titre et employe requis');
      error.statusCode = 400;
      throw error;
    }

    const piece = await Piece.findById(pieceId);
    if (!piece) {
      const error = new Error('Piece introuvable');
      error.statusCode = 404;
      throw error;
    }

    piece.taches.push({ titre, employe, priorite: priorite || 'moyenne', statut: 'a faire' });
    await piece.save();
    return piece;
  };

  // Title: Update one piece task.
  const patchPieceTask = async (pieceId, taskId, payload = {}) => {
    const piece = await Piece.findById(pieceId);
    if (!piece) {
      const error = new Error('Piece introuvable');
      error.statusCode = 404;
      throw error;
    }

    const task = piece.taches.id(taskId);
    if (!task) {
      const error = new Error('Tache introuvable');
      error.statusCode = 404;
      throw error;
    }

    const allowed = ['titre', 'employe', 'statut', 'priorite'];
    allowed.forEach((field) => {
      if (payload[field] !== undefined) task[field] = payload[field];
    });

    await piece.save();
    return piece;
  };

  // Title: Delete one piece task.
  const deletePieceTask = async (pieceId, taskId) => {
    const piece = await Piece.findById(pieceId);
    if (!piece) {
      const error = new Error('Piece introuvable');
      error.statusCode = 404;
      throw error;
    }

    piece.taches.pull({ _id: taskId });
    await piece.save();
    return piece;
  };

  return {
    listPieces,
    piecesTracking,
    progressPiece,
    createPiece,
    patchPiece,
    deletePiece,
    pieceDownloadMeta,
    addPieceTask,
    patchPieceTask,
    deletePieceTask,
  };
};

module.exports = {
  createPieceService,
};
