import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {LayoutDashboard, Settings, Activity, Heart, Bell, Zap, Thermometer, 
  Pause, Sun, Moon, X, MessageSquare, UserPlus, LogOut, CheckSquare, BarChart2} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import MessagingPage from './MessagingPage';
import MachinesPage from './MachinesPage';
import DemandesPage from './Demandespage';
import TasksPage from './Taskspage';
import AlertesPage from './AlertesPage';
import RapportsPage from './RapportsPage';
import './Dashboard.css';

interface SensorData {
  node: string; courant: number;
  vibX: number; vibY: number; vibZ: number; rpm: number;
  pression?: number;
}
interface ChartPoint {
  time: string; vibX: number; vibY: number; vibZ: number;
  courant: number; rpm: number;
}

const MAX_POINTS = 20;
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
  const [darkMode, setDarkMode]             = useState(true);
  const [currentTime, setCurrentTime]       = useState(new Date());
  const [connected, setConnected]           = useState(false);
  const [hasLiveData, setHasLiveData]       = useState(false);
  const [paused, setPaused]                 = useState(false);
  const [latest, setLatest]                 = useState<SensorData>(generateSimData());
  const [chartData, setChartData]           = useState<ChartPoint[]>([]);
  const [latestComp, setLatestComp]         = useState<SensorData>({ node:'compresseur', courant:0, vibX:0, vibY:0, vibZ:0, rpm:0, pression:0 });
  const [chartDataComp, setChartDataComp]   = useState<ChartPoint[]>([]);
  const [activeTab, setActiveTab]           = useState<'rectifieuse'|'compresseur'>('rectifieuse');
  const [showMessaging, setShowMessaging]   = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [alertCount, setAlertCount]         = useState(0);
  const role = localStorage.getItem('role');
const [activePage, setActivePage] = useState<'dashboard'|'machines'|'demandes'|'tasks'|'alertes'|'rapports'>('dashboard');
  const addPoint = useCallback((data: SensorData) => {
    const timeLabel = new Date().toLocaleTimeString('fr-FR');
    setChartData(prev => {
      const p: ChartPoint = { time: timeLabel, vibX: data.vibX, vibY: data.vibY, vibZ: data.vibZ, courant: data.courant, rpm: data.rpm };
      const u = [...prev, p];
      return u.length > MAX_POINTS ? u.slice(-MAX_POINTS) : u;
    });
  }, []);

  const addPointComp = useCallback((data: SensorData) => {
    const timeLabel = new Date().toLocaleTimeString('fr-FR');
    setChartDataComp(prev => {
      const p: ChartPoint = { time: timeLabel, vibX: data.vibX, vibY: data.vibY, vibZ: data.vibZ, courant: data.courant, rpm: data.pression ?? 0 };
      const u = [...prev, p];
      return u.length > MAX_POINTS ? u.slice(-MAX_POINTS) : u;
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
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
        <div style="font-size:16px;">${data.severity === 'critical' ? '🚨 ALERTE CRITIQUE' : '⚠️ ATTENTION'}</div>
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
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('direct-message');
      socket.off('alert');
    };
  }, []);

  useEffect(() => {
    socket.on('sensor-data', (data: SensorData) => {
      if (paused) return;
      setHasLiveData(true);
      if (data.node === 'compresseur') {
        setLatestComp(data);
        addPointComp(data);
      } else {
        setLatest(data);
        addPoint(data);
      }
    });
    return () => { socket.off('sensor-data'); };
  }, [paused, addPoint, addPointComp]);

  useEffect(() => {
    if (hasLiveData) return;
    const interval = setInterval(() => {
      if (paused) return;
      const sim = generateSimData();
      setLatest(sim);
      addPoint(sim);
      const simComp: SensorData = {
        node: 'compresseur',
        courant:  parseFloat((8 + Math.sin(Date.now() / 3000) * 2 + Math.random()).toFixed(2)),
        vibX:     parseFloat((0.5 + Math.sin(Date.now() / 2000) * 0.3 + Math.random() * 0.1).toFixed(2)),
        vibY:     parseFloat((0.3 + Math.cos(Date.now() / 2500) * 0.2 + Math.random() * 0.1).toFixed(2)),
        vibZ:     parseFloat((0.2 + Math.sin(Date.now() / 1800) * 0.1 + Math.random() * 0.1).toFixed(2)),
        rpm:      0,
        pression: parseFloat((7 + Math.sin(Date.now() / 4000) * 1.5).toFixed(2)),
      };
      setLatestComp(simComp);
      addPointComp(simComp);
    }, 1000);
    return () => clearInterval(interval);
  }, [hasLiveData, paused, addPoint, addPointComp]);

  const sante = useMemo(() => {
    const v = latest.vibX + latest.vibY + latest.vibZ;
    return parseFloat(Math.max(0, Math.min(100, 100 - v * 5)).toFixed(1));
  }, [latest]);

  const santeComp = useMemo(() => {
    const v = latestComp.vibX + latestComp.vibY + latestComp.vibZ;
    return parseFloat(Math.max(0, Math.min(100, 100 - v * 5)).toFixed(1));
  }, [latestComp]);

  const toggleTheme  = useCallback(() => setDarkMode(p => !p), []);
  const togglePaused = useCallback(() => setPaused(p => !p), []);
  const handleLogout = useCallback(() => {
    localStorage.clear();
    window.location.href = '/';
  }, []);
  const handleOpenMessaging = () => { setShowMessaging(true); setUnreadMessages(0); };

  const bg2    = darkMode ? 'bg-[#0f172a]'    : 'bg-white';
  const bgCard = darkMode ? 'bg-slate-800/50' : 'bg-white';
  const border = darkMode ? 'border-white/[0.08]' : 'border-slate-200';
  const txt1   = darkMode ? 'text-white'      : 'text-slate-900';
  const txt2   = darkMode ? 'text-slate-400'  : 'text-slate-500';
  const txtMut = darkMode ? 'text-slate-500'  : 'text-slate-400';
  const chartColors = { stroke: darkMode ? '#1e293b' : '#e2e8f0', axis: darkMode ? '#475569' : '#64748b', bg: darkMode ? '#0f172a' : '#fff', border: darkMode ? '#334155' : '#e2e8f0' };
  const activeData  = activeTab === 'rectifieuse' ? chartData : chartDataComp;

  return (
    <div className={`flex min-h-screen w-screen max-w-[100vw] overflow-x-hidden relative font-sans ${darkMode ? 'bg-[#0a0e27] text-white' : 'bg-slate-100 text-slate-900'}`}>

      {/* SIDEBAR */}
      <aside className={`w-[260px] min-w-[260px] ${bg2} border-r ${border} flex flex-col py-6 px-4 h-screen fixed left-0 top-0 overflow-y-auto overflow-x-hidden z-[100]`}>
        <div className={`flex items-center gap-3 mb-8 pb-5 border-b ${border}`}>
          <div className="w-11 h-11 min-w-[44px] rounded-[10px] flex items-center justify-center text-white"
            style={{ background: 'linear-gradient(135deg,#0066ff,#00d4ff)', boxShadow: '0 8px 16px -4px rgba(0,102,255,0.3)' }}>
            <Activity size={24} />
          </div>
          <div>
            <h1 className="text-[18px] font-bold text-white m-0">CNC Pulse</h1>
            <span className={`text-[10px] ${txtMut} uppercase tracking-widest`}>Supervision Industrielle</span>
          </div>
        </div>

        <nav className="flex-1">
          <div className="flex flex-col gap-2">
            <span className={`text-[10px] font-semibold ${txtMut} uppercase tracking-[1.5px] mb-2 pl-3`}>NAVIGATION</span>
            <ul className="list-none flex flex-col gap-1 p-0 m-0">
              {([
                { key: 'dashboard' as const, icon: <LayoutDashboard size={18} />, label: 'Tableau de Bord' },
                { key: 'machines'  as const, icon: <Settings size={18} />,        label: 'Machines' },
                { key: 'alertes'   as const, icon: <Bell size={18} />,            label: 'Alertes',  badge: alertCount },
                { key: 'tasks'     as const, icon: <CheckSquare size={18} />,     label: 'Tâches' },
                { key: 'rapports' as const, icon: <BarChart2 size={18} />, label: 'Rapports' },
                ...(role === 'admin' ? [{ key: 'demandes' as const, icon: <UserPlus size={18} />, label: "Demandes d'accès" }] : []),
              ]).map(item => (
                <li key={item.key}
                  onClick={() => { setActivePage(item.key as 'dashboard'|'machines'|'demandes'|'tasks'|'alertes'); if (item.key === 'alertes') setAlertCount(0); }}
                  className={`flex items-center gap-3 px-3 py-3 rounded-[10px] cursor-pointer transition-all duration-300 text-sm font-medium
                    ${activePage === item.key ? 'text-[#00d4ff] border border-[rgba(0,212,255,0.2)]' : `${txt2} border border-transparent hover:bg-[rgba(0,212,255,0.1)] hover:text-[#00d4ff]`}`}
                  style={activePage === item.key ? { background: 'linear-gradient(135deg,rgba(0,102,255,0.2),rgba(0,212,255,0.2))' } : {}}>
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {'badge' in item && (item as {badge: number}).badge > 0 && (
                    <span className="w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center flex-shrink-0">
                      {item.badge}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className={`mt-auto pt-4 border-t ${border}`}>
          <div className={`flex items-center gap-2 px-3 py-2 mb-2 rounded-lg ${bgCard}`}>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#0066ff] to-[#00d4ff] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {(localStorage.getItem('username') || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-xs font-semibold truncate">{localStorage.getItem('username')}</div>
              <div className="text-slate-500 text-[10px] capitalize">{role}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-[10px] text-sm font-medium cursor-pointer transition-all border border-transparent text-red-400 hover:bg-red-500/10 hover:border-red-500/20">
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 ml-[260px] w-[calc(100vw-260px)] min-w-0 flex flex-col overflow-x-hidden">

        {/* Header */}
        <header className={`h-[70px] ${bg2} border-b ${border} flex items-center justify-between px-6 gap-4 flex-wrap`}>
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-[rgba(0,212,255,0.1)] border border-[rgba(0,212,255,0.3)] rounded-full text-xs font-medium text-[#00d4ff] whitespace-nowrap">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${connected ? 'bg-green-400' : 'bg-blue-400'}`} />
              CNC Concept
            </span>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full text-[11px] text-green-400 whitespace-nowrap">
              <span>{hasLiveData ? '🟢 Live Wokwi' : '🔵 Simulation'}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div onClick={toggleTheme} title="Changer le thème"
              className={`w-9 h-9 rounded-lg ${bgCard} border ${border} flex items-center justify-center cursor-pointer ${txt2} hover:text-[#00d4ff] flex-shrink-0`}>
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </div>
            <div className="relative">
              <button onClick={handleOpenMessaging}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-red-500 to-orange-500 border-none rounded-lg text-white text-xs font-semibold cursor-pointer uppercase tracking-wide whitespace-nowrap">
                <MessageSquare size={14} /> Messages
              </button>
              {unreadMessages > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">{unreadMessages}</span>
              )}
            </div>
            <button onClick={togglePaused}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-red-500 to-orange-500 border-none rounded-lg text-white text-xs font-semibold cursor-pointer uppercase tracking-wide whitespace-nowrap">
              <Pause size={14} />{paused ? 'Reprendre' : 'Pause'}
            </button>
            <button onClick={handleLogout} title="Déconnexion"
              className={`w-9 h-9 rounded-lg ${bgCard} border ${border} flex items-center justify-center cursor-pointer text-red-400 hover:bg-red-500/10 flex-shrink-0`}>
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {/* Content */}
{activePage === 'machines'  ? <div className="flex-1 overflow-y-auto"><MachinesPage /></div>
: activePage === 'demandes' ? <div className="flex-1 overflow-y-auto"><DemandesPage /></div>
: activePage === 'tasks'    ? <div className="flex-1 overflow-y-auto"><TasksPage /></div>
: activePage === 'alertes'  ? <div className="flex-1 overflow-y-auto"><AlertesPage /></div>
: activePage === 'rapports' ? <div className="flex-1 overflow-y-auto"><RapportsPage /></div>
: (
          <div className="flex-1 p-6 overflow-y-auto overflow-x-hidden min-w-0 w-full">

            <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
              <div>
                <h2 className={`text-2xl font-bold mb-1 ${txt1}`}>Tableau de Bord</h2>
                <p className={`text-[13px] ${txtMut}`}>CNC Concept — Vue Générale Usine</p>
              </div>
              <div className="text-right">
                <div className={`text-[13px] ${txt2} capitalize`}>
                  {currentTime.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
                </div>
                <div className="text-[20px] font-bold text-[#00d4ff] font-mono">
                  {currentTime.toLocaleTimeString('fr-FR')}
                </div>
              </div>
            </div>

            {/* Machine Cards */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Rectifieuse */}
              <div className={`${bgCard} border ${border} rounded-xl p-5`}>
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className={`text-sm font-bold ${txt1} mb-0.5`}>⚙️ Rectifieuse</h3>
                    <span className="text-[11px] text-slate-500">ESP32-NODE-01</span>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${latest.courant > 20 || latest.vibX > 3 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}>
                    {latest.courant > 20 || latest.vibX > 3 ? '⚠️ ATTENTION' : '✅ EN MARCHE'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label:'Courant',   value:`${latest.courant} A`,          color: latest.courant > 15 ? '#ef4444' : '#22c55e' },
                    { label:'Vibration', value:`${latest.vibX.toFixed(2)} g`,  color: latest.vibX > 2 ? '#f97316' : '#3b82f6' },
                    { label:'RPM',       value:`${latest.rpm}`,                color:'#a855f7' },
                  ].map(s => (
                    <div key={s.label} className={`${darkMode ? 'bg-slate-900/50' : 'bg-slate-50'} rounded-lg p-3 text-center`}>
                      <div className="text-[18px] font-bold" style={{ color: s.color }}>{s.value}</div>
                      <div className={`text-[10px] ${txtMut} mt-1`}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 bg-slate-700/50 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full transition-all" style={{ width:`${sante}%`, background: sante > 70 ? '#22c55e' : sante > 40 ? '#f97316' : '#ef4444' }} />
                  </div>
                  <span className={`text-[11px] font-bold ${txt2}`}>Santé {sante}%</span>
                </div>
              </div>

              {/* Compresseur */}
              <div className={`${bgCard} border ${border} rounded-xl p-5`}>
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className={`text-sm font-bold ${txt1} mb-0.5`}>🔧 Compresseur ABAC</h3>
                    <span className="text-[11px] text-slate-500">compresseur</span>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${latestComp.courant > 20 || latestComp.vibX > 3 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}>
                    {latestComp.courant > 20 || latestComp.vibX > 3 ? '⚠️ ATTENTION' : '✅ EN MARCHE'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label:'Courant',   value:`${latestComp.courant.toFixed(1)} A`,           color: latestComp.courant > 15 ? '#ef4444' : '#22c55e' },
                    { label:'Vibration', value:`${latestComp.vibX.toFixed(2)} g`,              color: latestComp.vibX > 2 ? '#f97316' : '#3b82f6' },
                    { label:'Pression',  value:`${(latestComp.pression ?? 0).toFixed(1)} bar`, color:'#06b6d4' },
                  ].map(s => (
                    <div key={s.label} className={`${darkMode ? 'bg-slate-900/50' : 'bg-slate-50'} rounded-lg p-3 text-center`}>
                      <div className="text-[18px] font-bold" style={{ color: s.color }}>{s.value}</div>
                      <div className={`text-[10px] ${txtMut} mt-1`}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 bg-slate-700/50 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full transition-all" style={{ width:`${santeComp}%`, background: santeComp > 70 ? '#22c55e' : santeComp > 40 ? '#f97316' : '#ef4444' }} />
                  </div>
                  <span className={`text-[11px] font-bold ${txt2}`}>Santé {santeComp}%</span>
                </div>
              </div>
            </div>

            {/* Tabs Graphs */}
            <div className={`${bgCard} border ${border} rounded-xl overflow-hidden mb-4`}>
              <div className={`flex border-b ${border}`}>
                {(['rectifieuse','compresseur'] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`flex-1 px-6 py-3 text-sm font-semibold transition-all cursor-pointer border-none
                      ${activeTab === tab ? 'text-[#00d4ff] border-b-2 border-[#00d4ff] bg-[rgba(0,212,255,0.05)]' : `${txt2} hover:text-[#00d4ff]`}`}
                    style={{ background: 'transparent' }}>
                    {tab === 'rectifieuse' ? '⚙️ Rectifieuse' : '🔧 Compresseur ABAC'}
                  </button>
                ))}
              </div>
              <div className="p-5">
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity size={15} className="text-[#00d4ff]" />
                    <span className={`text-sm font-semibold ${txt1}`}>Vibrations (g)</span>
                    <div className="flex gap-3 ml-4">
                      {[['#3b82f6','VibX'],['#06b6d4','VibY'],['#f97316','VibZ']].map(([c,l]) => (
                        <span key={l} className={`flex items-center gap-1 text-xs ${txt2}`}>
                          <span className="w-2 h-2 rounded-sm" style={{ background:c }} />{l}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={activeData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.stroke} />
                      <XAxis dataKey="time" tick={{ fontSize:10 }} stroke={chartColors.axis} angle={-45} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize:11 }} stroke={chartColors.axis} domain={[0,5]} />
                      <Tooltip contentStyle={{ backgroundColor:chartColors.bg, border:`1px solid ${chartColors.border}`, borderRadius:'8px' }} />
                      <Line type="monotone" dataKey="vibX" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="vibY" stroke="#06b6d4" strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="vibZ" stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Zap size={15} className="text-[#00d4ff]" />
                      <span className={`text-sm font-semibold ${txt1}`}>Courant (A)</span>
                    </div>
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={activeData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.stroke} />
                        <XAxis hide />
                        <YAxis tick={{ fontSize:11 }} stroke={chartColors.axis} domain={[0,30]} />
                        <Tooltip contentStyle={{ backgroundColor:chartColors.bg, border:`1px solid ${chartColors.border}`, borderRadius:'8px' }} />
                        <Line type="monotone" dataKey="courant" stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Thermometer size={15} className="text-[#00d4ff]" />
                      <span className={`text-sm font-semibold ${txt1}`}>
                        {activeTab === 'rectifieuse' ? 'RPM' : 'Pression (bar)'}
                      </span>
                    </div>
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={activeData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.stroke} />
                        <XAxis hide />
                        <YAxis tick={{ fontSize:11 }} stroke={chartColors.axis} />
                        <Tooltip contentStyle={{ backgroundColor:chartColors.bg, border:`1px solid ${chartColors.border}`, borderRadius:'8px' }} />
                        <Line type="monotone" dataKey="rpm" stroke="#a855f7" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* Santé */}
            <div className={`${bgCard} border ${border} rounded-xl p-5`}>
              <div className="flex items-center gap-2 mb-4">
                <Heart size={15} className="text-[#00d4ff]" />
                <span className={`text-sm font-semibold ${txt1}`}>Santé des Machines</span>
              </div>
              <div className="flex justify-around items-center flex-wrap gap-5">
                {[
                  { name:'Rectifieuse', value:sante,     color:'#3b82f6' },
                  { name:'Compresseur', value:santeComp, color:'#06b6d4' },
                ].map((item, i) => (
                  <div key={i} className="flex flex-col items-center gap-2">
                    <div className="relative w-20 h-20">
                      <ResponsiveContainer width={100} height={100}>
                        <PieChart>
                          <Pie data={[{ value:item.value },{ value:100-item.value }]}
                            cx={50} cy={50} innerRadius={35} outerRadius={45}
                            startAngle={90} endAngle={-270} dataKey="value" stroke="none">
                            <Cell fill={item.color} />
                            <Cell fill={darkMode ? '#1e293b' : '#e2e8f0'} />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[18px] font-bold" style={{ color:item.color }}>
                        {item.value.toFixed(0)}%
                      </div>
                    </div>
                    <span className={`text-[13px] ${txt2}`}>{item.name}</span>
                  </div>
                ))}
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