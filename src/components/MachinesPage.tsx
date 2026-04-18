import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Zap, Thermometer, Activity, Search, Plus, X, Trash2, PencilLine } from 'lucide-react';
import { io } from 'socket.io-client';
import MachineDetail from './MachineDetail';
import { getMachineVisual } from '../utils/machineVisuals';
import { getMachineFunctions, type MachineFunction } from '../utils/machineFunctions';

const socket = io('http://localhost:5000', { transports: ['websocket'] });

interface Probleme {
  severity: 'critical' | 'warning';
  title: string;
  desc: string;
  time: string;
}

type MachineStatus = 'En marche' | 'Avertissement' | 'Arr\u00eat' | 'En maintenance';
type MachineIcon = 'gear' | 'wrench' | 'bolt' | 'drill';
type MachineProcessType = 'Fraisage' | 'Tournage' | 'Perçage' | 'Taraudage';

interface MachineFormState {
  name: string;
  marque: string;
  model: string;
  ip: string;
  type: MachineProcessType;
  imageUrl: string;
  imageFile: File | null;
}

interface Machine {
  id: string;
  name: string;
  model: string;
  marque: string;
  type: string;
  node: string;
  ip: string;
  imageUrl?: string;
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
  hasProductionData?: boolean;
  hasEfficiencyData?: boolean;
  hasWorkData?: boolean;
}

interface ApiMachine {
  id: string;
  name: string;
  model?: string;
  marque?: string;
  type?: string;
  node?: string | null;
  ip?: string;
  imageUrl?: string;
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
  hasProductionData?: boolean;
  hasEfficiencyData?: boolean;
  hasWorkData?: boolean;
}

const machineTypeOptions: Array<{ value: MachineProcessType; icon: MachineIcon }> = [
  { value: 'Fraisage', icon: 'gear' },
  { value: 'Tournage', icon: 'wrench' },
  { value: 'Perçage', icon: 'drill' },
  { value: 'Taraudage', icon: 'bolt' },
];

const emptyMachineForm: MachineFormState = {
  name: '',
  marque: '',
  model: '',
  ip: '',
  type: 'Fraisage' as MachineProcessType,
  imageUrl: '',
  imageFile: null,
};

const iconForMachineType = (type: MachineProcessType): MachineIcon => (
  machineTypeOptions.find((option) => option.value === type)?.icon || 'gear'
);

const normalizeMachineProcessType = (type?: string): MachineProcessType => {
  const found = machineTypeOptions.find((option) => option.value.toLowerCase() === String(type || '').toLowerCase());
  return found?.value || 'Fraisage';
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

const mapApiMachine = (machine: ApiMachine): Machine => ({
  id: machine.id,
  name: machine.name,
  model: machine.model || '-',
  marque: machine.marque || '',
  type: machine.type || '-',
  node: machine.node || '-',
  ip: machine.ip || '-',
  imageUrl: machine.imageUrl || '',
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
  fonctions: getMachineFunctions(machine),
  isBase: Boolean(machine.isBase),
  isDerived: Boolean(machine.isDerived),
  hasProductionData: Boolean(machine.hasProductionData),
  hasEfficiencyData: Boolean(machine.hasEfficiencyData),
  hasWorkData: Boolean(machine.hasWorkData),
});

const isLiveMachine = (machine: Pick<Machine, 'id'>) => machine.id === 'rectifieuse' || machine.id === 'compresseur';

const formatMachineNumber = (value: number, digits = 0) => (
  Number.isFinite(value) ? value.toLocaleString('fr-FR', { maximumFractionDigits: digits }) : '0'
);

const formatMachineHours = (value: number) => (
  Number.isFinite(value) ? `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}h` : '0h'
);

const pendingMetric = '-';

const MachinesPage: React.FC = () => {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Machine | null>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [savingMachine, setSavingMachine] = useState(false);
  const [machineForm, setMachineForm] = useState(emptyMachineForm);
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

  useEffect(() => {
    const refreshMachines = () => {
      fetchMachines();
    };
    const intervalId = window.setInterval(refreshMachines, 10000);

    socket.on('dashboard-refresh', refreshMachines);
    socket.on('employee-machine-updated', refreshMachines);
    socket.on('piece-progressed', refreshMachines);

    return () => {
      window.clearInterval(intervalId);
      socket.off('dashboard-refresh', refreshMachines);
      socket.off('employee-machine-updated', refreshMachines);
      socket.off('piece-progressed', refreshMachines);
    };
  }, [fetchMachines]);

  const closeMachineModal = () => {
    setShowAddModal(false);
    setEditingMachine(null);
    setMachineForm(emptyMachineForm);
  };

  const openAddMachineModal = () => {
    setEditingMachine(null);
    setMachineForm(emptyMachineForm);
    setShowAddModal(true);
  };

  const openEditMachineModal = (machine: Machine, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingMachine(machine);
    setMachineForm({
      name: machine.name || '',
      marque: machine.marque || '',
      model: machine.model === '-' ? '' : machine.model || '',
      ip: machine.ip === '-' ? '' : machine.ip || '',
      type: normalizeMachineProcessType(machine.type),
      imageUrl: machine.imageUrl || '',
      imageFile: null,
    });
    setShowAddModal(true);
  };

  const handleSaveMachine = async () => {
    if (!machineForm.name.trim()) return;

    const token = localStorage.getItem('token') || '';
    const isEditing = Boolean(editingMachine);
    const formData = new FormData();
    formData.append('name', machineForm.name.trim());
    formData.append('marque', machineForm.marque.trim());
    formData.append('model', machineForm.model.trim());
    formData.append('ip', machineForm.ip.trim());
    formData.append('type', machineForm.type);
    formData.append('icon', iconForMachineType(machineForm.type));
    if (machineForm.imageFile) formData.append('image', machineForm.imageFile);

    setSavingMachine(true);
    try {
      const res = await fetch(`http://localhost:5000/api/machines${isEditing ? `/${editingMachine?.id}` : ''}`, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (res.ok) {
        closeMachineModal();
        await fetchMachines();
      }
    } catch {
      // ignore
    } finally {
      setSavingMachine(false);
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

  const normalizedSearch = search.trim().toLowerCase();
  const filtrees = machines
    .filter(
      (machine) =>
        !normalizedSearch ||
        machine.name.toLowerCase().includes(normalizedSearch) ||
        machine.marque.toLowerCase().includes(normalizedSearch) ||
        machine.model.toLowerCase().includes(normalizedSearch) ||
        machine.type.toLowerCase().includes(normalizedSearch) ||
        machine.ip.toLowerCase().includes(normalizedSearch)
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
          <p className="text-sm text-slate-500">{machines.length} machines</p>
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

          <span className="text-xs text-slate-500">Mise à jour : {lastUpdate.toLocaleTimeString('fr-FR')}</span>

          <button
            onClick={refresh}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer border-none"
            style={{ background: 'linear-gradient(135deg,#0066ff,#00d4ff)' }}
          >
            <RefreshCw size={14} /> Actualiser
          </button>

          {role === 'admin' && (
            <button
              onClick={openAddMachineModal}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer border-none"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}
            >
              <Plus size={14} /> Ajouter une machine
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {filtrees.map((machine) => {
          const visual = getMachineVisual({ id: machine.id, name: machine.name, icon: machine.icon, imageUrl: machine.imageUrl });
          const canManageMachine = role === 'admin';

          return (
            <div
              key={machine.id}
              onClick={() => setSelected(machine)}
              className="group rounded-xl cursor-pointer transition-all duration-300"
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
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: '#00d4ff', boxShadow: '0 0 6px #00d4ff' }} />
                    <span className="text-[15px] font-bold text-white">{machine.name}</span>
                  </div>

                  {canManageMachine && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(event) => openEditMachineModal(machine, event)}
                        title="Modifier"
                        aria-label={`Modifier ${machine.name}`}
                        className="p-1.5 rounded-lg cursor-pointer transition-all hover:bg-cyan-500/20"
                        style={{ border: '1px solid rgba(56,189,248,0.3)', color: '#38bdf8', background: 'transparent' }}
                      >
                        <PencilLine size={13} />
                      </button>
                      <button
                        onClick={(event) => handleDeleteMachine(machine.id, event)}
                        title="Supprimer"
                        aria-label={`Supprimer ${machine.name}`}
                        className="p-1.5 rounded-lg cursor-pointer transition-all hover:bg-red-500/20"
                        style={{ border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', background: 'transparent' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                <p className="text-xs text-slate-500 ml-4">{machine.type}</p>
                <p className="text-[11px] text-slate-600 ml-4 mt-1">
                  {[machine.marque, machine.model !== '-' ? machine.model : ''].filter(Boolean).join(' - ') || 'Modèle non renseigné'}
                </p>
                <p className="text-[11px] text-slate-600 ml-4 mt-1">Adresse IP : {machine.ip || '-'}</p>
              </div>

              <div className="relative mx-5 my-4 h-36 overflow-hidden rounded-xl border border-white/10 bg-slate-900/50">
                <img
                  src={visual.image}
                  alt={visual.alt}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-slate-950/20 via-slate-950/10 to-slate-950/75" />
                <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-cyan-300/40 bg-slate-950/70 px-2.5 py-1.5">
                  <visual.Icon size={14} className="text-cyan-300" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-cyan-100">Machine</span>
                </div>
                <div className="absolute right-3 bottom-3 rounded-lg border border-white/15 bg-slate-950/70 px-2 py-1">
                  <span className="text-[10px] font-semibold text-slate-200">{machine.model !== '-' ? machine.model : machine.type}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 px-5 mb-4">
                {(machine.id === 'compresseur'
                  ? [
                      { label: 'Pression', value: `${(machine.pression ?? 0).toFixed(1)} bar`, color: '#06b6d4' },
                      { label: 'Courant', value: `${machine.courant.toFixed(1)}A`, color: '#3b82f6' },
                      { label: 'Heures', value: machine.hasWorkData ? formatMachineHours(machine.heures) : pendingMetric, color: '#a855f7' },
                    ]
                  : [
                      { label: 'Production', value: machine.hasProductionData ? `${formatMachineNumber(machine.production)} pièces` : pendingMetric, color: '#3b82f6' },
                      { label: 'Efficacité', value: machine.hasEfficiencyData ? `${formatMachineNumber(machine.efficacite, 1)}%` : pendingMetric, color: '#00d4ff' },
                      { label: 'Heures', value: machine.hasWorkData ? formatMachineHours(machine.heures) : pendingMetric, color: '#a855f7' },
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

              {machine.fonctions && machine.fonctions.length > 0 && (
                <div className="px-5 mb-4">
                  <div className="text-[11px] font-semibold text-slate-500 mb-2">Fonctions</div>
                  <div className="grid grid-cols-1 gap-2">
                    {machine.fonctions.slice(0, 3).map((fonction) => (
                      <div
                        key={fonction.title}
                        className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-2"
                      >
                        <div className="text-[10px] font-semibold text-cyan-100">{fonction.title}</div>
                        <div className="mt-0.5 text-[10px] leading-snug text-slate-400">{fonction.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 px-5 pb-4 flex-wrap">
                {isLiveMachine(machine) ? (
                  <>
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }}>
                      <Activity size={10} /> EN DIRECT
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
          <div className="bg-slate-800 border border-white/[0.1] rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <span className="text-base font-bold text-white">{editingMachine ? 'Modifier machine' : 'Nouvelle machine'}</span>
              <button
                onClick={closeMachineModal}
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
                  value={machineForm.name}
                  onChange={(event) => setMachineForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Ex : Fraiseuse DMG"
                  className="w-full bg-slate-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Marque</label>
                  <input
                    value={machineForm.marque}
                    onChange={(event) => setMachineForm((prev) => ({ ...prev, marque: event.target.value }))}
                    placeholder="Ex : DMG MORI"
                    className="w-full bg-slate-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Modèle</label>
                  <input
                    value={machineForm.model}
                    onChange={(event) => setMachineForm((prev) => ({ ...prev, model: event.target.value }))}
                    placeholder="Ex : CMX 600"
                    className="w-full bg-slate-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Adresse IP</label>
                <input
                  value={machineForm.ip}
                  onChange={(event) => setMachineForm((prev) => ({ ...prev, ip: event.target.value }))}
                  placeholder="Ex : 192.168.1.50"
                  className="w-full bg-slate-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Type / icône</label>
                <select
                  aria-label="Type et icône de la machine"
                  value={machineForm.type}
                  onChange={(event) => setMachineForm((prev) => ({ ...prev, type: event.target.value as MachineProcessType }))}
                  className="w-full bg-slate-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.4)] transition-colors"
                >
                  {machineTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.value}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Image de la machine</label>
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-[rgba(0,212,255,0.4)]">
                  <span className="truncate">{machineForm.imageFile?.name || (machineForm.imageUrl ? 'Image actuelle conservée' : 'Choisir une image')}</span>
                  <span className="rounded-md bg-cyan-500/15 px-2 py-1 text-xs font-semibold text-cyan-200">Parcourir</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      setMachineForm((prev) => ({ ...prev, imageFile: file }));
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={closeMachineModal}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-slate-400 border border-white/10 hover:border-white/20 transition-all cursor-pointer bg-transparent"
              >
                Annuler
              </button>

              <button
                onClick={handleSaveMachine}
                disabled={savingMachine || !machineForm.name.trim()}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer disabled:opacity-50 border-none"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: 'white' }}
              >
                {savingMachine ? 'Enregistrement...' : editingMachine ? 'Modifier' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MachinesPage;
