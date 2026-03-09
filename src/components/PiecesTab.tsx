import React, { useState, useRef } from 'react';
import { Plus, X, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface Piece {
  id: string; ref: string; name: string;
  stock: number; maxStock: number; seuil: number; fichier?: string;
}
interface Props { machineId: string; }

const STORAGE_KEY = (id: string) => `pieces_${id}`;

const defaultPieces: Record<string, Piece[]> = {
  rectifieuse: [
    { id: '1', ref: 'MRC-001', name: 'Meule abrasive 400mm',     stock: 3, maxStock: 5, seuil: 2 },
    { id: '2', ref: 'MRC-002', name: 'Roulement SKF 6205',        stock: 1, maxStock: 4, seuil: 2 },
    { id: '3', ref: 'MRC-003', name: 'Courroie trapézoïdale B68', stock: 4, maxStock: 6, seuil: 1 },
    { id: '4', ref: 'MRC-004', name: 'Filtre à huile 10µm',       stock: 0, maxStock: 4, seuil: 2 },
    { id: '5', ref: 'MRC-005', name: "Joint d'étanchéité",        stock: 2, maxStock: 3, seuil: 1 },
  ],
  compresseur: [
    { id: '1', ref: 'CMP-001', name: 'Filtre à air',           stock: 2, maxStock: 4, seuil: 1 },
    { id: '2', ref: 'CMP-002', name: 'Courroie trapézoïdale',  stock: 1, maxStock: 3, seuil: 1 },
    { id: '3', ref: 'CMP-003', name: 'Séparateur huile/air',   stock: 0, maxStock: 2, seuil: 1 },
    { id: '4', ref: 'CMP-004', name: 'Soupape de sécurité',    stock: 3, maxStock: 4, seuil: 1 },
  ],
};

const loadPieces = (machineId: string): Piece[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY(machineId));
    if (saved) return JSON.parse(saved);
  } catch  { /* no saved data */ }
  return defaultPieces[machineId] || [];
};
const savePieces = (machineId: string, pieces: Piece[]) =>
  localStorage.setItem(STORAGE_KEY(machineId), JSON.stringify(pieces));

const getStatus = (p: Piece) => {
  if (p.stock === 0)       return { label: 'Rupture', color: '#ef4444', icon: 'x'    };
  if (p.stock <= p.seuil)  return { label: 'Faible',  color: '#f97316', icon: 'warn' };
  return                          { label: 'OK',      color: '#22c55e', icon: 'ok'   };
};

const inputCls = "w-full bg-slate-700/60 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors";

const PiecesTab: React.FC<Props> = ({ machineId }) => {
  const [pieces, setPieces]     = useState<Piece[]>(() => loadPieces(machineId));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ ref: '', name: '', stock: '', maxStock: '', seuil: '' });
  const [fichier, setFichier]   = useState('');
  const fileRef                 = useRef<HTMLInputElement>(null);

  const update = (next: Piece[]) => { setPieces(next); savePieces(machineId, next); };
  const utiliser  = (id: string) => update(pieces.map(p => p.id === id && p.stock > 0 ? { ...p, stock: p.stock - 1 } : p));
  const supprimer = (id: string) => update(pieces.filter(p => p.id !== id));
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) setFichier(f.name); };

  const ajouter = () => {
    if (!form.name || !form.ref) return;
    update([...pieces, {
      id: Date.now().toString(), ref: form.ref, name: form.name,
      stock: parseInt(form.stock) || 0, maxStock: parseInt(form.maxStock) || 1,
      seuil: parseInt(form.seuil) || 1, fichier: fichier || undefined,
    }]);
    setForm({ ref: '', name: '', stock: '', maxStock: '', seuil: '' });
    setFichier(''); setShowForm(false);
  };

  const alerts = pieces.filter(p => p.stock <= p.seuil).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="text-[15px] font-bold text-white">Stock des Pièces de Rechange</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {pieces.length} pièces · {alerts} alerte{alerts !== 1 ? 's' : ''}
          </div>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#0066ff] hover:bg-[#0052cc] rounded-lg text-white text-sm font-semibold cursor-pointer transition-colors">
          <Plus size={15} /> Ajouter une pièce
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-slate-800/70 border border-white/[0.08] rounded-xl p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-white">Nouvelle pièce</span>
            <button onClick={() => setShowForm(false)} title="Fermer" aria-label="Fermer le formulaire"
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-700/60 border border-white/[0.08] text-slate-400 hover:text-white cursor-pointer transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3 sm:grid-cols-3">
            {[
              { key: 'ref',      label: 'Référence',    placeholder: 'MRC-006' },
              { key: 'name',     label: 'Nom pièce',    placeholder: 'Nom de la pièce' },
              { key: 'stock',    label: 'Stock',        placeholder: '0' },
              { key: 'maxStock', label: 'Stock max',    placeholder: '5' },
              { key: 'seuil',    label: 'Seuil alerte', placeholder: '1' },
            ].map(f => (
              <div key={f.key}>
                <div className="text-[11px] text-slate-400 mb-1 uppercase tracking-wide">{f.label}</div>
                <input value={(form as Record<string,string>)[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder} className={inputCls} />
              </div>
            ))}
          </div>

          {/* File picker */}
          <div className="mb-4">
            <div className="text-[11px] text-slate-400 mb-1 uppercase tracking-wide">Fichier pièce (SolidWorks, PDF...)</div>
            <div className="flex items-center gap-3">
              <button onClick={() => fileRef.current?.click()}
                className="px-3 py-1.5 bg-slate-700/60 border border-white/[0.08] rounded-lg text-xs text-slate-300 hover:text-white cursor-pointer transition-colors">
                📂 Choisir un fichier
              </button>
              {fichier && <span className="text-xs text-green-400">✓ {fichier}</span>}
              <input ref={fileRef} type="file" className="hidden" onChange={handleFile}
                title="Choisir un fichier" accept=".sldprt,.sldasm,.stp,.step,.pdf,.dwg,.dxf,.stl" />
            </div>
          </div>

          <button onClick={ajouter}
            className="px-5 py-2 bg-[#0066ff] hover:bg-[#0052cc] rounded-lg text-white text-sm font-semibold cursor-pointer transition-colors">
            Ajouter
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex flex-col gap-3">
        {pieces.map(p => {
          const st  = getStatus(p);
          const pct = Math.min(100, (p.stock / p.maxStock) * 100);
          const barColor = p.stock === 0 ? '#ef4444' : p.stock <= p.seuil ? '#f97316' : '#22c55e';

          return (
            <div key={p.id} className="bg-slate-800/50 border border-white/[0.08] rounded-xl p-4 hover:border-[rgba(0,212,255,0.15)] transition-all">

              {/* Top row */}
              <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <div>
                  <div className="text-[11px] font-bold text-slate-500 mb-0.5">{p.ref}</div>
                  <div className="text-sm font-semibold text-white">{p.name}</div>
                  {p.fichier && <div className="text-[11px] text-slate-500 mt-0.5">📎 {p.fichier}</div>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Status badge */}
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                    style={{ background: st.color + '18', border: `1px solid ${st.color}44`, color: st.color }}>
                    {st.icon === 'ok'   && <CheckCircle   size={12} />}
                    {st.icon === 'warn' && <AlertTriangle size={12} />}
                    {st.icon === 'x'   && <XCircle       size={12} />}
                    {st.label}
                  </span>
                  <button onClick={() => utiliser(p.id)} disabled={p.stock === 0}
                    className="px-3 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20">
                    Utiliser
                  </button>
                  <button onClick={() => supprimer(p.id)} title="Supprimer"
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 cursor-pointer transition-colors">
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Bar */}
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 h-2 bg-slate-700/60 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} />
                </div>
                <span className="text-sm font-bold font-mono" style={{ color: barColor }}>
                  {p.stock}<span className="text-xs text-slate-500 font-normal">/{p.maxStock} pcs</span>
                </span>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Seuil: <strong className="text-slate-400">{p.seuil} pcs</strong></span>
                {p.stock === 0            && <span className="text-red-400 font-semibold">⚠ RUPTURE DE STOCK</span>}
                {p.stock > 0 && p.stock <= p.seuil && <span className="text-orange-400 font-semibold">⚠ Stock faible</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PiecesTab;