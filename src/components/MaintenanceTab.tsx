import React, { useState } from 'react';
import { Plus, X, ChevronDown, ChevronUp, FileText } from 'lucide-react';

interface PieceUsed { pieceId: string; pieceName: string; pieceRef: string; qty: number; }
interface Note { id: string; author: string; date: string; text: string; pieces: PieceUsed[]; }
interface Maintenance {
  id: string; type: 'Préventive' | 'Corrective' | 'Prédictive';
  statut: 'planifiée' | 'en attente' | 'en cours' | 'terminée';
  date: string; description: string; notes: Note[];
}
interface Piece { id: string; ref: string; name: string; stock: number; maxStock: number; seuil: number; }
interface Props { machineId: string; }

const defaultPieces: Record<string, Piece[]> = {
  'rectifieuse': [
    { id: '1', ref: 'MRC-001', name: 'Meule abrasive 400mm',     stock: 3, maxStock: 5, seuil: 2 },
    { id: '2', ref: 'MRC-002', name: 'Roulement SKF 6205',        stock: 1, maxStock: 4, seuil: 2 },
    { id: '3', ref: 'MRC-003', name: 'Courroie trapézoïdale B68', stock: 4, maxStock: 6, seuil: 1 },
    { id: '4', ref: 'MRC-004', name: 'Filtre à huile 10µm',       stock: 0, maxStock: 4, seuil: 2 },
    { id: '5', ref: 'MRC-005', name: "Joint d'étanchéité",        stock: 2, maxStock: 3, seuil: 1 },
  ],
  'compresseur': [
    { id: '1', ref: 'CMP-001', name: 'Filtre à air',          stock: 2, maxStock: 4, seuil: 1 },
    { id: '2', ref: 'CMP-002', name: 'Courroie trapézoïdale', stock: 1, maxStock: 3, seuil: 1 },
    { id: '3', ref: 'CMP-003', name: "Séparateur huile/air",  stock: 0, maxStock: 2, seuil: 1 },
    { id: '4', ref: 'CMP-004', name: 'Soupape de sécurité',   stock: 3, maxStock: 4, seuil: 1 },
  ],
};

const defaultMaint: Record<string, Maintenance[]> = {
  'rectifieuse': [
    { id: 'm1', type: 'Préventive', statut: 'planifiée', date: '2025-03-10',
      description: 'Remplacement roulement + graissage général',
      notes: [{ id: 'n1', author: 'Mohamed Ali B.', date: '2025-02-20',
        text: 'Planifiée suite à vibrations ADXL345 > 2.5 mm/s',
        pieces: [{ pieceId: '2', pieceName: 'Roulement SKF 6205', pieceRef: 'MRC-002', qty: 1 }] }] },
    { id: 'm2', type: 'Corrective', statut: 'terminée',  date: '2025-02-01', description: 'Remplacement meule – usure excessive', notes: [] },
    { id: 'm3', type: 'Prédictive', statut: 'en attente',date: '2025-03-25', description: 'Vibration anormale détectée – ADXL345', notes: [] },
  ],
  'compresseur': [
    { id: 'm1', type: 'Préventive', statut: 'planifiée', date: '2025-04-01', description: 'Remplacement filtre à air + vérification courroie', notes: [] },
  ],
};

const MKEY = (id: string) => `maintenance_${id}`;
const PKEY = (id: string) => `pieces_${id}`;

const loadMaint  = (id: string): Maintenance[] => { try { const s = localStorage.getItem(MKEY(id)); if (s) return JSON.parse(s); } catch { /**/ } return defaultMaint[id] || []; };
const loadPieces = (id: string): Piece[]       => { try { const s = localStorage.getItem(PKEY(id)); if (s) return JSON.parse(s); } catch { /**/ } return defaultPieces[id] || []; };
const savePieces = (id: string, p: Piece[])    => localStorage.setItem(PKEY(id), JSON.stringify(p));

const typeColor:   Record<string, string> = { Préventive: '#3b82f6', Corrective: '#f97316', Prédictive: '#a855f7' };
const statutColor: Record<string, string> = { 'planifiée': '#3b82f6', 'en attente': '#f97316', 'en cours': '#eab308', 'terminée': '#22c55e' };

// shared input class
const iCls = "w-full bg-slate-700/60 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors";

const MaintenanceTab: React.FC<Props> = ({ machineId }) => {
  const [maints, setMaints]     = useState<Maintenance[]>(() => loadMaint(machineId));
  const [pieces]                = useState<Piece[]>(() => loadPieces(machineId));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ type: 'Préventive' as Maintenance['type'], statut: 'planifiée' as Maintenance['statut'], date: '', description: '' });
  const [noteForm, setNoteForm] = useState<Record<string, { text: string; author: string; selectedPieces: Record<string, number> }>>({});

  const save = (next: Maintenance[]) => { setMaints(next); localStorage.setItem(MKEY(machineId), JSON.stringify(next)); };

  const addMaint = () => {
    if (!form.date || !form.description) return;
    save([{ id: Date.now().toString(), ...form, notes: [] }, ...maints]);
    setForm({ type: 'Préventive', statut: 'planifiée', date: '', description: '' });
    setShowForm(false);
  };

  const changeStatut = (id: string, statut: Maintenance['statut']) =>
    save(maints.map(m => m.id === id ? { ...m, statut } : m));

  const addNote = (maintId: string) => {
    const nf = noteForm[maintId];
    if (!nf || !nf.text) return;
    const usedPieces: PieceUsed[] = Object.entries(nf.selectedPieces)
      .filter(([, qty]) => qty > 0)
      .map(([pieceId, qty]) => { const p = pieces.find(p => p.id === pieceId)!; return { pieceId, pieceName: p.name, pieceRef: p.ref, qty }; });
    savePieces(machineId, pieces.map(p => ({ ...p, stock: Math.max(0, p.stock - (nf.selectedPieces[p.id] || 0)) })));
    save(maints.map(m => m.id === maintId ? { ...m, notes: [...m.notes, { id: Date.now().toString(), author: nf.author || 'Technicien', date: new Date().toISOString().split('T')[0], text: nf.text, pieces: usedPieces }] } : m));
    setNoteForm(prev => ({ ...prev, [maintId]: { text: '', author: '', selectedPieces: {} } }));
  };

  const nf = (id: string) => noteForm[id] || { text: '', author: '', selectedPieces: {} };
  const urgentes = maints.filter(m => m.statut === 'en attente' || m.statut === 'en cours').length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="text-[15px] font-bold text-white">Plan &amp; Historique de Maintenance</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {maints.length} entrée{maints.length !== 1 ? 's' : ''} · {urgentes} urgente{urgentes !== 1 ? 's' : ''}
          </div>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#0066ff] hover:bg-[#0052cc] rounded-lg text-white text-sm font-semibold cursor-pointer transition-colors">
          <Plus size={15} /> Nouvelle maintenance
        </button>
      </div>

      {/* New maintenance form */}
      {showForm && (
        <div className="bg-slate-800/70 border border-white/[0.08] rounded-xl p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-white">🔧 Nouvelle Maintenance</span>
            <button onClick={() => setShowForm(false)} title="Fermer"
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-700/60 border border-white/[0.08] text-slate-400 hover:text-white cursor-pointer transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <div className="text-[11px] text-slate-400 mb-1 uppercase tracking-wide">Type</div>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as Maintenance['type'] }))}
                title="Type de maintenance" className={iCls}>
                <option>Préventive</option><option>Corrective</option><option>Prédictive</option>
              </select>
            </div>
            <div>
              <div className="text-[11px] text-slate-400 mb-1 uppercase tracking-wide">Statut</div>
              <select value={form.statut} onChange={e => setForm(p => ({ ...p, statut: e.target.value as Maintenance['statut'] }))}
                title="Statut" className={iCls}>
                <option value="planifiée">planifiée</option><option value="en attente">en attente</option>
                <option value="en cours">en cours</option><option value="terminée">terminée</option>
              </select>
            </div>
          </div>

          <div className="mb-3">
            <div className="text-[11px] text-slate-400 mb-1 uppercase tracking-wide">Date prévue *</div>
            <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
              title="Date prévue" className={iCls} />
          </div>

          <div className="mb-4">
            <div className="text-[11px] text-slate-400 mb-1 uppercase tracking-wide">Description *</div>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Décrire l'opération de maintenance..." rows={3} title="Description"
              className={`${iCls} resize-none`} />
          </div>

          <div className="flex gap-3">
            <button onClick={addMaint}
              className="px-5 py-2 bg-[#0066ff] hover:bg-[#0052cc] rounded-lg text-white text-sm font-semibold cursor-pointer transition-colors">
              Créer
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-5 py-2 bg-slate-700/60 border border-white/[0.08] rounded-lg text-slate-300 text-sm font-medium cursor-pointer hover:text-white transition-colors">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Maintenance list */}
      <div className="flex flex-col gap-3">
        {maints.map(m => {
          const isOpen = expanded === m.id;
          const tc = typeColor[m.type]     || '#64748b';
          const sc = statutColor[m.statut] || '#64748b';
          const cnf = nf(m.id);

          return (
            <div key={m.id} className="bg-slate-800/50 border border-white/[0.08] rounded-xl overflow-hidden transition-all">

              {/* Card header */}
              <div className="flex items-center gap-3 p-4 flex-wrap">
                {/* Type badge */}
                <span className="px-2.5 py-1 rounded-md text-[11px] font-bold flex-shrink-0"
                  style={{ background: tc + '22', border: `1px solid ${tc}55`, color: tc }}>
                  {m.type}
                </span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{m.description}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">📅 {m.date}</div>
                </div>

                {/* Statut select — dynamic color */}
                <select value={m.statut} onChange={e => changeStatut(m.id, e.target.value as Maintenance['statut'])}
                  title="Changer le statut"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border outline-none cursor-pointer bg-transparent flex-shrink-0"
                  style={{ background: sc + '18', borderColor: sc + '44', color: sc }}>
                  <option value="planifiée">planifiée</option>
                  <option value="en attente">en attente</option>
                  <option value="en cours">en cours</option>
                  <option value="terminée">terminée</option>
                </select>

                {/* Expand btn */}
                <button onClick={() => setExpanded(isOpen ? null : m.id)}
                  title={isOpen ? 'Réduire' : 'Développer'}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-700/60 border border-white/[0.08] text-slate-400 hover:text-[#00d4ff] cursor-pointer transition-colors flex-shrink-0">
                  {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>

              {/* Expanded */}
              {isOpen && (
                <div className="border-t border-white/[0.06] p-4 bg-slate-900/30">

                  {/* Notes list */}
                  {m.notes.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">
                        <FileText size={12} /> NOTES D'INTERVENTION ({m.notes.length})
                      </div>
                      <div className="flex flex-col gap-2">
                        {m.notes.map(n => (
                          <div key={n.id} className="bg-slate-800/60 border border-white/[0.06] rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-semibold text-[#00d4ff]">👤 {n.author}</span>
                              <span className="text-[11px] text-slate-500">{n.date}</span>
                            </div>
                            <div className="text-xs text-slate-300 mb-2">{n.text}</div>
                            {n.pieces.length > 0 && (
                              <div className="flex items-center gap-2 flex-wrap text-[11px]">
                                <span className="text-slate-500">🔩 Pièces:</span>
                                {n.pieces.map(pu => (
                                  <span key={pu.pieceId} className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-md text-blue-400">
                                    {pu.pieceName} ×{pu.qty}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add note form */}
                  <div className="bg-slate-800/40 border border-white/[0.06] rounded-lg p-4">
                    <div className="text-xs font-semibold text-slate-400 mb-3">+ Ajouter une note</div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <div className="text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Auteur</div>
                        <input value={cnf.author}
                          onChange={e => setNoteForm(prev => ({ ...prev, [m.id]: { ...nf(m.id), author: e.target.value } }))}
                          placeholder="Nom du technicien" title="Auteur" className={iCls} />
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Note</div>
                        <input value={cnf.text}
                          onChange={e => setNoteForm(prev => ({ ...prev, [m.id]: { ...nf(m.id), text: e.target.value } }))}
                          placeholder="Décrire l'intervention..." title="Note" className={iCls} />
                      </div>
                    </div>

                    {/* Pièces utilisées */}
                    {pieces.length > 0 && (
                      <div className="mb-3">
                        <div className="text-[11px] text-slate-500 mb-2 uppercase tracking-wide">🔩 Pièces utilisées (stock actuel)</div>
                        <div className="flex flex-col gap-2">
                          {pieces.map(p => {
                            const qty = cnf.selectedPieces[p.id] || 0;
                            return (
                              <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg transition-all"
                                style={{ background: qty > 0 ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${qty > 0 ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)'}` }}>
                                <span className="text-xs flex-1 min-w-0 truncate" style={{ color: qty > 0 ? '#60a5fa' : '#94a3b8' }}>
                                  {p.ref} — {p.name}
                                  <span className="text-slate-600 ml-1">({p.stock} en stock)</span>
                                </span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <button onClick={() => setNoteForm(prev => ({ ...prev, [m.id]: { ...nf(m.id), selectedPieces: { ...nf(m.id).selectedPieces, [p.id]: Math.max(0, qty - 1) } } }))}
                                    title="Diminuer" className="w-6 h-6 flex items-center justify-center rounded bg-slate-700/60 border border-white/[0.08] text-slate-300 hover:text-white cursor-pointer text-sm">−</button>
                                  <span className="text-sm font-bold text-white w-5 text-center">{qty}</span>
                                  <button onClick={() => setNoteForm(prev => ({ ...prev, [m.id]: { ...nf(m.id), selectedPieces: { ...nf(m.id).selectedPieces, [p.id]: Math.min(p.stock, qty + 1) } } }))}
                                    title="Augmenter" className="w-6 h-6 flex items-center justify-center rounded bg-slate-700/60 border border-white/[0.08] text-slate-300 hover:text-white cursor-pointer text-sm">+</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <button onClick={() => addNote(m.id)}
                      className="px-4 py-2 bg-[#0066ff] hover:bg-[#0052cc] rounded-lg text-white text-xs font-semibold cursor-pointer transition-colors">
                      Ajouter une note
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty */}
      {maints.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
          <div className="text-4xl mb-1">🔧</div>
          <div className="text-base font-semibold text-white">Aucune maintenance enregistrée</div>
          <div className="text-sm text-slate-500">Cliquez sur "+ Nouvelle maintenance" pour commencer</div>
        </div>
      )}
    </div>
  );
};

export default MaintenanceTab;