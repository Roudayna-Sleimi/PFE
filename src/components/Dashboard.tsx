import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  LayoutDashboard, Settings, Activity,
  Pause, Sun, Moon, X, MessageSquare, UserPlus, LogOut, PhoneCall,
  BarChart2, Package, Heart, Search
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import MessagingPage from './Messagingpage';
import MachinesPage from './MachinesPage';
import DemandesPage from './Demandespage';
import ProductionPage from './ProductionPage';
import ReportsPage from './ReportsPage';
import GsmContactsPage from './GsmContactsPage';
import MaintenancePage from './MaintenancePage';
import { useTheme } from '../hooks/useTheme';
import './Dashboard.css';

interface SensorData {
  node: string; courant: number;
  vibX: number; vibY: number; vibZ: number; rpm: number;
  pression?: number;
}

interface EmployeOverview {
  _id?: string;
  username: string;
  assignedMachine?: string | null;
  currentPieceName?: string | null;
  currentPieceId?: string | null;
  machineStatus?: 'started' | 'paused' | 'stopped';
  currentActivity?: string;
  machineStatusUpdatedAt?: string;
  connectedAt?: string;
  isOnline?: boolean;
}

interface MachineEvent {
  _id: string;
  username: string;
  machine: string;
  action: 'started' | 'paused' | 'stopped';
  activity?: string;
  pieceName?: string;
  pieceCount?: number;
  createdAt: string;
}

interface EmployeHistorique {
  events: MachineEvent[];
  stats: {
    totalPieces: number;
    totalSessions: number;
    totalPausees: number;
    totalTerminees: number;
    piecesProduites: number;
    piecesAujourd: number;
    workSecondsToday: number;
    pauseSecondsToday: number;
  };
}

interface MachineApi {
  id: string;
  name: string;
  hasSensors?: boolean;
  node?: string | null;
}

interface DashboardStats {
  kpi: { totalPcs: number; totalRevenu: number; enCours: number; totalPieces: number; alertesActives: number; };
  prodParJour: { label: string; pcs: number }[];
  repartition: { name: string; value: number }[];
  tempsMachines: { machine: string; seconds: number }[];
  totalFonctionSeconds: number;
  totalPauseSeconds: number;
  activiteEmployes: { username: string; machineStatus?: string; assignedMachine?: string; sessions: number; pcs: number }[];
  machinesActives: { machine?: string; username: string }[];
  employes: { total: number; actifs: number; enPause: number; enligne: number };
}

const socket: Socket = io('http://localhost:5000', { transports: ['websocket'] });

const generateSimData = (): SensorData => ({
  node: 'ESP32-NODE-01',
  courant: parseFloat((10 + Math.sin(Date.now() / 3000) * 5 + Math.random()).toFixed(2)),
  vibX:    parseFloat((1.5 + Math.sin(Date.now() / 2000) * 0.8 + Math.random() * 0.3).toFixed(2)),
  vibY:    parseFloat((1.2 + Math.cos(Date.now() / 2500) * 0.6 + Math.random() * 0.2).toFixed(2)),
  vibZ:    parseFloat((0.8 + Math.sin(Date.now() / 1800) * 0.4 + Math.random() * 0.2).toFixed(2)),
  rpm:     parseFloat((1200 + Math.sin(Date.now() / 4000) * 200).toFixed(0)),
});

const Dashboard: React.FC = () => {
  const { darkMode, toggleTheme }           = useTheme();
  const [currentTime, setCurrentTime]       = useState(new Date());
  const [connected, setConnected]           = useState(false);
  const [hasLiveData, setHasLiveData]       = useState(false);
  const [paused, setPaused]                 = useState(false);
  const [latest, setLatest]                 = useState<SensorData>(generateSimData());
  const [latestComp, setLatestComp]         = useState<SensorData>({ node:'compresseur', courant:0, vibX:0, vibY:0, vibZ:0, rpm:0, pression:0 });
  const [showMessaging, setShowMessaging]   = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [alertCount, setAlertCount]         = useState(0);
  const [globalSearch, setGlobalSearch]     = useState('');
  const role = localStorage.getItem('role');



const [activePage, setActivePage] = useState<
  'dashboard' | 'production' | 'gsm' | 'maintenance' | 'machines' | 'rapports' | 'employes' | 'demandes'
>('dashboard');
  // ── Stats Production depuis MongoDB ──
  const [prodStats, setProdStats] = useState({ totalPcs: 0, totalRevenu: 0, enCours: 0 });
  const [employeesOverview, setEmployeesOverview] = useState<EmployeOverview[]>([]);

  const [selectedEmploye, setSelectedEmploye] = useState<string | null>(null);
  const [historique, setHistorique] = useState<EmployeHistorique | null>(null);
  const [loadingHisto, setLoadingHisto] = useState(false);
  const [dashStats, setDashStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token') || '';
    fetch('http://localhost:5000/api/machines', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((data: MachineApi[]) => {
        if (!Array.isArray(data)) return;

      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token') || '';
    fetch('http://localhost:5000/api/pieces', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return;
        setProdStats({
          totalPcs:    data.reduce((s: number, p: { quantite: number }) => s + p.quantite, 0),
          totalRevenu: data.reduce((s: number, p: { quantite: number; prix: number }) => s + p.quantite * p.prix, 0),
          enCours:     data.filter((p: { status: string }) => p.status === 'En cours').length,
        });
      })
      .catch(() => {});
  }, [activePage]);

  useEffect(() => {
    const token = localStorage.getItem('token') || '';
    if (activePage === 'employes' && role === 'admin') {
      fetch('http://localhost:5000/api/admin/employes-overview', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setEmployeesOverview(data); })
        .catch(() => {});
    }
  }, [activePage, role]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchDashStats = useCallback(async () => {
    const token = localStorage.getItem('token') || '';
    try {
      const res = await fetch('http://localhost:5000/api/dashboard/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) { const data = await res.json(); setDashStats(data); }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    socket.on('connect', () => {
      setConnected(true);
      const username = localStorage.getItem('username');
      const role     = localStorage.getItem('role');
      if (username && role) socket.emit('user-online', { username, role });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('alert', (data: { severity: string; message: string; node: string }) => {
      setAlertCount(prev => prev + 1);
      const alertDiv = document.createElement('div');
      alertDiv.style.cssText = `
        position: fixed; top: 80px; right: 24px; z-index: 9999;
        padding: 18px 24px; border-radius: 14px; font-size: 14px;
        font-weight: 600; color: white; max-width: 400px; min-width: 300px;
        background: ${data.severity === 'critical' ? '#ef4444' : '#f59e0b'};
        box-shadow: 0 12px 32px rgba(0,0,0,0.4);
        border-left: 5px solid ${data.severity === 'critical' ? '#b91c1c' : '#d97706'};
        display: flex; flex-direction: column; gap: 6px; cursor: pointer;
      `;
      alertDiv.innerHTML = `
        <div style="font-size:16px;">${data.severity === 'critical' ? 'ALERTE CRITIQUE' : 'ATTENTION'}</div>
        <div style="font-size:13px; font-weight:400; opacity:0.9;">${data.message}</div>
        <div style="font-size:11px; opacity:0.7;">Machine: ${data.node || 'Inconnue'} — Cliquez pour fermer</div>
      `;
      alertDiv.onclick = () => alertDiv.remove();
      document.body.appendChild(alertDiv);
      setTimeout(() => alertDiv.remove(), 10000);
    });
    socket.on('direct-message', (msg: { from: string }) => {
      const currentUser = localStorage.getItem('username');
      if (msg.from !== currentUser) setUnreadMessages(prev => prev + 1);
    });
    socket.on('employee-machine-updated', (payload: EmployeOverview) => {
      if (!payload?.username) return;
      setEmployeesOverview(prev => {
        const idx = prev.findIndex(e => e.username === payload.username);
        if (idx === -1) return [payload, ...prev];
        const next = [...prev];
        next[idx] = { ...next[idx], ...payload };
        return next;
      });
      // Refresh dashboard stats when employee status changes
      fetchDashStats();
    });
    socket.on('user-status', (payload: { username: string; isOnline: boolean }) => {
      if (!payload?.username) return;
      setEmployeesOverview(prev => prev.map(e =>
        e.username === payload.username ? { ...e, isOnline: payload.isOnline } : e
      ));
      fetchDashStats();
    });
    socket.on('dashboard-refresh', () => {
      fetchDashStats();
    });
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('direct-message');
      socket.off('alert');
      socket.off('employee-machine-updated');
      socket.off('user-status');
      socket.off('dashboard-refresh');
    };
  }, [fetchDashStats]);

  useEffect(() => {
    socket.on('sensor-data', (data: SensorData) => {
      if (paused) return;
      setHasLiveData(true);
      if (data.node === 'compresseur') setLatestComp(data);
      else setLatest(data);
    });
    return () => { socket.off('sensor-data'); };
  }, [paused]);

  useEffect(() => {
    if (hasLiveData) return;
    const interval = setInterval(() => {
      if (paused) return;
      setLatest(generateSimData());
      setLatestComp({
        node: 'compresseur',
        courant:  parseFloat((8 + Math.sin(Date.now() / 3000) * 2 + Math.random()).toFixed(2)),
        vibX:     parseFloat((0.5 + Math.sin(Date.now() / 2000) * 0.3 + Math.random() * 0.1).toFixed(2)),
        vibY:     parseFloat((0.3 + Math.cos(Date.now() / 2500) * 0.2 + Math.random() * 0.1).toFixed(2)),
        vibZ:     parseFloat((0.2 + Math.sin(Date.now() / 1800) * 0.1 + Math.random() * 0.1).toFixed(2)),
        rpm:      0,
        pression: parseFloat((7 + Math.sin(Date.now() / 4000) * 1.5).toFixed(2)),
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [hasLiveData, paused]);

  const sante = useMemo(() => {
    const v = latest.vibX + latest.vibY + latest.vibZ;
    return parseFloat(Math.max(0, Math.min(100, 100 - v * 5)).toFixed(1));
  }, [latest]);

  const santeComp = useMemo(() => {
    const v = latestComp.vibX + latestComp.vibY + latestComp.vibZ;
    return parseFloat(Math.max(0, Math.min(100, 100 - v * 5)).toFixed(1));
  }, [latestComp]);

  const togglePaused = useCallback(() => setPaused(p => !p), []);
  const handleLogout = useCallback(() => {
    const savedTheme = localStorage.getItem('themeMode') || localStorage.getItem('loginMode');
    localStorage.clear();
    if (savedTheme) {
      localStorage.setItem('themeMode', savedTheme);
      localStorage.setItem('loginMode', savedTheme);
    }
    window.location.href = '/';
  }, []);
  const handleOpenMessaging = () => { setShowMessaging(true); setUnreadMessages(0); };



  useEffect(() => {
    fetchDashStats();
    const interval = setInterval(fetchDashStats, 30000);
    return () => clearInterval(interval);
  }, [fetchDashStats]);

  const fetchHistorique = async (username: string) => {    setLoadingHisto(true);
    setHistorique(null);
    const token = localStorage.getItem('token') || '';
    try {
      const res = await fetch(`http://localhost:5000/api/admin/employes/${username}/historique`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setHistorique(data);
    } catch { /* ignore */ }
    finally { setLoadingHisto(false); }
  };

  const shellBg = darkMode ? 'bg-[#07111f] text-slate-100' : 'bg-slate-100 text-slate-900';
  const bg2 = darkMode ? 'bg-[#0b1627]/92 backdrop-blur-md' : 'bg-white';
  const bgCard = darkMode ? 'bg-[#0d1a2d]/80 shadow-[0_16px_32px_-26px_rgba(56,189,248,0.5)]' : 'bg-white';
  const bgCardStrong = darkMode ? 'bg-[#0b1627]/92 shadow-[0_24px_60px_-34px_rgba(14,165,233,0.6)]' : 'bg-white';
  const border = darkMode ? 'border-sky-300/15' : 'border-slate-200';
  const txt1 = darkMode ? 'text-white' : 'text-slate-900';
  const txt2 = darkMode ? 'text-slate-300' : 'text-slate-500';
  const txtMut = darkMode ? 'text-slate-400' : 'text-slate-400';
  const navHover = darkMode ? 'hover:bg-sky-500/10 hover:text-sky-200' : 'hover:bg-[rgba(0,212,255,0.1)] hover:text-[#00d4ff]';
  const navActive = darkMode
    ? 'text-sky-100 border border-sky-400/30 bg-[linear-gradient(135deg,rgba(14,165,233,0.18),rgba(56,189,248,0.08))] shadow-[0_18px_40px_-32px_rgba(56,189,248,0.9)]'
    : 'text-[#00d4ff] border border-[rgba(0,212,255,0.2)]';

  // ── navItems ──
const navItems = [
  { key: 'dashboard' as const, icon: <LayoutDashboard size={18} />, label: 'Tableau de bord' },
  { key: 'production' as const, icon: <Package size={18} />, label: 'Production' },
  ...(role === 'admin' ? [
    { key: 'employes' as const, icon: <UserPlus size={18} />, label: 'Employe' },
  ] : []),
  { key: 'machines' as const, icon: <Settings size={18} />, label: 'Machine' },
  { key: 'maintenance' as const, icon: <Heart size={18} />, label: 'Maintenance' },
  { key: 'gsm' as const, icon: <PhoneCall size={18} />, label: 'GSM alertes' },
  { key: 'rapports' as const, icon: <BarChart2 size={18} />, label: 'Rapport' },
  ...(role === 'admin' ? [
    { key: 'demandes' as const, icon: <UserPlus size={18} />, label: "Demande d'accès" },
  ] : []),
];

  const globalSearchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return [];

    const pageResults = navItems
      .filter(item => item.label.toLowerCase().includes(q) || item.key.includes(q))
      .map(item => ({
        key: `page-${item.key}`,
        page: item.key as typeof activePage,
        label: item.label,
        detail: 'Ouvrir la page',
      }));

    const employeeResults = role === 'admin'
      ? employeesOverview
          .filter(emp => [emp.username, emp.assignedMachine, emp.currentPieceName, emp.machineStatus]
            .some(value => String(value || '').toLowerCase().includes(q)))
          .slice(0, 4)
          .map(emp => ({
            key: `employee-${emp.username}`,
            page: 'employes' as typeof activePage,
            label: emp.username,
            detail: `${emp.assignedMachine || 'Sans machine'} · ${emp.currentPieceName || 'Sans pièce'}`,
          }))
      : [];

    const machineResults = (dashStats?.machinesActives || [])
      .filter(item => [item.machine, item.username].some(value => String(value || '').toLowerCase().includes(q)))
      .slice(0, 4)
      .map((item, index) => ({
        key: `machine-active-${item.machine || index}`,
        page: 'dashboard' as typeof activePage,
        label: item.machine || 'Machine active',
        detail: `Production avec ${item.username}`,
      }));

    return [...pageResults, ...employeeResults, ...machineResults].slice(0, 7);
  }, [dashStats?.machinesActives, employeesOverview, globalSearch, navItems, role]);

  const openGlobalSearchResult = (page: typeof activePage) => {
    setActivePage(page);
    setGlobalSearch('');
  };


  const reportsContent = <ReportsPage darkMode={darkMode} />;

  return (
    <div className={`flex min-h-screen w-screen max-w-[100vw] overflow-x-hidden relative font-sans ${shellBg}`}>
      {darkMode && <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(14,165,233,0.14)_0%,rgba(14,165,233,0.03)_34%,#07111f_100%)]" />}
      {darkMode && <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.06)_1px,transparent_1px)] [background-size:36px_36px] opacity-20" />}

      {/* ── SIDEBAR ── */}
      <aside className={`w-[260px] min-w-[260px] ${bg2} border-r ${border} flex flex-col py-6 px-4 h-screen fixed left-0 top-0 overflow-y-auto overflow-x-hidden z-[100]`}>
        <div className={`flex items-center gap-3 mb-8 pb-5 border-b ${border}`}>
          <div className="w-11 h-11 min-w-[44px] rounded-[10px] flex items-center justify-center text-white"
            style={{ background: 'linear-gradient(135deg,#0066ff,#00d4ff)', boxShadow: '0 8px 16px -4px rgba(0,102,255,0.3)' }}>
            <Activity size={24} />
          </div>
          <div>
            <h1 className={`${txt1} text-[18px] font-bold m-0`}>CNC Pulse</h1>
            <span className={`text-[10px] ${txtMut} uppercase tracking-widest`}>Supervision Industrielle</span>
          </div>
        </div>

        <nav className="flex-1">
          <div className="flex flex-col gap-2">
            <span className={`text-[10px] font-semibold ${txtMut} uppercase tracking-[1.5px] mb-2 pl-3`}>NAVIGATION</span>
            <ul className="list-none flex flex-col gap-1 p-0 m-0">
              {navItems.map(item => (
                <li key={item.key}
                  onClick={() => {
                    setActivePage(item.key as typeof activePage);
                  }}
                  className={`flex items-center gap-3 px-3 py-3 rounded-[10px] cursor-pointer transition-all duration-300 text-sm font-medium
                    ${activePage === item.key ? navActive : `${txt2} border border-transparent ${navHover}`}`}>
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {'badge' in item && (item as { badge: number }).badge > 0 && (
                    <span className="w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center flex-shrink-0">
                      {(item as { badge: number }).badge}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className={`mt-auto pt-4 border-t ${border}`}>
          <div className={`flex items-center gap-2 px-3 py-2 mb-2 rounded-lg border ${border} ${bgCard}`}>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#0066ff] to-[#00d4ff] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {(localStorage.getItem('username') || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`${txt1} text-xs font-semibold truncate`}>{localStorage.getItem('username')}</div>
              <div className="text-slate-500 text-[10px] capitalize">{role}</div>
            </div>
          </div>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-[10px] text-sm font-medium cursor-pointer transition-all border border-transparent text-red-400 hover:bg-red-500/10 hover:border-red-500/20">
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="flex-1 ml-[260px] w-[calc(100vw-260px)] min-w-0 flex flex-col overflow-x-hidden">

        {/* Header */}
        <header className={`h-[70px] ${bg2} border-b ${border} flex items-center justify-between px-6 gap-4 flex-wrap`}>
          <div className="flex items-center gap-4 flex-wrap">
            <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${darkMode ? 'bg-sky-500/10 border border-sky-400/25 text-sky-100' : 'bg-[rgba(15,118,110,0.1)] border border-[rgba(15,118,110,0.3)] text-[#0f766e]'}`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${connected ? 'bg-green-400' : 'bg-blue-400'}`} />
              CNC Concept
            </span>
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] whitespace-nowrap ${darkMode ? 'bg-emerald-500/10 border border-emerald-400/20 text-emerald-200' : 'bg-slate-500/10 border border-slate-500/20 text-slate-600'}`}>
              <span>{hasLiveData ? 'Live Wokwi' : 'Simulation'}</span>
            </div>
            <form
              className="relative"
              onSubmit={(event) => {
                event.preventDefault();
                if (globalSearchResults[0]) openGlobalSearchResult(globalSearchResults[0].page);
              }}
            >
              <div className={`${bgCardStrong} border ${border} flex h-10 w-[310px] max-w-[42vw] items-center gap-2 rounded-xl px-3 shadow-sm`}>
                <Search size={15} className={txt2} />
                <input
                  value={globalSearch}
                  onChange={(event) => setGlobalSearch(event.target.value)}
                  placeholder="Recherche projet, page, employé..."
                  className={`w-full bg-transparent text-sm outline-none ${txt1} placeholder:text-slate-400`}
                />
              </div>
              {globalSearch.trim() && (
                <div className={`${bgCardStrong} ${txt1} border ${border} absolute left-0 top-12 z-[130] w-[360px] max-w-[80vw] overflow-hidden rounded-xl shadow-2xl`}>
                  {globalSearchResults.length === 0 ? (
                    <div className={`px-4 py-3 text-sm ${txt2}`}>Aucun résultat</div>
                  ) : globalSearchResults.map(result => (
                    <button
                      key={result.key}
                      type="button"
                      onClick={() => openGlobalSearchResult(result.page)}
                      className={`block w-full border-b ${border} bg-transparent px-4 py-3 text-left last:border-b-0 hover:bg-slate-500/10`}
                    >
                      <div className={`text-sm font-semibold ${txt1}`}>{result.label}</div>
                      <div className={`text-[11px] ${txt2}`}>{result.detail}</div>
                    </button>
                  ))}
                </div>
              )}
            </form>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div onClick={toggleTheme} title="Changer le thème"
              className={`w-9 h-9 rounded-lg ${bgCardStrong} border ${border} flex items-center justify-center cursor-pointer ${txt2} ${darkMode ? 'hover:text-sky-100 hover:bg-sky-500/10' : 'hover:text-[#0f766e]'} flex-shrink-0`}>
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </div>
            <div className="relative">
              <button onClick={handleOpenMessaging}
                className={`flex items-center gap-1.5 px-4 py-2 border-none rounded-lg text-white text-xs font-semibold cursor-pointer uppercase tracking-wide whitespace-nowrap ${darkMode ? 'bg-sky-500 hover:bg-sky-400 shadow-[0_18px_36px_-24px_rgba(14,165,233,0.95)]' : 'bg-gradient-to-r from-slate-700 to-slate-500'}`}>
                <MessageSquare size={14} /> Messages
              </button>
              {unreadMessages > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                  {unreadMessages}
                </span>
              )}
            </div>
            <button onClick={togglePaused}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-xs font-semibold cursor-pointer uppercase tracking-wide whitespace-nowrap ${darkMode ? 'border border-white/10 bg-white/5 hover:bg-white/10' : 'border-none bg-gradient-to-r from-slate-700 to-slate-500'}`}>
              <Pause size={14} />{paused ? 'Reprendre' : 'Pause'}
            </button>
            <button onClick={handleLogout} title="Déconnexion"
              className={`w-9 h-9 rounded-lg ${bgCardStrong} border ${border} flex items-center justify-center cursor-pointer text-red-400 hover:bg-red-500/10 flex-shrink-0`}>
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {/* ── Content ── */}
        {activePage === 'machines'     ? <div className="flex-1 overflow-y-auto"><MachinesPage /></div>
        : activePage === 'demandes'    ? <div className="flex-1 overflow-y-auto"><DemandesPage /></div>
        : activePage === 'gsm'         ? <div className="flex-1 overflow-y-auto"><GsmContactsPage /></div>
        : activePage === 'maintenance' ? <div className="flex-1 overflow-y-auto"><MaintenancePage /></div>
        : activePage === 'production'  ? <div className="flex-1 overflow-y-auto"><ProductionPage /></div>
        : activePage === 'employes'    ? (
          <div className="flex-1 p-6 overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between mb-5 flex-wrap gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">Suivi des Employés</h2>
                <p className="text-[13px] text-slate-400">Temps réel · Production · Historique complet</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold animate-pulse"
                style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}>
                <Activity size={12} /> Live
              </div>
            </div>

            {/* Stats globales */}
            <div className="grid grid-cols-4 gap-3 mb-5">
              {[
                { label: 'En production', value: employeesOverview.filter(e => e.machineStatus === 'started').length, color: '#22c55e', icon: <Activity size={16} /> },
                { label: 'En pause',      value: employeesOverview.filter(e => e.machineStatus === 'paused').length,  color: '#475569', icon: <Pause size={16} /> },
                { label: 'En ligne',      value: employeesOverview.filter(e => e.isOnline).length, color: '#00d4ff', icon: <PhoneCall size={16} /> },
                { label: 'Total',         value: employeesOverview.length, color: '#0369a1', icon: <UserPlus size={16} /> },
              ].map(s => (
                <div key={s.label} className={`${bgCard} border ${border} rounded-xl p-3 flex items-center gap-3`}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                    style={{ background: s.color + '15', border: `1px solid ${s.color}30` }}>{s.icon}</div>
                  <div>
                    <div className="text-[20px] font-bold" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[10px] text-slate-500">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-5">
              {/* ── Cards employés ── */}
              <div className="flex flex-col gap-3">
                {employeesOverview.length === 0 ? (
                  <div className={`${bgCard} border ${border} rounded-xl p-8 text-center ${txt2}`}>Aucun employé trouvé</div>
                ) : employeesOverview.map(emp => {
                  const st = emp.machineStatus || 'stopped';
                  const stColor = st === 'started' ? '#16a34a' : st === 'paused' ? '#475569' : '#64748b';
                  const stLabel = st === 'started' ? 'En production' : st === 'paused' ? 'En pause' : 'Arret';
                  const isSelected = selectedEmploye === emp.username;
                  const connectedAt = emp.connectedAt;
                  const currentPieceName = emp.currentPieceName;
                  return (
                    <div key={emp.username}
                      onClick={() => {
                        if (isSelected) { setSelectedEmploye(null); setHistorique(null); }
                        else { setSelectedEmploye(emp.username); fetchHistorique(emp.username); }
                      }}
                      className="border rounded-xl p-4 cursor-pointer transition-all"
                      style={{
                        borderColor: isSelected ? 'rgba(0,212,255,0.4)' : st === 'started' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)',
                        background: isSelected ? 'rgba(0,102,255,0.08)' : st === 'started' ? 'rgba(34,197,94,0.04)' : 'rgba(15,23,42,0.5)',
                      }}>
                      {/* Top row */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="relative flex-shrink-0">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                            style={{ background: stColor + '20', border: `2px solid ${stColor}50`, color: stColor }}>
                            {emp.username.charAt(0).toUpperCase()}
                          </div>
                          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900"
                            style={{ background: emp.isOnline ? '#22c55e' : '#64748b' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-white">{emp.username}</div>
                          <div className="text-[11px] font-semibold" style={{ color: stColor }}>{stLabel}</div>
                        </div>
                        <div className="text-[10px] text-slate-500 text-right">
                          {connectedAt && emp.isOnline && (
                            <div className="text-[#22c55e]">Connecté {new Date(connectedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                          )}
                          {!emp.isOnline && emp.machineStatusUpdatedAt && (
                            <div>Vu {new Date(emp.machineStatusUpdatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                          )}
                        </div>
                      </div>

                      {/* Info row */}
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div className="rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div className="text-[9px] text-slate-500 mb-0.5">MACHINE</div>
                          <div className="text-[12px] font-bold text-white truncate">{emp.assignedMachine || '—'}</div>
                        </div>
                        <div className="rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div className="text-[9px] text-slate-500 mb-0.5">PIECE</div>
                          <div className="text-[12px] font-bold text-white truncate">{currentPieceName || '—'}</div>
                        </div>
                      </div>

                      {/* Status update time */}
                      {emp.machineStatusUpdatedAt && (
                        <div className="text-[10px] text-slate-600 flex items-center gap-1">
                          <span>Dernière action:</span>
                          <span className="text-slate-500">{new Date(emp.machineStatusUpdatedAt).toLocaleTimeString('fr-FR')}</span>
                        </div>
                      )}

                      <div className="mt-2 text-[10px] text-slate-600 text-right">{isSelected ? 'Fermer' : 'Voir historique'}</div>
                    </div>
                  );
                })}
              </div>

              {/* ── Détail employé ── */}
              <div>
                {!selectedEmploye ? (
                  <div className={`${bgCard} border ${border} rounded-xl p-10 text-center`}>
                    <UserPlus size={30} className="mx-auto mb-3 text-slate-500" />
                    <div className="text-slate-500 text-sm">Cliquez sur un employé pour voir le détail</div>
                  </div>
                ) : loadingHisto ? (
                  <div className={`${bgCard} border ${border} rounded-xl p-10 text-center ${txt2} text-sm animate-pulse`}>Chargement...</div>
                ) : historique ? (() => {
                  const h = historique as typeof historique & { stats: { piecesAujourd?: number; workSecondsToday?: number; pauseSecondsToday?: number } };
                  const fmtTime = (s: number) => { if (!s) return '0m'; const h2 = Math.floor(s/3600); const m = Math.floor((s%3600)/60); return h2 > 0 ? `${h2}h ${String(m).padStart(2,'0')}m` : `${m}m`; };
                  return (
                    <div className="flex flex-col gap-3">
                      {/* En-tête employé */}
                      <div className={`${bgCard} border ${border} rounded-xl p-4`}>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{selectedEmploye} — Aujourd'hui</div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
                            <div className="text-[22px] font-bold text-[#22c55e]">{h.stats.piecesAujourd ?? 0}</div>
                            <div className="text-[10px] text-slate-500">Pièces produites aujourd'hui</div>
                          </div>
                          <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}>
                            <div className="text-[22px] font-bold text-[#3b82f6]">{fmtTime(h.stats.workSecondsToday ?? 0)}</div>
                            <div className="text-[10px] text-slate-500">Temps travaillé aujourd'hui</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: 'Sessions', value: h.stats.totalSessions, color: '#3b82f6' },
                            { label: 'Pauses',   value: h.stats.totalPausees,  color: '#475569' },
                            { label: 'Pièces',   value: h.stats.piecesProduites, color: '#22c55e' },
                          ].map(s => (
                            <div key={s.label} className={`${darkMode ? 'bg-[#07111f]/75' : 'bg-white'} rounded-lg p-2 text-center border ${border}`}>
                              <div className="text-[16px] font-bold" style={{ color: s.color }}>{s.value}</div>
                              <div className="text-[9px] text-slate-500">{s.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Timeline événements */}
                      <div className={`${bgCard} border ${border} rounded-xl overflow-hidden`}>
                        <div className={`px-4 py-2.5 border-b ${border} text-[11px] font-bold ${txt2} uppercase tracking-wider flex items-center justify-between`}>
                          <span>Timeline</span>
                          <span className="text-slate-600">{historique.events.length} événements</span>
                        </div>
                        <div className="max-h-72 overflow-y-auto">
                          {historique.events.length === 0 ? (
                            <div className="p-6 text-center text-slate-500 text-sm">Aucun événement</div>
                          ) : historique.events.map(ev => {
                            const evColor = ev.action === 'started' ? '#16a34a' : ev.action === 'paused' ? '#475569' : '#dc2626';
                            const evIcon = ev.action === 'started' ? <Activity size={12} /> : ev.action === 'paused' ? <Pause size={12} /> : <X size={12} />;
                            const evLabel = ev.action === 'started' ? 'Démarré' : ev.action === 'paused' ? 'Pause' : 'Arrêté';
                            return (
                              <div key={ev._id} className="flex items-start gap-3 px-4 py-2.5 border-b border-white/[0.03] last:border-0">
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5"
                                  style={{ background: evColor + '18', color: evColor, border: `1px solid ${evColor}30` }}>
                                  {evIcon}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                    <span className="text-[11px] font-bold" style={{ color: evColor }}>{evLabel}</span>
                                    <span className="text-[10px] text-slate-500 truncate">· {ev.machine}</span>
                                  </div>
                                  {ev.pieceName && (
                                    <div className="text-[11px] text-slate-400">
                                      Piece: {ev.pieceName}
                                      {ev.pieceCount ? <span className="ml-1 text-[#22c55e] font-bold">→ {ev.pieceCount} pcs</span> : null}
                                    </div>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-600 flex-shrink-0">
                                  {new Date(ev.createdAt).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })() : null}
              </div>
            </div>
          </div>
        )
        : activePage === 'rapports'    ? reportsContent
        : (
          /* ── DASHBOARD PRINCIPAL ── */
          <div className="flex-1 p-6 overflow-y-auto overflow-x-hidden min-w-0 w-full">

            {/* Title */}
            <div className="flex justify-between items-start mb-5 flex-wrap gap-4">
              <div>
                <h2 className={`text-2xl font-bold mb-1 ${txt1}`}>Production Dashboard</h2>
                <p className={`text-[13px] ${txtMut}`}>CNC Concept — Vue Générale Usine</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold" style={{ background: 'rgba(15,118,110,0.08)', border: '1px solid rgba(15,118,110,0.2)', color: '#0f766e' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
                  IoT Monitoring
                </div>
                <div className="text-right">
                  <div className={`text-[12px] ${txt2} capitalize`}>{currentTime.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })}</div>
                  <div className="text-[18px] font-bold text-[#00d4ff] font-mono">{currentTime.toLocaleTimeString('fr-FR')}</div>
                </div>
              </div>
            </div>

            {/* ── KPI Row ── */}
            <div className="grid grid-cols-3 gap-4 mb-5">
              {[
                {
                  icon: <Package size={20} />, title: 'Total Produites',
                  main: (dashStats?.kpi.totalPcs ?? prodStats.totalPcs).toLocaleString(),
                  sub: `${prodStats.enCours} en cours`,
                  color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',
                },
                {
                  icon: <Settings size={20} />, title: 'Actifs Machines',
                  main: (dashStats?.employes.actifs ?? 0) + ' actifs',
                  sub: `${dashStats?.employes.enPause ?? 0} pause · ${(dashStats?.employes.total ?? 0) - (dashStats?.employes.actifs ?? 0) - (dashStats?.employes.enPause ?? 0)} arrêt`,
                  color: '#0f766e', bg: 'rgba(15,118,110,0.08)',
                },
                {
                  icon: <UserPlus size={20} />, title: 'Employes Connectes',
                  main: `${dashStats?.employes.enligne ?? employeesOverview.filter(e => e.isOnline).length}`,
                  sub: `${dashStats?.employes.actifs ?? 0} en production`,
                  color: '#2563eb', bg: 'rgba(37,99,235,0.08)',
                },
              ].map(k => (
                <div key={k.title} className={`${bgCard} border ${border} rounded-xl p-4`} style={{ background: k.bg }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className='inline-flex items-center justify-center w-8 h-8 rounded-lg' style={{ background: k.color + '18', color: k.color }}>{k.icon}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: k.color + '20', color: k.color }}>LIVE</span>
                  </div>
                  <div className="text-[24px] font-bold mb-0.5" style={{ color: k.color }}>{k.main}</div>
                  <div className={`text-[11px] font-semibold ${txt1} mb-1`}>{k.title}</div>
                  <div className={`text-[10px] ${txtMut}`}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* ── Row 2: Production en Cours + Chart + Répartition ── */}
            <div className="grid grid-cols-3 gap-4 mb-4">

              {/* Production en Cours */}
              <div className={`${bgCard} border ${border} rounded-xl p-4`}>
                <div className="flex items-center justify-between mb-4">
                  <span className={`text-sm font-bold ${txt1}`}>Production en Cours</span>
                  <span className='text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse inline-flex items-center gap-1' style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}><Activity size={10} /> EN LIVE</span>
                </div>
                {dashStats?.machinesActives && dashStats.machinesActives.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {dashStats.machinesActives.slice(0, 4).map((m, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div>
                          <div className={`text-[13px] font-bold ${txt1}`}>{m.machine || '—'}</div>
                          <div className="text-[10px] text-slate-500">{m.username}</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 rounded-full bg-slate-700/50">
                            <div className="h-full rounded-full bg-[#0f766e]" style={{ width: '70%' }} />
                          </div>
                          <span className="text-[12px] font-bold text-[#0f766e]">En cours</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-500 text-sm">Aucune production active</div>
                )}

                {/* Activité employés */}
                <div className={`mt-4 pt-4 border-t ${border}`}>
                  <div className={`text-[11px] font-bold ${txtMut} mb-3 uppercase tracking-wider`}>Activité Employés</div>
                  {(dashStats?.activiteEmployes ?? []).slice(0, 3).map(e => {
                    const stColor = e.machineStatus === 'started' ? '#16a34a' : e.machineStatus === 'paused' ? '#475569' : '#64748b';
                    return (
                      <div key={e.username} className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: stColor + '20', color: stColor }}>{e.username.charAt(0).toUpperCase()}</div>
                        <span className={`text-[12px] font-semibold ${txt1} w-16 truncate`}>{e.username}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-slate-700/50">
                          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, e.sessions * 10)}%`, background: stColor }} />
                        </div>
                        <span className="text-[11px] font-bold" style={{ color: stColor }}>{e.pcs} pcs</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chart Production Journalière */}
              <div className={`${bgCard} border ${border} rounded-xl p-4`}>
                <div className={`text-sm font-bold ${txt1} mb-4`}>Production Journaliere</div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={dashStats?.prodParJour ?? []} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="prodGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey="pcs" stroke="#3b82f6" strokeWidth={2} fill="url(#prodGrad)" dot={{ fill: '#3b82f6', r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Répartition par Machine */}
              <div className={`${bgCard} border ${border} rounded-xl p-4`}>
                <div className={`text-sm font-bold ${txt1} mb-4`}>Repartition par Machine</div>
                {dashStats?.repartition && dashStats.repartition.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={130}>
                      <PieChart>
                        <Pie data={dashStats.repartition} cx="50%" cy="50%" outerRadius={55} dataKey="value" stroke="none">
                          {dashStats.repartition.map((_, i) => (
                            <Cell key={i} fill={['#2563eb','#0891b2','#16a34a','#475569','#0f766e'][i % 5]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col gap-1.5 mt-2">
                      {dashStats.repartition.slice(0, 4).map((r, i) => (
                        <div key={r.name} className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: ['#2563eb','#0891b2','#16a34a','#475569','#0f766e'][i % 5] }} />
                          <span className={`text-[11px] ${txt2} flex-1 truncate`}>{r.name}</span>
                          <span className={`text-[11px] font-bold ${txt1}`}>{r.value} pcs</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-32 text-slate-500 text-sm">Aucune donnée</div>
                )}
              </div>
            </div>

            {/* ── Row 3: Temps Machines + Santé + Alertes ── */}
            <div className="grid grid-cols-3 gap-4 mb-4">

              {/* Temps des Machines */}
              <div className={`${bgCard} border ${border} rounded-xl p-4`}>
                <div className={`text-sm font-bold ${txt1} mb-4`}>Temps des Machines</div>
                {(() => {
                  const machinesTemps = dashStats?.tempsMachines ?? [];
                  const pauseSec = dashStats?.totalPauseSeconds ?? 0;
                  const visibleMachines = machinesTemps.slice(0, 4);
                  const autresSeconds = machinesTemps.slice(4).reduce((sum, machine) => sum + machine.seconds, 0);
                  const rows = autresSeconds > 0
                    ? [...visibleMachines, { machine: 'Autres machines', seconds: autresSeconds }]
                    : visibleMachines;
                  const maxSeconds = Math.max(1, ...rows.map(machine => machine.seconds));
                  const fmt = (s: number) => {
                    if (s <= 0) return '0h 00m';
                    const h = Math.floor(s/3600);
                    const m = Math.floor((s%3600)/60);
                    return `${h}h ${String(m).padStart(2,'0')}m`;
                  };
                  return (
                    <div className="flex flex-col gap-3">
                      {rows.length > 0 ? rows.map((item, index) => (
                        <div key={`${item.machine}-${index}`} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: '#22c55e10', border: '1px solid #22c55e25' }}>
                          <span className='inline-flex items-center justify-center w-8 h-8 rounded-lg' style={{ background: '#22c55e18', color: '#22c55e' }}><Activity size={16} /></span>
                          <div className="flex-1">
                            <div className={`text-[10px] ${txtMut} mb-1 truncate`}>{item.machine || 'Machine inconnue'}</div>
                            <div className="h-1.5 rounded-full bg-black/20">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(100, (item.seconds / maxSeconds) * 100)}%`, background: '#22c55e' }} />
                            </div>
                          </div>
                          <div className="text-[15px] font-bold text-[#22c55e]">{fmt(item.seconds)}</div>
                        </div>
                      )) : (
                        <div className={`text-sm ${txtMut} rounded-xl p-4 border ${border}`}>
                          Aucune activite machine reelle
                        </div>
                      )}
                      {pauseSec > 0 && (
                        <div className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: '#47556910', border: '1px solid #47556925' }}>
                          <span className="flex items-center gap-2 text-[11px] text-[#475569] font-semibold"><Pause size={14} /> Pause totale</span>
                          <span className="text-[13px] font-bold text-[#475569]">{fmt(pauseSec)}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Santé des Machines Live */}
              <div className={`${bgCard} border ${border} rounded-xl p-4`}>
                <div className="flex items-center gap-2 mb-4">
                  <Heart size={14} className="text-[#00d4ff]" />
                  <span className={`text-sm font-bold ${txt1}`}>Santé des Machines</span>
                </div>
                <div className="flex flex-col gap-3">
                  {[
                    { name: 'Rectifieuse', node: 'ESP32-NODE-01', value: sante, color: '#2563eb' },
                    { name: 'Compresseur', node: 'compresseur',   value: santeComp, color: '#0f766e' },
                  ].map((m, i) => (
                    <div key={i} className={`${darkMode ? 'bg-[#07111f]/75' : 'bg-slate-50'} rounded-xl p-3 border ${border}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className={'text-[12px] font-bold ' + txt1}>{m.name}</div>
                          <div className="text-[10px] text-slate-500">{m.node}</div>
                        </div>
                        <span className="text-[18px] font-bold" style={{ color: m.color }}>{m.value.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-700/50">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${m.value}%`, background: m.value > 70 ? '#22c55e' : m.value > 40 ? '#f97316' : '#ef4444' }} />
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 mt-2">
                        {(i === 0 ? [
                          { l: 'Courant', v: `${latest.courant}A`, c: latest.courant > 15 ? '#dc2626' : '#0f766e' },
                          { l: 'Vib.', v: `${latest.vibX.toFixed(1)}g`, c: latest.vibX > 2 ? '#f97316' : '#3b82f6' },
                          { l: 'RPM', v: `${latest.rpm}`, c: '#475569' },
                        ] : [
                          { l: 'Courant', v: `${latestComp.courant.toFixed(1)}A`, c: latestComp.courant > 15 ? '#dc2626' : '#0f766e' },
                          { l: 'Vib.', v: `${latestComp.vibX.toFixed(2)}g`, c: latestComp.vibX > 2 ? '#f97316' : '#3b82f6' },
                          { l: 'Bar', v: `${(latestComp.pression ?? 0).toFixed(1)}`, c: '#2563eb' },
                        ]).map(s => (
                          <div key={s.l} className={`${darkMode ? 'bg-slate-800/60' : 'bg-white'} rounded-lg p-1.5 text-center border ${border}`}>
                            <div className="text-[12px] font-bold" style={{ color: s.c }}>{s.v}</div>
                            <div className={`text-[9px] ${txtMut}`}>{s.l}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Alertes */}
              <div className={`${bgCard} border ${border} rounded-xl p-4`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-sm font-bold ${txt1}`}>Alertes</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-bold" style={{ background: alertCount > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.12)', color: alertCount > 0 ? '#ef4444' : '#22c55e', border: `1px solid ${alertCount > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.25)'}` }}>
                    {alertCount > 0 ? `${alertCount} active(s)` : 'Aucune'}
                  </span>
                </div>
                {alertCount === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <Activity size={32} className="text-slate-500" />
                    <div className="text-slate-500 text-xs text-center">Aucune alerte active<br/>Toutes les machines fonctionnent normalement</div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {[
                      { label: 'Vibration élevée', machine: 'Rectifieuse', color: '#475569' },
                      { label: 'Courant anormal',  machine: 'Compresseur', color: '#0f766e' },
                    ].slice(0, alertCount).map((a, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: a.color + '10', border: `1px solid ${a.color}25` }}>
                        <Activity size={14} style={{ color: a.color }} />
                        <div>
                          <div className="text-[11px] font-bold" style={{ color: a.color }}>{a.label}</div>
                          <div className="text-[10px] text-slate-500">{a.machine}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

      </main>

      {/* Messaging Overlay */}
      {showMessaging && (
        <div className="fixed inset-0 z-[1000] bg-[#0f172a]">
          <div className="absolute top-4 right-4 z-10">
            <button onClick={() => setShowMessaging(false)}
              className="flex items-center gap-1.5 px-[18px] py-2 bg-white/[0.08] border border-white/[0.15] rounded-lg text-slate-200 cursor-pointer text-[13px] font-semibold hover:bg-white/[0.14] transition-colors">
              <X size={14} /> Fermer
            </button>
          </div>
          <MessagingPage
            currentUsername={localStorage.getItem('username') || ''}
            currentRole={localStorage.getItem('role') || 'user'}
            token={localStorage.getItem('token') || ''}
            socket={socket}
          />
        </div>
      )}
    </div>
  );
};

export default Dashboard;
