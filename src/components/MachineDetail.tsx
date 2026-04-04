import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { ArrowLeft, Activity, Zap } from 'lucide-react';

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

const getTabs = (machineId: string): string[] => {
  if (LIVE_MACHINES.includes(machineId)) {
    return ['Capteurs', 'Fonctions', 'Pièces', 'Maintenance', 'Historique'];
  }
  return ['Fonctions', 'Pièces', 'Maintenance', 'Historique'];
};

const tabIcon: Record<string, string> = {
  Capteurs: '🔌', Fonctions: '⚡', Pièces: '⚙️', Maintenance: '🔧', Historique: '📋',
};

const statusStyle = (s: Machine['status']) => {
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
  const st = statusStyle(machine.status);

  // Fetch pièces de cette machine
  useEffect(() => {
    const token = localStorage.getItem('token') || '';
    fetch(`http://localhost:5000/api/pieces?machine=${encodeURIComponent(machine.name)}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setPieces(data); })
      .catch(() => {});
  }, [machine.name]);

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

  // Simulation seulement pour Rectifieuse/Compresseur si pas de live
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

  const vibPct = Math.min(100, (live.vibration / 5)    * 100);
  const couPct = Math.min(100, (live.courant   / 30)   * 100);
  const rpmPct = Math.min(100, (live.rpm       / 5000) * 100);
  const presPct = Math.min(100, (live.pression / 12)   * 100);

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
              <span className="text-[10px] px-2 py-0.5 rounded-md font-bold" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
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

      {/* ── CAPTEURS (Rectifieuse + Compresseur seulement) ── */}
      {activeTab === 'Capteurs' && LIVE_MACHINES.includes(machine.id) && (
        <div className="bg-slate-800/50 border border-white/[0.08] rounded-xl p-5">
          <div className="flex items-center gap-2.5 mb-5">
            <Activity size={16} color="#3b82f6" />
            <span className="text-sm font-semibold text-white">Mesures en Temps Réel</span>
            <span className={`ml-auto px-2.5 py-0.5 rounded-full text-[10px] font-bold ${live.isLive ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-blue-500/10 border border-blue-500/30 text-blue-400'}`}>
              {live.isLive ? '● LIVE' : '◎ SIMULATION'}
            </span>
          </div>

          {/* Mesures communes */}
          {[
            { label: 'Vibration',          value: live.vibration, unit: 'mm/s', color: '#3b82f6', pct: vibPct },
            { label: 'Courant électrique', value: live.courant,   unit: 'A',    color: '#f97316', pct: couPct },
            ...(!isComp ? [{ label: 'Vitesse rotation', value: live.rpm, unit: 'RPM', color: '#22c55e', pct: rpmPct }] : []),
            ...(isComp  ? [{ label: 'Pression',          value: live.pression, unit: 'bar', color: '#06b6d4', pct: presPct }] : []),
          ].map((m, i) => (
            <div key={i} className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-300">{m.label}</span>
                <span className="text-[20px] font-bold font-mono" style={{ color: m.color }}>
                  {m.value} <span className="text-sm">{m.unit}</span>
                </span>
              </div>
              <div className="h-2 bg-slate-700/60 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${m.pct}%`, background: m.color }} />
              </div>
            </div>
          ))}

          {/* Alertes rapides */}
          <div className="mt-2 flex gap-3 flex-wrap">
            {live.courant > 15 && (
              <span className="text-[11px] px-3 py-1 rounded-full font-bold" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
                ⚠️ Courant élevé
              </span>
            )}
            {live.vibration > 2 && (
              <span className="text-[11px] px-3 py-1 rounded-full font-bold" style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', color: '#f97316' }}>
                ⚠️ Vibration élevée
              </span>
            )}
            {isComp && live.pression > 10 && (
              <span className="text-[11px] px-3 py-1 rounded-full font-bold" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
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

      {/* ── PIÈCES (liées à cette machine mel MongoDB) ── */}
      {activeTab === 'Pièces' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-base">⚙️</span>
            <span className="text-[15px] font-bold text-white">Pièces — {machine.name}</span>
            <span className="ml-auto text-xs text-slate-500">{pieces.length} pièce(s)</span>
          </div>
          {pieces.length === 0 ? (
            <div className="text-center text-slate-500 py-16">
              <div className="text-4xl mb-3">⚙️</div>
              <div>Aucune pièce enregistrée pour cette machine</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {pieces.map(piece => {
                const st = statusPieceConfig[piece.status];
                return (
                  <div key={piece._id} className="bg-slate-800/50 border border-white/[0.08] rounded-xl p-4 hover:border-[rgba(0,212,255,0.2)] transition-all">
                    <div className="flex items-start justify-between mb-3">
                      <div className="text-sm font-bold text-white">{piece.nom}</div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                        style={{ background: st.bg, color: st.color }}>
                        {st.label}
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

      {/* ── BIENTÔT (Maintenance + Historique) ── */}
      {activeTab !== 'Capteurs' && activeTab !== 'Fonctions' && activeTab !== 'Pièces' && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="text-4xl">{tabIcon[activeTab]}</div>
          <div className="text-base font-semibold text-white">Section {activeTab}</div>
          <div className="text-sm text-slate-500">Bientôt disponible</div>
        </div>
      )}
    </div>
  );
};

export default MachineDetail;