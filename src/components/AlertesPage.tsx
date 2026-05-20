import React, { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useTheme } from '../hooks/useTheme';
import { SOCKET_URL, apiUrl } from '../utils/runtimeConfig';
import {
  type AlertRecord,
  formatAlertAnalysis,
  formatAlertSource,
  formatAlertTrigger,
  upsertAlertEntry,
} from '../utils/alertMetadata';

type Alert = AlertRecord;

interface CallLog {
  _id: string;
  audioBase64?: string | null;
  audioFormat?: string | null;
}

const socket = io(SOCKET_URL, { transports: ['websocket'] });

const AlertesPage: React.FC = () => {
  useTheme();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'new' | 'resolved'>('all');
  const [loading, setLoading] = useState(true);
  const [audioLoadingId, setAudioLoadingId] = useState<string | null>(null);
  const [audioMessage, setAudioMessage] = useState('');
  const token = localStorage.getItem('token') || '';

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/alerts?limit=50'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAlerts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAlerts();
    const onAlert = (data: Alert) => {
      setAlerts((prev) => upsertAlertEntry(prev, data, 50));
    };
    socket.on('alert', onAlert);
    socket.on('alert-updated', onAlert);
    return () => {
      socket.off('alert', onAlert);
      socket.off('alert-updated', onAlert);
    };
  }, [fetchAlerts]);

  const markResolved = async (id: string) => {
    await fetch(apiUrl(`/alerts/${id}/resolve`), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    setAlerts((prev) => prev.map((a) => (a._id === id ? { ...a, status: 'resolved' } : a)));
  };

  const playAlertAudio = async (alertId: string) => {
    try {
      setAudioMessage('');
      setAudioLoadingId(alertId);

      const res = await fetch(apiUrl(`/call-logs/${alertId}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setAudioMessage('Impossible de recuperer audio pour cette alerte.');
        return;
      }

      const logs: CallLog[] = await res.json();
      const latestWithAudio = logs.find((l) => Boolean(l.audioBase64));
      if (!latestWithAudio?.audioBase64) {
        setAudioMessage('Aucun audio disponible pour cette alerte.');
        return;
      }

      const format = (latestWithAudio.audioFormat || 'wav').toLowerCase();
      const mime = format === 'mp3' ? 'audio/mpeg' : `audio/${format}`;
      const audio = new Audio(`data:${mime};base64,${latestWithAudio.audioBase64}`);
      await audio.play();
    } catch (e) {
      console.error(e);
      setAudioMessage('Lecture audio echouee.');
    } finally {
      setAudioLoadingId(null);
    }
  };

  const filtered = alerts.filter((a) => {
    if (filter === 'all') return true;
    if (filter === 'critical') return a.severity === 'critical';
    if (filter === 'warning') return a.severity === 'warning';
    if (filter === 'new') return a.status === 'new';
    if (filter === 'resolved') return a.status === 'resolved';
    return true;
  });

  const counts = {
    total: alerts.length,
    critical: alerts.filter((a) => a.severity === 'critical').length,
    warning: alerts.filter((a) => a.severity === 'warning').length,
    new: alerts.filter((a) => a.status === 'new').length,
  };
  const titleClass = 'text-[var(--app-heading)]';
  const mutedClass = 'text-[var(--app-muted)]';
  const bodyClass = 'text-[var(--app-text)]';
  const panelClass = 'rounded-xl border border-[color:var(--app-border)] bg-[var(--app-card)]';

  return (
    <div className="flex-1 min-w-0 w-full overflow-y-auto p-4 sm:p-6" style={{ background: 'transparent' }}>
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <div>
          <h2 className={`text-2xl font-bold mb-1 ${titleClass}`}>Alertes</h2>
          <p className={`text-sm ${mutedClass}`}>Historique et alertes en temps reel</p>
        </div>
        <button
          onClick={fetchAlerts}
          className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all border"
          style={{ background: 'var(--app-accent-soft)', borderColor: 'var(--app-accent-soft-strong)', color: 'var(--app-accent)' }}
        >
          Actualiser
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total', value: counts.total, color: 'var(--app-text)', bg: 'var(--app-neutral-soft)', border: 'var(--app-neutral-border)' },
          { label: 'Critiques', value: counts.critical, color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)' },
          { label: 'Attention', value: counts.warning, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)' },
          { label: 'Nouvelles', value: counts.new, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl p-4 text-center" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
            <div className="text-3xl font-bold" style={{ color: s.color }}>
              {s.value}
            </div>
            <div className={`text-xs mt-1 ${mutedClass}`}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(['all', 'critical', 'warning', 'new', 'resolved'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold cursor-pointer border transition-all ${
              filter === f
                ? 'text-white'
                : 'bg-transparent text-[var(--app-muted)] border-[color:var(--app-border)] hover:border-[color:var(--app-border)]'
            }`}
            style={filter === f ? { background: 'var(--app-accent)', borderColor: 'var(--app-accent)' } : undefined}
          >
            {f === 'all' ? 'Toutes' : f === 'critical' ? 'Critiques' : f === 'warning' ? 'Attention' : f === 'new' ? 'Nouvelles' : 'Resolues'}
          </button>
        ))}
      </div>

      {audioMessage && (
        <div className={`mb-4 text-xs rounded-lg px-3 py-2 ${panelClass} ${bodyClass}`}>{audioMessage}</div>
      )}

      {loading ? (
        <div className={`text-center py-10 ${mutedClass}`}>Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className={`text-center py-10 ${mutedClass}`}>Aucune alerte</div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((alert) => (
            <div
              key={alert._id}
              className="flex flex-col gap-4 rounded-xl p-4 sm:flex-row sm:items-start"
              style={{
                background: alert.severity === 'critical' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                border: `1px solid ${alert.severity === 'critical' ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`,
                borderLeft: `4px solid ${alert.severity === 'critical' ? '#ef4444' : '#f59e0b'}`,
                opacity: alert.status === 'resolved' ? 0.6 : 1,
              }}
            >
              <div className="mt-0.5 text-2xl sm:flex-shrink-0">{alert.severity === 'critical' ? '!' : '!'}</div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`font-semibold text-sm ${titleClass}`}>{alert.message}</span>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{
                      background: alert.severity === 'critical' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                      color: alert.severity === 'critical' ? '#ef4444' : '#f59e0b',
                    }}
                  >
                    {alert.severity.toUpperCase()}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: 'var(--app-inset)', color: 'var(--app-muted)', border: '1px solid var(--app-border)' }}
                  >
                    {alert.type}
                  </span>
                  {alert.status === 'resolved' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/20 text-green-400">RESOLU</span>
                  )}
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: 'var(--app-accent-soft)', color: 'var(--app-accent)', border: '1px solid var(--app-accent-soft-strong)' }}
                  >
                    {formatAlertSource(alert.ai?.source)}
                  </span>
                  {(alert.occurrenceCount || 1) > 1 && (
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: 'var(--app-neutral-soft)', color: 'var(--app-text)', border: '1px solid var(--app-border)' }}
                    >
                      x{alert.occurrenceCount}
                    </span>
                  )}
                </div>

                <div className={`mb-2 text-xs ${bodyClass}`}>
                  Analyse: {formatAlertAnalysis(alert.ai)}
                  {alert.ai?.trigger ? ` · ${formatAlertTrigger(alert.ai.trigger)}` : ''}
                  {alert.ai?.contributor ? ` · Cause: ${alert.ai.contributor}` : ''}
                </div>

                <div className={`flex items-center gap-4 text-xs flex-wrap ${mutedClass}`}>
                  <span>Node: {alert.node}</span>
                  <span>Heure: {new Date(alert.createdAt).toLocaleString('fr-FR')}</span>
                  {alert.lastObservedAt && <span>Derniere detection: {new Date(alert.lastObservedAt).toLocaleString('fr-FR')}</span>}
                  {alert.sensorSnapshot?.courant != null && <span>Courant: {alert.sensorSnapshot.courant.toFixed(1)} A</span>}
                  {alert.sensorSnapshot?.vibX != null && <span>VibX: {alert.sensorSnapshot.vibX.toFixed(2)} g</span>}
                  {alert.sensorSnapshot?.pression != null && <span>Pression: {alert.sensorSnapshot.pression.toFixed(1)} bar</span>}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 sm:flex-col sm:flex-nowrap sm:self-start">
                <button
                  onClick={() => playAlertAudio(alert._id)}
                  disabled={audioLoadingId === alert._id}
                  className="px-3 py-1.5 bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-300 text-xs font-medium cursor-pointer hover:bg-blue-500/30 transition-all whitespace-nowrap disabled:opacity-50"
                >
                  {audioLoadingId === alert._id ? 'Lecture...' : 'Play audio'}
                </button>
                {alert.status !== 'resolved' && (
                  <button
                    onClick={() => markResolved(alert._id)}
                    className="px-3 py-1.5 bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-xs font-medium cursor-pointer hover:bg-green-500/30 transition-all whitespace-nowrap"
                  >
                    Resoudre
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AlertesPage;
