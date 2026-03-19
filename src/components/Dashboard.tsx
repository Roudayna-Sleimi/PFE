import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {LayoutDashboard, Settings, Activity, Heart, Bell, Wifi, Zap, Thermometer, 
  Pause, Sun, Moon, X, MessageSquare, UserPlus, LogOut, CheckSquare} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import MessagingPage from './MessagingPage';
import MachinesPage from './MachinesPage';
import DemandesPage from './Demandespage';
import TasksPage from './Taskspage';
import './Dashboard.css';

interface SensorData {
  node: string; courant: number;
  vibX: number; vibY: number; vibZ: number; rpm: number;
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
  const [showMessaging, setShowMessaging]   = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const role = localStorage.getItem('role');
  const [activePage, setActivePage] = useState<'dashboard' | 'machines' | 'demandes' | 'tasks'>('dashboard');

  const addPoint = useCallback((data: SensorData) => {
    const timeLabel = new Date().toLocaleTimeString('fr-FR');
    setChartData(prev => {
      const newPoint: ChartPoint = {
        time: timeLabel,
        vibX: data.vibX, vibY: data.vibY, vibZ: data.vibZ,
        courant: data.courant, rpm: data.rpm,
      };
      const updated = [...prev, newPoint];
      return updated.length > MAX_POINTS ? updated.slice(-MAX_POINTS) : updated;
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
    socket.on('direct-message', (msg: { from: string }) => {
      const currentUser = localStorage.getItem('username');
      if (msg.from !== currentUser) setUnreadMessages(prev => prev + 1);
    });
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('direct-message');
    };
  }, []);

  useEffect(() => {
    socket.on('sensor-data', (data: SensorData) => {
      if (paused) return;
      setHasLiveData(true);
      setLatest(data);
      addPoint(data);
    });
    return () => { socket.off('sensor-data'); };
  }, [paused, addPoint]);

  useEffect(() => {
    if (hasLiveData) return; // Wokwi connecté — pas de simulation
    const interval = setInterval(() => {
      if (paused) return;
      const sim = generateSimData();
      setLatest(sim);
      addPoint(sim);
    }, 1000);
    return () => clearInterval(interval);
  }, [hasLiveData, paused, addPoint]);

  const sante = useMemo(() => {
    const vibTotal = latest.vibX + latest.vibY + latest.vibZ;
    return parseFloat(Math.max(0, Math.min(100, 100 - vibTotal * 5)).toFixed(1));
  }, [latest]);

  const healthData = useMemo(() => [
    { name: 'Rectifieuse', value: sante,                   color: '#3b82f6' },
    { name: 'Compresseur', value: Math.max(0, sante - 10), color: '#06b6d4' },
  ], [sante]);

  const toggleTheme  = useCallback(() => setDarkMode(p => !p), []);
  const togglePaused = useCallback(() => setPaused(p => !p), []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    window.location.href = '/';
  }, []);

  const handleOpenMessaging = () => {
    setShowMessaging(true);
    setUnreadMessages(0);
  };

  // Tailwind helpers dépendant du thème
  const bg2    = darkMode ? 'bg-[#0f172a]'        : 'bg-white';
  const bgCard = darkMode ? 'bg-slate-800/50'     : 'bg-white';
  const border = darkMode ? 'border-white/[0.08]' : 'border-slate-200';
  const txt1   = darkMode ? 'text-white'          : 'text-slate-900';
  const txt2   = darkMode ? 'text-slate-400'      : 'text-slate-500';
  const txtMut = darkMode ? 'text-slate-500'      : 'text-slate-400';

  return (
    <div className={`flex min-h-screen w-screen max-w-[100vw] overflow-x-hidden relative font-sans ${darkMode ? 'bg-[#0a0e27] text-white' : 'bg-slate-100 text-slate-900'}`}>

      {/* SIDEBAR */}
      <aside className={`w-[260px] min-w-[260px] ${bg2} border-r ${border} flex flex-col py-6 px-4 h-screen fixed left-0 top-0 overflow-y-auto overflow-x-hidden z-[100]`}>

        {/* Logo */}
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

        {/* Nav */}
        <nav className="flex-1">
          <div className="flex flex-col gap-2">
            <span className={`text-[10px] font-semibold ${txtMut} uppercase tracking-[1.5px] mb-2 pl-3`}>NAVIGATION</span>
            <ul className="list-none flex flex-col gap-1 p-0 m-0">
              {([
                { key: 'dashboard' as const, icon: <LayoutDashboard size={18} />, label: 'Tableau de Bord' },
                { key: 'machines'  as const, icon: <Settings size={18} />,        label: 'Machines' },
                { key: 'tasks'     as const, icon: <CheckSquare size={18} />,     label: 'Tâches' },
                ...(role === 'admin' ? [{ key: 'demandes' as const, icon: <UserPlus size={18} />, label: "Demandes d'accès" }] : []),
              ]).map(item => (
                <li
                  key={item.key}
                  onClick={() => setActivePage(item.key as 'dashboard' | 'machines' | 'demandes' | 'tasks')}
                  className={`flex items-center gap-3 px-3 py-3 rounded-[10px] cursor-pointer transition-all duration-300 text-sm font-medium
                    ${activePage === item.key
                      ? 'text-[#00d4ff] border border-[rgba(0,212,255,0.2)]'
                      : `${txt2} border border-transparent hover:bg-[rgba(0,212,255,0.1)] hover:text-[#00d4ff]`}`}
                  style={activePage === item.key ? { background: 'linear-gradient(135deg,rgba(0,102,255,0.2),rgba(0,212,255,0.2))' } : {}}
                >
                  {item.icon}<span>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* User + Logout */}
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
          <button onClick={handleLogout}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-[10px] text-sm font-medium cursor-pointer transition-all border border-transparent text-red-400 hover:bg-red-500/10 hover:border-red-500/20`}>
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 ml-[260px] w-[calc(100vw-260px)] min-w-0 flex flex-col overflow-x-hidden">

        {/* Header */}
        <header className={`h-[70px] ${bg2} border-b ${border} flex items-center justify-between px-6 gap-4 flex-wrap`}>

          {/* Left */}
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-[rgba(0,212,255,0.1)] border border-[rgba(0,212,255,0.3)] rounded-full text-xs font-medium text-[#00d4ff] whitespace-nowrap">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${connected ? 'bg-green-400 shadow-[0_0_8px_#22c55e]' : 'bg-blue-400 shadow-[0_0_8px_#3b82f6]'}`} />
              {latest.node}
            </span>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full text-[11px] text-green-400 whitespace-nowrap">
              <span style={{ display:'inline-block', animation:'spin 3s linear infinite' }}>⟳</span>
              <span>{hasLiveData ? '🟢 Live Wokwi' : '🔵 Simulation'}</span>
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-3 flex-wrap">
            <div onClick={toggleTheme} title="Thème"
              className={`w-9 h-9 rounded-lg ${bgCard} border ${border} flex items-center justify-center cursor-pointer transition-all ${txt2} hover:bg-[rgba(0,212,255,0.1)] hover:text-[#00d4ff] flex-shrink-0`}>
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </div>

            <div className="relative">
              <button onClick={handleOpenMessaging} title="Messages"
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-red-500 to-orange-500 border-none rounded-lg text-white text-xs font-semibold cursor-pointer uppercase tracking-wide whitespace-nowrap hover:-translate-y-0.5 transition-transform">
                <MessageSquare size={14} /> Messages
              </button>
              {unreadMessages > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                  {unreadMessages}
                </span>
              )}
            </div>

            <span className={`px-3 py-1.5 ${bgCard} border ${border} rounded-full text-xs font-medium ${txt2} font-mono whitespace-nowrap`}>
              RPM : {latest.rpm}
            </span>
            <span className={`px-3 py-1.5 ${bgCard} border ${border} rounded-full text-xs font-medium ${txt2} font-mono whitespace-nowrap`}>
              I : {latest.courant} A
            </span>

            <button onClick={togglePaused} title={paused ? 'Reprendre' : 'Pause'}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-red-500 to-orange-500 border-none rounded-lg text-white text-xs font-semibold cursor-pointer uppercase tracking-wide whitespace-nowrap hover:-translate-y-0.5 transition-transform">
              <Pause size={14} />
              {paused ? 'Reprendre' : 'Pause'}
            </button>

            <button onClick={handleLogout} title="Déconnexion"
              className={`w-9 h-9 rounded-lg ${bgCard} border ${border} flex items-center justify-center cursor-pointer transition-all text-red-400 hover:bg-red-500/10 hover:border-red-500/20 flex-shrink-0`}>
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {/* Content */}
        {activePage === 'machines' ? (
          <div className="flex-1 overflow-y-auto"><MachinesPage /></div>
        ) : activePage === 'demandes' ? (
          <div className="flex-1 overflow-y-auto"><DemandesPage /></div>
        ) : activePage === 'tasks' ? (
          <div className="flex-1 overflow-y-auto"><TasksPage /></div>
        ) : (
          <div className="flex-1 p-6 overflow-y-auto overflow-x-hidden min-w-0 w-full">

            {/* Page header */}
            <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
              <div>
                <h2 className={`text-2xl font-bold mb-1 ${txt1}`}>Tableau de Bord</h2>
                <p className={`text-[13px] ${txtMut}`}>Vue d'ensemble — Supervision IoT Industrielle en Temps Réel</p>
              </div>
              <div className="text-right">
                <div className={`text-[13px] ${txt2} capitalize`}>
                  {currentTime.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
                <div className="text-[20px] font-bold text-[#00d4ff] font-mono">
                  {currentTime.toLocaleTimeString('fr-FR')}
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-4 gap-4 mb-6 w-full">
              {[
                { label:'Machines Actives', icon:<Settings size={20}/>,    grad:'from-violet-500 to-purple-500',  value:<>{`2`}<span className={`text-sm ${txtMut} font-medium`}>/ 2</span></>, trend:<span className="text-green-400">▲ 100% disponibilité</span> },
                { label:'Santé Moyenne',    icon:<Heart size={20}/>,       grad:'from-pink-500 to-pink-400',      value:<>{sante}<span className={`text-sm ${txtMut} font-medium`}>%</span></>,   trend:<span className="text-blue-400">▲ Stable</span> },
                { label:'Courant',          icon:<Bell size={20}/>,        grad:'from-orange-500 to-orange-400',  value:<>{latest.courant}<span className={`text-sm ${txtMut} font-medium`}>A</span></>, trend:<span className="text-green-400">RPM : {latest.rpm}</span> },
                { label:'Nœud ESP32',       icon:<Wifi size={20}/>,        grad:'from-green-500 to-green-400',    value:<>{connected?'🟢':'🔵'}<span className={`text-sm ${txtMut} font-medium`}>{connected?'Live':'Sim'}</span></>,
                  trend:<span className="inline-block px-2 py-0.5 bg-green-500/10 border border-green-500/20 rounded-full text-[10px] text-green-400">{connected?'MQTT • HiveMQ':'Mode Simulation'}</span> },
              ].map((card, i) => (
                <div key={i} className={`${bgCard} border ${border} rounded-xl p-5 flex items-start gap-3 transition-all duration-300 hover:-translate-y-0.5 min-w-0 w-full`}>
                  <div className={`w-10 h-10 min-w-[40px] rounded-[10px] flex items-center justify-center text-white bg-gradient-to-br ${card.grad}`}>
                    {card.icon}
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <span className={`text-[11px] ${txtMut} uppercase tracking-wide mb-1.5 block whitespace-nowrap`}>{card.label}</span>
                    <div className={`text-[28px] font-bold ${txt1} flex items-baseline gap-1`}>{card.value}</div>
                    <div className="text-[11px] mt-1.5 flex items-center gap-1">{card.trend}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Charts row 1 */}
            <div className="grid grid-cols-[2fr_1fr] gap-4 mb-4 w-full">
              <div className={`${bgCard} border ${border} rounded-xl p-5 min-w-0 overflow-hidden min-h-[350px]`}>
                <div className="flex items-center gap-2.5 mb-4">
                  <Activity size={16} className="text-[#00d4ff] flex-shrink-0" />
                  <h3 className={`text-sm font-semibold m-0 ${txt1}`}>Vibrations Temps Réel — ADXL345 (mm/s)</h3>
                </div>
                <div className="flex gap-4 mb-4 px-3 py-2 bg-black/20 rounded-lg w-fit flex-wrap">
                  {[['#3b82f6','VibX'],['#06b6d4','VibY'],['#f97316','VibZ']].map(([c,l]) => (
                    <span key={l} className={`flex items-center gap-1.5 text-xs ${txt2}`}>
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{l}
                    </span>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#1e293b' : '#e2e8f0'} />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke={darkMode ? '#475569' : '#64748b'} angle={-45} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} stroke={darkMode ? '#475569' : '#64748b'} domain={[0, 5]} />
                    <Tooltip contentStyle={{ backgroundColor: darkMode ? '#0f172a' : '#fff', border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`, borderRadius: '8px' }} />
                    <Line type="monotone" dataKey="vibX" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="vibY" stroke="#06b6d4" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="vibZ" stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className={`${bgCard} border ${border} rounded-xl p-5 min-w-0 overflow-hidden min-h-[350px]`}>
                <div className="flex items-center gap-2.5 mb-4">
                  <Heart size={16} className="text-[#00d4ff] flex-shrink-0" />
                  <h3 className={`text-sm font-semibold m-0 ${txt1}`}>Santé des Machines</h3>
                </div>
                <div className="flex justify-around items-center h-[calc(100%-50px)] flex-wrap gap-5">
                  {healthData.map((item, index) => (
                    <div key={index} className="flex flex-col items-center gap-3">
                      <div className="relative w-20 h-20">
                        <ResponsiveContainer width={100} height={100}>
                          <PieChart>
                            <Pie data={[{ value: item.value }, { value: 100 - item.value }]}
                              cx={50} cy={50} innerRadius={35} outerRadius={45}
                              startAngle={90} endAngle={-270} dataKey="value" stroke="none">
                              <Cell fill={item.color} />
                              <Cell fill={darkMode ? '#1e293b' : '#e2e8f0'} />
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[18px] font-bold"
                          style={{ color: item.color }}>
                          {item.value.toFixed(0)}%
                        </div>
                      </div>
                      <span className={`text-[13px] ${txt2}`}>{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Charts row 2 */}
            <div className="grid grid-cols-2 gap-4 mb-4 w-full">
              <div className={`${bgCard} border ${border} rounded-xl p-5 min-w-0 overflow-hidden`}>
                <div className="flex items-center gap-2.5 mb-4">
                  <Zap size={16} className="text-[#00d4ff] flex-shrink-0" />
                  <h3 className={`text-sm font-semibold m-0 ${txt1}`}>Courant Électrique (A)</h3>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#1e293b' : '#e2e8f0'} />
                    <XAxis hide />
                    <YAxis tick={{ fontSize: 11 }} stroke={darkMode ? '#475569' : '#64748b'} domain={[0, 30]} />
                    <Tooltip contentStyle={{ backgroundColor: darkMode ? '#0f172a' : '#fff', border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`, borderRadius: '8px' }} />
                    <Line type="monotone" dataKey="courant" stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className={`${bgCard} border ${border} rounded-xl p-5 min-w-0 overflow-hidden`}>
                <div className="flex items-center gap-2.5 mb-4">
                  <Thermometer size={16} className="text-[#00d4ff] flex-shrink-0" />
                  <h3 className={`text-sm font-semibold m-0 ${txt1}`}>Vitesse Rotation (RPM)</h3>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#1e293b' : '#e2e8f0'} />
                    <XAxis hide />
                    <YAxis tick={{ fontSize: 11 }} stroke={darkMode ? '#475569' : '#64748b'} />
                    <Tooltip contentStyle={{ backgroundColor: darkMode ? '#0f172a' : '#fff', border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`, borderRadius: '8px' }} />
                    <Line type="monotone" dataKey="rpm" stroke="#a855f7" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        )}
      </main>

      {/* Messaging Overlay */}
      {showMessaging && (
        <div className="fixed inset-0 z-[1000] bg-[#0f172a]">
          <div className="absolute top-4 right-4 z-10">
            <button
              onClick={() => setShowMessaging(false)}
              className="flex items-center gap-1.5 px-[18px] py-2 bg-white/[0.08] border border-white/[0.15] rounded-lg text-slate-200 cursor-pointer text-[13px] font-semibold hover:bg-white/[0.14] transition-colors"
            >
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