import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Zap, Thermometer, Activity, Search, Plus, X, Trash2 } from 'lucide-react';
import { io } from 'socket.io-client';
import MachineDetail from './MachineDetail';

const socket = io('http://localhost:5000', { transports: ['websocket'] });

// ─── Types ───────────────────────────────────────────────
interface Probleme { severity: 'critical' | 'warning'; title: string; desc: string; time: string; }

interface Machine {
  id: string;
  name: string;
  model: string;
  type: string;
  node: string;
  ip: string;
  icon: 'gear' | 'wrench' | 'bolt' | 'drill';
  sensors: string[];
  status: 'En marche' | 'Avertissement' | 'Arrêt' | 'En maintenance';
  sante: number;
  production: number;
  objectif: number;
  efficacite: number;
  heures: number;
  temperature: number;
  courant: number;
  vibration: number;
  rpm: number;
  pression?: number;
  protocol: string;
  broker: string;
  latence: string;
  uptime: string;
  chipModel: string;
  machId: string;
  problems: Probleme[];
  fonctions?: { title: string; desc: string }[];
}

// ─── Données initiales ────────────────────────────────────
const INITIAL_MACHINES: Machine[] = [
  {
    id: 'haas-cnc', name: 'HAAS CNC Milling Machine', model: 'HAAS VF-2SS', type: 'Fraiseuse CNC',
    node: '-', ip: '192.168.1.101', icon: 'gear',
    sensors: [], status: 'En marche',
    sante: 85, production: 686, objectif: 700, efficacite: 93.6, heures: 156,
    temperature: 43.5, courant: 0, vibration: 0, rpm: 0,
    protocol: '—', broker: '—', latence: '—', uptime: '—',
    chipModel: '—', machId: 'MACH-HAAS-001',
    problems: [],
    fonctions: [],
  },
  {
    id: 'agie-cut', name: 'Agie Cut Classic', model: 'AgieCharmilles CUT 20 P', type: 'Électroérosion à fil',
    node: '-', ip: '192.168.1.102', icon: 'bolt',
    sensors: [], status: 'En marche',
    sante: 78, production: 458, objectif: 450, efficacite: 91.3, heures: 142,
    temperature: 45.1, courant: 0, vibration: 0, rpm: 0,
    protocol: '—', broker: '—', latence: '—', uptime: '—',
    chipModel: '—', machId: 'MACH-AGIE-002',
    problems: [],
    fonctions: [],
  },
  {
    id: 'rectifieuse', name: 'Rectifieuse de Surface', model: 'Surface Grinding SG-400', type: 'Rectification plane',
    node: 'ESP32-NODE-03', ip: '192.168.1.103', icon: 'gear',
    sensors: ['ADXL345', 'SCT-013', 'Hall Sensor'], status: 'En marche',
    sante: 71, production: 312, objectif: 350, efficacite: 88.4, heures: 98,
    temperature: 38.2, courant: 12.3, vibration: 1.4, rpm: 3096,
    protocol: 'WiFi 2.4GHz', broker: '192.168.1.10:1883', latence: '12 ms', uptime: '8h 45min',
    chipModel: 'ESP32-WROOM-32D', machId: 'MACH-RCT-003',
    problems: [],
    fonctions: [
      { title: 'Rectification plane',       desc: 'Surfaçage de pièces métalliques avec précision ±0.01mm' },
      { title: 'Rectification cylindrique', desc: 'Finition de surfaces cylindriques internes/externes' },
      { title: 'Dressage de meule',         desc: 'Reconditionnement automatique de la meule abrasive' },
    ],
  },
  {
    id: 'agie-drill', name: 'Agie Drill', model: 'AgieCharmilles DRILL 20', type: 'Perçage EDM',
    node: '-', ip: '192.168.1.104', icon: 'drill',
    sensors: [], status: 'En marche',
    sante: 82, production: 390, objectif: 400, efficacite: 89.8, heures: 120,
    temperature: 41.2, courant: 0, vibration: 0, rpm: 0,
    protocol: '—', broker: '—', latence: '—', uptime: '—',
    chipModel: '—', machId: 'MACH-DRL-004',
    problems: [],
    fonctions: [],
  },
  {
    id: 'compresseur', name: 'Compresseur ABAC FORMULA 7.5', model: 'ABAC FORMULA 7.5 – 270L', type: 'Compresseur à vis',
    node: 'compresseur', ip: '192.168.1.105', icon: 'wrench',
    sensors: ['ADXL345', 'SCT-013', 'Pression'], status: 'En marche',
    sante: 90, production: 0, objectif: 0, efficacite: 0, heures: 210,
    temperature: 37.0, courant: 8.2, vibration: 0.3, rpm: 0, pression: 0,
    protocol: 'WiFi 2.4GHz', broker: 'mqtt', latence: '—', uptime: '—',
    chipModel: 'ESP32', machId: 'MACH-CMP-005',
    problems: [],
    fonctions: [],
  },
  {
    id: 'tour-cnc', name: 'Tour CNC MAZAK', model: 'MAZAK QT-PRIMOS 150', type: 'Tour à commande numérique',
    node: '-', ip: '192.168.1.106', icon: 'gear',
    sensors: [], status: 'En marche',
    sante: 90, production: 523, objectif: 500, efficacite: 96.2, heures: 178,
    temperature: 41.0, courant: 0, vibration: 0, rpm: 0,
    protocol: '—', broker: '—', latence: '—', uptime: '—',
    chipModel: '—', machId: 'MACH-TRN-006',
    problems: [],
    fonctions: [],
  },
];

// ─── Helpers ──────────────────────────────────────────────
const statusConfig = {
  'En marche':      { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)',  dot: '#22c55e' },
  'Avertissement':  { color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)', dot: '#f97316' },
  'Arrêt':          { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  dot: '#ef4444' },
  'En maintenance': { color: '#a855f7', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)', dot: '#a855f7' },
};

// ─── Composant principal ──────────────────────────────────
const MachinesPage: React.FC = () => {
  const [machines, setMachines]     = useState<Machine[]>(INITIAL_MACHINES);
  const [filtre, setFiltre]         = useState<'Toutes' | 'En marche'>('Toutes');
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState<Machine | null>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding]         = useState(false);
  const [newMachine, setNewMachine] = useState({ name: '', model: '', icon: 'gear' as Machine['icon'], status: 'Arrêt' as Machine['status'], objectif: '' });
  const role = localStorage.getItem('role');

  // Fetch custom machines from DB and merge with base
  const fetchCustomMachines = useCallback(async () => {
    const token = localStorage.getItem('token') || '';
    try {
      const res = await fetch('http://localhost:5000/api/machines', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!Array.isArray(data)) return;
      setMachines(prev => {
        const baseIds = INITIAL_MACHINES.map(m => m.id);
        const custom: Machine[] = data
          .filter((d: {id:string; isBase?:boolean}) => !baseIds.includes(d.id))
          .map((d: {id:string; name:string; model?:string; icon?:string; status?:string; objectif?:number; isBase?:boolean}) => ({
            id: d.id, name: d.name, model: d.model || '—', type: '—',
            node: '—', ip: '—', icon: (d.icon || 'gear') as Machine['icon'],
            sensors: [], status: (d.status || 'Arrêt') as Machine['status'],
            sante: 100, production: 0, objectif: d.objectif || 0,
            efficacite: 0, heures: 0, temperature: 0, courant: 0,
            vibration: 0, rpm: 0, protocol: '—', broker: '—',
            latence: '—', uptime: '—', chipModel: '—',
            machId: `MACH-${d.id.toUpperCase()}`,
            problems: [], fonctions: [],
          }));
        const baseOnly = prev.filter(m => baseIds.includes(m.id));
        return [...baseOnly, ...custom];
      });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchCustomMachines(); }, [fetchCustomMachines]);

  const handleAddMachine = async () => {
    if (!newMachine.name) return;
    const token = localStorage.getItem('token') || '';
    setAdding(true);
    try {
      const res = await fetch('http://localhost:5000/api/machines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...newMachine, objectif: Number(newMachine.objectif) || 0 }),
      });
      if (res.ok) {
        setShowAddModal(false);
        setNewMachine({ name: '', model: '', icon: 'gear', status: 'Arrêt', objectif: '' });
        await fetchCustomMachines();
      }
    } catch { /* ignore */ }
    finally { setAdding(false); }
  };

  const handleDeleteMachine = async (machineId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Supprimer cette machine ?')) return;
    const token = localStorage.getItem('token') || '';
    await fetch(`http://localhost:5000/api/machines/${machineId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
    });
    await fetchCustomMachines();
  };

  // ── Socket live ──
  useEffect(() => {
    socket.on('sensor-data', (data: { node: string; courant: number; vibX: number; vibY: number; vibZ: number; rpm: number; pression?: number }) => {
      setMachines(prev => prev.map(m => {
        if (m.node !== data.node) return m;
        if (m.id !== 'rectifieuse' && m.id !== 'compresseur') return m;
        const vib = parseFloat(Math.sqrt(data.vibX**2 + data.vibY**2 + data.vibZ**2).toFixed(2));
        const next = { ...m, courant: data.courant, vibration: vib, rpm: data.rpm, sante: Math.max(0, Math.min(100, 100 - vib * 5)) };
        if (m.id === 'compresseur' && typeof data.pression === 'number') next.pression = data.pression;
        return next;
      }));
      setLastUpdate(new Date());
    });
    return () => { socket.off('sensor-data'); };
  }, []);

  const filtrees = machines
    .filter(m => filtre === 'Toutes' || m.status === filtre)
    .filter(m => !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.model.toLowerCase().includes(search.toLowerCase()));
  const refresh  = useCallback(() => setLastUpdate(new Date()), []);


  if (selected) return <MachineDetail machine={selected} onBack={() => setSelected(null)} />;
  const isLive = (m: Machine) => m.id === 'rectifieuse' || m.id === 'compresseur';

  return (
    <div className="flex-1 p-6 overflow-y-auto min-w-0 w-full" style={{ background: 'transparent' }}>

      {/* Header */}
      <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Gestion des Machines</h2>
          <p className="text-sm text-slate-500">{machines.length} machines actives</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.08] bg-slate-800/50">
            <Search size={14} color="#64748b" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher une machine..."
              className="bg-transparent text-sm text-white outline-none placeholder-slate-500 w-44"
            />
          </div>
          <span className="text-xs text-slate-500">Mise à jour : {lastUpdate.toLocaleTimeString('fr-FR')}</span>
          <button onClick={refresh} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer border-none"
            style={{ background: 'linear-gradient(135deg,#0066ff,#00d4ff)' }}>
            <RefreshCw size={14} /> Actualiser
          </button>
          {role === 'admin' && (
            <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer border-none"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}>
              <Plus size={14} /> Ajouter Machine
            </button>
          )}
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {([
          { key: 'Toutes',         label: 'Toutes',             count: machines.length },
          { key: 'En marche',      label: '✅ Opérationnelles',  count: machines.filter(m => m.status === 'En marche').length },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setFiltre(f.key as typeof filtre)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer border transition-all"
            style={{
              background:  filtre === f.key ? 'linear-gradient(135deg,rgba(0,102,255,0.3),rgba(0,212,255,0.3))' : 'rgba(30,41,59,0.5)',
              borderColor: filtre === f.key ? 'rgba(0,212,255,0.5)' : 'rgba(255,255,255,0.08)',
              color:       filtre === f.key ? '#00d4ff' : '#94a3b8',
            }}>
            {f.label}
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{ background: filtre === f.key ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.08)', color: filtre === f.key ? '#00d4ff' : '#64748b' }}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Grille */}
      <div className="grid grid-cols-2 gap-5">
        {filtrees.map(machine => {
          const st  = statusConfig[machine.status];
          const pct = machine.objectif > 0 ? Math.min(100, (machine.production / machine.objectif) * 100) : 0;
          return (
            <div key={machine.id} onClick={() => setSelected(machine)}
              className="rounded-xl cursor-pointer transition-all duration-300"
              style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,212,255,0.3)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)'; }}>

              <div className="p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: st.dot, boxShadow: `0 0 6px ${st.dot}` }} />
                    <span className="text-[15px] font-bold text-white">{machine.name}</span>
                  </div>
                  {role === 'admin' && !['rectifieuse','compresseur','agie-cut','agie-drill','haas-cnc','tour-cnc'].includes(machine.id) && (
                    <button onClick={e => handleDeleteMachine(machine.id, e)} title="Supprimer"
                      className="p-1.5 rounded-lg cursor-pointer transition-all hover:bg-red-500/20"
                      style={{ border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', background: 'transparent' }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500 ml-4">{machine.type}</p>
              </div>

              <div className="mx-5 my-4 h-32 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 48, opacity: 0.6 }}>
                  {machine.icon === 'gear' ? '⚙️' : machine.icon === 'bolt' ? '⚡' : machine.icon === 'drill' ? '🔩' : '🔧'}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 px-5 mb-4">
                {(machine.id === 'compresseur'
                  ? [
                    { label: 'Pression',  value: `${(machine.pression ?? 0).toFixed(1)} bar`, color: '#06b6d4' },
                    { label: 'Courant',   value: `${machine.courant.toFixed(1)}A`,            color: '#3b82f6' },
                    { label: 'Heures',    value: `${machine.heures}h`,                        color: '#a855f7' },
                  ]
                  : [
                    { label: 'Production', value: machine.objectif > 0 ? `${machine.production}` : '—', color: '#3b82f6' },
                    { label: 'Efficacité', value: `${machine.efficacite}%`,                             color: '#00d4ff' },
                    { label: 'Heures',     value: `${machine.heures}h`,                                 color: '#a855f7' },
                  ]
                ).map(s => (
                  <div key={s.label} className="rounded-lg p-3 text-center"
                    style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="text-xs text-slate-500 mb-1">{s.label}</div>
                    <div className="text-[18px] font-bold" style={{ color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {machine.objectif > 0 && (
                <div className="px-5 mb-4">
                  <div className="flex justify-between text-[11px] text-slate-500 mb-1.5">
                    <span>Objectif: {machine.objectif} pcs</span>
                    <span style={{ color: pct >= 100 ? '#22c55e' : '#00d4ff' }}>{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: pct >= 100 ? '#22c55e' : 'linear-gradient(90deg,#0066ff,#00d4ff)' }} />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 px-5 pb-4 flex-wrap">
                {isLive(machine) ? (
                  <>
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }}>
                      ● LIVE
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Thermometer size={11} color="#f97316" /> {machine.temperature.toFixed(1)}°C
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Zap size={11} color="#3b82f6" /> {machine.courant.toFixed(1)}A
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Activity size={11} color="#a855f7" /> {machine.vibration.toFixed(2)} mm/s
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Modal Ajouter Machine ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="bg-slate-800 border border-white/[0.1] rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <span className="text-base font-bold text-white">➕ Nouvelle Machine</span>
              <button onClick={() => setShowAddModal(false)} title="Fermer"
                className="text-slate-400 hover:text-white transition-colors cursor-pointer bg-transparent border-none">
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Nom de la machine *</label>
                <input value={newMachine.name} onChange={e => setNewMachine(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: Fraiseuse DMG"
                  className="w-full bg-slate-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Modèle</label>
                <input value={newMachine.model} onChange={e => setNewMachine(p => ({ ...p, model: e.target.value }))}
                  placeholder="Ex: DMG MORI CMX 600"
                  className="w-full bg-slate-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Icône</label>
                  <select aria-label="Icône de la machine" value={newMachine.icon} onChange={e => setNewMachine(p => ({ ...p, icon: e.target.value as Machine['icon'] }))}
                    className="w-full bg-slate-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors">
                    <option value="gear">⚙️ Engrenage</option>
                    <option value="bolt">⚡ Éclair</option>
                    <option value="drill">🔩 Foret</option>
                    <option value="wrench">🔧 Clé</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Statut initial</label>
                  <select aria-label="Statut initial de la machine" value={newMachine.status} onChange={e => setNewMachine(p => ({ ...p, status: e.target.value as Machine['status'] }))}
                    className="w-full bg-slate-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors">
                    <option value="En marche">✅ En marche</option>
                    <option value="Arrêt">🔴 Arrêt</option>
                    <option value="En maintenance">🔧 En maintenance</option>
                    <option value="Avertissement">⚠️ Avertissement</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Objectif production (pcs)</label>
                <input type="number" value={newMachine.objectif} onChange={e => setNewMachine(p => ({ ...p, objectif: e.target.value }))}
                  placeholder="0"
                  className="w-full bg-slate-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddModal(false)}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-slate-400 border border-white/10 hover:border-white/20 transition-all cursor-pointer bg-transparent">
                Annuler
              </button>
              <button onClick={handleAddMachine} disabled={adding || !newMachine.name}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer disabled:opacity-50 border-none"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: 'white' }}>
                {adding ? 'Ajout...' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MachinesPage;