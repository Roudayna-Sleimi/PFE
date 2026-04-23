import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Bot, CheckCircle, Clock, RefreshCw, Wrench } from 'lucide-react';
import { io } from 'socket.io-client';
import { useTheme } from '../hooks/useTheme';

const socket = io('http://localhost:5000', { transports: ['websocket'] });

interface Prediction {
  label: string;
  eta: string;
  confidence: number;
}

interface MaintenanceReport {
  _id: string;
  machineId: string;
  machineName?: string;
  node: string;
  severity: 'normal' | 'warning' | 'critical';
  anomalyScore: number;
  prediction?: Prediction;
  recommendedAction?: string;
  status: 'open' | 'reviewed' | 'resolved';
  createdAt: string;
}

interface MaintenanceRequest {
  _id: string;
  machineId: string;
  machineName?: string;
  node: string;
  title: string;
  description?: string;
  priority: 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'done' | 'cancelled';
  createdAt: string;
}

interface MaintenanceMachine {
  machineId: string;
  machineName: string;
  node: string;
  severity: 'normal' | 'warning' | 'critical';
  anomalyScore: number;
  prediction?: Prediction;
  recommendedAction?: string;
  lastReport?: MaintenanceReport | null;
  openRequest?: MaintenanceRequest | null;
}

interface Overview {
  machines: MaintenanceMachine[];
  reports: MaintenanceReport[];
  requests: MaintenanceRequest[];
  counts: {
    openRequests: number;
    criticalReports: number;
    warningReports: number;
  };
}

const severityStyle = (severity: MaintenanceReport['severity']) => {
  if (severity === 'critical') return { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', label: 'Critique' };
  if (severity === 'warning') return { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', label: 'Risque' };
  return { color: '#22c55e', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)', label: 'Normal' };
};

const requestStatusLabel = (status: MaintenanceRequest['status']) => {
  if (status === 'in_progress') return 'En cours';
  if (status === 'done') return 'Terminee';
  if (status === 'cancelled') return 'Annulee';
  return 'Ouverte';
};

const MaintenancePage: React.FC = () => {
  useTheme();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const token = localStorage.getItem('token') || '';

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:5000/api/maintenance/overview', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.message || 'Impossible de charger maintenance AI.');
        return;
      }
      setOverview(data);
      setMessage('');
    } catch {
      setMessage('Serveur maintenance AI indisponible.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    const onReport = (report: MaintenanceReport) => {
      setOverview(prev => prev ? { ...prev, reports: [report, ...prev.reports].slice(0, 20) } : prev);
    };
    const onRequest = (request: MaintenanceRequest) => {
      setOverview(prev => {
        if (!prev) return prev;
        const exists = prev.requests.some(item => item._id === request._id);
        const requests = exists
          ? prev.requests.map(item => item._id === request._id ? request : item)
          : [request, ...prev.requests];
        return { ...prev, requests: requests.slice(0, 20) };
      });
    };
    socket.on('maintenance-report', onReport);
    socket.on('maintenance-request', onRequest);
    return () => {
      socket.off('maintenance-report', onReport);
      socket.off('maintenance-request', onRequest);
    };
  }, []);

  const analyzeMachine = async (machine: MaintenanceMachine) => {
    setAnalyzing(machine.machineId);
    setMessage('');
    try {
      const res = await fetch('http://localhost:5000/api/maintenance/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ machineId: machine.machineId, node: machine.node }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.message || 'Analyse impossible.');
        return;
      }
      setMessage(data.maintenance ? 'Rapport maintenance cree.' : 'Analyse terminee: comportement normal.');
      await fetchOverview();
    } catch {
      setMessage('Analyse maintenance echouee.');
    } finally {
      setAnalyzing(null);
    }
  };

  const updateRequestStatus = async (requestId: string, status: MaintenanceRequest['status']) => {
    try {
      const res = await fetch(`http://localhost:5000/api/maintenance/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      if (res.ok) await fetchOverview();
    } catch {
      setMessage('Mise a jour demande echouee.');
    }
  };

  const counts = useMemo(() => overview?.counts || { openRequests: 0, criticalReports: 0, warningReports: 0 }, [overview]);
  const panelClass = 'rounded-xl border border-[color:var(--app-border)] bg-[var(--app-card)]';
  const nestedPanelClass = 'rounded-lg border border-[color:var(--app-border)] bg-[var(--app-surface-strong)]';
  const titleClass = 'text-[var(--app-heading)]';
  const bodyClass = 'text-[var(--app-text)]';
  const mutedClass = 'text-[var(--app-muted)]';
  const subtleClass = 'text-[var(--app-subtle)]';
  const progressTrack = 'var(--app-neutral-soft)';
  const statusBadgeBg = 'var(--app-inset)';

  return (
    <div className="flex-1 p-6 overflow-y-auto min-w-0 w-full bg-transparent">
      <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
        <div>
          <h2 className={`text-2xl font-bold mb-1 ${titleClass}`}>Maintenance AI</h2>
          <p className={`text-sm ${mutedClass}`}>Dataset capteurs, prediction panne, rapports et demandes maintenance</p>
        </div>
        <button
          onClick={fetchOverview}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer border transition-all"
          style={{ color: 'var(--app-accent)', borderColor: 'var(--app-accent-soft-strong)', background: 'var(--app-accent-soft)' }}
        >
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--app-accent-soft-strong)', background: 'var(--app-accent-soft)', color: 'var(--app-text)' }}>{message}</div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Demandes ouvertes', value: counts.openRequests, icon: <Wrench size={18} />, color: 'var(--app-accent)' },
          { label: 'Rapports critiques', value: counts.criticalReports, icon: <AlertTriangle size={18} />, color: '#ef4444' },
          { label: 'Risques detectes', value: counts.warningReports, icon: <Activity size={18} />, color: '#f59e0b' },
        ].map(item => (
          <div key={item.label} className={`${panelClass} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${item.color}18`, color: item.color }}>
                {item.icon}
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-wide ${subtleClass}`}>AI</span>
            </div>
            <div className="text-3xl font-bold" style={{ color: item.color }}>{item.value}</div>
            <div className={`text-xs mt-1 ${mutedClass}`}>{item.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className={`text-center py-12 ${mutedClass}`}>Chargement maintenance AI...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 mb-6">
            {(overview?.machines || []).map(machine => {
              const st = severityStyle(machine.severity);
              return (
                <div key={`${machine.machineId}-${machine.node}`} className={`${panelClass} p-4`}>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Bot size={16} className="text-cyan-300" />
                        <span className={`text-sm font-bold ${titleClass}`}>{machine.machineName || machine.machineId}</span>
                      </div>
                      <div className={`text-xs mt-1 ${mutedClass}`}>Node: {machine.node}</div>
                    </div>
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.color }}>
                      {st.label}
                    </span>
                  </div>

                  <div className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className={bodyClass}>Score anomalie</span>
                      <span className="font-bold" style={{ color: st.color }}>{machine.anomalyScore || 0}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: progressTrack }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, machine.anomalyScore || 0)}%`, background: st.color }} />
                    </div>
                  </div>

                  <div className={`${nestedPanelClass} p-3 mb-3`}>
                    <div className={`text-xs mb-1 ${mutedClass}`}>Prediction</div>
                    <div className={`text-sm font-semibold ${titleClass}`}>{machine.prediction?.label || 'Pas de prediction'}</div>
                    <div className={`text-xs mt-1 ${mutedClass}`}>ETA: {machine.prediction?.eta || '-'}</div>
                  </div>

                  {machine.openRequest && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
                      <Wrench size={13} /> Demande ouverte: {machine.openRequest.title}
                    </div>
                  )}

                  <button
                    onClick={() => analyzeMachine(machine)}
                    disabled={analyzing === machine.machineId}
                    className="w-full rounded-lg border border-cyan-400/30 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-50"
                  >
                    {analyzing === machine.machineId ? 'Analyse...' : 'Analyser maintenant'}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className={`${panelClass} p-4`}>
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle size={16} className="text-amber-400" />
                <span className={`text-sm font-bold ${titleClass}`}>Derniers rapports</span>
              </div>
              {(overview?.reports || []).length === 0 ? (
                <div className={`text-center py-8 ${mutedClass}`}>Aucun rapport maintenance</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {(overview?.reports || []).map(report => {
                    const st = severityStyle(report.severity);
                    return (
                      <div key={report._id} className="rounded-lg border p-3" style={{ background: st.bg, borderColor: st.border }}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-bold" style={{ color: st.color }}>{report.machineName || report.machineId}</span>
                          <span className={`text-[10px] ${mutedClass}`}>{new Date(report.createdAt).toLocaleString('fr-FR')}</span>
                        </div>
                        <div className={`text-sm font-medium ${titleClass}`}>{report.prediction?.label || report.severity}</div>
                        <div className={`text-xs mt-1 ${bodyClass}`}>{report.recommendedAction}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={`${panelClass} p-4`}>
              <div className="flex items-center gap-2 mb-4">
                <Wrench size={16} className="text-cyan-300" />
                <span className={`text-sm font-bold ${titleClass}`}>Demandes maintenance</span>
              </div>
              {(overview?.requests || []).length === 0 ? (
                <div className={`text-center py-8 ${mutedClass}`}>Aucune demande maintenance</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {(overview?.requests || []).map(request => (
                    <div key={request._id} className={`${nestedPanelClass} p-3`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className={`text-sm font-bold ${titleClass}`}>{request.title}</div>
                          <div className={`text-xs mt-1 ${mutedClass}`}>{request.machineName || request.machineId} - {new Date(request.createdAt).toLocaleString('fr-FR')}</div>
                        </div>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: statusBadgeBg, color: 'var(--app-text)' }}>{requestStatusLabel(request.status)}</span>
                      </div>
                      <div className="mt-3 flex gap-2">
                        {request.status === 'open' && (
                          <button onClick={() => updateRequestStatus(request._id, 'in_progress')} className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200">
                            <Clock size={11} /> Demarrer
                          </button>
                        )}
                        {request.status !== 'done' && request.status !== 'cancelled' && (
                          <button onClick={() => updateRequestStatus(request._id, 'done')} className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                            <CheckCircle size={11} /> Terminer
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MaintenancePage;
