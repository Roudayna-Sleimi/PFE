import React, { useEffect, useState } from 'react';
import { FileText, Upload, Calendar, User, Trash2, Download, FolderSearch } from 'lucide-react';

const API = 'http://localhost:5000/api';

interface DossierDocument {
  _id: string;
  originalName: string;
  clientLastName: string;
  clientFirstName: string;
  pieceName: string;
  storageDate: string;
  uploadedBy: string | null;
  createdAt: string;
  size: number;
}

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
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [client, setClient] = useState('');
  const [piece, setPiece] = useState('');
  const [date, setDate] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [form, setForm] = useState({
    clientLastName: '',
    clientFirstName: '',
    storageDate: '',
    pieceName: '',
  });

  const token = localStorage.getItem('token') || '';
  const role = localStorage.getItem('role') || 'user';

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (client.trim()) params.set('client', client.trim());
      if (piece.trim()) params.set('piece', piece.trim());
      if (date) params.set('date', date);

      const url = `${API}/dossiers${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Impossible de charger les documents');
      setDocuments(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [search, client, piece, date]);

  const handlePickFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    setSelectedFiles(Array.from(files));
    setMessage('');
    setError('');
  };

  const handleUpload = async () => {
    if (
      !form.clientLastName.trim() ||
      !form.clientFirstName.trim() ||
      !form.storageDate ||
      !form.pieceName.trim()
    ) {
      setError('Remplissez tous les champs du formulaire avant Upload.');
      return;
    }
    if (selectedFiles.length === 0) {
      setError('Selectionnez au moins un fichier PDF.');
      return;
    }

    try {
      setUploading(true);
      setMessage('');
      setError('');

      const formData = new FormData();
      formData.append('clientLastName', form.clientLastName.trim());
      formData.append('clientFirstName', form.clientFirstName.trim());
      formData.append('storageDate', form.storageDate);
      formData.append('pieceName', form.pieceName.trim());
      selectedFiles.forEach((file) => formData.append('documents', file));

      const res = await fetch(`${API}/dossiers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Upload impossible');

      setMessage(`${data.length || selectedFiles.length} fichier(s) enregistre(s) avec succes.`);
      setSelectedFiles([]);
      setForm({ clientLastName: '', clientFirstName: '', storageDate: '', pieceName: '' });
      fetchDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur pendant l upload');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (id: string, filename: string) => {
    try {
      const res = await fetch(`${API}/dossiers/${id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Telechargement impossible');
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de telechargement');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setError('');
      const res = await fetch(`${API}/dossiers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Suppression impossible');
      setDocuments((prev) => prev.filter((doc) => doc._id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de suppression');
    }
  };

  const cardStyle: React.CSSProperties = {
    background: 'rgba(15,23,42,0.72)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(15,23,42,0.82)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: '11px 14px',
    color: 'white',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ flex: 1, padding: 24, overflowY: 'auto', minWidth: 0, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'white' }}>Dossier</h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b', maxWidth: 720 }}>
            Enregistrez vos PDF avec les informations client et piece. Ces donnees serviront ensuite a l auto-completion en Production.
          </p>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: 18, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Nom du client *</label>
            <input
              value={form.clientLastName}
              onChange={(e) => setForm((p) => ({ ...p, clientLastName: e.target.value }))}
              placeholder="Ex: Ben Salah"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Prenom du client *</label>
            <input
              value={form.clientFirstName}
              onChange={(e) => setForm((p) => ({ ...p, clientFirstName: e.target.value }))}
              placeholder="Ex: Ali"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Date de stockage *</label>
<label htmlFor="storageDate" style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
  Date de stockage *
</label>

<input
  id="storageDate"
  type="date"
  value={form.storageDate}
  onChange={(e) => setForm((p) => ({ ...p, storageDate: e.target.value }))}
  style={inputStyle}
/>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Nom de la piece *</label>
            <input
              value={form.pieceName}
              onChange={(e) => setForm((p) => ({ ...p, pieceName: e.target.value }))}
              placeholder="Ex: Engrenage 50mm"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 10,
            cursor: uploading ? 'progress' : 'pointer',
            background: 'rgba(56,189,248,0.12)',
            border: '1px solid rgba(56,189,248,0.3)',
            color: '#7dd3fc',
            fontWeight: 700,
            fontSize: 13,
          }}>
            <Upload size={16} />
            Selectionner PDF
            <input type="file" multiple accept="application/pdf" onChange={handlePickFiles} style={{ display: 'none' }} disabled={uploading} />
          </label>

          <button
            onClick={handleUpload}
            disabled={uploading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              cursor: uploading ? 'progress' : 'pointer',
              background: 'linear-gradient(135deg,#0ea5e9,#22c55e)',
              color: 'white',
              fontWeight: 700,
              fontSize: 13,
              opacity: uploading ? 0.75 : 1,
            }}
          >
            <Upload size={15} />
            {uploading ? 'Upload en cours...' : 'Upload'}
          </button>

          <span style={{ color: '#94a3b8', fontSize: 12 }}>
            {selectedFiles.length > 0 ? `${selectedFiles.length} fichier(s) selectionne(s)` : 'Aucun fichier selectionne'}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 14, marginBottom: 22 }}>
        {[
          { label: 'Documents', value: documents.length, icon: <FolderSearch size={18} color="#38bdf8" />, color: '#38bdf8' },
          { label: 'Clients', value: new Set(documents.map((doc) => `${doc.clientLastName} ${doc.clientFirstName}`.trim()).filter(Boolean)).size, icon: <User size={18} color="#22c55e" />, color: '#22c55e' },
          { label: 'Pieces', value: new Set(documents.map((doc) => doc.pieceName).filter(Boolean)).size, icon: <FileText size={18} color="#f59e0b" />, color: '#f59e0b' },
          { label: 'Date de stockage', value: documents.length ? formatDate(documents[0].storageDate) : '-', icon: <Calendar size={18} color="#a78bfa" />, color: '#a78bfa' },
        ].map((item) => (
          <div key={item.label} style={{ ...cardStyle, padding: '18px 20px' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `${item.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              {item.icon}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: item.color, wordBreak: 'break-word' }}>{item.value}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{item.label}</div>
          </div>
        ))}
      </div>

      <div style={{ ...cardStyle, padding: 18, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Recherche globale</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Client, piece, nom du fichier..." style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Client</label>
            <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Nom ou prenom" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Piece</label>
            <input value={piece} onChange={(e) => setPiece(e.target.value)} placeholder="Ex: Engrenage" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Date de stockage</label>
            <div style={{ position: 'relative' }}>
              <Calendar size={14} color="#64748b" style={{ position: 'absolute', left: 12, top: 12 }} />
<label
  htmlFor="filterDate"
  style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}
>
  Date de stockage
</label>

<div style={{ position: 'relative' }}>
  <Calendar size={14} color="#64748b" style={{ position: 'absolute', left: 12, top: 12 }} />
  <input
    id="filterDate"
    type="date"
    value={date}
    onChange={(e) => setDate(e.target.value)}
    style={{ ...inputStyle, paddingLeft: 34 }}
  />
</div>            </div>
          </div>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 16 }}>
        {loading ? (
          <div style={{ ...cardStyle, padding: '42px 18px', textAlign: 'center', color: '#64748b', gridColumn: '1/-1' }}>
            Chargement des documents...
          </div>
        ) : documents.length === 0 ? (
          <div style={{ ...cardStyle, padding: '48px 18px', textAlign: 'center', color: '#64748b', gridColumn: '1/-1' }}>
            Aucun document trouve.
          </div>
        ) : documents.map((doc) => (
          <div key={doc._id} style={{ ...cardStyle, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
                <div style={{
                  width: 46,
                  height: 46,
                  flexShrink: 0,
                  borderRadius: 14,
                  background: 'linear-gradient(135deg,rgba(14,165,233,0.18),rgba(34,197,94,0.18))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <FileText size={20} color="#38bdf8" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'white', fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.originalName}</div>
                  <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                    Ajoute par {doc.uploadedBy || 'Utilisateur'} | {formatSize(doc.size)}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '12px 13px' }}>
                <div style={{ color: '#64748b', fontSize: 11, marginBottom: 5 }}>Client</div>
                <div style={{ color: 'white', fontSize: 13, fontWeight: 600 }}>{`${doc.clientLastName} ${doc.clientFirstName}`.trim()}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '12px 13px' }}>
                <div style={{ color: '#64748b', fontSize: 11, marginBottom: 5 }}>Piece</div>
                <div style={{ color: 'white', fontSize: 13, fontWeight: 600 }}>{doc.pieceName}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '12px 13px' }}>
                <div style={{ color: '#64748b', fontSize: 11, marginBottom: 5 }}>Date de stockage</div>
                <div style={{ color: 'white', fontSize: 13, fontWeight: 600 }}>{formatDate(doc.storageDate)}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '12px 13px' }}>
                <div style={{ color: '#64748b', fontSize: 11, marginBottom: 5 }}>Date d ajout</div>
                <div style={{ color: 'white', fontSize: 13, fontWeight: 600 }}>{new Date(doc.createdAt).toLocaleDateString('fr-FR')}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
              <button
                onClick={() => handleDownload(doc._id, doc.originalName)}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(56,189,248,0.24)',
                  background: 'rgba(56,189,248,0.1)',
                  color: '#7dd3fc',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Download size={15} />
                Ouvrir le PDF
              </button>
              {role === 'admin' && (
                <button
                  onClick={() => handleDelete(doc._id)}
                  style={{
                    width: 44,
                    height: 40,
                    borderRadius: 10,
                    border: '1px solid rgba(239,68,68,0.25)',
                    background: 'rgba(239,68,68,0.08)',
                    color: '#f87171',
                    cursor: 'pointer',
                  }}
                  title="Supprimer le document"
                  aria-label="Supprimer le document"
                >
                  <Trash2 size={15} style={{ marginTop: 2 }} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DossierPage;
