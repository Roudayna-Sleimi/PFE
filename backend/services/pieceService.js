const path = require('path');

// Title: Build pieces production service.
const createPieceService = (deps) => {
  const { Piece, io, normalizeMachineChain, uploadsDir } = deps;

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
    const currentMachine = chain[currentStep];
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
      piece.status = 'En cours';
      piece.history.push({ machine: chain[nextStep], action: 'entered', by: username });
    }

    await piece.save();
    io.emit('piece-progressed', piece);
    return piece;
  };

  // Title: Create one piece with optional uploaded file.
  const createPiece = async (payload = {}, file = null, username = null) => {
    const { nom, machine, machineChain, employe, quantite, prix, status, matiere, solidworksPath, ref } = payload;
    if (!nom) {
      const error = new Error('Nom requis');
      error.statusCode = 400;
      throw error;
    }

    const chain = normalizeMachineChain(machine, machineChain);
    return Piece.create({
      ref: ref || '',
      nom,
      machine: machine || 'Rectifieuse',
      machineChain: chain,
      currentStep: 0,
      currentMachine: chain[0] || machine || 'Rectifieuse',
      history: [{ machine: chain[0] || machine || 'Rectifieuse', action: 'entered', by: username }],
      employe: employe || '',
      quantite: Number(quantite) || 0,
      prix: Number(prix) || 0,
      status: status || 'En cours',
      matiere: typeof matiere === 'boolean' ? matiere : matiere !== 'false',
      solidworksPath: solidworksPath || null,
      fichier: file ? file.filename : null,
      taches: [],
    });
  };

  // Title: Update one piece.
  const patchPiece = async (pieceId, payload = {}) => {
    const allowed = [
      'nom',
      'machine',
      'machineChain',
      'employe',
      'quantite',
      'prix',
      'status',
      'matiere',
      'solidworksPath',
      'ref',
      'stock',
      'maxStock',
      'seuil',
      'currentStep',
      'currentMachine',
    ];

    const updates = allowed.reduce((acc, key) => {
      if (payload[key] !== undefined) acc[key] = payload[key];
      return acc;
    }, {});

    if (updates.machineChain || updates.machine) {
      const existing = await Piece.findById(pieceId);
      if (!existing) {
        const error = new Error('Piece introuvable');
        error.statusCode = 404;
        throw error;
      }
      const nextChain = normalizeMachineChain(updates.machine || existing.machine, updates.machineChain || existing.machineChain);
      updates.machineChain = nextChain;
      const safeStep = Math.min(Math.max(Number(updates.currentStep ?? existing.currentStep ?? 0), 0), Math.max(nextChain.length - 1, 0));
      updates.currentStep = safeStep;
      updates.currentMachine = nextChain[safeStep] || null;
    }

    const piece = await Piece.findByIdAndUpdate(pieceId, updates, { new: true });
    if (!piece) {
      const error = new Error('Piece introuvable');
      error.statusCode = 404;
      throw error;
    }
    return piece;
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
