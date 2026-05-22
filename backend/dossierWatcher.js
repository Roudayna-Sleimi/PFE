const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const cleanSegment = (value = '') => String(value)
  .replace(/[_]+/g, ' ')
  .replace(/[-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const stripExt = (filename = '') => {
  const name = String(filename);
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(0, idx) : name;
};

const parseClientSegment = (segment = '') => {
  const raw = cleanSegment(segment);
  if (!raw) return { clientLastName: '', clientFirstName: '' };

  // "Last, First" or "Last First"
  if (raw.includes(',')) {
    const [last, first] = raw.split(',').map((s) => s.trim());
    return { clientLastName: last || '', clientFirstName: first || '' };
  }

  const parts = raw.split(' ').filter(Boolean);
  if (parts.length === 1) return { clientLastName: parts[0], clientFirstName: '' };
  return { clientLastName: parts[0], clientFirstName: parts.slice(1).join(' ') };
};

const guessMimeType = (filename = '') => {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.bmp') return 'image/bmp';
  if (ext === '.tif' || ext === '.tiff') return 'image/tiff';
  return 'application/octet-stream';
};

const normalizeFsPath = (value = '') => path.resolve(String(value || ''))
  .replace(/[\\/]+/g, '/')
  .replace(/\/+$/, '')
  .toLowerCase();

const isInsideRoot = (rootAbs, fileAbs) => {
  const root = normalizeFsPath(rootAbs);
  const file = normalizeFsPath(fileAbs);
  return file !== root && file.startsWith(`${root}/`);
};

const safeYMD = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
};

const parseFromRelativePath = (relPath, opts = {}) => {
  const ignoreRootFolder = opts.ignoreRootFolder ?? false;
  const segs = String(relPath || '').replace(/\\/g, '/').split('/').filter(Boolean);

  const fileName = segs[segs.length - 1] || '';
  const folders = segs.slice(0, -1);
  const normalized = ignoreRootFolder ? folders.slice(1) : folders;

  const clientSeg = normalized[0] || '';
  const projectSeg = normalized[1] || '';
  const pieceSeg = normalized.length >= 3 ? normalized[2] : '';

  const client = parseClientSegment(clientSeg);
  const projectName = cleanSegment(projectSeg);
  const pieceName = cleanSegment(pieceSeg) || cleanSegment(stripExt(fileName));

  return {
    clientLastName: client.clientLastName || 'Inconnu',
    clientFirstName: client.clientFirstName || '',
    projectName,
    pieceName: pieceName || 'Inconnu',
    originalName: fileName || path.basename(relPath || ''),
  };
};

const walkFiles = async (dirAbs) => {
  const out = [];
  let hadReadError = false;
  const queue = [dirAbs];
  while (queue.length) {
    const cur = queue.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      hadReadError = true;
      continue;
    }
    for (const ent of entries) {
      const abs = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        queue.push(abs);
      } else if (ent.isFile()) {
        out.push(abs);
      }
    }
  }
  return { files: out, hadReadError };
};

/**
 * Starts a watcher that keeps the Dossier collection in sync with a folder.
 * - rootDir: absolute path to the watched folder (e.g. C:\data CNC CONCEPT)
 * - Dossier: mongoose model
 * - logger: console-like object
 */
const startDossierWatcher = async ({ rootDir, Dossier, logger = console }) => {
  const rootAbs = path.resolve(rootDir);
  let isActive = true;
  let scheduledRescan = null;

  const listIndexedDocs = async () => {
    const docs = await Dossier.find(
      { filePath: { $exists: true, $ne: '' } },
      { _id: 1, filePath: 1 }
    ).lean();

    return docs.filter((doc) => doc?.filePath && isInsideRoot(rootAbs, doc.filePath));
  };

  const runUpserts = async (files = [], why) => {
    const concurrency = 10;
    let idx = 0;
    const worker = async () => {
      while (idx < files.length) {
        const i = idx;
        idx += 1;
        await upsertFile(files[i], why);
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  };

  const upsertFile = async (fileAbs, why) => {
    if (!isActive) return;
    if (!isInsideRoot(rootAbs, fileAbs)) return;

    let stat;
    try {
      stat = fs.statSync(fileAbs);
      if (!stat.isFile()) return;
    } catch {
      return;
    }

    const rel = path.relative(rootAbs, fileAbs);
    const meta = parseFromRelativePath(rel, { ignoreRootFolder: false });

    const storageDate = safeYMD(stat.mtime) || safeYMD(new Date()) || '1970-01-01';
    const mimeType = guessMimeType(meta.originalName);
    const searchableText = [
      meta.clientLastName.toLowerCase(),
      meta.clientFirstName.toLowerCase(),
      String(meta.projectName || '').toLowerCase(),
      meta.pieceName.toLowerCase(),
      String(meta.originalName || '').toLowerCase(),
      String(rel || '').toLowerCase(),
    ].join(' ');

    try {
      await Dossier.findOneAndUpdate(
        { filePath: fileAbs },
        {
          originalName: meta.originalName,
          storedFilename: path.basename(fileAbs),
          filePath: fileAbs,
          // Not served from /uploads for watched files.
          publicPath: '',
          mimeType,
          size: stat.size,
          clientLastName: meta.clientLastName,
          clientFirstName: meta.clientFirstName,
          projectName: meta.projectName,
          pieceName: meta.pieceName,
          storageDate: new Date(`${storageDate}T00:00:00`),
          searchableText,
        },
        { upsert: true, returnDocument: 'after' }
      );
      if (why) logger.log(`[dossier-watcher] upsert (${why}): ${rel}`);
    } catch (e) {
      logger.error('[dossier-watcher] upsert error:', e?.message || e);
    }
  };

  const deleteFile = async (fileAbs, why) => {
    if (!isActive) return;
    if (!isInsideRoot(rootAbs, fileAbs)) return;
    const rel = path.relative(rootAbs, fileAbs);
    try {
      const targetPath = normalizeFsPath(fileAbs);
      const indexedDocs = await listIndexedDocs();
      const matchingIds = indexedDocs
        .filter((doc) => normalizeFsPath(doc.filePath) === targetPath)
        .map((doc) => doc._id);

      if (!matchingIds.length) {
        if (why) logger.log(`[dossier-watcher] delete (${why}): ${rel} (aucun index a supprimer)`);
        return;
      }

      await Dossier.deleteMany({ _id: { $in: matchingIds } });
      if (why) logger.log(`[dossier-watcher] delete (${why}): ${rel} (${matchingIds.length} index supprime(s))`);
    } catch (e) {
      logger.error('[dossier-watcher] delete error:', e?.message || e);
    }
  };

  const cleanupMissingFiles = async (currentFiles = [], why) => {
    const currentFileSet = new Set(currentFiles.map((fileAbs) => normalizeFsPath(fileAbs)));
    const indexedDocs = await listIndexedDocs();

    const staleDocIds = indexedDocs
      .filter((doc) => !currentFileSet.has(normalizeFsPath(doc.filePath)))
      .map((doc) => doc._id);

    if (!staleDocIds.length) {
      if (why) logger.log(`[dossier-watcher] cleanup (${why}): 0 fichier stale`);
      return;
    }

    await Dossier.deleteMany({ _id: { $in: staleDocIds } });
    if (why) logger.log(`[dossier-watcher] cleanup (${why}): ${staleDocIds.length} fichier(s) stale supprime(s)`);
  };

  const rescan = async (why = 'rescan', options = {}) => {
    const strict = options.strict === true;
    try {
      if (fs.existsSync(rootAbs)) {
        const { files, hadReadError } = await walkFiles(rootAbs);
        logger.log(`[dossier-watcher] ${why}: ${files.length} fichier(s)`);
        await runUpserts(files, why);
        if (hadReadError) {
          const message = `Rescan incomplet: certains sous-dossiers de ${rootAbs} n'ont pas pu etre lus`;
          if (strict) {
            const error = new Error(message);
            error.statusCode = 409;
            throw error;
          }
          logger.warn(`[dossier-watcher] cleanup (${why}) skipped: some subfolders could not be read`);
        } else {
          await cleanupMissingFiles(files, why);
        }
        return {
          indexedCount: files.length,
          exactSyncApplied: !hadReadError,
        };
      } else {
        logger.warn(`[dossier-watcher] root folder introuvable: ${rootAbs}`);
        return {
          indexedCount: 0,
          exactSyncApplied: false,
        };
      }
    } catch (e) {
      logger.error(`[dossier-watcher] ${why} error:`, e?.message || e);
      throw e;
    }
  };

  const scheduleRescan = (why) => {
    if (!isActive) return;
    if (scheduledRescan) clearTimeout(scheduledRescan);
    scheduledRescan = setTimeout(() => {
      scheduledRescan = null;
      void rescan(why, { strict: false });
    }, 500);
  };

  const close = async () => {
    isActive = false;
    if (scheduledRescan) {
      clearTimeout(scheduledRescan);
      scheduledRescan = null;
    }
    if (watcher?.close) {
      await watcher.close();
    }
  };

  // Initial scan (best effort)
  await rescan('initial', { strict: false });

  const watcher = chokidar.watch(rootAbs, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 },
    ignored: [
      /(^|[\/\\])\../, // dotfiles
      /Thumbs\.db$/i,
    ],
  });

  watcher
    .on('add', (p) => upsertFile(p, 'add'))
    .on('change', (p) => upsertFile(p, 'change'))
    .on('unlink', (p) => deleteFile(p, 'unlink'))
    .on('addDir', (p) => {
      if (normalizeFsPath(p) !== normalizeFsPath(rootAbs)) scheduleRescan('addDir');
    })
    .on('unlinkDir', (p) => {
      if (normalizeFsPath(p) !== normalizeFsPath(rootAbs)) scheduleRescan('unlinkDir');
    })
    .on('error', (err) => logger.error('[dossier-watcher] chokidar error:', err?.message || err));

  logger.log(`[dossier-watcher] watching: ${rootAbs}`);
  return { watcher, upsertFile, deleteFile, rescan, rootAbs, close };
};

module.exports = { startDossierWatcher, parseFromRelativePath, escapeRegex };
