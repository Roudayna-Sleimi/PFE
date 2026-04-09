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

const isInsideRoot = (rootAbs, fileAbs) => {
  const root = path.resolve(rootAbs);
  const file = path.resolve(fileAbs);
  const rel = path.relative(root, file);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
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
  const queue = [dirAbs];
  while (queue.length) {
    const cur = queue.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
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
  return out;
};

/**
 * Starts a watcher that keeps the Dossier collection in sync with a folder.
 * - rootDir: absolute path to the watched folder (e.g. C:\data CNC CONCEPT)
 * - Dossier: mongoose model
 * - logger: console-like object
 */
const startDossierWatcher = async ({ rootDir, Dossier, logger = console }) => {
  const rootAbs = path.resolve(rootDir);

  const upsertFile = async (fileAbs, why) => {
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
        { upsert: true, new: true }
      );
      if (why) logger.log(`[dossier-watcher] upsert (${why}): ${rel}`);
    } catch (e) {
      logger.error('[dossier-watcher] upsert error:', e?.message || e);
    }
  };

  const deleteFile = async (fileAbs, why) => {
    if (!isInsideRoot(rootAbs, fileAbs)) return;
    const rel = path.relative(rootAbs, fileAbs);
    try {
      await Dossier.deleteOne({ filePath: fileAbs });
      if (why) logger.log(`[dossier-watcher] delete (${why}): ${rel}`);
    } catch (e) {
      logger.error('[dossier-watcher] delete error:', e?.message || e);
    }
  };

  const rescan = async (why = 'rescan') => {
    try {
      if (fs.existsSync(rootAbs)) {
        const files = await walkFiles(rootAbs);
        logger.log(`[dossier-watcher] ${why}: ${files.length} fichier(s)`);
        // Small concurrency without extra deps.
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
      } else {
        logger.warn(`[dossier-watcher] root folder introuvable: ${rootAbs}`);
      }
    } catch (e) {
      logger.error(`[dossier-watcher] ${why} error:`, e?.message || e);
    }
  };

  // Initial scan (best effort)
  await rescan('initial');

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
    .on('error', (err) => logger.error('[dossier-watcher] chokidar error:', err?.message || err));

  logger.log(`[dossier-watcher] watching: ${rootAbs}`);
  return { watcher, upsertFile, deleteFile, rescan, rootAbs };
};

module.exports = { startDossierWatcher, parseFromRelativePath, escapeRegex };
