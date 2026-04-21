import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart2, Clock, Package, Search, Users, Zap } from 'lucide-react';

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
  reportByMachine: Array.isArray(payload?.reportByMachine) ? payload.reportByMachine : [],
  reportByEmployee: Array.isArray(payload?.reportByEmployee) ? payload.reportByEmployee : [],
  logs: Array.isArray(payload?.logs) ? payload.logs : [],
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
  const [search, setSearch] = useState('');

  const role = localStorage.getItem('role');
  const token = localStorage.getItem('token') || '';

  useEffect(() => {
    const load = async () => {
      if (role !== 'admin') {
        setError("Acces reserve a l'admin.");
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
      } catch {
        setError('Impossible de charger les rapports.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [role, token]);

  const accent = darkMode ? '#60a5fa' : '#1d4ed8';
  const neutral = darkMode ? '#e2e8f0' : '#0f172a';

  const theme = useMemo(() => ({
    page: 'bg-[var(--app-bg)] text-[var(--app-text)]',
    card: 'bg-[var(--app-card)] border-[color:var(--app-border)]',
    muted: 'text-[var(--app-muted)]',
    subtle: 'text-[var(--app-subtle)]',
    tableHead: 'text-[var(--app-heading)] bg-[var(--app-surface-strong)]',
    rowBorder: 'border-[color:var(--app-border)]',
    tableShell: 'border-[color:var(--app-border)]',
    input: darkMode ? 'placeholder:text-[var(--app-subtle)]' : 'placeholder:text-[var(--app-subtle)]',
    error: darkMode ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-red-200 bg-white text-red-700',
  }), [darkMode]);

  const summary = data ? [
    { label: 'Consommation energie', value: `${data.totalEnergyKwh.toLocaleString('fr-FR')} kWh`, icon: <Zap size={18} color={neutral} /> },
    { label: 'Pieces produites', value: `${data.totalPiecesProduced.toLocaleString('fr-FR')} pcs`, icon: <Package size={18} color={accent} /> },
    { label: "Temps d'usinage", value: fmtDuration(data.totalMachiningSeconds), icon: <Clock size={18} color={accent} /> },
    { label: 'Anomalies', value: `${data.anomalies}`, icon: <AlertTriangle size={18} color="#ef4444" /> },
  ] : [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!data || !q) {
      return {
        machines: data?.reportByMachine || [],
        employees: data?.reportByEmployee || [],
        logs: data?.logs || [],
      };
    }

    return {
      machines: data.reportByMachine.filter((row) => row.machine.toLowerCase().includes(q)),
      employees: data.reportByEmployee.filter((row) =>
        [row.username, row.assignedMachine].some((value) => String(value || '').toLowerCase().includes(q))),
      logs: data.logs.filter((log) =>
        [log.machine, log.username, log.action, log.pieceName].some((value) => String(value || '').toLowerCase().includes(q))),
    };
  }, [data, search]);

  return (
    <div className={`flex-1 overflow-y-auto p-6 ${theme.page}`}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="mb-1 text-2xl font-bold">Rapports de production</h2>
          <p className={`text-sm ${theme.muted}`}>Rapport global, par machine et par employe.</p>
        </div>
        {data?.energyEstimated && (
          <div className={`rounded-lg border px-3 py-2 text-xs font-semibold ${theme.card}`}>
            Energie estimee selon temps machine
          </div>
        )}
        <div className={`flex h-10 min-w-[300px] items-center gap-2 rounded-lg border px-3 ${theme.card}`}>
          <Search size={15} color={neutral} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher machine, employe, action..."
            className={`w-full bg-transparent text-sm outline-none ${theme.input}`}
          />
        </div>
      </div>

      {loading && (
        <div className={`rounded-xl border p-8 text-center ${theme.card}`}>
          Chargement des rapports...
        </div>
      )}

      {!loading && error && (
        <div className={`rounded-xl border p-6 text-sm ${theme.error}`}>
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="mb-6 grid grid-cols-4 gap-4">
            {summary.map((item) => (
              <div key={item.label} className={`rounded-xl border p-4 ${theme.card}`}>
                <div className="mb-3">{item.icon}</div>
                <div className="mb-1 text-[22px] font-bold">{item.value}</div>
                <div className={`text-xs ${theme.muted}`}>{item.label}</div>
              </div>
            ))}
          </div>

          <div className="mb-6 grid grid-cols-2 gap-5">
            <section className={`rounded-xl border p-5 ${theme.card}`}>
              <div className="mb-4 flex items-center gap-2">
                <BarChart2 size={16} color={accent} />
                <h3 className="text-base font-bold">Rapport par machine</h3>
              </div>

              {filtered.machines.length === 0 ? (
                <div className={`text-sm ${theme.muted}`}>Aucune donnee machine.</div>
              ) : (
                <div className={`overflow-hidden rounded-lg border ${theme.tableShell}`}>
                  <div className={`grid grid-cols-[1.4fr_0.8fr_1fr_1fr] gap-3 px-4 py-3 text-xs font-bold ${theme.tableHead}`}>
                    <span>Machine</span>
                    <span>Pieces</span>
                    <span>Usinage</span>
                    <span>Energie</span>
                  </div>
                  {filtered.machines.map((row) => (
                    <div key={row.machine} className={`grid grid-cols-[1.4fr_0.8fr_1fr_1fr] gap-3 border-t px-4 py-3 text-sm ${theme.rowBorder}`}>
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
              <div className="mb-4 flex items-center gap-2">
                <Users size={16} color={accent} />
                <h3 className="text-base font-bold">Rapport par employe</h3>
              </div>

              {filtered.employees.length === 0 ? (
                <div className={`text-sm ${theme.muted}`}>Aucune donnee employe.</div>
              ) : (
                <div className={`overflow-hidden rounded-lg border ${theme.tableShell}`}>
                  <div className={`grid grid-cols-[1.2fr_0.7fr_1fr_1fr] gap-3 px-4 py-3 text-xs font-bold ${theme.tableHead}`}>
                    <span>Employe</span>
                    <span>Pieces</span>
                    <span>Usinage</span>
                    <span>Energie</span>
                  </div>
                  {filtered.employees.map((row) => (
                    <div key={row.username} className={`grid grid-cols-[1.2fr_0.7fr_1fr_1fr] gap-3 border-t px-4 py-3 text-sm ${theme.rowBorder}`}>
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
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold">Journal recent</h3>
                <p className={`text-xs ${theme.muted}`}>Dernieres operations machine et production.</p>
              </div>
              <div className={`text-xs ${theme.subtle}`}>{filtered.logs.length} ligne(s)</div>
            </div>

            {filtered.logs.length === 0 ? (
              <div className={`text-sm ${theme.muted}`}>Aucun log disponible.</div>
            ) : (
              <div className={`overflow-hidden rounded-lg border ${theme.tableShell}`}>
                <div className={`grid grid-cols-[1fr_0.9fr_0.8fr_0.8fr_1.2fr] gap-3 px-4 py-3 text-xs font-bold ${theme.tableHead}`}>
                  <span>Machine</span>
                  <span>Employe</span>
                  <span>Action</span>
                  <span>Pieces</span>
                  <span>Date</span>
                </div>
                {filtered.logs.slice(0, 12).map((log, index) => (
                  <div key={`${log.machine}-${log.at}-${index}`} className={`grid grid-cols-[1fr_0.9fr_0.8fr_0.8fr_1.2fr] gap-3 border-t px-4 py-3 text-sm ${theme.rowBorder}`}>
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
