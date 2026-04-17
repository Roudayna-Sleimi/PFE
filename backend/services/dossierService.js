// Title: Build dossiers documents service.
const createDossierService = (deps) => {
  const {
    Dossier,
    fs,
    watchDir,
    getDossierWatcherHandle,
    isMongoConnected,
    parseStorageDate,
    escapeRegex,
  } = deps;

  // Title: Return watcher status payload.
  const watcherStatus = async () => {
    const exists = fs.existsSync(watchDir);
    const indexedCount = await Dossier.countDocuments({});
    const watcher = getDossierWatcherHandle();
    if (!watcher) {
      return {
        running: false,
        watchDir,
        exists,
        mongoConnected: isMongoConnected(),
        indexedCount,
        message: 'Watcher non demarre',
      };
    }
    return {
      running: true,
      watchDir: watcher.rootAbs || watchDir,
      exists,
      mongoConnected: isMongoConnected(),
      indexedCount,
    };
  };

  // Title: Trigger a manual dossier rescan.
  const rescan = async () => {
    const watcher = getDossierWatcherHandle();
    if (!watcher) {
      const error = new Error('Watcher non demarre');
      error.statusCode = 503;
      throw error;
    }
    await watcher.rescan('manual-rescan');
    return { message: 'Rescan termine' };
  };

  // Title: Build a Mongo date range from start and end.
  const buildRange = (start, end) => {
    if (!start && !end) return null;
    const range = {};
    if (start) range.$gte = start;
    if (end) range.$lte = end;
    return Object.keys(range).length ? range : null;
  };

  // Title: List dossiers with filters.
  const listDossiers = async (query = {}) => {
    const { client, piece, date, from, to, q, type, project, batchId } = query;
    const filter = {};

    if (batchId) filter.batchId = String(batchId);
    if (client) {
      const pattern = { $regex: escapeRegex(String(client)), $options: 'i' };
      filter.$or = [
        { clientLastName: pattern },
        { clientFirstName: pattern },
        { searchableText: { $regex: escapeRegex(String(client).toLowerCase()), $options: 'i' } },
      ];
    }
    if (piece) filter.pieceName = { $regex: escapeRegex(String(piece)), $options: 'i' };
    if (project) filter.projectName = { $regex: escapeRegex(String(project)), $options: 'i' };
    if (q) filter.searchableText = { $regex: escapeRegex(String(q).toLowerCase()), $options: 'i' };

    if (date && !from && !to) {
      const parsedDate = parseStorageDate(String(date));
      if (parsedDate) {
        const start = new Date(parsedDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(parsedDate);
        end.setHours(23, 59, 59, 999);
        filter.storageDate = buildRange(start, end);
      }
    }

    if (from || to) {
      const start = parseStorageDate(String(from || ''));
      const endBase = parseStorageDate(String(to || ''));
      const end = endBase ? new Date(endBase) : null;
      if (end) end.setHours(23, 59, 59, 999);
      const range = buildRange(start, end);
      if (range) filter.storageDate = range;
    }

    if (type) {
      const t = String(type);
      if (t === 'pdf') filter.mimeType = 'application/pdf';
      else if (t === 'image') filter.mimeType = { $regex: '^image\\/' };
      else if (t === 'cad') filter.originalName = { $regex: '\\.(step|stp|iges|igs|sldprt|sldasm|slddrw|dxf|dwg)$', $options: 'i' };
    }

    return Dossier.find(filter).sort({ createdAt: -1 });
  };

  // Title: Create dossier entries from uploaded files.
  const createDossiers = async (payload = {}, files = [], username = null) => {
    const { clientLastName, clientFirstName, pieceName, storageDate, projectName, batchId } = payload;
    const parsedStorageDate = parseStorageDate(storageDate);

    if (!clientLastName || !clientFirstName || !pieceName || !parsedStorageDate) {
      const error = new Error('Nom, prenom, date de stockage et nom de la piece sont requis');
      error.statusCode = 400;
      throw error;
    }
    if (!Array.isArray(files) || files.length === 0) {
      const error = new Error('Aucun fichier recu');
      error.statusCode = 400;
      throw error;
    }

    const saved = [];
    for (const file of files) {
      const publicPath = `/uploads/dossiers/${file.filename}`;
      const searchableText = [
        String(clientLastName).toLowerCase(),
        String(clientFirstName).toLowerCase(),
        String(projectName || '').toLowerCase(),
        String(pieceName).toLowerCase(),
        String(file.originalname).toLowerCase(),
        String(batchId || '').toLowerCase(),
      ].join(' ');

      const dossier = await Dossier.create({
        originalName: file.originalname,
        storedFilename: file.filename,
        filePath: file.path,
        publicPath,
        mimeType: file.mimetype,
        size: file.size,
        clientLastName: String(clientLastName).trim(),
        clientFirstName: String(clientFirstName).trim(),
        projectName: String(projectName || '').trim(),
        pieceName: String(pieceName).trim(),
        batchId: String(batchId || '').trim(),
        storageDate: parsedStorageDate,
        searchableText,
        uploadedBy: username || null,
      });
      saved.push(dossier);
    }

    return saved;
  };

  // Title: List distinct clients full names.
  const listClients = async () => {
    const docs = await Dossier.find({}).select('clientLastName clientFirstName -_id').lean();
    const uniq = new Set();
    for (const dossier of docs) {
      const name = `${(dossier.clientLastName || '').trim()} ${(dossier.clientFirstName || '').trim()}`.trim();
      if (name) uniq.add(name);
    }
    return Array.from(uniq).sort((a, b) => a.localeCompare(b));
  };

  // Title: List distinct project names.
  const listProjects = async () => {
    const names = await Dossier.distinct('projectName', { projectName: { $ne: '' } });
    return names.sort((a, b) => a.localeCompare(b));
  };

  // Title: List distinct piece names.
  const listPieceNames = async () => {
    const names = await Dossier.distinct('pieceName', { pieceName: { $ne: '' } });
    return names.sort((a, b) => a.localeCompare(b));
  };

  // Title: List latest dossier batches.
  const listBatches = async (query = {}) => {
    const limit = Math.min(Math.max(Number(query.limit || 30), 1), 100);
    const rows = await Dossier.aggregate([
      { $match: { batchId: { $exists: true, $ne: '' } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$batchId',
          createdAt: { $first: '$createdAt' },
          storageDate: { $first: '$storageDate' },
          clientLastName: { $first: '$clientLastName' },
          clientFirstName: { $first: '$clientFirstName' },
          projectName: { $first: '$projectName' },
          count: { $sum: 1 },
          totalSize: { $sum: '$size' },
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: limit },
    ]);

    return rows.map((row) => ({
      batchId: row._id,
      createdAt: row.createdAt,
      storageDate: row.storageDate,
      clientLastName: row.clientLastName,
      clientFirstName: row.clientFirstName,
      projectName: row.projectName,
      count: row.count,
      totalSize: row.totalSize,
    }));
  };

  // Title: Build dossier download metadata.
  const dossierDownloadMeta = async (dossierId) => {
    const dossier = await Dossier.findById(dossierId);
    if (!dossier) {
      const error = new Error('Document introuvable');
      error.statusCode = 404;
      throw error;
    }
    if (!fs.existsSync(dossier.filePath)) {
      const error = new Error('Fichier introuvable sur le disque');
      error.statusCode = 404;
      throw error;
    }
    return { filePath: dossier.filePath, filename: dossier.originalName };
  };

  // Title: Delete one dossier and its disk file.
  const deleteDossier = async (dossierId) => {
    const dossier = await Dossier.findById(dossierId);
    if (!dossier) {
      const error = new Error('Document introuvable');
      error.statusCode = 404;
      throw error;
    }
    if (fs.existsSync(dossier.filePath)) fs.unlinkSync(dossier.filePath);
    await dossier.deleteOne();
    return { message: 'Document supprime avec succes' };
  };

  // Title: Update one dossier metadata.
  const updateDossier = async (dossierId, payload = {}) => {
    const dossier = await Dossier.findById(dossierId);
    if (!dossier) {
      const error = new Error('Document introuvable');
      error.statusCode = 404;
      throw error;
    }

    const { clientLastName, clientFirstName, projectName, pieceName, storageDate } = payload;
    if (typeof clientLastName === 'string') dossier.clientLastName = clientLastName.trim();
    if (typeof clientFirstName === 'string') dossier.clientFirstName = clientFirstName.trim();
    if (typeof projectName === 'string') dossier.projectName = projectName.trim();
    if (typeof pieceName === 'string') dossier.pieceName = pieceName.trim();

    if (typeof storageDate === 'string') {
      const parsed = parseStorageDate(storageDate);
      if (!parsed) {
        const error = new Error('Date de stockage invalide');
        error.statusCode = 400;
        throw error;
      }
      dossier.storageDate = parsed;
    }

    dossier.searchableText = [
      String(dossier.clientLastName || '').toLowerCase(),
      String(dossier.clientFirstName || '').toLowerCase(),
      String(dossier.projectName || '').toLowerCase(),
      String(dossier.pieceName || '').toLowerCase(),
      String(dossier.originalName || '').toLowerCase(),
    ].join(' ');

    await dossier.save();
    return dossier;
  };

  return {
    watcherStatus,
    rescan,
    listDossiers,
    createDossiers,
    listClients,
    listProjects,
    listPieceNames,
    listBatches,
    dossierDownloadMeta,
    deleteDossier,
    updateDossier,
  };
};

module.exports = {
  createDossierService,
};
