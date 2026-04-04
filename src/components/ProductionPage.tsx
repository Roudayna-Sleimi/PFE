import React, { useState, useEffect } from 'react';
import { Package, Plus, X, AlertTriangle, CheckCircle, Clock, User, Wrench, TrendingUp, DollarSign } from 'lucide-react';

const API = 'http://localhost:5000/api';

// ── Types ──
interface UserAPI {
  _id: string;
  username: string;
  role: string;
}

interface Tache {
  _id: string;
  titre: string;
  employe: string;
  statut: 'à faire' | 'en cours' | 'terminée';
  priorite: 'haute' | 'moyenne' | 'basse';
}

interface Piece {
  _id: string;
  nom: string;
  machine: string;
  employe: string;
  quantite: number;
  prix: number;
  status: 'Terminé' | 'En cours' | 'Contrôle';
  matiere: boolean;
  solidworksPath?: string;
  taches: Tache[];
}

const MACHINES = ['Rectifieuse', 'Agie Cut', 'Agie Drill', 'HAAS CNC', 'Compresseur ABAC'];

const statusConfig = {
  'Terminé':  { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)',   label: '✅ Terminé' },
  'En cours': { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)',  label: '🔄 En cours' },
  'Contrôle': { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)',  label: '🔍 Contrôle' },
};

const tacheStatutConfig = {
  'à faire':  { color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  'en cours': { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  'terminée': { color: '#22c55e', bg: 'rgba(34,197,94,0.15)'  },
};

const prioriteConfig = {
  'haute':   { color: '#ef4444' },
  'moyenne': { color: '#f59e0b' },
  'basse':   { color: '#22c55e' },
};

const PieceIcon = ({ nom }: { nom: string }) => {
  const icons: Record<string, string> = {
    'engrenage': '⚙️', 'support': '🔩', 'plaque': '🔲',
    'connecteur': '🔌', 'axe': '🔧',
  };
  const key = Object.keys(icons).find(k => nom.toLowerCase().includes(k));
  return <span style={{ fontSize: 40 }}>{key ? icons[key] : '⚙️'}</span>;
};

const ProductionPage: React.FC = () => {
  const [pieces, setPieces]               = useState<Piece[]>([]);
  const [employes, setEmployes]           = useState<string[]>([]);
  const [loading, setLoading]             = useState(true);
  const [filtre, setFiltre]               = useState('Toutes');
  const [showForm, setShowForm]           = useState(false);
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);
  const [activeTab, setActiveTab]         = useState<'details' | 'taches'>('details');
  const [newPiece, setNewPiece]           = useState<Partial<Piece>>({ matiere: true, status: 'En cours' });
  const [newTache, setNewTache]           = useState({ titre: '', employe: '', priorite: 'moyenne' as Tache['priorite'] });

  const token   = localStorage.getItem('token') || '';
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  // ── Fetch employés (role = 'employe' seulement) ──
  const fetchEmployes = async () => {
    try {
      const res  = await fetch(`${API}/users`, { headers });
      const data: UserAPI[] = await res.json();
      if (res.ok && Array.isArray(data)) {
        const noms = data
          .filter((u: UserAPI) => u.role === 'employe')
          .map((u: UserAPI) => u.username);
        setEmployes(noms);
        if (noms.length > 0) setNewTache(p => ({ ...p, employe: noms[0] }));
      }
    } catch (err) {
      console.error('Erreur fetch employés:', err);
    }
  };

  // ── Fetch pièces ──
  const fetchPieces = async () => {
    try {
      setLoading(true);
      const res  = await fetch(`${API}/pieces`, { headers });
      const data = await res.json();
      setPieces(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erreur fetch pièces:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployes();
    fetchPieces();
  }, []);

  // Stats
  const totalProduction = pieces.reduce((s, p) => s + p.quantite, 0);
  const totalRevenu     = pieces.reduce((s, p) => s + p.quantite * p.prix, 0);
  const enCours         = pieces.filter(p => p.status === 'En cours').length;
  const alertes         = pieces.filter(p => !p.matiere);
  const tachesEnCours   = pieces.flatMap(p => p.taches).filter(t => t.statut !== 'terminée').length;

  const filtrees = filtre === 'Toutes' ? pieces : pieces.filter(p => p.status === filtre);

  // ── Ajouter pièce ──
  const ajouterPiece = async () => {
    if (!newPiece.nom || !newPiece.machine || !newPiece.employe) return;
    try {
      const res  = await fetch(`${API}/pieces`, {
        method: 'POST', headers,
        body: JSON.stringify({
          nom:            newPiece.nom,
          machine:        newPiece.machine,
          employe:        newPiece.employe,
          quantite:       Number(newPiece.quantite) || 0,
          prix:           Number(newPiece.prix) || 0,
          status:         newPiece.status || 'En cours',
          matiere:        newPiece.matiere !== false,
          solidworksPath: newPiece.solidworksPath || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPieces(prev => [data, ...prev]);
        setShowForm(false);
        setNewPiece({ matiere: true, status: 'En cours' });
      }
    } catch (err) { console.error('Erreur ajout pièce:', err); }
  };

  // ── Ajouter tâche ──
  const ajouterTache = async () => {
    if (!newTache.titre || !newTache.employe || !selectedPiece) return;
    try {
      const res     = await fetch(`${API}/pieces/${selectedPiece._id}/taches`, {
        method: 'POST', headers,
        body: JSON.stringify(newTache),
      });
      const updated = await res.json();
      if (res.ok) {
        setPieces(prev => prev.map(p => p._id === updated._id ? updated : p));
        setSelectedPiece(updated);
        setNewTache({ titre: '', employe: employes[0] || '', priorite: 'moyenne' });
      }
    } catch (err) { console.error('Erreur ajout tâche:', err); }
  };

  // ── Update statut tâche ──
  const updateTache = async (pieceId: string, tacheId: string, statut: Tache['statut']) => {
    try {
      const res     = await fetch(`${API}/pieces/${pieceId}/taches/${tacheId}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ statut }),
      });
      const updated = await res.json();
      if (res.ok) {
        setPieces(prev => prev.map(p => p._id === updated._id ? updated : p));
        setSelectedPiece(updated);
      }
    } catch (err) { console.error('Erreur update tâche:', err); }
  };

  const card        : React.CSSProperties = { background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 };
  const inputStyle  : React.CSSProperties = { width: '100%', background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 12px', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
  const selectStyle : React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

  return (
    <div style={{ flex: 1, padding: 24, overflowY: 'auto', minWidth: 0, width: '100%' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'white' }}>🏭 Production</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Gestion des pièces et tâches de l'usine</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg,#0066ff,#00d4ff)', color: 'white',
          fontSize: 13, fontWeight: 700,
        }}>
          <Plus size={16} /> Ajouter Pièce
        </button>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Production Totale', value: `${totalProduction.toLocaleString()} pcs`, icon: <Package size={20} color="#3b82f6" />, color: '#3b82f6' },
          { label: 'Revenu Estimé',     value: `${totalRevenu.toLocaleString()} DT`,      icon: <DollarSign size={20} color="#22c55e" />, color: '#22c55e' },
          { label: 'En cours',          value: `${enCours} pièces`,                        icon: <TrendingUp size={20} color="#f59e0b" />, color: '#f59e0b' },
          { label: 'Tâches actives',    value: `${tachesEnCours} tâches`,                 icon: <Clock size={20} color="#a855f7" />,      color: '#a855f7' },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: '18px 20px' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: s.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              {s.icon}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, marginBottom: 4 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Alertes matière ── */}
      {alertes.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderLeft: '4px solid #ef4444', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={16} color="#ef4444" />
            <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 13 }}>Matière manquante — {alertes.length} pièce(s)</span>
          </div>
          {alertes.map(p => (
            <div key={p._id} style={{ color: '#fca5a5', fontSize: 12, marginBottom: 2 }}>
              • {p.nom} — {p.machine} (Responsable: {p.employe})
            </div>
          ))}
        </div>
      )}

      {/* ── Filtres ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {['Toutes', 'Terminé', 'En cours', 'Contrôle'].map(f => (
          <button key={f} onClick={() => setFiltre(f)} style={{
            padding: '7px 18px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
            background: filtre === f ? 'linear-gradient(135deg,#0066ff,#00d4ff)' : 'rgba(30,41,59,0.6)',
            color: filtre === f ? 'white' : '#64748b',
          }}>{f}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#475569', alignSelf: 'center' }}>
          {filtrees.length} pièce(s)
        </span>
      </div>

      {/* ── Galerie ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16, marginBottom: 30 }}>
        {loading ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#475569', padding: '60px 0', fontSize: 14 }}>
            ⏳ Chargement...
          </div>
        ) : filtrees.length === 0 ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#475569', padding: '60px 0', fontSize: 14 }}>
            Aucune pièce — ajoutez-en une !
          </div>
        ) : filtrees.map(piece => {
          const st = statusConfig[piece.status];
          return (
            <div key={piece._id} onClick={() => { setSelectedPiece(piece); setActiveTab('details'); }}
              style={{ ...card, cursor: 'pointer', overflow: 'hidden', transition: 'all 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(0,212,255,0.4)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}>
              <div style={{ height: 130, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <PieceIcon nom={piece.nom} />
              </div>
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'white', marginBottom: 3 }}>{piece.nom}</div>
                <div style={{ fontSize: 11, color: '#475569', marginBottom: 10 }}>{piece.machine}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: st.bg, border: `1px solid ${st.border}`, color: st.color, fontWeight: 600 }}>
                    {st.label}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#00d4ff' }}>{piece.quantite} pcs</span>
                </div>
                {!piece.matiere && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertTriangle size={11} /> Matière manquante
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: 11, color: '#475569', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <User size={11} /> {piece.employe}
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: '#475569' }}>
                  💰 {(piece.quantite * piece.prix).toLocaleString()} DT
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ══════════════════════════════════════
          MODAL — Détail Pièce
      ══════════════════════════════════════ */}
      {selectedPiece && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: '100%', maxWidth: 580, maxHeight: '88vh', overflowY: 'auto' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}><PieceIcon nom={selectedPiece.nom} /></span>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>{selectedPiece.nom}</div>
                  <div style={{ fontSize: 12, color: '#475569' }}>{selectedPiece.machine}</div>
                </div>
              </div>
              <button onClick={() => setSelectedPiece(null)} aria-label="Fermer" title="Fermer"
                style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {(['details', 'taches'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  flex: 1, padding: '12px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  background: activeTab === tab ? 'rgba(0,212,255,0.08)' : 'transparent',
                  color: activeTab === tab ? '#00d4ff' : '#475569',
                  borderBottom: activeTab === tab ? '2px solid #00d4ff' : '2px solid transparent',
                }}>
                  {tab === 'details' ? '📋 Détails' : `✅ Tâches (${selectedPiece.taches.length})`}
                </button>
              ))}
            </div>

            <div style={{ padding: '18px 22px' }}>

              {activeTab === 'details' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    {[
                      { label: 'Machine',       value: selectedPiece.machine,                                                  icon: <Wrench size={13} /> },
                      { label: 'Employé',       value: selectedPiece.employe,                                                  icon: <User size={13} /> },
                      { label: 'Quantité',      value: `${selectedPiece.quantite} pcs`,                                        icon: <Package size={13} /> },
                      { label: 'Prix unitaire', value: `${selectedPiece.prix} DT`,                                             icon: <DollarSign size={13} /> },
                      { label: 'Revenu total',  value: `${(selectedPiece.quantite * selectedPiece.prix).toLocaleString()} DT`, icon: <TrendingUp size={13} /> },
                      { label: 'Status',        value: statusConfig[selectedPiece.status].label,                               icon: <CheckCircle size={13} /> },
                    ].map(row => (
                      <div key={row.label} style={{ background: 'rgba(30,41,59,0.6)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: 11, color: '#475569', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                          {row.icon} {row.label}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>{row.value}</div>
                      </div>
                    ))}
                  </div>
                  {!selectedPiece.matiere && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444', fontSize: 13, fontWeight: 600 }}>
                        <AlertTriangle size={15} /> Matière insuffisante — commande nécessaire
                      </div>
                    </div>
                  )}
                  {selectedPiece.solidworksPath && (
                    <button onClick={() => alert(`🔷 Ouverture SolidWorks:\n${selectedPiece.solidworksPath}`)}
                      style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#0066ff,#00d4ff)', color: 'white', fontSize: 13, fontWeight: 700 }}>
                      🔷 Ouvrir dans SolidWorks
                    </button>
                  )}
                </>
              )}

              {activeTab === 'taches' && (
                <>
                  <div style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 10 }}>+ Nouvelle tâche</div>
                    <input
                      placeholder="Titre de la tâche..."
                      value={newTache.titre}
                      onChange={e => setNewTache(p => ({ ...p, titre: e.target.value }))}
                      style={{ ...inputStyle, marginBottom: 10, background: 'rgba(15,23,42,0.8)' }}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, color: '#64748b', marginBottom: 4, display: 'block' }}>Employé</label>
                        <select
                          title="Employé responsable" aria-label="Employé responsable"
                          value={newTache.employe}
                          onChange={e => setNewTache(p => ({ ...p, employe: e.target.value }))}
                          style={{ ...selectStyle, background: 'rgba(15,23,42,0.8)', fontSize: 12 }}
                        >
                          {employes.length === 0
                            ? <option value="">Aucun employé trouvé</option>
                            : employes.map(e => <option key={e} value={e}>{e}</option>)
                          }
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: '#64748b', marginBottom: 4, display: 'block' }}>Priorité</label>
                        <select
                          title="Priorité de la tâche" aria-label="Priorité de la tâche"
                          value={newTache.priorite}
                          onChange={e => setNewTache(p => ({ ...p, priorite: e.target.value as Tache['priorite'] }))}
                          style={{ ...selectStyle, background: 'rgba(15,23,42,0.8)', fontSize: 12 }}
                        >
                          <option value="haute">🔴 Haute</option>
                          <option value="moyenne">🟡 Moyenne</option>
                          <option value="basse">🟢 Basse</option>
                        </select>
                      </div>
                    </div>
                    <button onClick={ajouterTache}
                      style={{ width: '100%', padding: '9px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'rgba(0,212,255,0.15)', color: '#00d4ff', fontSize: 13, fontWeight: 600 }}>
                      + Ajouter la tâche
                    </button>
                  </div>

                  {selectedPiece.taches.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#334155', padding: '30px 0', fontSize: 13 }}>
                      Aucune tâche — ajoutez-en une ci-dessus
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {selectedPiece.taches.map(tache => {
                        const ts = tacheStatutConfig[tache.statut];
                        const tp = prioriteConfig[tache.priorite];
                        return (
                          <div key={tache._id} style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.06)', borderLeft: `3px solid ${ts.color}`, borderRadius: 10, padding: '12px 14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'white', marginBottom: 3 }}>{tache.titre}</div>
                                <div style={{ fontSize: 11, color: '#475569', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <User size={11} /> {tache.employe}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: tp.color + '22', color: tp.color, fontWeight: 700 }}>{tache.priorite}</span>
                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: ts.bg, color: ts.color, fontWeight: 700 }}>{tache.statut}</span>
                              </div>
                            </div>
                            {tache.statut !== 'terminée' && (
                              <div style={{ display: 'flex', gap: 8 }}>
                                {tache.statut === 'à faire' && (
                                  <button onClick={() => updateTache(selectedPiece._id, tache._id, 'en cours')}
                                    style={{ padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: 'rgba(59,130,246,0.2)', color: '#3b82f6', fontSize: 12, fontWeight: 600 }}>
                                    ▶ Commencer
                                  </button>
                                )}
                                {tache.statut === 'en cours' && (
                                  <button onClick={() => updateTache(selectedPiece._id, tache._id, 'terminée')}
                                    style={{ padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: 'rgba(34,197,94,0.2)', color: '#22c55e', fontSize: 12, fontWeight: 600 }}>
                                    ✅ Terminer
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          MODAL — Ajouter Pièce
      ══════════════════════════════════════ */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: '100%', maxWidth: 460, maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>+ Nouvelle Pièce</div>
              <button onClick={() => setShowForm(false)} aria-label="Fermer" title="Fermer"
                style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Nom de la pièce *</label>
                <input placeholder="ex: Engrenage Ø50mm"
                  value={newPiece.nom || ''}
                  onChange={e => setNewPiece(p => ({ ...p, nom: e.target.value }))}
                  style={inputStyle} />
              </div>

              <div>
                <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Chemin SolidWorks</label>
                <input placeholder="C:/SolidWorks/piece.sldprt"
                  value={newPiece.solidworksPath || ''}
                  onChange={e => setNewPiece(p => ({ ...p, solidworksPath: e.target.value }))}
                  style={inputStyle} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Quantité</label>
                  <input type="number" placeholder="0"
                    value={newPiece.quantite || ''}
                    onChange={e => setNewPiece(p => ({ ...p, quantite: Number(e.target.value) }))}
                    style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Prix unitaire (DT)</label>
                  <input type="number" placeholder="0"
                    value={newPiece.prix || ''}
                    onChange={e => setNewPiece(p => ({ ...p, prix: Number(e.target.value) }))}
                    style={inputStyle} />
                </div>
              </div>

              <div>
                <label htmlFor="select-machine" style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Machine *</label>
                <select id="select-machine" title="Machine"
                  value={newPiece.machine || ''}
                  onChange={e => setNewPiece(p => ({ ...p, machine: e.target.value }))}
                  style={selectStyle}>
                  <option value="">Choisir une machine</option>
                  {MACHINES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="select-employe" style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>
                  Employé responsable *
                </label>
                <select id="select-employe" title="Employé responsable"
                  value={newPiece.employe || ''}
                  onChange={e => setNewPiece(p => ({ ...p, employe: e.target.value }))}
                  style={selectStyle}>
                  <option value="">
                    {employes.length === 0 ? 'Aucun employé trouvé' : 'Choisir un employé'}
                  </option>
                  {employes.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="select-status" style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Status</label>
                <select id="select-status" title="Status de la pièce"
                  value={newPiece.status || 'En cours'}
                  onChange={e => setNewPiece(p => ({ ...p, status: e.target.value as Piece['status'] }))}
                  style={selectStyle}>
                  <option>En cours</option>
                  <option>Terminé</option>
                  <option>Contrôle</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="matiere" checked={newPiece.matiere !== false}
                  onChange={e => setNewPiece(p => ({ ...p, matiere: e.target.checked }))}
                  style={{ width: 16, height: 16, cursor: 'pointer' }} />
                <label htmlFor="matiere" style={{ fontSize: 13, color: '#94a3b8', cursor: 'pointer' }}>Matière disponible</label>
              </div>

              <button onClick={ajouterPiece}
                style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#0066ff,#00d4ff)', color: 'white', fontSize: 14, fontWeight: 700, marginTop: 4 }}>
                ✅ Ajouter la pièce
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductionPage;