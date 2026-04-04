import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { ArrowLeft, Settings, Wrench, Activity, Zap } from 'lucide-react';

const socket = io('http://localhost:5000', { transports: ['websocket'] });

interface Machine {
  id: string; name: string; model: string; node: string; ip: string;
  sensors: string[];
  icon: 'gear' | 'wrench' | 'bolt' | 'drill'; // FIX: type complet — identique à MachinesPage
  sante: number;
  status: 'En marche' | 'Avertissement' | 'Arrêt' | 'En maintenance';
  protocol: string; broker: string; latence: string; uptime: string;
  chipModel: string; machId: string; vibration: number; courant: number; rpm: number;
  fonctions?: { title: string; desc: string }[];
}
interface Props { machine: Machine; onBack: () => void; }

const getTabs = (machineId: string) => {
  if (machineId === 'rectifieuse') return ['Capteurs', 'Fonctions', 'Pièces', 'Maintenance', 'Historique'];
  return ['Capteurs', 'Fonctions', 'Maintenance', 'Historique'];
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

const MachineIconDisplay = ({ icon }: { icon: Machine['icon'] }) => {
  if (icon === 'gear')  return <Settings size={26} color="#94a3b8" />;
  if (icon === 'bolt')  return <Zap size={26} color="#94a3b8" />;
  if (icon === 'drill') return <Activity size={26} color="#94a3b8" />;
  return <Wrench size={26} color="#94a3b8" />;
};

const SensorTag = ({ label, color }: { label: string; color: string }) => (
  <span className="text-[10px] px-2 py-0.5 rounded-md font-bold"
    style={{ background: color + '22', border: `1px solid ${color}66`, color }}>
    {label}
  </span>
);

interface LiveData { vibration: number; courant: number; rpm: number; isLive: boolean; }

const MachineDetail: React.FC<Props> = ({ machine, onBack }) => {
  const [activeTab, setActiveTab] = useState('Capteurs');
  const [live, setLive] = useState<LiveData>({
    vibration: machine.vibration, courant: machine.courant, rpm: machine.rpm, isLive: false,
  });
  const st = statusStyle(machine.status);

  useEffect(() => {
    const handler = (data: { node: string; courant: number; vibX: number; vibY: number; vibZ: number; rpm: number }) => {
      if (data.node !== machine.node) return;
      const vib = parseFloat(Math.sqrt(data.vibX**2 + data.vibY**2 + data.vibZ**2).toFixed(2));
      setLive({ vibration: vib, courant: data.courant, rpm: data.rpm, isLive: true });
    };
    socket.on('sensor-data', handler);
    return () => { socket.off('sensor-data', handler); };
  }, [machine.node]);

  useEffect(() => {
    if (live.isLive) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const baseVib = machine.id === 'rectifieuse' ? 1.4 : 2.8;
      const baseCou = machine.id === 'rectifieuse' ? 12.3 : 18.5;
      const baseRpm = machine.id === 'rectifieuse' ? 3096 : 1450;
      setLive(prev => {
        if (prev.isLive) return prev;
        return {
          ...prev,
          vibration: parseFloat((baseVib + Math.sin(now / 2000) * 0.4 + Math.random() * 0.2).toFixed(2)),
          courant:   parseFloat((baseCou + Math.sin(now / 3000) * 2   + Math.random() * 0.5).toFixed(1)),
          rpm:       Math.round(baseRpm  + Math.sin(now / 4000) * 80  + Math.random() * 30),
          isLive:    false,
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [live.isLive, machine.id]);

  const vibPct = Math.min(100, (live.vibration / 5)    * 100);
  const couPct = Math.min(100, (live.courant   / 30)   * 100);
  const rpmPct = Math.min(100, (live.rpm       / 4000) * 100);

  return (
    <div className="flex-1 p-6 overflow-y-auto min-w-0 w-full">

      {/* Back */}
      <button onClick={onBack}
        className="flex items-center gap-2 px-4 py-2 mb-5 bg-slate-800/50 border border-white/[0.08] rounded-lg text-slate-400 text-sm font-medium cursor-pointer hover:text-[#00d4ff] hover:border-[rgba(0,212,255,0.3)] transition-all">
        <ArrowLeft size={16} /> Retour aux machines
      </button>

      {/* Header card */}
      <div className="bg-slate-800/50 border border-white/[0.08] rounded-xl p-5 flex items-center gap-4 mb-5 flex-wrap">
        <div className="w-14 h-14 min-w-[56px] rounded-xl bg-slate-700/60 border border-white/[0.08] flex items-center justify-center flex-shrink-0">
          <MachineIconDisplay icon={machine.icon} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-bold text-white mb-0.5">{machine.name}</div>
          <div className="text-xs text-slate-500 mb-2">{machine.model}</div>
          <div className="flex flex-wrap gap-1.5">
            <SensorTag label={machine.node}      color="#22c55e" />
            <SensorTag label={machine.ip}        color="#a855f7" />
            <SensorTag label={machine.chipModel} color="#3b82f6" />
            <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-slate-700/60 border border-white/[0.08] text-slate-400">
              {machine.machId}
            </span>
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
        {getTabs(machine.id).map(tab => (
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
      {activeTab === 'Capteurs' && (
        <div className="grid grid-cols-1 gap-4">
          <div className="bg-slate-800/50 border border-white/[0.08] rounded-xl p-5">
            <div className="flex items-center gap-2.5 mb-5">
              <Activity size={16} color="#3b82f6" />
              <span className="text-sm font-semibold text-white">Mesures en Temps Réel</span>
              <span className={`ml-auto px-2.5 py-0.5 rounded-full text-[10px] font-bold ${live.isLive ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-blue-500/10 border border-blue-500/30 text-blue-400'}`}>
                {live.isLive ? '● LIVE' : '◎ SIMULATION'}
              </span>
            </div>

            {[
              { label: 'Vibration',          tags: [['ADXL345','#3b82f6'],['GPIO21/22 I2C','#06b6d4']] as [string,string][], value: live.vibration, color: '#3b82f6', pct: vibPct },
              { label: 'Courant électrique', tags: [['SCT-013','#f97316'],['GPIO34 ADC','#a855f7']]    as [string,string][], value: live.courant,   color: '#f97316', pct: couPct },
              { label: 'Vitesse rotation',   tags: [['Hall Sensor','#22c55e'],['GPIO35','#06b6d4']]    as [string,string][], value: live.rpm,       color: '#22c55e', pct: rpmPct },
            ].map((m, i) => (
              <div key={i} className="mb-5">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium text-slate-300">{m.label}</span>
                    {m.tags.map(([l, c]) => <SensorTag key={l} label={l} color={c} />)}
                  </div>
                  <span className="text-[20px] font-bold font-mono" style={{ color: m.color }}>{m.value}</span>
                </div>
                <div className="h-2 bg-slate-700/60 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${m.pct}%`, background: m.color }} />
                </div>
              </div>
            ))}

            {/* LEDs */}
            <div className="flex gap-4 flex-wrap mt-2">
              {[
                { label: 'D12 GREEN', color: '#22c55e', on: true  },
                { label: 'D14 YEL',   color: '#fbbf24', on: false },
                { label: 'D27 RED',   color: '#ef4444', on: false },
                { label: 'D26 BLK',   color: '#475569', on: false },
              ].map(led => (
                <div key={led.label} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full"
                    style={{ background: led.on ? led.color : 'rgba(255,255,255,0.08)', boxShadow: led.on ? `0 0 8px ${led.color}` : 'none' }} />
                  <span className="text-[11px] text-slate-400">{led.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── FONCTIONS ── */}
      {activeTab === 'Fonctions' && machine.fonctions && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-base">⚡</span>
            <span className="text-[15px] font-bold text-white">Fonctions de la Machine</span>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {machine.fonctions.map((f, i) => (
              <div key={i} className="bg-slate-800/50 border border-white/[0.08] rounded-xl p-4 hover:border-[rgba(0,212,255,0.2)] transition-all">
                <div className="text-sm font-semibold text-[#00d4ff] mb-1">▸ {f.title}</div>
                <div className="text-xs text-slate-400">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BIENTÔT ── */}
      {activeTab !== 'Capteurs' && activeTab !== 'Fonctions' && (
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