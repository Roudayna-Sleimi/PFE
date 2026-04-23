import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import {
  Activity,
  ArrowLeft,
  Bell,
  CheckCircle,
  Clock,
  Eye,
  History,
  Package,
  Zap,
} from 'lucide-react';
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

interface Piece {
  _id: string;
  nom: string;
  quantite: number;
  prix: number;
  status: string;
  matiere: boolean;
}

interface EmployeOverview {
  username: string;
  currentPieceId?: string | null;
  machineStatus?: 'started' | 'paused' | 'stopped';
}

interface Machine {
  id: string;
  name: string;
  model: string;
  marque?: string;
  type?: string;
  node: string;
  ip: string;
  imageUrl?: string;
  sensors: string[];
  icon: 'gear' | 'wrench' | 'bolt' | 'drill';
  sante: number;
  status: 'En marche' | 'Avertissement' | 'Arr\u00eat' | 'En maintenance';
  protocol: string;
  broker: string;
  latence: string;
  uptime: string;
  chipModel: string;
  machId: string;
  vibration: number;
  courant: number;
  rpm: number;
  fonctions?: MachineFunction[];
}

interface Props {
  machine: Machine;
  onBack: () => void;
}

interface LiveData {
  vibration: number;
  courant: number;
  rpm: number;
  pression: number;
  isLive: boolean;
}

const socket = io('http://localhost:5000', { transports: ['websocket'] });

const LIVE_MACHINES = ['rectifieuse', 'compresseur'];

const accentTone = {
  color: 'var(--app-accent)',
  bg: 'var(--app-accent-soft)',
  border: 'var(--app-accent-soft-strong)',
};

const neutralTone = {
  color: 'var(--app-muted)',
  bg: 'var(--app-neutral-soft)',
  border: 'var(--app-border)',
};

const successTone = {
  color: 'var(--app-success)',
  bg: 'rgba(34,197,94,0.12)',
  border: 'rgba(34,197,94,0.26)',
};

const warningTone = {
  color: 'var(--app-warning)',
  bg: 'rgba(245,158,11,0.12)',
  border: 'rgba(245,158,11,0.24)',
};

const dangerTone = {
  color: 'var(--app-danger)',
  bg: 'rgba(239,68,68,0.12)',
  border: 'rgba(239,68,68,0.24)',
};

const panelStyle: React.CSSProperties = {
  background: 'var(--app-card)',
  border: '1px solid var(--app-border)',
  boxShadow: 'none',
};

const softPanelStyle: React.CSSProperties = {
  background: 'var(--app-card-alt)',
  border: '1px solid var(--app-border)',
  boxShadow: 'none',
};

const insetPanelStyle: React.CSSProperties = {
  background: 'var(--app-inset)',
  border: '1px solid var(--app-border)',
  boxShadow: 'none',
};

const normalizeAlertText = (value: unknown) => String(value ?? '').toLowerCase();

const normalizeText = (value: unknown) => (
  String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
);

const getTabs = (machineId: string): string[] => {
  if (LIVE_MACHINES.includes(machineId)) {
    const isCompresseur = machineId === 'compresseur';
    return ['Capteurs', 'Fonctions', ...(!isCompresseur ? ['Pieces'] : []), 'Alertes', 'Historique'];
  }
  return ['Fonctions', 'Pieces', 'Historique'];
};

const getTabIcon = (tab: string) => {
  if (tab.toLowerCase().startsWith('cap')) return Activity;
  if (tab.toLowerCase().startsWith('fon')) return Zap;
  if (tab.toLowerCase().startsWith('pi')) return Package;
  if (tab.toLowerCase().startsWith('ale')) return Bell;
  return History;
};

const getMachineStatusStyle = (status: Machine['status']) => {
  if (status === 'En marche') return successTone;
  if (status === 'Avertissement') return warningTone;
  if (status === 'En maintenance') return accentTone;
  return dangerTone;
};

const santeColor = (value: number) => {
  if (value >= 70) return successTone.color;
  if (value >= 40) return warningTone.color;
  return dangerTone.color;
};

const resolvePieceStatusConfig = (status: unknown) => {
  const normalized = normalizeText(status);

  if (normalized.includes('termin')) return { ...successTone, label: 'Termine' };
  if (normalized.includes('control') || normalized.includes('contr')) {
    return { ...warningTone, label: 'Controle' };
  }
  if (normalized.includes('encours')) return { ...accentTone, label: 'En cours' };
  return { ...neutralTone, label: 'Arrete' };
};

const resolveAlertSeverityStyle = (severity: Alert['severity']) => {
  if (severity === 'critical') return { ...dangerTone, label: 'Critique' };
  if (severity === 'warning') return { ...warningTone, label: 'Avertissement' };
  return { ...accentTone, label: 'Info' };
};

const resolveAlertStatusStyle = (status: Alert['status']) => {
  if (status === 'new') return { text: 'Nouveau', color: dangerTone.color };
  if (status === 'seen') return { text: 'Vu', color: warningTone.color };
  if (status === 'notified') return { text: 'Notifie', color: accentTone.color };
  return { text: 'Resolu', color: successTone.color };
};

const MachineDetail: React.FC<Props> = ({ machine, onBack }) => {
  const tabs = getTabs(machine.id);
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [employeesOverview, setEmployeesOverview] = useState<EmployeOverview[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [live, setLive] = useState<LiveData>({
    vibration: machine.vibration,
    courant: machine.courant,
    rpm: machine.rpm,
    pression: 0,
    isLive: false,
  });

  const hasPieces = tabs.includes('Pieces');
  const statusStyle = getMachineStatusStyle(machine.status);
  const visual = getMachineVisual({
    id: machine.id,
    name: machine.name,
    icon: machine.icon,
    imageUrl: machine.imageUrl,
  });
  const machineFunctions = getMachineFunctions(machine);

  const activePieceIds = useMemo(
    () =>
      new Set(
        employeesOverview
          .filter((row) => row.currentPieceId && (row.machineStatus === 'started' || row.machineStatus === 'paused'))
          .map((row) => String(row.currentPieceId)),
      ),
    [employeesOverview],
  );

  const getVisiblePieceStatus = (piece: Piece) => {
    const normalized = normalizeText(piece.status);
    if (normalized.includes('termin')) return 'Termine';
    if (normalized.includes('control') || normalized.includes('contr')) return 'Controle';
    if (activePieceIds.has(piece._id)) return 'En cours';
    return 'Arrete';
  };

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
          (machine.id === 'compresseur' &&
            (alertMachineId.includes('compress') || alertNode.includes('compress')))
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
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchAlerts();
  };

  const handleResolve = async (alertId: string) => {
    const token = localStorage.getItem('token') || '';
    await fetch(`http://localhost:5000/api/alerts/${alertId}/resolve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchAlerts();
  };

  useEffect(() => {
    if (!hasPieces) return;

    const token = localStorage.getItem('token') || '';
    fetch(`http://localhost:5000/api/pieces?machine=${encodeURIComponent(piecesMachineName)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => response.json())
      .then((data) => {
        if (Array.isArray(data)) setPieces(data);
      })
      .catch(() => {});
  }, [hasPieces, piecesMachineName]);

  useEffect(() => {
    const token = localStorage.getItem('token') || '';
    fetch('http://localhost:5000/api/admin/employes-overview', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setEmployeesOverview(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!LIVE_MACHINES.includes(machine.id)) return;

    const handler = (data: {
      node: string;
      courant: number;
      vibX: number;
      vibY: number;
      vibZ: number;
      rpm: number;
      pression?: number;
    }) => {
      if (data.node !== machine.node) return;

      const vibration = parseFloat(
        Math.sqrt(data.vibX ** 2 + data.vibY ** 2 + data.vibZ ** 2).toFixed(2),
      );

      setLive({
        vibration,
        courant: data.courant,
        rpm: data.rpm,
        pression: data.pression ?? 0,
        isLive: true,
      });
    };

    socket.on('sensor-data', handler);
    return () => {
      socket.off('sensor-data', handler);
    };
  }, [machine.id, machine.node]);

  useEffect(() => {
    const handler = (payload: EmployeOverview) => {
      if (!payload?.username) return;

      setEmployeesOverview((prev) => {
        const index = prev.findIndex((row) => row.username === payload.username);
        if (index === -1) return [payload, ...prev];

        const next = [...prev];
        next[index] = { ...next[index], ...payload };
        return next;
      });
    };

    socket.on('employee-machine-updated', handler);
    return () => {
      socket.off('employee-machine-updated', handler);
    };
  }, []);

  useEffect(() => {
    if (!LIVE_MACHINES.includes(machine.id) || live.isLive) return;

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const isCompresseur = machine.id === 'compresseur';

      setLive((prev) => {
        if (prev.isLive) return prev;

        return {
          ...prev,
          vibration: parseFloat(
            ((isCompresseur ? 2.8 : 1.4) + Math.sin(now / 2000) * 0.4 + Math.random() * 0.2).toFixed(2),
          ),
          courant: parseFloat(
            ((isCompresseur ? 18.5 : 12.3) + Math.sin(now / 3000) * 2 + Math.random() * 0.5).toFixed(1),
          ),
          rpm: isCompresseur
            ? 1450
            : Math.round(3096 + Math.sin(now / 4000) * 80 + Math.random() * 30),
          pression: isCompresseur ? parseFloat((7.5 + Math.sin(now / 4000) * 1.5).toFixed(1)) : 0,
          isLive: false,
        };
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [live.isLive, machine.id]);

  const vibPct = Math.min(100, (live.vibration / 5) * 100);
  const couPct = Math.min(100, (live.courant / 30) * 100);
  const rpmPct = Math.min(100, (live.rpm / 5000) * 100);
  const presPct = Math.min(100, (live.pression / 12) * 100);

  const isCompresseur = machine.id === 'compresseur';
  const isLiveMachine = LIVE_MACHINES.includes(machine.id);
  const activeAlerts = alerts.filter((alert) => alert.status !== 'resolved');
  const resolvedAlerts = alerts.filter((alert) => alert.status === 'resolved');

  const metrics = [
    { label: 'Vibration', value: live.vibration, unit: 'mm/s', color: 'var(--app-accent)', pct: vibPct },
    {
      label: 'Courant electrique',
      value: live.courant,
      unit: 'A',
      color: 'var(--app-warning)',
      pct: couPct,
    },
    ...(!isCompresseur
      ? [{ label: 'Vitesse rotation', value: live.rpm, unit: 'tr/min', color: 'var(--app-success)', pct: rpmPct }]
      : []),
    ...(isCompresseur
      ? [{ label: 'Pression', value: live.pression, unit: 'bar', color: 'var(--app-accent)', pct: presPct }]
      : []),
  ];

  const metadata = [
    { label: 'Node', value: machine.node || '-' },
    { label: 'Adresse IP', value: machine.ip || '-' },
    { label: 'Protocole', value: machine.protocol || '-' },
    { label: 'Broker', value: machine.broker || '-' },
  ];

  const sideFacts = [
    { label: 'Sante', value: `${machine.sante}%`, color: santeColor(machine.sante) },
    { label: 'Latence', value: machine.latence || '-', color: 'var(--app-accent)' },
    { label: 'Uptime', value: machine.uptime || '-', color: 'var(--app-text)' },
  ];

  const getTabButtonStyle = (isActive: boolean): React.CSSProperties => ({
    background: isActive ? 'var(--app-accent-soft)' : 'var(--app-surface)',
    border: `1px solid ${isActive ? 'var(--app-accent-soft-strong)' : 'var(--app-border)'}`,
    color: isActive ? 'var(--app-accent)' : 'var(--app-muted)',
    boxShadow: 'none',
  });

  return (
    <div
      className="flex-1 min-w-0 w-full overflow-y-auto p-6"
      style={{
        fontFamily: '"Sora", "Manrope", "Segoe UI", system-ui, sans-serif',
        color: 'var(--app-text)',
      }}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <button
          onClick={onBack}
          className="inline-flex w-fit items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
          style={{
            background: 'var(--app-surface)',
            border: '1px solid var(--app-border)',
            color: 'var(--app-muted)',
          }}
        >
          <ArrowLeft size={16} />
          Retour aux machines
        </button>

        <section className="relative overflow-hidden rounded-[28px]" style={panelStyle}>
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(135deg, var(--app-accent-soft), transparent 62%)' }}
          />

          <div className="relative grid gap-5 p-5 lg:grid-cols-[280px,1fr,220px]">
            <div
              className="relative flex min-h-[220px] items-center justify-center overflow-hidden rounded-[24px]"
              style={{
                background: 'linear-gradient(180deg, var(--app-card-alt), var(--app-inset))',
                border: '1px solid var(--app-border)',
              }}
            >
              <img
                src={visual.image}
                alt={visual.alt}
                loading="lazy"
                className="h-full w-full object-contain object-center p-4"
              />

              <div
                className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em]"
                style={{
                  background: 'var(--app-surface)',
                  border: '1px solid var(--app-accent-soft-strong)',
                  color: 'var(--app-accent)',
                }}
              >
                <visual.Icon size={14} />
                <span>Machine</span>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-4">
              <div>
                <div
                  className="mb-2 text-[12px] font-semibold uppercase tracking-[0.24em]"
                  style={{ color: 'var(--app-accent)' }}
                >
                  Detail machine
                </div>
                <h2 className="text-[30px] font-bold leading-tight" style={{ color: 'var(--app-heading)' }}>
                  {machine.name}
                </h2>
                <p className="mt-2 text-sm leading-6" style={{ color: 'var(--app-muted)' }}>
                  {[machine.marque, machine.model].filter(Boolean).join(' • ') || 'Modele non renseigne'}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span
                  className="inline-flex items-center rounded-xl px-3 py-1.5 text-xs font-semibold"
                  style={{ background: 'var(--app-inset)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
                >
                  {machine.machId}
                </span>
                {machine.type && machine.type !== '-' && (
                  <span
                    className="inline-flex items-center rounded-xl px-3 py-1.5 text-xs font-semibold"
                    style={{ background: 'var(--app-card-alt)', border: '1px solid var(--app-border)', color: 'var(--app-muted)' }}
                  >
                    {machine.type}
                  </span>
                )}
                {machine.chipModel && machine.chipModel !== '-' && (
                  <span
                    className="inline-flex items-center rounded-xl px-3 py-1.5 text-xs font-semibold"
                    style={{ background: 'var(--app-card-alt)', border: '1px solid var(--app-border)', color: 'var(--app-muted)' }}
                  >
                    {machine.chipModel}
                  </span>
                )}
                {isLiveMachine && (
                  <span
                    className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold"
                    style={{ background: successTone.bg, border: `1px solid ${successTone.border}`, color: successTone.color }}
                  >
                    <Activity size={12} />
                    Capteurs actifs
                  </span>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {metadata.map((item) => (
                  <div key={item.label} className="rounded-[20px] px-4 py-3" style={insetPanelStyle}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--app-subtle)' }}>
                      {item.label}
                    </div>
                    <div className="mt-2 text-sm font-semibold break-all" style={{ color: 'var(--app-text)' }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div
                className="inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
                style={{
                  background: statusStyle.bg,
                  border: `1px solid ${statusStyle.border}`,
                  color: statusStyle.color,
                }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: statusStyle.color }} />
                {machine.status}
              </div>

              {sideFacts.map((item) => (
                <div key={item.label} className="rounded-[22px] px-4 py-4" style={softPanelStyle}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--app-subtle)' }}>
                    {item.label}
                  </div>
                  <div className="mt-3 text-[22px] font-bold" style={{ color: item.color }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const TabIcon = getTabIcon(tab);

            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
                style={getTabButtonStyle(activeTab === tab)}
              >
                <TabIcon size={15} />
                {tab}
              </button>
            );
          })}
        </div>

        {activeTab === 'Capteurs' && isLiveMachine && (
          <section className="rounded-[28px] p-5" style={panelStyle}>
            <div className="mb-5 flex items-center gap-3 flex-wrap">
              <div
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: 'var(--app-accent-soft)', color: 'var(--app-accent)' }}
              >
                <Activity size={18} />
              </div>
              <div>
                <div className="text-lg font-bold" style={{ color: 'var(--app-heading)' }}>
                  Mesures en temps reel
                </div>
                <div className="text-sm" style={{ color: 'var(--app-muted)' }}>
                  Suivi de l'etat machine et des valeurs instantanees.
                </div>
              </div>
              <span
                className="ml-auto inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold"
                style={{
                  background: live.isLive ? successTone.bg : accentTone.bg,
                  border: `1px solid ${live.isLive ? successTone.border : accentTone.border}`,
                  color: live.isLive ? successTone.color : accentTone.color,
                }}
              >
                {live.isLive ? <Activity size={12} /> : <Clock size={12} />}
                {live.isLive ? 'EN DIRECT' : 'SIMULATION'}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {metrics.map((metric) => (
                <div key={metric.label} className="rounded-[22px] p-4" style={insetPanelStyle}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold" style={{ color: 'var(--app-muted)' }}>
                      {metric.label}
                    </div>
                    <div className="text-right">
                      <div className="text-[24px] font-bold leading-none" style={{ color: metric.color }}>
                        {metric.value}
                      </div>
                      <div className="mt-1 text-xs font-semibold" style={{ color: 'var(--app-subtle)' }}>
                        {metric.unit}
                      </div>
                    </div>
                  </div>

                  <div
                    className="h-2 overflow-hidden rounded-full"
                    style={{ background: 'var(--app-neutral-soft)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${metric.pct}%`, background: metric.color }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {live.courant > 15 && (
                <span
                  className="inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold"
                  style={{ background: dangerTone.bg, border: `1px solid ${dangerTone.border}`, color: dangerTone.color }}
                >
                  Courant eleve
                </span>
              )}
              {live.vibration > 2 && (
                <span
                  className="inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold"
                  style={{ background: warningTone.bg, border: `1px solid ${warningTone.border}`, color: warningTone.color }}
                >
                  Vibration elevee
                </span>
              )}
              {isCompresseur && live.pression > 10 && (
                <span
                  className="inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold"
                  style={{ background: dangerTone.bg, border: `1px solid ${dangerTone.border}`, color: dangerTone.color }}
                >
                  Pression critique
                </span>
              )}
            </div>
          </section>
        )}

        {activeTab === 'Fonctions' && (
          <section className="rounded-[28px] p-5" style={panelStyle}>
            <div className="mb-5 flex items-center gap-3">
              <div
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: 'var(--app-accent-soft)', color: 'var(--app-accent)' }}
              >
                <Zap size={18} />
              </div>
              <div>
                <div className="text-lg font-bold" style={{ color: 'var(--app-heading)' }}>
                  Fonctions de la machine
                </div>
                <div className="text-sm" style={{ color: 'var(--app-muted)' }}>
                  Capacites et usages operationnels de cet equipement.
                </div>
              </div>
            </div>

            {machineFunctions.length === 0 ? (
              <div className="rounded-[22px] px-4 py-12 text-center" style={softPanelStyle}>
                <div className="text-base font-semibold" style={{ color: 'var(--app-heading)' }}>
                  Aucune fonction renseignee
                </div>
                <div className="mt-2 text-sm" style={{ color: 'var(--app-muted)' }}>
                  Cette machine n'a pas encore de fiche fonctionnelle detaillee.
                </div>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {machineFunctions.map((func, index) => (
                  <div key={`${func.title}-${index}`} className="rounded-[22px] p-4" style={softPanelStyle}>
                    <div className="text-sm font-bold" style={{ color: 'var(--app-heading)' }}>
                      {func.title}
                    </div>
                    <div className="mt-2 text-sm leading-6" style={{ color: 'var(--app-muted)' }}>
                      {func.desc}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {hasPieces && activeTab === 'Pieces' && (
          <section className="rounded-[28px] p-5" style={panelStyle}>
            <div className="mb-5 flex items-center gap-3 flex-wrap">
              <div
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: 'var(--app-accent-soft)', color: 'var(--app-accent)' }}
              >
                <Package size={18} />
              </div>
              <div>
                <div className="text-lg font-bold" style={{ color: 'var(--app-heading)' }}>
                  Pieces de {machine.name}
                </div>
                <div className="text-sm" style={{ color: 'var(--app-muted)' }}>
                  Vue de production et etat des pieces associees a cette machine.
                </div>
              </div>
              <span
                className="ml-auto inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{ background: 'var(--app-card-alt)', border: '1px solid var(--app-border)', color: 'var(--app-muted)' }}
              >
                {pieces.length} piece(s)
              </span>
            </div>

            {pieces.length === 0 ? (
              <div className="rounded-[22px] px-4 py-12 text-center" style={softPanelStyle}>
                <Package size={40} className="mx-auto mb-3" style={{ color: 'var(--app-accent)' }} />
                <div className="text-base font-semibold" style={{ color: 'var(--app-heading)' }}>
                  Aucune piece enregistree
                </div>
                <div className="mt-2 text-sm" style={{ color: 'var(--app-muted)' }}>
                  Cette machine n'a pas encore de piece de production associee.
                </div>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {pieces.map((piece) => {
                  const pieceStatus = resolvePieceStatusConfig(getVisiblePieceStatus(piece));

                  return (
                    <div key={piece._id} className="rounded-[24px] p-4" style={softPanelStyle}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-bold" style={{ color: 'var(--app-heading)' }}>
                            {piece.nom}
                          </div>
                          <div className="mt-1 text-sm" style={{ color: 'var(--app-muted)' }}>
                            Suivi de production machine
                          </div>
                        </div>

                        <span
                          className="inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold"
                          style={{
                            background: pieceStatus.bg,
                            border: `1px solid ${pieceStatus.border}`,
                            color: pieceStatus.color,
                          }}
                        >
                          {pieceStatus.label}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div
                          className="rounded-[20px] p-4 text-center"
                          style={{
                            background: 'var(--app-accent-soft)',
                            border: '1px solid var(--app-accent-soft-strong)',
                          }}
                        >
                          <div className="text-[26px] font-bold" style={{ color: 'var(--app-accent)' }}>
                            {piece.quantite}
                          </div>
                          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--app-subtle)' }}>
                            Quantite
                          </div>
                        </div>

                        <div
                          className="rounded-[20px] p-4 text-center"
                          style={{
                            background: successTone.bg,
                            border: `1px solid ${successTone.border}`,
                          }}
                        >
                          <div className="text-[26px] font-bold" style={{ color: successTone.color }}>
                            {(piece.quantite * piece.prix).toLocaleString('fr-FR')}
                          </div>
                          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--app-subtle)' }}>
                            Valeur DT
                          </div>
                        </div>
                      </div>

                      {!piece.matiere && (
                        <div
                          className="mt-4 inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold"
                          style={{ background: dangerTone.bg, border: `1px solid ${dangerTone.border}`, color: dangerTone.color }}
                        >
                          Matiere manquante
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {activeTab === 'Alertes' && isLiveMachine && (
          <section className="rounded-[28px] p-5" style={panelStyle}>
            <div className="mb-5 flex items-center gap-3 flex-wrap">
              <div
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: warningTone.bg, color: warningTone.color }}
              >
                <Bell size={18} />
              </div>
              <div>
                <div className="text-lg font-bold" style={{ color: 'var(--app-heading)' }}>
                  Alertes machine
                </div>
                <div className="text-sm" style={{ color: 'var(--app-muted)' }}>
                  Evenements, anomalies et suivi de resolution.
                </div>
              </div>

              <span
                className="ml-auto inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{
                  background: activeAlerts.length > 0 ? dangerTone.bg : successTone.bg,
                  border: `1px solid ${activeAlerts.length > 0 ? dangerTone.border : successTone.border}`,
                  color: activeAlerts.length > 0 ? dangerTone.color : successTone.color,
                }}
              >
                {activeAlerts.length > 0 ? `${activeAlerts.length} active(s)` : 'Aucune alerte active'}
              </span>

              <button
                onClick={fetchAlerts}
                className="inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold"
                style={{
                  background: 'var(--app-surface)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-accent)',
                }}
              >
                Actualiser
              </button>
            </div>

            {alertsLoading ? (
              <div className="rounded-[22px] px-4 py-12 text-center" style={softPanelStyle}>
                <div className="text-base font-semibold" style={{ color: 'var(--app-heading)' }}>
                  Chargement des alertes...
                </div>
                <div className="mt-2 text-sm" style={{ color: 'var(--app-muted)' }}>
                  Recuperation des donnees machine en cours.
                </div>
              </div>
            ) : alerts.length === 0 ? (
              <div className="rounded-[22px] px-4 py-12 text-center" style={softPanelStyle}>
                <CheckCircle size={40} className="mx-auto mb-3" style={{ color: successTone.color }} />
                <div className="text-base font-semibold" style={{ color: 'var(--app-heading)' }}>
                  Aucune alerte
                </div>
                <div className="mt-2 text-sm" style={{ color: 'var(--app-muted)' }}>
                  Cette machine fonctionne normalement pour le moment.
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {activeAlerts.length > 0 && (
                  <div>
                    <div
                      className="mb-3 text-[12px] font-semibold uppercase tracking-[0.24em]"
                      style={{ color: 'var(--app-subtle)' }}
                    >
                      Alertes actives
                    </div>

                    <div className="flex flex-col gap-3">
                      {activeAlerts.map((alert) => {
                        const severityStyle = resolveAlertSeverityStyle(alert.severity);
                        const alertStatusStyle = resolveAlertStatusStyle(alert.status);

                        return (
                          <div
                            key={alert._id}
                            className="rounded-[22px] p-4"
                            style={{
                              background: severityStyle.bg,
                              border: `1px solid ${severityStyle.border}`,
                            }}
                          >
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
                                  style={{
                                    background: severityStyle.bg,
                                    border: `1px solid ${severityStyle.border}`,
                                    color: severityStyle.color,
                                  }}
                                >
                                  {severityStyle.label}
                                </span>
                                <span className="text-xs font-semibold" style={{ color: alertStatusStyle.color }}>
                                  {alertStatusStyle.text}
                                </span>
                              </div>

                              <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--app-muted)' }}>
                                <Clock size={12} />
                                {new Date(alert.createdAt).toLocaleString('fr-FR')}
                              </span>
                            </div>

                            <div className="mt-3 text-sm font-semibold leading-6" style={{ color: 'var(--app-heading)' }}>
                              {alert.message}
                            </div>

                            {alert.sensorSnapshot && Object.keys(alert.sensorSnapshot).length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {Object.entries(alert.sensorSnapshot).map(([key, value]) => (
                                  <span
                                    key={key}
                                    className="inline-flex items-center rounded-xl px-3 py-1.5 text-xs font-semibold"
                                    style={{
                                      background: 'var(--app-inset)',
                                      border: '1px solid var(--app-border)',
                                      color: 'var(--app-text)',
                                    }}
                                  >
                                    {key}: {value}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="mt-4 flex flex-wrap gap-2">
                              {alert.status === 'new' && (
                                <button
                                  onClick={() => handleMarkSeen(alert._id)}
                                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold"
                                  style={{
                                    background: warningTone.bg,
                                    border: `1px solid ${warningTone.border}`,
                                    color: warningTone.color,
                                  }}
                                >
                                  <Eye size={12} />
                                  Marquer vu
                                </button>
                              )}

                              <button
                                onClick={() => handleResolve(alert._id)}
                                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold"
                                style={{
                                  background: successTone.bg,
                                  border: `1px solid ${successTone.border}`,
                                  color: successTone.color,
                                }}
                              >
                                <CheckCircle size={12} />
                                Resoudre
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {resolvedAlerts.length > 0 && (
                  <div>
                    <div
                      className="mb-3 text-[12px] font-semibold uppercase tracking-[0.24em]"
                      style={{ color: 'var(--app-subtle)' }}
                    >
                      Alertes resolues ({resolvedAlerts.length})
                    </div>

                    <div className="flex flex-col gap-3">
                      {resolvedAlerts.map((alert) => {
                        const severityStyle = resolveAlertSeverityStyle(alert.severity);

                        return (
                          <div key={alert._id} className="rounded-[22px] p-4" style={softPanelStyle}>
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <span
                                className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
                                style={{
                                  background: severityStyle.bg,
                                  border: `1px solid ${severityStyle.border}`,
                                  color: severityStyle.color,
                                }}
                              >
                                {severityStyle.label}
                              </span>

                              <span className="text-xs font-semibold" style={{ color: successTone.color }}>
                                Resolu
                              </span>

                              <span className="text-xs" style={{ color: 'var(--app-muted)' }}>
                                {new Date(alert.createdAt).toLocaleString('fr-FR')}
                              </span>
                            </div>

                            <div className="mt-3 text-sm leading-6" style={{ color: 'var(--app-muted)' }}>
                              {alert.message}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {activeTab === 'Historique' && (
          <section className="rounded-[28px] p-5" style={panelStyle}>
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <History size={40} style={{ color: 'var(--app-accent)' }} />
              <div className="text-base font-semibold" style={{ color: 'var(--app-heading)' }}>
                Historique
              </div>
              <div className="max-w-md text-sm leading-6" style={{ color: 'var(--app-muted)' }}>
                Cette partie sera utilisee pour afficher les interventions, les cycles passes et les
                changements importants sur la machine.
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default MachineDetail;
