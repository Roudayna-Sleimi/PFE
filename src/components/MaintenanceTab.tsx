import React, { useState } from 'react';
import { Plus, X, ChevronDown, ChevronUp, FileText } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PieceUsed {
  pieceId: string;
  pieceName: string;
  pieceRef: string;
  qty: number;
}

interface Note {
  id: string;
  author: string;
  date: string;
  text: string;
  pieces: PieceUsed[];
}

interface Maintenance {
  id: string;
  type: 'Préventive' | 'Corrective' | 'Prédictive';
  statut: 'planifiée' | 'en attente' | 'en cours' | 'terminée';
  date: string;
  description: string;
  notes: Note[];
}

interface Piece {
  id: string;
  ref: string;
  name: string;
  stock: number;
  maxStock: number;
  seuil: number;
}

interface Props {
  machineId: string;
}

// ─── Default data ──────────────────────────────────────────────────────────────
const defaultPieces: Record<string, Piece[]> = {
  'rectifieuse': [
    { id: '1', ref: 'MRC-001', name: 'Meule abrasive 400mm',     stock: 3, maxStock: 5, seuil: 2 },
    { id: '2', ref: 'MRC-002', name: 'Roulement SKF 6205',        stock: 1, maxStock: 4, seuil: 2 },
    { id: '3', ref: 'MRC-003', name: 'Courroie trapézoïdale B68', stock: 4, maxStock: 6, seuil: 1 },
    { id: '4', ref: 'MRC-004', name: 'Filtre à huile 10µm',       stock: 0, maxStock: 4, seuil: 2 },
    { id: '5', ref: 'MRC-005', name: "Joint d'étanchéité",        stock: 2, maxStock: 3, seuil: 1 },
  ],
  'compresseur': [
    { id: '1', ref: 'CMP-001', name: 'Filtre à air',              stock: 2, maxStock: 4, seuil: 1 },
    { id: '2', ref: 'CMP-002', name: 'Courroie trapézoïdale',     stock: 1, maxStock: 3, seuil: 1 },
    { id: '3', ref: 'CMP-003', name: "Séparateur huile/air",      stock: 0, maxStock: 2, seuil: 1 },
    { id: '4', ref: 'CMP-004', name: 'Soupape de sécurité',       stock: 3, maxStock: 4, seuil: 1 },
  ],
};

const defaultMaint: Record<string, Maintenance[]> = {
  'rectifieuse': [
    {
      id: 'm1', type: 'Préventive', statut: 'planifiée', date: '2025-03-10',
      description: 'Remplacement roulement + graissage général',
      notes: [{
        id: 'n1', author: 'Mohamed Ali B.', date: '2025-02-20',
        text: 'Planifiée suite à vibrations ADXL345 > 2.5 mm/s',
        pieces: [{ pieceId: '2', pieceName: 'Roulement SKF 6205', pieceRef: 'MRC-002', qty: 1 }],
      }],
    },
    {
      id: 'm2', type: 'Corrective', statut: 'terminée', date: '2025-02-01',
      description: 'Remplacement meule – usure excessive',
      notes: [],
    },
    {
      id: 'm3', type: 'Prédictive', statut: 'en attente', date: '2025-03-25',
      description: 'Vibration anormale détectée – ADXL345',
      notes: [],
    },
  ],
  'compresseur': [
    {
      id: 'm1', type: 'Préventive', statut: 'planifiée', date: '2025-04-01',
      description: 'Remplacement filtre à air + vérification courroie',
      notes: [],
    },
  ],
};

// ─── Storage ───────────────────────────────────────────────────────────────────
const MKEY = (id: string) => `maintenance_${id}`;
const PKEY = (id: string) => `pieces_${id}`;

const loadMaint = (machineId: string): Maintenance[] => {
  try {
    const s = localStorage.getItem(MKEY(machineId));
    if (s) return JSON.parse(s);
  } catch { /* empty */ }
  return defaultMaint[machineId] || [];
};

const loadPieces = (machineId: string): Piece[] => {
  try {
    const s = localStorage.getItem(PKEY(machineId));
    if (s) return JSON.parse(s);
  } catch { /* empty */ }
  return defaultPieces[machineId] || [];
};

const savePieces = (machineId: string, pieces: Piece[]) =>
  localStorage.setItem(PKEY(machineId), JSON.stringify(pieces));

// ─── Colors ────────────────────────────────────────────────────────────────────
const typeColor: Record<string, string> = {
  Préventive: '#3b82f6',
  Corrective: '#f97316',
  Prédictive: '#a855f7',
};

const statutColor: Record<string, string> = {
  'planifiée':  '#3b82f6',
  'en attente': '#f97316',
  'en cours':   '#eab308',
  'terminée':   '#22c55e',
};

// ─── Component ─────────────────────────────────────────────────────────────────
const MaintenanceTab: React.FC<Props> = ({ machineId }) => {
  const [maints, setMaints]       = useState<Maintenance[]>(() => loadMaint(machineId));
  const [pieces]                  = useState<Piece[]>(() => loadPieces(machineId));
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);

  // new maintenance form
  const [form, setForm] = useState({
    type: 'Préventive' as Maintenance['type'],
    statut: 'planifiée' as Maintenance['statut'],
    date: '',
    description: '',
  });

  // note form per card
  const [noteForm, setNoteForm]   = useState<Record<string, { text: string; author: string; selectedPieces: Record<string, number> }>>({});

  // save to localStorage
  const save = (next: Maintenance[]) => {
    setMaints(next);
    localStorage.setItem(MKEY(machineId), JSON.stringify(next));
  };

  // add maintenance
  const addMaint = () => {
    if (!form.date || !form.description) return;
    const m: Maintenance = {
      id: Date.now().toString(),
      type: form.type,
      statut: form.statut,
      date: form.date,
      description: form.description,
      notes: [],
    };
    save([m, ...maints]);
    setForm({ type: 'Préventive', statut: 'planifiée', date: '', description: '' });
    setShowForm(false);
  };

  // change statut
  const changeStatut = (id: string, statut: Maintenance['statut']) => {
    save(maints.map(m => m.id === id ? { ...m, statut } : m));
  };

  // add note (+ decrement pieces used)
  const addNote = (maintId: string) => {
    const nf = noteForm[maintId];
    if (!nf || !nf.text) return;

    const usedPieces: PieceUsed[] = Object.entries(nf.selectedPieces)
      .filter(([, qty]) => qty > 0)
      .map(([pieceId, qty]) => {
        const p = pieces.find(p => p.id === pieceId)!;
        return { pieceId, pieceName: p.name, pieceRef: p.ref, qty };
      });

    // decrement stock in localStorage
    const updatedPieces = pieces.map(p => {
      const used = nf.selectedPieces[p.id] || 0;
      return { ...p, stock: Math.max(0, p.stock - used) };
    });
    savePieces(machineId, updatedPieces);

    const note: Note = {
      id: Date.now().toString(),
      author: nf.author || 'Technicien',
      date: new Date().toISOString().split('T')[0],
      text: nf.text,
      pieces: usedPieces,
    };

    save(maints.map(m => m.id === maintId ? { ...m, notes: [...m.notes, note] } : m));
    setNoteForm(prev => ({ ...prev, [maintId]: { text: '', author: '', selectedPieces: {} } }));
  };

  const nf = (id: string) => noteForm[id] || { text: '', author: '', selectedPieces: {} };
  const urgentes = maints.filter(m => m.statut === 'en attente' || m.statut === 'en cours').length;

  return (
    <div>
      {/* Header */}
      <div className="mt-header">
        <div>
          <div className="mt-header-title">Plan &amp; Historique de Maintenance</div>
          <div className="mt-header-sub">
            {maints.length} entrée{maints.length !== 1 ? 's' : ''} · {urgentes} urgente{urgentes !== 1 ? 's' : ''}
          </div>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="mt-add-btn">
          <Plus size={15} /> Nouvelle maintenance
        </button>
      </div>

      {/* New maintenance form */}
      {showForm && (
        <div className="mt-form">
          <div className="mt-form-header">
            <span className="mt-form-title">🔧 Nouvelle Maintenance</span>
            <button onClick={() => setShowForm(false)} title="Fermer" aria-label="Fermer le formulaire" className="mt-form-close-btn">
              <X size={16} />
            </button>
          </div>

          <div className="mt-form-grid2">
            <div>
              <div className="mt-form-label">Type</div>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as Maintenance['type'] }))} title="Type de maintenance" className="mt-select">
                <option>Préventive</option>
                <option>Corrective</option>
                <option>Prédictive</option>
              </select>
            </div>
            <div>
              <div className="mt-form-label">Statut</div>
              <select value={form.statut} onChange={e => setForm(p => ({ ...p, statut: e.target.value as Maintenance['statut'] }))} title="Statut de maintenance" className="mt-select">
                <option value="planifiée">planifiée</option>
                <option value="en attente">en attente</option>
                <option value="en cours">en cours</option>
                <option value="terminée">terminée</option>
              </select>
            </div>
          </div>

          <div className="mt-form-field">
            <div className="mt-form-label">Date prévue *</div>
            <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
              className="mt-input" title="Date prévue" />
          </div>

          <div className="mt-form-field-last">
            <div className="mt-form-label">Description *</div>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Décrire l'opération de maintenance..."
              rows={3} className="mt-textarea" title="Description" />
          </div>

          <div className="mt-form-actions">
            <button onClick={addMaint} className="mt-submit-btn">Créer</button>
            <button onClick={() => setShowForm(false)} className="mt-cancel-btn">Annuler</button>
          </div>
        </div>
      )}

      {/* Maintenance list */}
      <div className="mt-list">
        {maints.map(m => {
          const isOpen = expanded === m.id;
          const tc = typeColor[m.type] || '#64748b';
          const sc = statutColor[m.statut] || '#64748b';
          const cnf = nf(m.id);

          return (
            <div key={m.id} className="mt-card">
              {/* Card header */}
              <div className="mt-card-header">
                <span className="mt-type-badge" style={{ background: tc + '22', border: `1px solid ${tc}55`, color: tc }}>
                  {m.type}
                </span>

                <div className="mt-card-info">
                  <div className="mt-card-desc">{m.description}</div>
                  <div className="mt-card-date">📅 {m.date}</div>
                </div>

                <select
                  value={m.statut}
                  onChange={e => changeStatut(m.id, e.target.value as Maintenance['statut'])}
                  title="Changer le statut"
                  className="mt-statut-select"
                  style={{ background: sc + '18', borderColor: sc + '44', color: sc }}
                >
                  <option value="planifiée">planifiée</option>
                  <option value="en attente">en attente</option>
                  <option value="en cours">en cours</option>
                  <option value="terminée">terminée</option>
                </select>

                <button
                  onClick={() => setExpanded(isOpen ? null : m.id)}
                  title={isOpen ? 'Réduire' : 'Développer'}
                  aria-label={isOpen ? 'Réduire' : 'Développer'}
                  className="mt-expand-btn"
                >
                  {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>

              {/* Expanded: notes + add note */}
              {isOpen && (
                <div className="mt-expanded">
                  {/* Notes list */}
                  {m.notes.length > 0 && (
                    <div>
                      <div className="mt-notes-header">
                        <FileText size={12} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        NOTES D'INTERVENTION ({m.notes.length})
                      </div>
                      <div className="mt-notes-list">
                        {m.notes.map(n => (
                          <div key={n.id} className="mt-note-card">
                            <div className="mt-note-top">
                              <span className="mt-note-author">👤 {n.author}</span>
                              <span className="mt-note-date">{n.date}</span>
                            </div>
                            <div className="mt-note-text">{n.text}</div>
                            {n.pieces.length > 0 && (
                              <div className="mt-note-pieces">
                                <span>🔩 Pièces:</span>
                                {n.pieces.map(pu => (
                                  <span key={pu.pieceId} className="mt-piece-tag">
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
                  <div className="mt-note-form">
                    <div className="mt-note-form-title">+ Ajouter une note</div>

                    <div className="mt-note-form-grid">
                      <div>
                        <div className="mt-form-label">Auteur</div>
                        <input
                          value={cnf.author}
                          onChange={e => setNoteForm(prev => ({ ...prev, [m.id]: { ...nf(m.id), author: e.target.value } }))}
                          placeholder="Nom du technicien"
                          title="Auteur"
                          className="mt-input"
                        />
                      </div>
                      <div>
                        <div className="mt-form-label">Note</div>
                        <input
                          value={cnf.text}
                          onChange={e => setNoteForm(prev => ({ ...prev, [m.id]: { ...nf(m.id), text: e.target.value } }))}
                          placeholder="Décrire l'intervention..."
                          title="Note d'intervention"
                          className="mt-input"
                        />
                      </div>
                    </div>

                    {/* Pièces utilisées */}
                    {pieces.length > 0 && (
                      <div>
                        <div className="mt-pieces-used-label">🔩 Pièces utilisées (stock actuel)</div>
                        <div className="mt-pieces-used-list">
                          {pieces.map(p => {
                            const qty = cnf.selectedPieces[p.id] || 0;
                            return (
                              <div key={p.id} className="mt-piece-selector" style={{
                                background: qty > 0 ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${qty > 0 ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
                              }}>
                                <span className="mt-piece-selector-label" style={{ color: qty > 0 ? '#60a5fa' : '#94a3b8' }}>
                                  {p.ref} — {p.name}
                                  <span className="mt-piece-stock-muted">({p.stock} en stock)</span>
                                </span>
                                <div className="mt-qty-controls">
                                  <button
                                    onClick={() => setNoteForm(prev => ({
                                      ...prev,
                                      [m.id]: { ...nf(m.id), selectedPieces: { ...nf(m.id).selectedPieces, [p.id]: Math.max(0, qty - 1) } },
                                    }))}
                                    title="Diminuer" aria-label="Diminuer quantité"
                                    className="mt-qty-btn"
                                  >−</button>
                                  <span className="mt-qty-val">{qty}</span>
                                  <button
                                    onClick={() => setNoteForm(prev => ({
                                      ...prev,
                                      [m.id]: { ...nf(m.id), selectedPieces: { ...nf(m.id).selectedPieces, [p.id]: Math.min(p.stock, qty + 1) } },
                                    }))}
                                    title="Augmenter" aria-label="Augmenter quantité"
                                    className="mt-qty-btn"
                                  >+</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <button onClick={() => addNote(m.id)} className="mt-note-submit-btn">
                      Ajouter une note
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {maints.length === 0 && (
        <div className="mt-empty">
          <div className="mt-empty-icon">🔧</div>
          <div className="mt-empty-title">Aucune maintenance enregistrée</div>
          <div className="mt-empty-sub">Cliquez sur "+ Nouvelle maintenance" pour commencer</div>
        </div>
      )}
    </div>
  );
};

export default MaintenanceTab;