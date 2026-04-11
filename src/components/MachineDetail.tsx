import React, { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { ArrowLeft, Activity, Zap, Bell, CheckCircle, Eye, Clock, Wrench, Plus, X } from 'lucide-react';

interface Alert {
  _id: string;
  machineId: string;
  node: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  status: 'new' | 'seen' | 'resolved' | 'notified';
  createdAt: string;
  seenAt?: string;
  seenBy?: string;
  sensorSnapshot?: Record<string, number>;
}

const socket = io('http://localhost:5000', { transports: ['websocket'] });

// ─── Types ───────────────────────────────────────────────
interface Piece {
  _id: string;
  nom: string;
  quantite: number;
  prix: number;
  status: 'Terminé' | 'En cours' | 'Contrôle';
  matiere: boolean;
}

interface Machine {
  id: string; name: string; model: string; node: string; ip: string;
  sensors: string[];
  icon: 'gear' | 'wrench' | 'bolt' | 'drill';
  sante: number;
  status: 'En marche' | 'Avertissement' | 'Arrêt' | 'En maintenance';
  protocol: string; broker: string; latence: string; uptime: string;
  chipModel: string; machId: string; vibration: number; courant: number; rpm: number;
  fonctions?: { title: string; desc: string }[];
}
interface Props { machine: Machine; onBack: () => void; }

// Machines avec capteurs live (ESP32 connectés)
const LIVE_MACHINES = ['rectifieuse', 'compresseur'];

// ── FIX : compresseur n'a pas de tab "Pièces" ──
const getTabs = (machineId: string): string[] => {
  if (LIVE_MACHINES.includes(machineId)) {
    const isCompresseur = machineId === 'compresseur';
    return [
      'Capteurs',
      'Fonctions',
      ...(!isCompresseur ? ['Pièces'] : []),
      'Alertes',
      'Maintenance',
      'Historique',
    ];
  }
  return ['Fonctions', 'Pièces', 'Maintenance', 'Historique'];
};

const tabIcon: Record<string, string> = {
  Capteurs: '🔌', Fonctions: '⚡', Pièces: '⚙️', Alertes: '🔔', Maintenance: '🔧', Historique: '📋',
};

const getMachineStatusStyle = (s: Machine['status']) => {
  if (s === 'En marche')     return { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)' };
  if (s === 'Avertissement') return { color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)' };
  if (s === 'En maintenance') return { color: '#a855f7', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)' };
  return { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' };
};

const santeColor = (v: number) => v >= 70 ? '#22c55e' : v >= 40 ? '#f97316' : '#ef4444';

const statusPieceConfig = {
  'Terminé':  { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  label: '✅ Terminé' },
  'En cours': { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', label: '🔄 En cours' },
  'Contrôle': { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: '🔍 Contrôle' },
};

interface LiveData { vibration: number; courant: number; rpm: number; pression: number; isLive: boolean; }

const MachineDetail: React.FC<Props> = ({ machine, onBack }) => {
  const tabs = getTabs(machine.id);
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [pieces, setPieces]       = useState<Piece[]>([]);
  const [live, setLive]           = useState<LiveData>({
    vibration: machine.vibration, courant: machine.courant,
    rpm: machine.rpm, pression: 0, isLive: false,
  });
  const [alerts, setAlerts]           = useState<Alert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [showAddPiece, setShowAddPiece] = useState(false);
  const [newPiece, setNewPiece] = useState({ nom: '', quantite: '', prix: '', status: 'En cours' as Piece['status'], matiere: true });
  const [addingPiece, setAddingPiece] = useState(false);
  const role = localStorage.getItem('role');

  const hasPieces = tabs.includes('Pièces');
  const st = getMachineStatusStyle(machine.status);

  const piecesMachineName = (() => {
    if (machine.id === 'rectifieuse') return 'Rectifieuse';
    if (machine.id === 'agie-cut') return 'Agie Cut';
    if (machine.id === 'agie-drill') return 'Agie Drill';
    if (machine.id === 'haas-cnc') return 'HAAS CNC';
    if (machine.id === 'tour-cnc') return 'Tour CNC';
    if (/rectifi/i.test(machine.name)) return 'Rectifieuse';
    if (/agie cut/i.test(machine.name)) return 'Agie Cut';
    if (/agie drill/i.test(machine.name)) return 'Agie Drill';
    if (/haas/i.test(machine.name)) return 'HAAS CNC';
    if (/mazak|tour cnc/i.test(machine.name)) return 'Tour CNC';
    return machine.name;
  })();

  const handleAddPiece = async () => {
    if (!newPiece.nom || !newPiece.quantite || !newPiece.prix) return;
    const token = localStorage.getItem('token') || '';
    setAddingPiece(true);
    try {
      await fetch('http://localhost:5000/api/pieces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nom: newPiece.nom,
          quantite: Number(newPiece.quantite),
          prix: Number(newPiece.prix),
          status: newPiece.status,
          matiere: newPiece.matiere,
          machine: piecesMachineName,
        }),
      });
      setShowAddPiece(false);
      setNewPiece({ nom: '', quantite: '', prix: '', status: 'En cours', matiere: true });
      const r = await fetch(`http://localhost:5000/api/pieces?machine=${encodeURIComponent(piecesMachineName)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await r.json();
      if (Array.isArray(data)) setPieces(data);
    } catch { /* ignore */ }
    finally { setAddingPiece(false); }
  };

  const fetchAlerts = useCallback(() => {
    if (!LIVE_MACHINES.includes(machine.id)) return;
    const token = localStorage.getItem('token') || '';
    setAlertsLoading(true);
    fetch('http://localhost:5000/api/alerts?limit=50', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then((data: Alert[]) => {
        if (!Array.isArray(data)) return;
        const filtered = data.filter(a =>
          a.machineId === machine.id ||
          a.machineId === machine.machId ||
          a.node === machine.node ||
          (machine.id === 'rectifieuse' && (a.machineId?.toLowerCase().includes('rectif') || a.node?.toLowerCase().includes('esp32'))) ||
          (machine.id === 'compresseur' && (a.machineId?.toLowerCase().includes('compress') || a.node?.toLowerCase().includes('compress')))
        );
        setAlerts(filtered);
      })
      .catch(() => {})
      .finally(() => setAlertsLoading(false));
  }, [machine.id, machine.machId, machine.node]);

  useEffect(() => {
    if (activeTab === 'Alertes') fetchAlerts();
  }, [activeTab, fetchAlerts]);

  const handleMarkSeen = async (alertId: string) => {
    const token = localStorage.getItem('token') || '';
    await fetch(`http://localhost:5000/api/alerts/${alertId}/seen`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}` }
    });
    fetchAlerts();
  };

  const handleResolve = async (alertId: string) => {
    const token = localStorage.getItem('token') || '';
    await fetch(`http://localhost:5000/api/alerts/${alertId}/resolve`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}` }
    });
    fetchAlerts();
  };

  // Fetch pièces — seulement si le tab existe (donc jamais pour compresseur)
  useEffect(() => {
    if (!hasPieces) return;
    const token = localStorage.getItem('token') || '';
    fetch(`http://localhost:5000/api/pieces?machine=${encodeURIComponent(piecesMachineName)}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setPieces(data); })
      .catch(() => {});
  }, [piecesMachineName, hasPieces]);

  // Socket live — seulement pour les machines avec capteurs
  useEffect(() => {
    if (!LIVE_MACHINES.includes(machine.id)) return;
    const handler = (data: { node: string; courant: number; vibX: number; vibY: number; vibZ: number; rpm: number; pression?: number }) => {
      if (data.node !== machine.node) return;
      const vib = parseFloat(Math.sqrt(data.vibX**2 + data.vibY**2 + data.vibZ**2).toFixed(2));
      setLive({ vibration: vib, courant: data.courant, rpm: data.rpm, pression: data.pression ?? 0, isLive: true });
    };
    socket.on('sensor-data', handler);
    return () => { socket.off('sensor-data', handler); };
  }, [machine.node, machine.id]);

  // Simulation fallback
  useEffect(() => {
    if (!LIVE_MACHINES.includes(machine.id) || live.isLive) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const isComp = machine.id === 'compresseur';
      setLive(prev => {
        if (prev.isLive) return prev;
        return {
          ...prev,
          vibration: parseFloat(((isComp ? 2.8 : 1.4) + Math.sin(now / 2000) * 0.4 + Math.random() * 0.2).toFixed(2)),
          courant:   parseFloat(((isComp ? 18.5 : 12.3) + Math.sin(now / 3000) * 2 + Math.random() * 0.5).toFixed(1)),
          rpm:       isComp ? 1450 : Math.round(3096 + Math.sin(now / 4000) * 80 + Math.random() * 30),
          pression:  isComp ? parseFloat((7.5 + Math.sin(now / 4000) * 1.5).toFixed(1)) : 0,
          isLive:    false,
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [live.isLive, machine.id]);

  const vibPct  = Math.min(100, (live.vibration / 5)    * 100);
  const couPct  = Math.min(100, (live.courant   / 30)   * 100);
  const rpmPct  = Math.min(100, (live.rpm       / 5000) * 100);
  const presPct = Math.min(100, (live.pression  / 12)   * 100);

  const isComp = machine.id === 'compresseur';

  return (
    <div className="flex-1 p-6 overflow-y-auto min-w-0 w-full">

      {/* Back */}
      <button onClick={onBack}
        className="flex items-center gap-2 px-4 py-2 mb-5 bg-slate-800/50 border border-white/[0.08] rounded-lg text-slate-400 text-sm font-medium cursor-pointer hover:text-[#00d4ff] hover:border-[rgba(0,212,255,0.3)] transition-all">
        <ArrowLeft size={16} /> Retour aux machines
      </button>

      {/* Header card */}
      <div className="bg-slate-800/50 border border-white/[0.08] rounded-xl p-5 flex items-center gap-4 mb-5 flex-wrap">
        <div className="w-14 h-14 min-w-[56px] rounded-xl bg-slate-700/60 border border-white/[0.08] flex items-center justify-center text-4xl flex-shrink-0">
          {machine.icon === 'gear' ? '⚙️' : machine.icon === 'bolt' ? '⚡' : machine.icon === 'drill' ? '🔩' : '🔧'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-bold text-white mb-0.5">{machine.name}</div>
          <div className="text-xs text-slate-500 mb-2">{machine.model}</div>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-slate-700/60 border border-white/[0.08] text-slate-400">{machine.machId}</span>
            {LIVE_MACHINES.includes(machine.id) && (
              <span className="text-[10px] px-2 py-0.5 rounded-md font-bold"
                style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
                ● Capteurs actifs
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold"
            style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.color }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.color }} />
            {machine.status}
          </span>
          <span className="text-[20px] font-bold" style={{ color: santeColor(machine.sante) }}>
            {machine.sante}% santé
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all border
              ${activeTab === tab
                ? 'text-[#00d4ff] border-[rgba(0,212,255,0.3)]'
                : 'text-slate-400 border-white/[0.08] bg-slate-800/50 hover:text-[#00d4ff] hover:border-[rgba(0,212,255,0.2)]'}`}
            style={activeTab === tab ? { background: 'linear-gradient(135deg,rgba(0,102,255,0.15),rgba(0,212,255,0.15))' } : {}}>
            {tabIcon[tab]} {tab}
          </button>
        ))}
      </div>

      {/* ── CAPTEURS ── */}
      {activeTab === 'Capteurs' && LIVE_MACHINES.includes(machine.id) && (
        <div className="bg-slate-800/50 border border-white/[0.08] rounded-xl p-5">
          <div className="flex items-center gap-2.5 mb-5">
            <Activity size={16} color="#3b82f6" />
            <span className="text-sm font-semibold text-white">Mesures en Temps Réel</span>
            <span className={`ml-auto px-2.5 py-0.5 rounded-full text-[10px] font-bold ${live.isLive
              ? 'bg-green-500/10 border border-green-500/30 text-green-400'
              : 'bg-blue-500/10 border border-blue-500/30 text-blue-400'}`}>
              {live.isLive ? '● LIVE' : '◎ SIMULATION'}
            </span>
          </div>

          {[
            { label: 'Vibration',          value: live.vibration, unit: 'mm/s', color: '#3b82f6', pct: vibPct },
            { label: 'Courant électrique', value: live.courant,   unit: 'A',    color: '#f97316', pct: couPct },
            ...(!isComp ? [{ label: 'Vitesse rotation', value: live.rpm,      unit: 'RPM',  color: '#22c55e', pct: rpmPct  }] : []),
            ...(isComp  ? [{ label: 'Pression',          value: live.pression, unit: 'bar',  color: '#06b6d4', pct: presPct }] : []),
          ].map((m, i) => (
            <div key={i} className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-300">{m.label}</span>
                <span className="text-[20px] font-bold font-mono" style={{ color: m.color }}>
                  {m.value} <span className="text-sm">{m.unit}</span>
                </span>
              </div>
              <div className="h-2 bg-slate-700/60 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${m.pct}%`, background: m.color }} />
              </div>
            </div>
          ))}

          <div className="mt-2 flex gap-3 flex-wrap">
            {live.courant > 15 && (
              <span className="text-[11px] px-3 py-1 rounded-full font-bold"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
                ⚠️ Courant élevé
              </span>
            )}
            {live.vibration > 2 && (
              <span className="text-[11px] px-3 py-1 rounded-full font-bold"
                style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', color: '#f97316' }}>
                ⚠️ Vibration élevée
              </span>
            )}
            {isComp && live.pression > 10 && (
              <span className="text-[11px] px-3 py-1 rounded-full font-bold"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
                ⚠️ Pression critique
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── FONCTIONS ── */}
      {activeTab === 'Fonctions' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Zap size={16} color="#00d4ff" />
            <span className="text-[15px] font-bold text-white">Fonctions de la Machine</span>
          </div>
          {(!machine.fonctions || machine.fonctions.length === 0) ? (
            <div className="text-center text-slate-500 py-16">Aucune fonction renseignée</div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {machine.fonctions.map((f, i) => (
                <div key={i} className="bg-slate-800/50 border border-white/[0.08] rounded-xl p-4 hover:border-[rgba(0,212,255,0.2)] transition-all">
                  <div className="text-sm font-semibold text-[#00d4ff] mb-1">▸ {f.title}</div>
                  <div className="text-xs text-slate-400">{f.desc}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── PIÈCES (jamais affiché pour compresseur grâce à getTabs) ── */}
      {hasPieces && activeTab === 'Pièces' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-base">⚙️</span>
            <span className="text-[15px] font-bold text-white">Pièces — {machine.name}</span>
            <span className="text-xs text-slate-500">{pieces.length} pièce(s)</span>
            {role === 'admin' && (
              <button onClick={() => setShowAddPiece(true)}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all"
                style={{ background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff' }}>
                <Plus size={13} /> Nouvelle Pièce
              </button>
            )}
          </div>

          {/* Modal Nouvelle Pièce */}
          {showAddPiece && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
              <div className="bg-slate-800 border border-white/[0.1] rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                  <span className="text-base font-bold text-white">Nouvelle Pièce — {machine.name}</span>
                  <button onClick={() => setShowAddPiece(false)} title="Fermer"
                    className="text-slate-400 hover:text-white transition-colors cursor-pointer">
                    <X size={18} />
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Nom de la pièce *</label>
                    <input value={newPiece.nom}
                      onChange={e => setNewPiece(p => ({ ...p, nom: e.target.value }))}
                      placeholder="Ex: Engrenage Z24"
                      className="w-full bg-slate-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Quantité *</label>
                      <input type="number" value={newPiece.quantite}
                        onChange={e => setNewPiece(p => ({ ...p, quantite: e.target.value }))}
                        placeholder="0"
                        className="w-full bg-slate-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Prix unitaire (DT) *</label>
                      <input type="number" value={newPiece.prix}
                        onChange={e => setNewPiece(p => ({ ...p, prix: e.target.value }))}
                        placeholder="0.00"
                        className="w-full bg-slate-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Statut</label>
                    <select aria-label="Statut de la pièce" value={newPiece.status}
                      onChange={e => setNewPiece(p => ({ ...p, status: e.target.value as Piece['status'] }))}
                      className="w-full bg-slate-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors">
                      <option value="En cours">🔄 En cours</option>
                      <option value="Contrôle">🔍 Contrôle</option>
                      <option value="Terminé">✅ Terminé</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <input type="checkbox" id="matiere" checked={newPiece.matiere}
                      onChange={e => setNewPiece(p => ({ ...p, matiere: e.target.checked }))}
                      className="w-4 h-4 accent-cyan-400" />
                    <label htmlFor="matiere" className="text-sm text-slate-300 cursor-pointer">Matière disponible</label>
                  </div>
                </div>
                <div className="flex gap-3 mt-5">
                  <button onClick={() => setShowAddPiece(false)}
                    className="flex-1 py-2 rounded-lg text-sm font-medium text-slate-400 border border-white/10 hover:border-white/20 transition-all cursor-pointer">
                    Annuler
                  </button>
                  <button onClick={handleAddPiece}
                    disabled={addingPiece || !newPiece.nom || !newPiece.quantite || !newPiece.prix}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg,rgba(0,102,255,0.8),rgba(0,212,255,0.8))', color: 'white' }}>
                    {addingPiece ? 'Ajout...' : 'Ajouter'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {pieces.length === 0 ? (
            <div className="text-center text-slate-500 py-16">
              <div className="text-4xl mb-3">⚙️</div>
              <div>Aucune pièce enregistrée pour cette machine</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {pieces.map(piece => {
                const sc = statusPieceConfig[piece.status];
                return (
                  <div key={piece._id}
                    className="bg-slate-800/50 border border-white/[0.08] rounded-xl p-4 hover:border-[rgba(0,212,255,0.2)] transition-all">
                    <div className="flex items-start justify-between mb-3">
                      <div className="text-sm font-bold text-white">{piece.nom}</div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                        style={{ background: sc.bg, color: sc.color }}>
                        {sc.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(59,130,246,0.1)' }}>
                        <div className="text-[16px] font-bold text-[#3b82f6]">{piece.quantite}</div>
                        <div className="text-[10px] text-slate-500">pcs</div>
                      </div>
                      <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(34,197,94,0.1)' }}>
                        <div className="text-[16px] font-bold text-[#22c55e]">{(piece.quantite * piece.prix).toLocaleString()}</div>
                        <div className="text-[10px] text-slate-500">DT</div>
                      </div>
                    </div>
                    {!piece.matiere && (
                      <div className="mt-2 text-[10px] text-red-400 flex items-center gap-1">⚠️ Matière manquante</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── ALERTES ── */}
      {activeTab === 'Alertes' && LIVE_MACHINES.includes(machine.id) && (() => {
        const sevColor = (s: Alert['severity']) =>
          s === 'critical' ? { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', label: '🔴 Critique' }
          : s === 'warning' ? { color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)', label: '🟠 Avertissement' }
          : { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', label: '🔵 Info' };

        const statusLabel = (s: Alert['status']) =>
          s === 'new'        ? { text: 'Nouveau',  color: '#ef4444' }
          : s === 'seen'     ? { text: 'Vu',       color: '#f59e0b' }
          : s === 'notified' ? { text: 'Notifié',  color: '#a855f7' }
          : { text: 'Résolu', color: '#22c55e' };

        const active   = alerts.filter(a => a.status !== 'resolved');
        const resolved = alerts.filter(a => a.status === 'resolved');

        return (
          <div>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Bell size={16} color="#f97316" />
              <span className="text-[15px] font-bold text-white">Alertes — {machine.name}</span>
              <span className="ml-auto text-xs px-2.5 py-0.5 rounded-full font-bold"
                style={{
                  background: active.length > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                  border: `1px solid ${active.length > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                  color: active.length > 0 ? '#ef4444' : '#22c55e'
                }}>
                {active.length > 0 ? `${active.length} active(s)` : '✓ Aucune alerte active'}
              </span>
              <button onClick={fetchAlerts}
                className="text-xs px-3 py-1 rounded-lg border border-white/[0.08] text-slate-400 hover:text-[#00d4ff] hover:border-[rgba(0,212,255,0.3)] transition-all cursor-pointer">
                ↻ Actualiser
              </button>
            </div>

            {alertsLoading ? (
              <div className="text-center text-slate-500 py-16 animate-pulse">Chargement des alertes...</div>
            ) : alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <CheckCircle size={40} color="#22c55e" />
                <div className="text-base font-semibold text-white">Aucune alerte</div>
                <div className="text-sm text-slate-500">Cette machine fonctionne normalement</div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {active.length > 0 && (
                  <>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Alertes actives</div>
                    {active.map(alert => {
                      const sev = sevColor(alert.severity);
                      const sl  = statusLabel(alert.status);
                      return (
                        <div key={alert._id} className="rounded-xl p-4 border transition-all"
                          style={{ background: sev.bg, borderColor: sev.border }}>
                          <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] px-2 py-0.5 rounded-full font-bold"
                                style={{ background: sev.bg, border: `1px solid ${sev.border}`, color: sev.color }}>
                                {sev.label}
                              </span>
                              <span className="text-[11px] font-semibold" style={{ color: sl.color }}>● {sl.text}</span>
                            </div>
                            <span className="text-[10px] text-slate-500 flex-shrink-0 flex items-center gap-1">
                              <Clock size={10} /> {new Date(alert.createdAt).toLocaleString('fr-FR')}
                            </span>
                          </div>
                          <div className="text-sm text-white font-medium mb-3">{alert.message}</div>
                          {alert.sensorSnapshot && Object.keys(alert.sensorSnapshot).length > 0 && (
                            <div className="flex gap-2 flex-wrap mb-3">
                              {Object.entries(alert.sensorSnapshot).map(([k, v]) => (
                                <span key={k} className="text-[10px] px-2 py-0.5 rounded bg-slate-700/60 text-slate-400 border border-white/[0.06]">
                                  {k}: <span className="text-white font-bold">{v}</span>
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2">
                            {alert.status === 'new' && (
                              <button onClick={() => handleMarkSeen(alert._id)}
                                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-all"
                                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
                                <Eye size={11} /> Marquer vu
                              </button>
                            )}
                            <button onClick={() => handleResolve(alert._id)}
                              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-all"
                              style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
                              <CheckCircle size={11} /> Résoudre
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {resolved.length > 0 && (
                  <>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-2 mb-1">
                      Alertes résolues ({resolved.length})
                    </div>
                    {resolved.map(alert => {
                      const sev = sevColor(alert.severity);
                      return (
                        <div key={alert._id}
                          className="rounded-xl p-4 border border-white/[0.06] bg-slate-800/30 opacity-60">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-bold"
                              style={{ background: sev.bg, border: `1px solid ${sev.border}`, color: sev.color }}>
                              {sev.label}
                            </span>
                            <span className="text-[11px] font-semibold text-[#22c55e]">✓ Résolu</span>
                            <span className="text-[10px] text-slate-500 ml-auto">
                              {new Date(alert.createdAt).toLocaleString('fr-FR')}
                            </span>
                          </div>
                          <div className="text-sm text-slate-400">{alert.message}</div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── MAINTENANCE ── */}
      {activeTab === 'Maintenance' && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,rgba(168,85,247,0.15),rgba(0,212,255,0.15))', border: '1px solid rgba(168,85,247,0.3)' }}>
            <Wrench size={36} color="#a855f7" />
          </div>
          <div className="text-[18px] font-bold text-white">Maintenance Prédictive</div>
          <div className="text-sm text-slate-400 text-center max-w-sm">
            Module IA en cours de développement.<br />
            Prédiction des pannes et planning automatique bientôt disponibles.
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold"
            style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7' }}>
            🤖 IA Prédictive — Coming Soon
          </div>
        </div>
      )}

      {/* ── HISTORIQUE ── */}
      {activeTab === 'Historique' && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="text-4xl">📋</div>
          <div className="text-base font-semibold text-white">Historique</div>
          <div className="text-sm text-slate-500">Bientôt disponible</div>
        </div>
      )}

    </div>
  );
};

export default MachineDetail;