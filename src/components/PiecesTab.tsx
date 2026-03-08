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
  } catch  { /* no saved data */ }
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, color: '#f1f5f9' }}>Stock des Pièces de Rechange</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
            {pieces.length} pièces · {alerts} alerte{alerts !== 1 ? 's' : ''}
          </div>
        </div>
        <button onClick={() => setShowForm(true)} style={{
          background: '#3b82f6', border: 'none', borderRadius: 10,
          padding: '10px 18px', color: '#fff', cursor: 'pointer',
          fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Plus size={15} /> Ajouter une pièce
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{
          background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)',
          borderRadius: 14, padding: '20px 24px', marginBottom: 20,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Nouvelle pièce</span>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            {[
              { key: 'ref',      label: 'Référence',  placeholder: 'MRC-006' },
              { key: 'name',     label: 'Nom pièce',  placeholder: 'Nom de la pièce' },
              { key: 'stock',    label: 'Stock',      placeholder: '0' },
              { key: 'maxStock', label: 'Stock max',  placeholder: '5' },
              { key: 'seuil',    label: 'Seuil alerte', placeholder: '1' },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 5 }}>{f.label}</div>
                <input
                  value={(form as Record<string,string>)[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
                    padding: '8px 12px', color: '#e2e8f0', fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}
          </div>

          {/* File picker */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 5 }}>Fichier pièce (SolidWorks, PDF...)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => fileRef.current?.click()} style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8, padding: '8px 16px', color: '#94a3b8',
                cursor: 'pointer', fontSize: 13,
              }}>
                📂 Choisir un fichier
              </button>
              {fichier && <span style={{ fontSize: 13, color: '#22c55e' }}>✓ {fichier}</span>}
              <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={handleFile}
                accept=".sldprt,.sldasm,.stp,.step,.pdf,.dwg,.dxf,.stl" />
            </div>
          </div>

          <button onClick={ajouter} style={{
            background: '#3b82f6', border: 'none', borderRadius: 8,
            padding: '9px 20px', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>
            Ajouter
          </button>
        </div>
      )}

      {/* Pieces list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {pieces.map(p => {
          const st  = getStatus(p);
          const pct = Math.min(100, (p.stock / p.maxStock) * 100);
          const barColor = p.stock === 0 ? '#ef4444' : p.stock <= p.seuil ? '#f97316' : '#22c55e';

          return (
            <div key={p.id} style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 12, padding: '16px 20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600, marginBottom: 2 }}>{p.ref}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>{p.name}</div>
                  {p.fichier && (
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>📎 {p.fichier}</div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                    background: st.color + '18', border: `1px solid ${st.color}44`, color: st.color,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    {st.icon === 'ok'   && <CheckCircle size={12} />}
                    {st.icon === 'warn' && <AlertTriangle size={12} />}
                    {st.icon === 'x'    && <XCircle size={12} />}
                    {st.label}
                  </span>
                  <button onClick={() => utiliser(p.id)} disabled={p.stock === 0} style={{
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8, padding: '5px 14px', color: p.stock === 0 ? '#475569' : '#e2e8f0',
                    cursor: p.stock === 0 ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600,
                  }}>
                    Utiliser
                  </button>
                  <button onClick={() => supprimer(p.id)} style={{
                    background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 4,
                  }}>
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 3, transition: 'width 0.4s' }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: barColor, minWidth: 50, textAlign: 'right' }}>
                  {p.stock}<span style={{ color: '#475569', fontWeight: 400 }}>/{p.maxStock} pcs</span>
                </span>
              </div>

              {/* Seuil */}
              <div style={{ marginTop: 6, fontSize: 12, color: '#64748b', display: 'flex', gap: 12 }}>
                <span>Seuil: <strong style={{ color: '#94a3b8' }}>{p.seuil} pcs</strong></span>
                {p.stock === 0 && <span style={{ color: '#ef4444', fontWeight: 600 }}>⚠ RUPTURE DE STOCK</span>}
                {p.stock > 0 && p.stock <= p.seuil && <span style={{ color: '#f97316', fontWeight: 600 }}>⚠ Stock faible</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PiecesTab;