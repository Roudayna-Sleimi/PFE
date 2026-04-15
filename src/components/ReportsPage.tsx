import React, { useEffect, useMemo, useState } from 'react';
import { BarChart2, Clock, Package, Zap, Users, AlertTriangle } from 'lucide-react';

interface ReportRowMachine {
  machine: string;
  piecesProduced: number;
  machiningSeconds: number;
  energyKwh: number;
}

interface ReportRowEmployee {
  username: string;
  piecesProduced: number;
  machiningSeconds: number;
  energyKwh: number;
  assignedMachine?: string | null;
}

interface ReportLog {
  machine: string;
  action: string;
  at: string;
  username: string;
  pieceCount?: number | null;
  pieceName?: string | null;
}

interface ReportsOverview {
  piecesTraitees: number;
  pauses: number;
  anomalies: number;
  totalEnergyKwh: number;
  totalMachiningSeconds: number;
  totalPiecesProduced: number;
  energyEstimated?: boolean;
  reportByMachine: ReportRowMachine[];
  reportByEmployee: ReportRowEmployee[];
  logs: ReportLog[];
}

interface Props {
  darkMode?: boolean;
}

const normalizeReportsOverview = (payload: Partial<ReportsOverview> | null | undefined): ReportsOverview => ({
  piecesTraitees: Number(payload?.piecesTraitees || 0),
  pauses: Number(payload?.pauses || 0),
  anomalies: Number(payload?.anomalies || 0),
  totalEnergyKwh: Number(payload?.totalEnergyKwh || 0),
  totalMachiningSeconds: Number(payload?.totalMachiningSeconds || 0),
  totalPiecesProduced: Number(payload?.totalPiecesProduced || 0),
  energyEstimated: Boolean(payload?.energyEstimated),
  reportByMachine: Array.isArray(payload?.reportByMachine) ? payload!.reportByMachine : [],
  reportByEmployee: Array.isArray(payload?.reportByEmployee) ? payload!.reportByEmployee : [],
  logs: Array.isArray(payload?.logs) ? payload!.logs : [],
});

const fmtDuration = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')} min`;
};

const ReportsPage: React.FC<Props> = ({ darkMode = true }) => {
  const [data, setData] = useState<ReportsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const role = localStorage.getItem('role');
  const token = localStorage.getItem('token') || '';

  useEffect(() => {
    const load = async () => {
      if (role !== 'admin') {
        setError("Accès réservé à l'admin.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const res = await fetch('http://localhost:5000/api/reports/overview', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json?.message || 'Impossible de charger les rapports.');
          return;
        }
        setData(normalizeReportsOverview(json));
      } catch (err) {
        setError('Impossible de charger les rapports.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [role, token]);

  const theme = useMemo(() => ({
    page: darkMode ? 'bg-transparent text-white' : 'bg-slate-100 text-slate-900',
    card: darkMode ? 'bg-slate-800/50 border-white/[0.08]' : 'bg-white border-slate-200',
    muted: darkMode ? 'text-slate-400' : 'text-slate-500',
    subtle: darkMode ? 'text-slate-500' : 'text-slate-400',
    tableHead: darkMode ? 'text-slate-400 bg-slate-900/30' : 'text-slate-500 bg-slate-50',
    rowBorder: darkMode ? 'border-white/[0.06]' : 'border-slate-200',
  }), [darkMode]);

  const summary = data ? [
    { label: 'Consommation énergie', value: `${data.totalEnergyKwh.toLocaleString('fr-FR')} kWh`, icon: <Zap size={18} color="#f59e0b" /> },
    { label: 'Pièces produites', value: `${data.totalPiecesProduced.toLocaleString('fr-FR')} pcs`, icon: <Package size={18} color="#3b82f6" /> },
    { label: "Temps d'usinage", value: fmtDuration(data.totalMachiningSeconds), icon: <Clock size={18} color="#22c55e" /> },
    { label: 'Anomalies', value: `${data.anomalies}`, icon: <AlertTriangle size={18} color="#ef4444" /> },
  ] : [];

  return (
    <div className={`flex-1 p-6 overflow-y-auto ${theme.page}`}>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold mb-1">Rapports de production</h2>
          <p className={`text-sm ${theme.muted}`}>
            Rapport global, par machine et par employé.
          </p>
        </div>
        {data?.energyEstimated && (
          <div className={`px-3 py-2 rounded-lg border text-xs font-semibold ${theme.card}`}>
            Énergie estimée selon temps machine
          </div>
        )}
      </div>

      {loading && (
        <div className={`rounded-xl border p-8 text-center ${theme.card}`}>
          Chargement des rapports...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-4 gap-4 mb-6">
            {summary.map((item) => (
              <div key={item.label} className={`rounded-xl border p-4 ${theme.card}`}>
                <div className="mb-3">{item.icon}</div>
                <div className="text-[22px] font-bold mb-1">{item.value}</div>
                <div className={`text-xs ${theme.muted}`}>{item.label}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-5 mb-6">
            <section className={`rounded-xl border p-5 ${theme.card}`}>
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 size={16} color="#38bdf8" />
                <h3 className="text-base font-bold">Rapport par machine</h3>
              </div>

              {data.reportByMachine.length === 0 ? (
                <div className={`text-sm ${theme.muted}`}>Aucune donnée machine.</div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-white/[0.06]">
                  <div className={`grid grid-cols-[1.4fr_0.8fr_1fr_1fr] gap-3 px-4 py-3 text-xs font-bold ${theme.tableHead}`}>
                    <span>Machine</span>
                    <span>Pièces</span>
                    <span>Usinage</span>
                    <span>Énergie</span>
                  </div>
                  {data.reportByMachine.map((row) => (
                    <div key={row.machine} className={`grid grid-cols-[1.4fr_0.8fr_1fr_1fr] gap-3 px-4 py-3 text-sm border-t ${theme.rowBorder}`}>
                      <span className="font-semibold">{row.machine}</span>
                      <span>{row.piecesProduced}</span>
                      <span>{fmtDuration(row.machiningSeconds)}</span>
                      <span>{row.energyKwh.toLocaleString('fr-FR')} kWh</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className={`rounded-xl border p-5 ${theme.card}`}>
              <div className="flex items-center gap-2 mb-4">
                <Users size={16} color="#22c55e" />
                <h3 className="text-base font-bold">Rapport par employé</h3>
              </div>

              {data.reportByEmployee.length === 0 ? (
                <div className={`text-sm ${theme.muted}`}>Aucune donnée employé.</div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-white/[0.06]">
                  <div className={`grid grid-cols-[1.2fr_0.7fr_1fr_1fr] gap-3 px-4 py-3 text-xs font-bold ${theme.tableHead}`}>
                    <span>Employé</span>
                    <span>Pièces</span>
                    <span>Usinage</span>
                    <span>Énergie</span>
                  </div>
                  {data.reportByEmployee.map((row) => (
                    <div key={row.username} className={`grid grid-cols-[1.2fr_0.7fr_1fr_1fr] gap-3 px-4 py-3 text-sm border-t ${theme.rowBorder}`}>
                      <div>
                        <div className="font-semibold">{row.username}</div>
                        <div className={`text-[11px] ${theme.subtle}`}>{row.assignedMachine || 'Aucune machine fixe'}</div>
                      </div>
                      <span>{row.piecesProduced}</span>
                      <span>{fmtDuration(row.machiningSeconds)}</span>
                      <span>{row.energyKwh.toLocaleString('fr-FR')} kWh</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className={`rounded-xl border p-5 ${theme.card}`}>
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div>
                <h3 className="text-base font-bold">Journal récent</h3>
                <p className={`text-xs ${theme.muted}`}>Dernières opérations machine et production.</p>
              </div>
              <div className={`text-xs ${theme.subtle}`}>
                {data.logs.length} ligne(s)
              </div>
            </div>

            {data.logs.length === 0 ? (
              <div className={`text-sm ${theme.muted}`}>Aucun log disponible.</div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-white/[0.06]">
                <div className={`grid grid-cols-[1fr_0.9fr_0.8fr_0.8fr_1.2fr] gap-3 px-4 py-3 text-xs font-bold ${theme.tableHead}`}>
                  <span>Machine</span>
                  <span>Employé</span>
                  <span>Action</span>
                  <span>Pièces</span>
                  <span>Date</span>
                </div>
                {data.logs.slice(0, 12).map((log, index) => (
                  <div key={`${log.machine}-${log.at}-${index}`} className={`grid grid-cols-[1fr_0.9fr_0.8fr_0.8fr_1.2fr] gap-3 px-4 py-3 text-sm border-t ${theme.rowBorder}`}>
                    <span>{log.machine}</span>
                    <span>{log.username}</span>
                    <span className="capitalize">{log.action}</span>
                    <span>{log.pieceCount || 0}</span>
                    <span>{new Date(log.at).toLocaleString('fr-FR')}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default ReportsPage;
