import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

const API = 'http://localhost:5000/api';

interface DossierDocument {
  _id: string;
  originalName: string;
  mimeType?: string;
  clientLastName: string;
  clientFirstName: string;
  projectName?: string;
  pieceName: string;
  storageDate: string;
  uploadedBy: string | null;
  createdAt: string;
  size: number;
  publicPath?: string;
}

type WatcherStatus = {
  running: boolean;
  watchDir: string;
  exists?: boolean;
  mongoConnected?: boolean;
  indexedCount?: number;
  message?: string;
};

const readJsonMaybe = async (res: Response) => {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return await res.json();
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    const msg = String(text || '').replace(/\s+/g, ' ').trim();
    return { message: msg.length > 220 ? `${msg.slice(0, 220)}...` : msg };
  }
};

const formatDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Date invalide' : parsed.toLocaleDateString('fr-FR');
};

const formatSize = (size: number) => {
  if (!size) return '0 Ko';
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(2)} Mo`;
};

const displayMimeByExt: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  ico: 'image/x-icon',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

const cadExtensions = new Set(['stp', 'step', 'sldasm', 'sldprt', 'slddrw', 'igs', 'iges', 'dxf', 'dwg']);

const getFileExtension = (filename = '') => {
  const ext = filename.includes('.') ? filename.split('.').pop() || '' : '';
  return ext.trim().toLowerCase();
};

const getDisplayMimeType = (doc: DossierDocument) => {
  const ext = getFileExtension(doc.originalName);
  if (displayMimeByExt[ext]) return displayMimeByExt[ext];
  if (doc.mimeType && doc.mimeType !== 'application/octet-stream') return doc.mimeType;
  return 'application/octet-stream';
};

const getFileBadge = (doc: DossierDocument) => {
  const ext = getFileExtension(doc.originalName);
  const mime = String(doc.mimeType || '');
  if (ext === 'pdf' || mime === 'application/pdf') return 'PDF';
  if (displayMimeByExt[ext]?.startsWith('image/') || mime.startsWith('image/')) return 'IMG';
  if (cadExtensions.has(ext)) return '3D';
  return (ext || 'FILE').slice(0, 4).toUpperCase();
};

const canPreviewInBrowser = (doc: DossierDocument) => {
  const mimeType = getDisplayMimeType(doc);
  return mimeType === 'application/pdf' || mimeType.startsWith('image/');
};

const renderDocumentWindow = (popup: Window, doc: DossierDocument, url: string | null) => {
  const mimeType = getDisplayMimeType(doc);
  const ext = getFileExtension(doc.originalName).toUpperCase() || 'FILE';
  const isPreviewable = canPreviewInBrowser(doc);
  const docBody = popup.document.body;

  popup.document.title = doc.originalName;
  docBody.replaceChildren();
  docBody.style.margin = '0';
  docBody.style.minHeight = '100vh';
  docBody.style.background = '#020617';
  docBody.style.color = '#e2e8f0';
  docBody.style.fontFamily = 'Arial, sans-serif';

  const shell = popup.document.createElement('div');
  shell.style.minHeight = '100vh';
  shell.style.display = 'flex';
  shell.style.flexDirection = 'column';

  const header = popup.document.createElement('div');
  header.style.padding = '12px 16px';
  header.style.borderBottom = '1px solid rgba(255,255,255,0.10)';
  header.style.background = '#0f172a';
  header.style.fontSize = '13px';
  header.style.fontWeight = '700';
  header.style.overflow = 'hidden';
  header.style.textOverflow = 'ellipsis';
  header.style.whiteSpace = 'nowrap';
  header.textContent = doc.originalName;

  const content = popup.document.createElement('div');
  content.style.flex = '1';
  content.style.minHeight = '0';
  content.style.display = 'flex';
  content.style.alignItems = 'center';
  content.style.justifyContent = 'center';

  shell.appendChild(header);
  shell.appendChild(content);
  docBody.appendChild(shell);

  if (isPreviewable && url && mimeType.startsWith('image/')) {
    const image = popup.document.createElement('img');
    image.src = url;
    image.alt = doc.originalName;
    image.style.maxWidth = '100%';
    image.style.maxHeight = 'calc(100vh - 48px)';
    image.style.objectFit = 'contain';
    image.onerror = () => {
      content.replaceChildren();
      const message = popup.document.createElement('div');
      message.style.padding = '24px';
      message.style.textAlign = 'center';
      message.textContent = 'Apercu image non supporte par ce navigateur.';
      content.appendChild(message);
    };
    content.appendChild(image);
    return;
  }

  if (isPreviewable && url && mimeType === 'application/pdf') {
    const frame = popup.document.createElement('iframe');
    frame.title = doc.originalName;
    frame.src = url;
    frame.style.width = '100%';
    frame.style.height = 'calc(100vh - 48px)';
    frame.style.border = 'none';
    content.appendChild(frame);
    return;
  }

  const panel = popup.document.createElement('div');
  panel.style.maxWidth = '520px';
  panel.style.padding = '28px';
  panel.style.textAlign = 'center';
  panel.style.border = '1px solid rgba(255,255,255,0.10)';
  panel.style.background = '#0f172a';
  panel.style.borderRadius = '8px';

  const badge = popup.document.createElement('div');
  badge.style.margin = '0 auto 14px';
  badge.style.width = '72px';
  badge.style.height = '72px';
  badge.style.display = 'grid';
  badge.style.placeItems = 'center';
  badge.style.border = '1px solid rgba(125,211,252,0.28)';
  badge.style.borderRadius = '8px';
  badge.style.color = '#7dd3fc';
  badge.style.fontWeight = '900';
  badge.textContent = cadExtensions.has(ext.toLowerCase()) ? '3D' : ext;

  const title = popup.document.createElement('div');
  title.style.fontSize = '16px';
  title.style.fontWeight = '800';
  title.style.marginBottom = '8px';
  title.textContent = doc.originalName;

  const hint = popup.document.createElement('div');
  hint.style.color = '#94a3b8';
  hint.style.fontSize = '13px';
  hint.style.lineHeight = '1.5';
  hint.textContent = cadExtensions.has(ext.toLowerCase())
    ? 'Apercu CAD non disponible dans le navigateur sans viewer/converter. Aucun telechargement lance.'
    : 'Apercu non disponible pour ce type de fichier. Aucun telechargement lance.';

  panel.appendChild(badge);
  panel.appendChild(title);
  panel.appendChild(hint);
  content.appendChild(panel);
};

const expandedAria = (expanded: boolean): Pick<React.AriaAttributes, 'aria-expanded'> => ({
  'aria-expanded': expanded ? 'true' : 'false',
});

const DossierPage: React.FC = () => {
  const [documents, setDocuments] = useState<DossierDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [client, setClient] = useState('');
  const [piece, setPiece] = useState('');
  const [project, setProject] = useState('');

  const [clientOptions, setClientOptions] = useState<string[]>([]);
  const [projectOptions, setProjectOptions] = useState<string[]>([]);
  const [watcherStatus, setWatcherStatus] = useState<WatcherStatus | null>(null);

  const token = localStorage.getItem('token') || '';
  const role = localStorage.getItem('role') || 'user';

  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [expandedPieces, setExpandedPieces] = useState<Record<string, boolean>>({});

  const cardStyle: React.CSSProperties = useMemo(() => ({
    background: 'rgba(15,23,42,0.72)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
  }), []);

  const inputStyle: React.CSSProperties = useMemo(() => ({
    width: '100%',
    background: 'rgba(15,23,42,0.82)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: '11px 14px',
    color: 'white',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  }), []);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (client.trim()) params.set('client', client.trim());
      if (piece.trim()) params.set('piece', piece.trim());
      if (project.trim()) params.set('project', project.trim());

      const url = `${API}/dossiers${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await readJsonMaybe(res);
      if (!res.ok) throw new Error(data.message || 'Impossible de charger les documents');
      setDocuments(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [search, client, piece, project, token]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [clientsRes, projectsRes] = await Promise.all([
          fetch(`${API}/dossiers/clients`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/dossiers/projects`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const clientsData = await readJsonMaybe(clientsRes);
        const projectsData = await readJsonMaybe(projectsRes);
        if (clientsRes.ok && Array.isArray(clientsData)) setClientOptions(clientsData);
        if (projectsRes.ok && Array.isArray(projectsData)) setProjectOptions(projectsData);
      } catch {
        // optional
      }
    };
    loadOptions();
  }, [token]);

  useEffect(() => {
    const loadWatcher = async () => {
      try {
        const res = await fetch(`${API}/dossiers/watcher-status`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await readJsonMaybe(res);
        if (res.ok) setWatcherStatus(data);
        else setWatcherStatus({ running: false, watchDir: '', message: data.message || 'Watcher status indisponible' });
      } catch (e) {
        setWatcherStatus({ running: false, watchDir: '', message: e instanceof Error ? e.message : 'Watcher status indisponible' });
      }
    };
    loadWatcher();
  }, [token]);

  const triggerRescan = async () => {
    try {
      setError('');
      setMessage('');
      const res = await fetch(`${API}/dossiers/rescan`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await readJsonMaybe(res);
      if (!res.ok) throw new Error(data.message || 'Rescan impossible');
      setMessage('Rescan lancé.');
      // refresh status + list
      try {
        const st = await fetch(`${API}/dossiers/watcher-status`, { headers: { Authorization: `Bearer ${token}` } });
        const stData = await readJsonMaybe(st);
        if (st.ok) setWatcherStatus(stData);
      } catch {
        // ignore
      }
      fetchDocuments();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur rescan');
    }
  };

  const openDocument = async (doc: DossierDocument) => {
    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      setError('Fenetre bloquee par le navigateur. Autorisez les popups pour ouvrir le fichier.');
      return;
    }
    popup.opener = null;
    popup.document.title = doc.originalName;
    popup.document.body.style.margin = '0';
    popup.document.body.style.minHeight = '100vh';
    popup.document.body.style.display = 'grid';
    popup.document.body.style.placeItems = 'center';
    popup.document.body.style.background = '#0f172a';
    popup.document.body.style.color = '#e2e8f0';
    popup.document.body.style.fontFamily = 'Arial, sans-serif';
    const loadingText = popup.document.createElement('p');
    loadingText.textContent = `Ouverture de ${doc.originalName}...`;
    popup.document.body.appendChild(loadingText);

    if (!canPreviewInBrowser(doc)) {
      renderDocumentWindow(popup, doc, null);
      return;
    }

    try {
      setError('');
      setMessage('');

      const res = await fetch(`${API}/dossiers/${doc._id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await readJsonMaybe(res);
        throw new Error(data.message || 'Ouverture impossible');
      }

      const rawBlob = await res.blob();
      const mimeType = getDisplayMimeType(doc);
      const blob = rawBlob.type === mimeType ? rawBlob : new Blob([rawBlob], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      renderDocumentWindow(popup, doc, url);
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      popup.close();
      setError(e instanceof Error ? e.message : 'Erreur ouverture fichier');
    }
  };

  const tree = useMemo(() => {
    type PieceNode = { key: string; label: string; docs: DossierDocument[] };
    type ProjectNode = { key: string; label: string; pieces: PieceNode[]; count: number };
    type ClientNode = { key: string; label: string; projects: ProjectNode[]; count: number };

    const clients = new Map<string, { label: string; projects: Map<string, { label: string; pieces: Map<string, { label: string; docs: DossierDocument[] }> }> }>();

    const normKey = (v: string) => String(v || '').trim().toLowerCase();

    for (const doc of documents) {
      const clientLabel = `${doc.clientLastName} ${doc.clientFirstName}`.trim() || 'Inconnu';
      const projectLabel = String(doc.projectName || '').trim() || 'Sans projet';
      const pieceLabel = String(doc.pieceName || '').trim() || 'Sans pièce';

      const cKey = normKey(clientLabel) || 'inconnu';
      const pKey = `${cKey}::${normKey(projectLabel) || 'sans-projet'}`;
      const piKey = `${pKey}::${normKey(pieceLabel) || 'sans-piece'}`;

      const c = clients.get(cKey) || { label: clientLabel, projects: new Map() };
      clients.set(cKey, c);

      const p = c.projects.get(pKey) || { label: projectLabel, pieces: new Map() };
      c.projects.set(pKey, p);

      const pi = p.pieces.get(piKey) || { label: pieceLabel, docs: [] as DossierDocument[] };
      p.pieces.set(piKey, pi);

      pi.docs.push(doc);
    }

    const out: ClientNode[] = Array.from(clients.entries())
      .map(([cKey, c]) => {
        const projects: ProjectNode[] = Array.from(c.projects.entries())
          .map(([pKey, p]) => {
            const pieces: PieceNode[] = Array.from(p.pieces.entries())
              .map(([piKey, pi]) => ({
                key: piKey,
                label: pi.label,
                docs: [...pi.docs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
              }))
              .sort((a, b) => a.label.localeCompare(b.label));

            const count = pieces.reduce((acc, x) => acc + x.docs.length, 0);
            return { key: pKey, label: p.label, pieces, count };
          })
          .sort((a, b) => a.label.localeCompare(b.label));

        const count = projects.reduce((acc, x) => acc + x.count, 0);
        return { key: cKey, label: c.label, projects, count };
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    return out;
  }, [documents]);

  const toggleClient = (key: string) => setExpandedClients((p) => ({ ...p, [key]: !p[key] }));
  const toggleProject = (key: string) => setExpandedProjects((p) => ({ ...p, [key]: !p[key] }));
  const togglePiece = (key: string) => setExpandedPieces((p) => ({ ...p, [key]: !p[key] }));

  useEffect(() => {
    if (tree.length === 0) return;

    setExpandedClients((prev) => {
      let changed = false;
      const next = { ...prev };
      tree.forEach((clientNode) => {
        if (next[clientNode.key] === undefined) {
          next[clientNode.key] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    setExpandedProjects((prev) => {
      let changed = false;
      const next = { ...prev };
      tree.forEach((clientNode) => {
        clientNode.projects.forEach((projectNode) => {
          if (next[projectNode.key] === undefined) {
            next[projectNode.key] = true;
            changed = true;
          }
        });
      });
      return changed ? next : prev;
    });

    setExpandedPieces((prev) => {
      let changed = false;
      const next = { ...prev };
      tree.forEach((clientNode) => {
        clientNode.projects.forEach((projectNode) => {
          projectNode.pieces.forEach((pieceNode) => {
            if (next[pieceNode.key] === undefined) {
              next[pieceNode.key] = true;
              changed = true;
            }
          });
        });
      });
      return changed ? next : prev;
    });
  }, [tree]);

  return (
    <div style={{ flex: 1, padding: 24, overflowY: 'auto', minWidth: 0, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'white' }}>Dossier</h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b', maxWidth: 900 }}>
            Synchronisation automatique côté serveur depuis <span style={{ color: '#cbd5e1', fontWeight: 700 }}>DOSSIER_WATCH_DIR</span>. Aucun upload manuel.
          </p>
        </div>
      </div>

      {watcherStatus && (
        <div
          style={{
            ...cardStyle,
            padding: '12px 16px',
            marginBottom: 18,
            borderColor: watcherStatus.running ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.22)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ color: watcherStatus.running ? '#86efac' : '#fca5a5', fontSize: 12 }}>
            {watcherStatus.running ? 'Watcher: ON' : 'Watcher: OFF'}
            {watcherStatus.watchDir ? ` | Dir: ${watcherStatus.watchDir}` : ''}
            {typeof watcherStatus.exists === 'boolean' ? ` | Exists: ${watcherStatus.exists ? 'yes' : 'no'}` : ''}
            {typeof watcherStatus.indexedCount === 'number' ? ` | Indexed: ${watcherStatus.indexedCount}` : ''}
            {watcherStatus.message ? ` | ${watcherStatus.message}` : ''}
          </div>
          {role === 'admin' && (
            <button
              onClick={triggerRescan}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.10)',
                background: 'rgba(255,255,255,0.04)',
                color: '#e2e8f0',
                cursor: 'pointer',
                fontWeight: 900,
                fontSize: 12,
              }}
              title="Forcer un rescan du répertoire"
            >
              Rescan
            </button>
          )}
        </div>
      )}
      <div style={{ ...cardStyle, padding: 18, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
          <div>
            <label htmlFor="dossier-search" style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Recherche</label>
            <input
              id="dossier-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un client, projet, pièce, fichier..."
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 12 }}>
          <div>
            <label htmlFor="dossier-project-filter" style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Projet</label>
            <select id="dossier-project-filter" value={project} onChange={(e) => setProject(e.target.value)} style={inputStyle} title="Projet">
              <option value="">Tous les projets</option>
              {projectOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dossier-client-filter" style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Client</label>
            <select id="dossier-client-filter" value={client} onChange={(e) => setClient(e.target.value)} style={inputStyle} title="Client">
              <option value="">Tous les clients</option>
              {clientOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dossier-piece-filter" style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Pièce</label>
            <input
              id="dossier-piece-filter"
              value={piece}
              onChange={(e) => setPiece(e.target.value)}
              placeholder="Ex: Piece1"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => {
              setSearch('');
              setClient('');
              setProject('');
              setPiece('');
            }}
            style={{
              height: 40,
              padding: '0 14px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.04)',
              color: '#e2e8f0',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: 12,
            }}
            title="Réinitialiser"
          >
            Reset
          </button>
        </div>
      </div>

      {(message || error) && (
        <div style={{
          ...cardStyle,
          padding: '12px 16px',
          marginBottom: 18,
          borderColor: error ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)',
          color: error ? '#fca5a5' : '#86efac',
        }}>
          {error || message}
        </div>
      )}

      <div style={{ ...cardStyle, padding: 14 }}>
        {loading ? (
          <div style={{ padding: '28px 6px', color: '#64748b' }}>Chargement...</div>
        ) : tree.length === 0 ? (
          <div style={{ padding: '28px 6px', color: '#64748b' }}>Aucun document.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {tree.map((c) => (
              <div key={c.key} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
                <button
                  onClick={() => toggleClient(c.key)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: 'rgba(255,255,255,0.03)',
                    border: 'none',
                    color: 'white',
                    cursor: 'pointer',
                    padding: '12px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    fontWeight: 900,
                  }}
                  title="Afficher/masquer"
                  {...expandedAria(Boolean(expandedClients[c.key]))}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    {expandedClients[c.key] ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronRight size={16} color="#94a3b8" />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                  </span>
                  <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 800 }}>{c.count} fichier(s)</span>
                </button>

                {expandedClients[c.key] && (
                  <div style={{ padding: 12, display: 'grid', gap: 10 }}>
                    {c.projects.map((p) => (
                      <div key={p.key} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden', marginLeft: 12 }}>
                        <button
                          onClick={() => toggleProject(p.key)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            background: 'rgba(15,23,42,0.40)',
                            border: 'none',
                            color: '#e2e8f0',
                            cursor: 'pointer',
                            padding: '10px 12px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 12,
                            fontWeight: 800,
                          }}
                          title="Afficher/masquer"
                          {...expandedAria(Boolean(expandedProjects[p.key]))}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            {expandedProjects[p.key] ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronRight size={16} color="#94a3b8" />}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
                          </span>
                          <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 800 }}>{p.count}</span>
                        </button>

                        {expandedProjects[p.key] && (
                          <div style={{ padding: 10, display: 'grid', gap: 10 }}>
                            {p.pieces.map((pi) => (
                              <div key={pi.key} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden', marginLeft: 12 }}>
                                <button
                                  onClick={() => togglePiece(pi.key)}
                                  style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    background: 'rgba(255,255,255,0.02)',
                                    border: 'none',
                                    color: '#cbd5e1',
                                    cursor: 'pointer',
                                    padding: '10px 12px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: 12,
                                    fontWeight: 800,
                                  }}
                                  title="Afficher/masquer"
                                  {...expandedAria(Boolean(expandedPieces[pi.key]))}
                                >
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                    {expandedPieces[pi.key] ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronRight size={16} color="#94a3b8" />}
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pi.label}</span>
                                  </span>
                                  <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 800 }}>{pi.docs.length}</span>
                                </button>

                                {expandedPieces[pi.key] && (
                                  <div style={{ padding: 10, display: 'grid', gap: 8 }}>
                                    {pi.docs.map((doc) => {
                                      const badge = getFileBadge(doc);

                                      return (
                                        <div
                                          key={doc._id}
                                          style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            gap: 12,
                                            alignItems: 'center',
                                            padding: '10px 10px',
                                            borderRadius: 12,
                                            border: '1px solid rgba(255,255,255,0.06)',
                                            background: 'rgba(255,255,255,0.02)',
                                          }}
                                        >
                                        <div style={{ minWidth: 0 }}>
                                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                                            <div style={{ width: 34, height: 34, borderRadius: 12, background: 'rgba(56,189,248,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                              <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.6, color: '#7dd3fc' }}>{badge}</span>
                                            </div>
                                            <div style={{ minWidth: 0 }}>
                                              <div
                                                onDoubleClick={() => openDocument(doc)}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    openDocument(doc);
                                                  }
                                                }}
                                                role="button"
                                                tabIndex={0}
                                                style={{ color: 'white', fontWeight: 800, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                                                title="Double clic pour ouvrir"
                                                aria-label={`Ouvrir ${doc.originalName}`}
                                              >
                                                {doc.originalName}
                                              </div>
                                              <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>
                                                {formatSize(doc.size)} | {formatDate(doc.storageDate)}
                                              </div>
                                            </div>
                                          </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
                                          <button
                                            onClick={() => openDocument(doc)}
                                            style={{
                                              height: 34,
                                              padding: '0 12px',
                                              borderRadius: 10,
                                              border: '1px solid rgba(56,189,248,0.24)',
                                              background: 'rgba(56,189,248,0.10)',
                                              color: '#7dd3fc',
                                              cursor: 'pointer',
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: 6,
                                              fontWeight: 900,
                                              fontSize: 12,
                                            }}
                                            title="Ouvrir dans une autre fenetre"
                                            aria-label={`Ouvrir ${doc.originalName}`}
                                          >
                                            <ExternalLink size={15} />
                                            Ouvrir
                                          </button>
                                        </div>
                                      </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DossierPage;


