import React, { useState, useEffect } from 'react';

interface Alert {
  _id: string;
  machineId: string;
  severity: 'critical' | 'warning';
  status: string;
  createdAt: string;
  message: string;
}

const RapportsPage: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem('token') || '';

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/alerts?limit=500', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setAlerts(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchAlerts();
  }, [token]);

  const getStats = (machineId: string) => {
    const machineAlerts = alerts.filter(a =>
      a.machineId?.toLowerCase().includes(machineId.toLowerCase()) ||
      machineId.toLowerCase().includes(a.machineId?.toLowerCase())
    );
    const critical = machineAlerts.filter(a => a.severity === 'critical').length;
    const warning = machineAlerts.filter(a => a.severity === 'warning').length;
    const uptime = machineAlerts.length === 0 ? 100 : Math.max(0, Math.round(100 - (critical * 2) - (warning * 0.5)));
    return { uptime };
  };

  const getLast7Days = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
      const dayAlerts = alerts.filter(a => {
        const alertDate = new Date(a.createdAt);
        return alertDate.toDateString() === date.toDateString();
      });
      const hasCritical = dayAlerts.some(a => a.severity === 'critical');
      const hasWarning = dayAlerts.some(a => a.severity === 'warning');
      days.push({
        label: dateStr,
        total: dayAlerts.length,
        color: dayAlerts.length === 0 ? '#22c55e' : hasCritical ? '#ef4444' : hasWarning ? '#f59e0b' : '#22c55e',
      });
    }
    return days;
  };

  const rectStats = getStats('rectifieuse');
  const compStats = getStats('compresseur');
  const scoreGlobal = Math.round((rectStats.uptime + compStats.uptime) / 2);
  const scoreColor = scoreGlobal > 80 ? '#22c55e' : scoreGlobal > 60 ? '#f59e0b' : '#ef4444';
  const scoreLabel = scoreGlobal > 80 ? 'Excellent' : scoreGlobal > 60 ? 'Attention' : 'Critique';

  const msgCount: Record<string, number> = {};
  alerts.forEach(a => {
    const key = a.message?.split(':')[0] || a.message;
    msgCount[key] = (msgCount[key] || 0) + 1;
  });
  const top3 = Object.entries(msgCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const days = getLast7Days();

  return (
    <div className="flex-1 p-6 overflow-y-auto min-w-0 w-full" style={{ background: 'transparent' }}>

      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-1">Rapports de Performance</h2>
        <p className="text-sm text-slate-500">Analyse et statistiques des machines</p>
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-10">Chargement...</div>
      ) : (
        <div className="grid grid-cols-3 gap-6">

          {/* 1. Score Usine */}
          <div className="rounded-xl p-6 flex flex-col items-center justify-center text-center"
            style={{ background: 'rgba(255,255,255,0.03)', border: `2px solid ${scoreColor}40` }}>
            <div className="text-xs text-slate-500 mb-3 uppercase tracking-widest">Score Usine</div>
            <div className="relative w-28 h-28 mb-3">
              <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                <circle cx="40" cy="40" r="32" fill="none"
                  stroke={scoreColor} strokeWidth="6"
                  strokeDasharray={`${(scoreGlobal / 100) * 201} 201`}
                  strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold" style={{ color: scoreColor }}>{scoreGlobal}</span>
              </div>
            </div>
            <div className="text-sm font-semibold mb-4" style={{ color: scoreColor }}>{scoreLabel}</div>
            <div className="w-full flex justify-around text-center border-t border-white/10 pt-4">
              <div>
                <div className="text-lg font-bold text-green-400">{rectStats.uptime}%</div>
                <div className="text-xs text-slate-500">Rectifieuse</div>
              </div>
              <div>
                <div className="text-lg font-bold text-cyan-400">{compStats.uptime}%</div>
                <div className="text-xs text-slate-500">Compresseur</div>
              </div>
            </div>
          </div>

          {/* 2. Top alertes fréquentes */}
          <div className="rounded-xl p-6"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="text-white font-semibold mb-4">🏆 Top alertes fréquentes</div>
            {top3.length === 0 ? (
              <div className="text-xs text-slate-500">Aucune donnée</div>
            ) : (
              <div className="flex flex-col gap-4">
                {top3.map(([msg, count], i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: i === 0 ? '#ef4444' : i === 1 ? '#f59e0b' : '#94a3b8' }}>
                          #{i + 1}
                        </span>
                        <span className="text-sm text-slate-300 truncate max-w-[160px]">{msg}</span>
                      </div>
                      <span className="text-sm font-bold text-white">{count}x</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <div className="h-1.5 rounded-full"
                        style={{
                          width: `${(count / top3[0][1]) * 100}%`,
                          background: i === 0 ? '#ef4444' : i === 1 ? '#f59e0b' : '#94a3b8'
                        }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Calendrier santé */}
          <div className="rounded-xl p-6"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="text-white font-semibold mb-4">📅 Calendrier de santé (7 jours)</div>
            <div className="flex gap-2 mb-4">
              {days.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{
                      height: '44px',
                      background: `${d.color}20`,
                      border: `2px solid ${d.color}`,
                      color: d.color
                    }}>
                    {d.total === 0 ? '✓' : d.total}
                  </div>
                  <div className="text-[10px] text-slate-500 text-center">{d.label}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-2">
              {[
                { color: '#22c55e', label: 'Normal' },
                { color: '#f59e0b', label: 'Warning' },
                { color: '#ef4444', label: 'Critique' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded" style={{ background: l.color }} />
                  <span className="text-xs text-slate-400">{l.label}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

export default RapportsPage;