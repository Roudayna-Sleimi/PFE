import React, { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { ArrowLeft, Activity, Zap, Bell, CheckCircle, Eye, Clock, Package, History } from 'lucide-react';
import { getMachineVisual } from '../utils/machineVisuals';
import { getMachineFunctions, type MachineFunction } from '../utils/machineFunctions';

interface Alert {
  _id: string;
  machineId?: string | null;
  node?: string | null;
  type?: string;
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
  id: string; name: string; model: string; marque?: string; type?: string; node: string; ip: string; imageUrl?: string;
  sensors: string[];
  icon: 'gear' | 'wrench' | 'bolt' | 'drill';
  sante: number;
  status: 'En marche' | 'Avertissement' | 'Arr\u00eat' | 'En maintenance';
  protocol: string; broker: string; latence: string; uptime: string;
  chipModel: string; machId: string; vibration: number; courant: number; rpm: number;
  fonctions?: MachineFunction[];
}
interface Props { machine: Machine; onBack: () => void; }

// Machines avec capteurs live (ESP32 connectés)
const LIVE_MACHINES = ['rectifieuse', 'compresseur'];
const normalizeAlertText = (value: unknown) => String(value ?? '').toLowerCase();

// ── FIX : compresseur n'a pas de tab "Pièces" ──
const getTabs = (machineId: string): string[] => {
  if (LIVE_MACHINES.includes(machineId)) {
    const isCompresseur = machineId === 'compresseur';
    return [
      'Capteurs',
      'Fonctions',
      ...(!isCompresseur ? ['Pièces'] : []),
      'Alertes',
      'Historique',
    ];
  }
  return ['Fonctions', 'Pièces', 'Historique'];
};

const getTabIcon = (tab: string) => {
  if (tab.toLowerCase().startsWith('cap')) return Activity;
  if (tab.toLowerCase().startsWith('fon')) return Zap;
  if (tab.toLowerCase().startsWith('pi')) return Package;
  if (tab.toLowerCase().startsWith('ale')) return Bell;
  return History;
};

const getMachineStatusStyle = (s: Machine['status']) => {
  if (s === 'En marche')     return { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)' };
  if (s === 'Avertissement') return { color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)' };
  if (s === 'En maintenance') return { color: '#a855f7', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)' };
  return { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' };
};

const santeColor = (v: number) => v >= 70 ? '#22c55e' : v >= 40 ? '#f97316' : '#ef4444';

const statusPieceConfig = {
  'Terminé':  { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  label: 'Termine' },
  'En cours': { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', label: 'En cours' },
  'Contrôle': { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Controle' },
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

  const hasPieces = tabs.includes('Pièces');
  const st = getMachineStatusStyle(machine.status);
  const visual = getMachineVisual({ id: machine.id, name: machine.name, icon: machine.icon, imageUrl: machine.imageUrl });
  const machineFunctions = getMachineFunctions(machine);

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

  const fetchAlerts = useCallback(async () => {
    if (!LIVE_MACHINES.includes(machine.id)) return;
    const token = localStorage.getItem('token') || '';
    setAlertsLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/alerts?limit=50', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data)) {
        setAlerts([]);
        return;
      }

      const machineId = normalizeAlertText(machine.id);
      const machId = normalizeAlertText(machine.machId);
      const node = normalizeAlertText(machine.node);
      const filtered = data.filter((alert: Alert) => {
        const alertMachineId = normalizeAlertText(alert.machineId);
        const alertNode = normalizeAlertText(alert.node);

        return (
          alertMachineId === machineId ||
          alertMachineId === machId ||
          alertNode === node ||
          (machine.id === 'rectifieuse' && (alertMachineId.includes('rectif') || alertNode.includes('esp32'))) ||
          (machine.id === 'compresseur' && (alertMachineId.includes('compress') || alertNode.includes('compress')))
        );
      });
      setAlerts(filtered);
    } catch {
      setAlerts([]);
    } finally {
      setAlertsLoading(false);
    }
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
      <div className="relative mb-5 overflow-hidden rounded-xl border border-white/[0.08] bg-slate-800/50">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-blue-500/5" />
        <div className="relative flex items-start gap-4 p-5 flex-wrap lg:flex-nowrap">
          <div className="relative h-36 w-full max-w-[260px] overflow-hidden rounded-xl border border-white/10 bg-slate-900/60">
            <img
              src={visual.image}
              alt={visual.alt}
              loading="lazy"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950/10 via-slate-950/20 to-slate-950/75" />
            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-cyan-300/35 bg-slate-950/75 px-2.5 py-1.5">
              <visual.Icon size={14} className="text-cyan-300" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-cyan-100">Machine</span>
            </div>
          </div>

          <div className="flex-1 min-w-[220px]">
            <div className="text-[17px] font-bold text-white mb-0.5">{machine.name}</div>
            <div className="text-xs text-slate-500 mb-2">
              {[machine.marque, machine.model].filter(Boolean).join(' - ') || 'Modèle non renseigné'}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-slate-700/60 border border-white/[0.08] text-slate-400">{machine.machId}</span>
              {LIVE_MACHINES.includes(machine.id) && (
                <span className="text-[10px] px-2 py-0.5 rounded-md font-bold inline-flex items-center gap-1.5"
                  style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
                  <Activity size={11} />
                  Capteurs actifs
                </span>
              )}
            </div>
          </div>

          <div className="flex min-w-[180px] flex-col items-end gap-2">
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
            {React.createElement(getTabIcon(tab), { size: 14 })} {tab}
          </button>
        ))}
      </div>

      {/* ── CAPTEURS ── */}
      {activeTab === 'Capteurs' && LIVE_MACHINES.includes(machine.id) && (
        <div className="bg-slate-800/50 border border-white/[0.08] rounded-xl p-5">
          <div className="flex items-center gap-2.5 mb-5">
            <Activity size={16} color="#3b82f6" />
            <span className="text-sm font-semibold text-white">Mesures en temps réel</span>
            <span className={`ml-auto px-2.5 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${live.isLive
              ? 'bg-green-500/10 border border-green-500/30 text-green-400'
              : 'bg-blue-500/10 border border-blue-500/30 text-blue-400'}`}>
              {live.isLive ? <><Activity size={10} /> EN DIRECT</> : <><Clock size={10} /> SIMULATION</>}
            </span>
          </div>

          {[
            { label: 'Vibration',          value: live.vibration, unit: 'mm/s', color: '#3b82f6', pct: vibPct },
            { label: 'Courant électrique', value: live.courant,   unit: 'A',    color: '#f97316', pct: couPct },
            ...(!isComp ? [{ label: 'Vitesse rotation', value: live.rpm,      unit: 'tr/min',  color: '#22c55e', pct: rpmPct  }] : []),
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
                Courant eleve
              </span>
            )}
            {live.vibration > 2 && (
              <span className="text-[11px] px-3 py-1 rounded-full font-bold"
                style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', color: '#f97316' }}>
                Vibration elevee
              </span>
            )}
            {isComp && live.pression > 10 && (
              <span className="text-[11px] px-3 py-1 rounded-full font-bold"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
                Pression critique
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
          {machineFunctions.length === 0 ? (
            <div className="text-center text-slate-500 py-16">Aucune fonction renseignée</div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {machineFunctions.map((f, i) => (
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
            <Package size={16} className="text-[#00d4ff]" />
            <span className="text-[15px] font-bold text-white">Pièces — {machine.name}</span>
            <span className="text-xs text-slate-500">{pieces.length} pièce(s)</span>
          </div>

          {pieces.length === 0 ? (
            <div className="text-center text-slate-500 py-16">
              <Package size={40} className="mb-3 text-slate-400" />
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
                        <div className="text-[10px] text-slate-500">pièces</div>
                      </div>
                      <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(34,197,94,0.1)' }}>
                        <div className="text-[16px] font-bold text-[#22c55e]">{(piece.quantite * piece.prix).toLocaleString()}</div>
                        <div className="text-[10px] text-slate-500">DT</div>
                      </div>
                    </div>
                    {!piece.matiere && (
                      <div className="mt-2 text-[10px] text-red-400 flex items-center gap-1">Matiere manquante</div>
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
          s === 'critical' ? { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', label: 'Critique' }
          : s === 'warning' ? { color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)', label: 'Avertissement' }
          : { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', label: 'Info' };

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
                {active.length > 0 ? `${active.length} active(s)` : 'Aucune alerte active'}
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
                            <span className="text-[11px] font-semibold text-[#22c55e]">Resolu</span>
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

      {/* ── HISTORIQUE ── */}
      {activeTab === 'Historique' && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <History size={38} className="text-slate-400" />
          <div className="text-base font-semibold text-white">Historique</div>
          <div className="text-sm text-slate-500">Bientôt disponible</div>
        </div>
      )}

    </div>
  );
};

export default MachineDetail;
