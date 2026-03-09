import React, { useState, useRef } from 'react';
import { Plus, X, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface Piece {
  id: string;
  ref: string;
  name: string;
  stock: number;
  maxStock: number;
  seuil: number;
  fichier?: string; // nom du fichier attaché
}

interface Props {
  machineId: string;
}

const STORAGE_KEY = (id: string) => `pieces_${id}`;

const defaultPieces: Record<string, Piece[]> = {
  rectifieuse: [
    { id: '1', ref: 'MRC-001', name: 'Meule abrasive 400mm',    stock: 3, maxStock: 5, seuil: 2 },
    { id: '2', ref: 'MRC-002', name: 'Roulement SKF 6205',       stock: 1, maxStock: 4, seuil: 2 },
    { id: '3', ref: 'MRC-003', name: 'Courroie trapézoïdale B68', stock: 4, maxStock: 6, seuil: 1 },
    { id: '4', ref: 'MRC-004', name: 'Filtre à huile 10µm',      stock: 0, maxStock: 4, seuil: 2 },
    { id: '5', ref: 'MRC-005', name: 'Joint d\'étanchéité',       stock: 2, maxStock: 3, seuil: 1 },
  ],
  compresseur: [
    { id: '1', ref: 'CMP-001', name: 'Filtre à air',              stock: 2, maxStock: 4, seuil: 1 },
    { id: '2', ref: 'CMP-002', name: 'Courroie trapézoïdale',     stock: 1, maxStock: 3, seuil: 1 },
    { id: '3', ref: 'CMP-003', name: 'Séparateur huile/air',      stock: 0, maxStock: 2, seuil: 1 },
    { id: '4', ref: 'CMP-004', name: 'Soupape de sécurité',       stock: 3, maxStock: 4, seuil: 1 },
  ],
};

const loadPieces = (machineId: string): Piece[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY(machineId));
    if (saved) return JSON.parse(saved);
  } catch { /* no saved data */ }
  return defaultPieces[machineId] || [];
};

const savePieces = (machineId: string, pieces: Piece[]) => {
  localStorage.setItem(STORAGE_KEY(machineId), JSON.stringify(pieces));
};

const getStatus = (p: Piece) => {
  if (p.stock === 0)           return { label: 'Rupture', color: '#ef4444', icon: 'x' };
  if (p.stock <= p.seuil)      return { label: 'Faible',  color: '#f97316', icon: 'warn' };
  return                              { label: 'OK',      color: '#22c55e', icon: 'ok' };
};

const PiecesTab: React.FC<Props> = ({ machineId }) => {
  const [pieces, setPieces]       = useState<Piece[]>(() => loadPieces(machineId));
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ ref: '', name: '', stock: '', maxStock: '', seuil: '' });
  const [fichier, setFichier]     = useState<string>('');
  const fileRef                   = useRef<HTMLInputElement>(null);

  const update = (next: Piece[]) => { setPieces(next); savePieces(machineId, next); };

  const utiliser = (id: string) => {
    update(pieces.map(p => p.id === id && p.stock > 0 ? { ...p, stock: p.stock - 1 } : p));
  };

  const supprimer = (id: string) => update(pieces.filter(p => p.id !== id));

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFichier(f.name);
  };

  const ajouter = () => {
    if (!form.name || !form.ref) return;
    const newPiece: Piece = {
      id: Date.now().toString(),
      ref: form.ref,
      name: form.name,
      stock: parseInt(form.stock) || 0,
      maxStock: parseInt(form.maxStock) || 1,
      seuil: parseInt(form.seuil) || 1,
      fichier: fichier || undefined,
    };
    update([...pieces, newPiece]);
    setForm({ ref: '', name: '', stock: '', maxStock: '', seuil: '' });
    setFichier('');
    setShowForm(false);
  };

  const alerts = pieces.filter(p => p.stock <= p.seuil).length;

  return (
    <div>
      {/* Header */}
      <div className="pt-header">
        <div>
          <div className="pt-header-title">Stock des Pièces de Rechange</div>
          <div className="pt-header-sub">
            {pieces.length} pièces · {alerts} alerte{alerts !== 1 ? 's' : ''}
          </div>
        </div>
        <button onClick={() => setShowForm(true)} className="pt-add-btn">
          <Plus size={15} /> Ajouter une pièce
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="pt-form">
          <div className="pt-form-header">
            <span className="pt-form-title">Nouvelle pièce</span>
            <button onClick={() => setShowForm(false)} title="Fermer" aria-label="Fermer" className="pt-form-close-btn">
              <X size={16} />
            </button>
          </div>
          <div className="pt-form-grid">
            {[
              { key: 'ref',      label: 'Référence',    placeholder: 'MRC-006' },
              { key: 'name',     label: 'Nom pièce',    placeholder: 'Nom de la pièce' },
              { key: 'stock',    label: 'Stock',        placeholder: '0' },
              { key: 'maxStock', label: 'Stock max',    placeholder: '5' },
              { key: 'seuil',    label: 'Seuil alerte', placeholder: '1' },
            ].map(f => (
              <div key={f.key}>
                <div className="pt-form-label">{f.label}</div>
                <input
                  value={(form as Record<string,string>)[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="pt-form-input"
                />
              </div>
            ))}
          </div>

          {/* File picker */}
          <div className="pt-file-section">
            <div className="pt-form-label">Fichier pièce (SolidWorks, PDF...)</div>
            <div className="pt-file-row">
              <button onClick={() => fileRef.current?.click()} className="pt-file-btn">
                📂 Choisir un fichier
              </button>
              {fichier && <span className="pt-file-name">✓ {fichier}</span>}
              <input ref={fileRef} type="file" className="pt-file-hidden" onChange={handleFile}
                title="Choisir un fichier" accept=".sldprt,.sldasm,.stp,.step,.pdf,.dwg,.dxf,.stl" />
            </div>
          </div>

          <button onClick={ajouter} className="pt-submit-btn">Ajouter</button>
        </div>
      )}

      {/* Pieces list */}
      <div className="pt-list">
        {pieces.map(p => {
          const st  = getStatus(p);
          const pct = Math.min(100, (p.stock / p.maxStock) * 100);
          const barColor = p.stock === 0 ? '#ef4444' : p.stock <= p.seuil ? '#f97316' : '#22c55e';

          return (
            <div key={p.id} className="pt-piece-card">
              <div className="pt-piece-top">
                <div>
                  <div className="pt-piece-ref">{p.ref}</div>
                  <div className="pt-piece-name">{p.name}</div>
                  {p.fichier && <div className="pt-piece-file">📎 {p.fichier}</div>}
                </div>
                <div className="pt-piece-actions">
                  <span className="pt-status-badge" style={{ background: st.color + '18', border: `1px solid ${st.color}44`, color: st.color }}>
                    {st.icon === 'ok'   && <CheckCircle size={12} />}
                    {st.icon === 'warn' && <AlertTriangle size={12} />}
                    {st.icon === 'x'    && <XCircle size={12} />}
                    {st.label}
                  </span>
                  <button onClick={() => utiliser(p.id)} disabled={p.stock === 0} className="pt-use-btn">
                    Utiliser
                  </button>
                  <button onClick={() => supprimer(p.id)} title="Supprimer" aria-label="Supprimer la pièce" className="pt-del-btn">
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div className="pt-bar-row">
                <div className="pt-bar-bg">
                  <div className="pt-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
                </div>
                <span className="pt-bar-count" style={{ color: barColor }}>
                  {p.stock}<span className="pt-bar-max">/{p.maxStock} pcs</span>
                </span>
              </div>

              <div className="pt-piece-footer">
                <span>Seuil: <strong style={{ color: '#94a3b8' }}>{p.seuil} pcs</strong></span>
                {p.stock === 0 && <span className="pt-rupture">⚠ RUPTURE DE STOCK</span>}
                {p.stock > 0 && p.stock <= p.seuil && <span className="pt-faible">⚠ Stock faible</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PiecesTab;