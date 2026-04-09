import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Eye, PencilLine, Trash2, X } from 'lucide-react';

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

  const [preview, setPreview] = useState<{ url: string; title: string; mimeType?: string } | null>(null);
  const [editingDoc, setEditingDoc] = useState<DossierDocument | null>(null);
  const [editForm, setEditForm] = useState({
    clientLastName: '',
    clientFirstName: '',
    projectName: '',
    pieceName: '',
    storageDate: '',
  });

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

  const handleDownload = async (id: string, filename: string) => {
    try {
      const res = await fetch(`${API}/dossiers/${id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await readJsonMaybe(res);
        throw new Error(data.message || 'Téléchargement impossible');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de téléchargement');
    }
  };

  const openPreview = async (doc: DossierDocument) => {
    try {
      setError('');
      setMessage('');

      const res = await fetch(`${API}/dossiers/${doc._id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await readJsonMaybe(res);
        throw new Error(data.message || 'Preview impossible');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      setPreview({ url, title: doc.originalName, mimeType: doc.mimeType });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur preview');
    }
  };

  const closePreview = () => {
    if (preview?.url) window.URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const handleDelete = async (id: string) => {
    try {
      setError('');
      const res = await fetch(`${API}/dossiers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await readJsonMaybe(res);
      if (!res.ok) throw new Error(data.message || 'Suppression impossible');
      setDocuments((prev) => prev.filter((d) => d._id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de suppression');
    }
  };

  const startEdit = (doc: DossierDocument) => {
    setEditingDoc(doc);
    setEditForm({
      clientLastName: doc.clientLastName || '',
      clientFirstName: doc.clientFirstName || '',
      projectName: doc.projectName || '',
      pieceName: doc.pieceName || '',
      storageDate: (doc.storageDate || '').slice(0, 10),
    });
  };

  const saveEdit = async () => {
    if (!editingDoc) return;
    try {
      setError('');
      setMessage('');
      const res = await fetch(`${API}/dossiers/${editingDoc._id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editForm),
      });
      const data = await readJsonMaybe(res);
      if (!res.ok) throw new Error(data.message || 'Mise à jour impossible');
      setDocuments((prev) => prev.map((d) => (d._id === editingDoc._id ? data : d)));
      setEditingDoc(null);
      setMessage('Métadonnées mises à jour.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de mise à jour');
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
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Recherche</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un client, projet, pièce, fichier..." style={inputStyle} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Projet</label>
            <select value={project} onChange={(e) => setProject(e.target.value)} style={inputStyle} title="Projet">
              <option value="">Tous les projets</option>
              {projectOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Client</label>
            <select value={client} onChange={(e) => setClient(e.target.value)} style={inputStyle} title="Client">
              <option value="">Tous les clients</option>
              {clientOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Pièce</label>
            <input value={piece} onChange={(e) => setPiece(e.target.value)} placeholder="Ex: Piece1" style={inputStyle} />
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

      {(message || error) && (        <div style={{
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
                  aria-expanded={!!expandedClients[c.key]}
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
                          aria-expanded={!!expandedProjects[p.key]}
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
                                  aria-expanded={!!expandedPieces[pi.key]}
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
                                      const mime = String(doc.mimeType || '');
                                      const extRaw = doc.originalName.includes('.') ? doc.originalName.split('.').pop() || '' : '';
                                      const ext = extRaw.trim().toUpperCase();
                                      const badge = mime === 'application/pdf' ? 'PDF' : mime.startsWith('image/') ? 'IMG' : (ext || 'FILE').slice(0, 4);

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
                                              <div style={{ color: 'white', fontWeight: 800, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.originalName}>
                                                {doc.originalName}
                                              </div>
                                              <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>
                                                {formatSize(doc.size)} | {formatDate(doc.storageDate)}
                                              </div>
                                            </div>
                                          </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
                                          {(doc.mimeType === 'application/pdf' || String(doc.mimeType || '').startsWith('image/')) && (
                                            <button
                                              onClick={() => openPreview(doc)}
                                              style={{
                                                width: 36,
                                                height: 34,
                                                borderRadius: 10,
                                                border: '1px solid rgba(255,255,255,0.10)',
                                                background: 'rgba(255,255,255,0.04)',
                                                color: '#e2e8f0',
                                                cursor: 'pointer',
                                              }}
                                              title="Voir"
                                              aria-label="Voir"
                                            >
                                              <Eye size={16} />
                                            </button>
                                          )}
                                          <button
                                            onClick={() => handleDownload(doc._id, doc.originalName)}
                                            style={{
                                              width: 36,
                                              height: 34,
                                              borderRadius: 10,
                                              border: '1px solid rgba(56,189,248,0.24)',
                                              background: 'rgba(56,189,248,0.10)',
                                              color: '#7dd3fc',
                                              cursor: 'pointer',
                                            }}
                                            title="Download"
                                            aria-label="Download"
                                          >
                                            <Download size={16} />
                                          </button>
                                          {role === 'admin' && (
                                            <button
                                              onClick={() => startEdit(doc)}
                                              style={{
                                                width: 36,
                                                height: 34,
                                                borderRadius: 10,
                                                border: '1px solid rgba(56,189,248,0.24)',
                                                background: 'rgba(56,189,248,0.08)',
                                                color: '#7dd3fc',
                                                cursor: 'pointer',
                                              }}
                                              title="Modifier"
                                              aria-label="Modifier"
                                            >
                                              <PencilLine size={16} />
                                            </button>
                                          )}
                                          {role === 'admin' && (
                                            <button
                                              onClick={() => handleDelete(doc._id)}
                                              style={{
                                                width: 36,
                                                height: 34,
                                                borderRadius: 10,
                                                border: '1px solid rgba(239,68,68,0.25)',
                                                background: 'rgba(239,68,68,0.08)',
                                                color: '#f87171',
                                                cursor: 'pointer',
                                              }}
                                              title="Supprimer"
                                              aria-label="Supprimer"
                                            >
                                              <Trash2 size={16} />
                                            </button>
                                          )}
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

      {preview && (
        <div
          onClick={closePreview}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 18,
            zIndex: 50,
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(1100px, 100%)',
              maxHeight: '92vh',
              overflow: 'hidden',
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(15,23,42,0.96)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ color: 'white', fontWeight: 800, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={preview.title}>
                {preview.title}
              </div>
              <button
                onClick={closePreview}
                style={{
                  width: 40,
                  height: 36,
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: 'rgba(255,255,255,0.04)',
                  color: '#e2e8f0',
                  cursor: 'pointer',
                }}
                aria-label="Fermer"
                title="Fermer"
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ height: 'calc(92vh - 58px)', maxHeight: 760, background: 'rgba(0,0,0,0.2)' }}>
              {preview.mimeType?.startsWith('image/') ? (
                <img src={preview.url} alt={preview.title} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
              ) : preview.mimeType === 'application/pdf' ? (
                <iframe title={preview.title} src={preview.url} style={{ width: '100%', height: '100%', border: 'none' }} />
              ) : (
                <div style={{ padding: 18, color: '#cbd5e1' }}>
                  Aperçu non supporté.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editingDoc && (
        <div
          onClick={() => setEditingDoc(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 18,
            zIndex: 60,
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(720px, 100%)',
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(15,23,42,0.96)',
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ color: 'white', fontWeight: 900 }}>Modifier métadonnées</div>
              <button
                onClick={() => setEditingDoc(null)}
                style={{
                  width: 40,
                  height: 36,
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: 'rgba(255,255,255,0.04)',
                  color: '#e2e8f0',
                  cursor: 'pointer',
                }}
                aria-label="Fermer"
                title="Fermer"
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Nom</label>
                <input value={editForm.clientLastName} onChange={(e) => setEditForm((p) => ({ ...p, clientLastName: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Prénom</label>
                <input value={editForm.clientFirstName} onChange={(e) => setEditForm((p) => ({ ...p, clientFirstName: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Projet</label>
                <input value={editForm.projectName} onChange={(e) => setEditForm((p) => ({ ...p, projectName: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Pièce</label>
                <input value={editForm.pieceName} onChange={(e) => setEditForm((p) => ({ ...p, pieceName: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Date de stockage</label>
                <input type="date" value={editForm.storageDate} onChange={(e) => setEditForm((p) => ({ ...p, storageDate: e.target.value }))} style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button
                onClick={() => setEditingDoc(null)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: 'rgba(255,255,255,0.04)',
                  color: '#e2e8f0',
                  cursor: 'pointer',
                  fontWeight: 800,
                }}
              >
                Annuler
              </button>
              <button
                onClick={saveEdit}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg,#0ea5e9,#22c55e)',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 900,
                }}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DossierPage;


