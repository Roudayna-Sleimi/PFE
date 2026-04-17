import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Zap, Thermometer, Activity, Search, Plus, X, Trash2 } from 'lucide-react';
import { io } from 'socket.io-client';
import MachineDetail from './MachineDetail';

const socket = io('http://localhost:5000', { transports: ['websocket'] });

interface Probleme {
  severity: 'critical' | 'warning';
  title: string;
  desc: string;
  time: string;
}

type MachineStatus = 'En marche' | 'Avertissement' | 'Arr\u00eat' | 'En maintenance';
type MachineIcon = 'gear' | 'wrench' | 'bolt' | 'drill';

interface MachineFunction {
  title: string;
  desc: string;
}

interface Machine {
  id: string;
  name: string;
  model: string;
  type: string;
  node: string;
  ip: string;
  icon: MachineIcon;
  sensors: string[];
  status: MachineStatus;
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
  fonctions?: MachineFunction[];
  isBase?: boolean;
  isDerived?: boolean;
}

interface ApiMachine {
  id: string;
  name: string;
  model?: string;
  type?: string;
  node?: string | null;
  ip?: string;
  icon?: string;
  sensors?: string[];
  status?: string;
  sante?: number;
  production?: number;
  objectif?: number;
  efficacite?: number;
  heures?: number;
  temperature?: number;
  courant?: number;
  vibration?: number;
  rpm?: number;
  pression?: number | null;
  protocol?: string;
  broker?: string;
  latence?: string;
  uptime?: string;
  chipModel?: string;
  machId?: string;
  problems?: Probleme[];
  fonctions?: MachineFunction[];
  isBase?: boolean;
  isDerived?: boolean;
}

const statusConfig: Record<MachineStatus, { color: string; bg: string; border: string; dot: string }> = {
  'En marche': { color: '#22c55e', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)', dot: '#22c55e' },
  'Avertissement': { color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)', dot: '#f97316' },
  'Arr\u00eat': { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', dot: '#ef4444' },
  'En maintenance': { color: '#a855f7', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)', dot: '#a855f7' },
};

const normalizeMachineIcon = (icon?: string): MachineIcon => {
  if (icon === 'bolt' || icon === 'drill' || icon === 'wrench') return icon;
  return 'gear';
};

const normalizeMachineStatus = (status?: string): MachineStatus => {
  if (status === 'En marche') return 'En marche';
  if (status === 'Avertissement') return 'Avertissement';
  if (status === 'En maintenance') return 'En maintenance';
  return 'Arr\u00eat';
};

const getMachineGlyph = (icon: MachineIcon) => {
  if (icon === 'bolt') return '\u26A1';
  if (icon === 'drill') return '\uD83D\uDD29';
  if (icon === 'wrench') return '\uD83D\uDD27';
  return '\u2699\uFE0F';
};

const mapApiMachine = (machine: ApiMachine): Machine => ({
  id: machine.id,
  name: machine.name,
  model: machine.model || '-',
  type: machine.type || '-',
  node: machine.node || '-',
  ip: machine.ip || '-',
  icon: normalizeMachineIcon(machine.icon),
  sensors: Array.isArray(machine.sensors) ? machine.sensors : [],
  status: normalizeMachineStatus(machine.status),
  sante: typeof machine.sante === 'number' ? machine.sante : 100,
  production: typeof machine.production === 'number' ? machine.production : 0,
  objectif: typeof machine.objectif === 'number' ? machine.objectif : 0,
  efficacite: typeof machine.efficacite === 'number' ? machine.efficacite : 0,
  heures: typeof machine.heures === 'number' ? machine.heures : 0,
  temperature: typeof machine.temperature === 'number' ? machine.temperature : 0,
  courant: typeof machine.courant === 'number' ? machine.courant : 0,
  vibration: typeof machine.vibration === 'number' ? machine.vibration : 0,
  rpm: typeof machine.rpm === 'number' ? machine.rpm : 0,
  pression: typeof machine.pression === 'number' ? machine.pression : undefined,
  protocol: machine.protocol || '-',
  broker: machine.broker || '-',
  latence: machine.latence || '-',
  uptime: machine.uptime || '-',
  chipModel: machine.chipModel || '-',
  machId: machine.machId || `MACH-${machine.id.toUpperCase()}`,
  problems: Array.isArray(machine.problems) ? machine.problems : [],
  fonctions: Array.isArray(machine.fonctions) ? machine.fonctions : [],
  isBase: Boolean(machine.isBase),
  isDerived: Boolean(machine.isDerived),
});

const isLiveMachine = (machine: Pick<Machine, 'id'>) => machine.id === 'rectifieuse' || machine.id === 'compresseur';

const MachinesPage: React.FC = () => {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [filtre, setFiltre] = useState<'Toutes' | 'En marche'>('Toutes');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Machine | null>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newMachine, setNewMachine] = useState({
    name: '',
    model: '',
    icon: 'gear' as MachineIcon,
    status: 'Arr\u00eat' as MachineStatus,
    objectif: '',
  });
  const role = localStorage.getItem('role');

  const fetchMachines = useCallback(async () => {
    const token = localStorage.getItem('token') || '';
    try {
      const res = await fetch('http://localhost:5000/api/machines', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) return;

      const nextMachines = data.map((item: ApiMachine) => mapApiMachine(item));
      setMachines(nextMachines);
      setSelected((prev) => (prev ? nextMachines.find((machine) => machine.id === prev.id) || prev : prev));
      setLastUpdate(new Date());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchMachines();
  }, [fetchMachines]);

  const handleAddMachine = async () => {
    if (!newMachine.name) return;

    const token = localStorage.getItem('token') || '';
    setAdding(true);
    try {
      const res = await fetch('http://localhost:5000/api/machines', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...newMachine,
          objectif: Number(newMachine.objectif) || 0,
        }),
      });

      if (res.ok) {
        setShowAddModal(false);
        setNewMachine({ name: '', model: '', icon: 'gear', status: 'Arr\u00eat', objectif: '' });
        await fetchMachines();
      }
    } catch {
      // ignore
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteMachine = async (machineId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!confirm('Supprimer cette machine ?')) return;

    const token = localStorage.getItem('token') || '';
    await fetch(`http://localhost:5000/api/machines/${machineId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    await fetchMachines();
  };

  useEffect(() => {
    const onSensorData = (data: { node: string; courant: number; vibX: number; vibY: number; vibZ: number; rpm: number; pression?: number }) => {
      setMachines((prev) =>
        prev.map((machine) => {
          if (machine.node !== data.node) return machine;
          if (!isLiveMachine(machine)) return machine;

          const vibration = parseFloat(Math.sqrt(data.vibX ** 2 + data.vibY ** 2 + data.vibZ ** 2).toFixed(2));
          const nextMachine: Machine = {
            ...machine,
            courant: data.courant,
            vibration,
            rpm: data.rpm,
            sante: Math.max(0, Math.min(100, 100 - vibration * 5)),
          };

          if (machine.id === 'compresseur' && typeof data.pression === 'number') {
            nextMachine.pression = data.pression;
          }

          return nextMachine;
        })
      );
      setLastUpdate(new Date());
    };

    socket.on('sensor-data', onSensorData);
    return () => {
      socket.off('sensor-data', onSensorData);
    };
  }, []);

  const filtrees = machines
    .filter((machine) => filtre === 'Toutes' || machine.status === filtre)
    .filter(
      (machine) =>
        !search ||
        machine.name.toLowerCase().includes(search.toLowerCase()) ||
        machine.model.toLowerCase().includes(search.toLowerCase())
    );

  const refresh = useCallback(() => {
    fetchMachines();
  }, [fetchMachines]);

  if (selected) {
    return <MachineDetail machine={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto min-w-0 w-full" style={{ background: 'transparent' }}>
      <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Gestion des Machines</h2>
          <p className="text-sm text-slate-500">{machines.length} machines actives</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.08] bg-slate-800/50">
            <Search size={14} color="#64748b" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une machine..."
              className="bg-transparent text-sm text-white outline-none placeholder-slate-500 w-44"
            />
          </div>

          <span className="text-xs text-slate-500">Mise a jour : {lastUpdate.toLocaleTimeString('fr-FR')}</span>

          <button
            onClick={refresh}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer border-none"
            style={{ background: 'linear-gradient(135deg,#0066ff,#00d4ff)' }}
          >
            <RefreshCw size={14} /> Actualiser
          </button>

          {role === 'admin' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer border-none"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}
            >
              <Plus size={14} /> Ajouter Machine
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap">
        {([
          { key: 'Toutes', label: 'Toutes', count: machines.length },
          { key: 'En marche', label: 'Operationnelles', count: machines.filter((machine) => machine.status === 'En marche').length },
        ] as const).map((filterItem) => (
          <button
            key={filterItem.key}
            onClick={() => setFiltre(filterItem.key)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer border transition-all"
            style={{
              background:
                filtre === filterItem.key
                  ? 'linear-gradient(135deg,rgba(0,102,255,0.3),rgba(0,212,255,0.3))'
                  : 'rgba(30,41,59,0.5)',
              borderColor: filtre === filterItem.key ? 'rgba(0,212,255,0.5)' : 'rgba(255,255,255,0.08)',
              color: filtre === filterItem.key ? '#00d4ff' : '#94a3b8',
            }}
          >
            {filterItem.label}
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{
                background: filtre === filterItem.key ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.08)',
                color: filtre === filterItem.key ? '#00d4ff' : '#64748b',
              }}
            >
              {filterItem.count}
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        {filtrees.map((machine) => {
          const st = statusConfig[machine.status];
          const pct = machine.objectif > 0 ? Math.min(100, (machine.production / machine.objectif) * 100) : 0;

          return (
            <div
              key={machine.id}
              onClick={() => setSelected(machine)}
              className="rounded-xl cursor-pointer transition-all duration-300"
              style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}
              onMouseEnter={(event) => {
                event.currentTarget.style.borderColor = 'rgba(0,212,255,0.3)';
                event.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                event.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div className="p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: st.dot, boxShadow: `0 0 6px ${st.dot}` }} />
                    <span className="text-[15px] font-bold text-white">{machine.name}</span>
                  </div>

                  {role === 'admin' && !machine.isBase && !machine.isDerived && (
                    <button
                      onClick={(event) => handleDeleteMachine(machine.id, event)}
                      title="Supprimer"
                      className="p-1.5 rounded-lg cursor-pointer transition-all hover:bg-red-500/20"
                      style={{ border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', background: 'transparent' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                <p className="text-xs text-slate-500 ml-4">{machine.type}</p>
              </div>

              <div
                className="mx-5 my-4 h-32 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <div style={{ fontSize: 48, opacity: 0.6 }}>{getMachineGlyph(machine.icon)}</div>
              </div>

              <div className="grid grid-cols-3 gap-3 px-5 mb-4">
                {(machine.id === 'compresseur'
                  ? [
                      { label: 'Pression', value: `${(machine.pression ?? 0).toFixed(1)} bar`, color: '#06b6d4' },
                      { label: 'Courant', value: `${machine.courant.toFixed(1)}A`, color: '#3b82f6' },
                      { label: 'Heures', value: `${machine.heures}h`, color: '#a855f7' },
                    ]
                  : [
                      { label: 'Production', value: machine.objectif > 0 ? `${machine.production}` : '-', color: '#3b82f6' },
                      { label: 'Efficacite', value: `${machine.efficacite}%`, color: '#00d4ff' },
                      { label: 'Heures', value: `${machine.heures}h`, color: '#a855f7' },
                    ]
                ).map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-lg p-3 text-center"
                    style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <div className="text-xs text-slate-500 mb-1">{stat.label}</div>
                    <div className="text-[18px] font-bold" style={{ color: stat.color }}>
                      {stat.value}
                    </div>
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
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: pct >= 100 ? '#22c55e' : 'linear-gradient(90deg,#0066ff,#00d4ff)' }}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 px-5 pb-4 flex-wrap">
                {isLiveMachine(machine) ? (
                  <>
                    <span
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }}
                    >
                      LIVE
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Thermometer size={11} color="#f97316" /> {machine.temperature.toFixed(1)}C
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

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="bg-slate-800 border border-white/[0.1] rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <span className="text-base font-bold text-white">Nouvelle Machine</span>
              <button
                onClick={() => setShowAddModal(false)}
                title="Fermer"
                className="text-slate-400 hover:text-white transition-colors cursor-pointer bg-transparent border-none"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Nom de la machine *</label>
                <input
                  value={newMachine.name}
                  onChange={(event) => setNewMachine((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Ex: Fraiseuse DMG"
                  className="w-full bg-slate-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Modele</label>
                <input
                  value={newMachine.model}
                  onChange={(event) => setNewMachine((prev) => ({ ...prev, model: event.target.value }))}
                  placeholder="Ex: DMG MORI CMX 600"
                  className="w-full bg-slate-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Icone</label>
                  <select
                    aria-label="Icone de la machine"
                    value={newMachine.icon}
                    onChange={(event) => setNewMachine((prev) => ({ ...prev, icon: event.target.value as MachineIcon }))}
                    className="w-full bg-slate-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors"
                  >
                    <option value="gear">Engrenage</option>
                    <option value="bolt">Eclair</option>
                    <option value="drill">Foret</option>
                    <option value="wrench">Cle</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Statut initial</label>
                  <select
                    aria-label="Statut initial de la machine"
                    value={newMachine.status}
                    onChange={(event) => setNewMachine((prev) => ({ ...prev, status: event.target.value as MachineStatus }))}
                    className="w-full bg-slate-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors"
                  >
                    <option value="En marche">En marche</option>
                    <option value={'Arr\u00eat'}>Arret</option>
                    <option value="En maintenance">En maintenance</option>
                    <option value="Avertissement">Avertissement</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Objectif production (pcs)</label>
                <input
                  type="number"
                  value={newMachine.objectif}
                  onChange={(event) => setNewMachine((prev) => ({ ...prev, objectif: event.target.value }))}
                  placeholder="0"
                  className="w-full bg-slate-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-slate-400 border border-white/10 hover:border-white/20 transition-all cursor-pointer bg-transparent"
              >
                Annuler
              </button>

              <button
                onClick={handleAddMachine}
                disabled={adding || !newMachine.name}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer disabled:opacity-50 border-none"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: 'white' }}
              >
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
