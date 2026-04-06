import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  LayoutDashboard, Settings, Activity, Bell,
  Pause, Sun, Moon, X, MessageSquare, UserPlus, LogOut,
  BarChart2, Package, Heart, Wrench, FolderOpen
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import MessagingPage from './MessagingPage';
import MachinesPage from './MachinesPage';
import DemandesPage from './Demandespage';
import AlertesPage from './AlertesPage';
import ProductionPage from './ProductionPage';
import EspaceEmployer from './EspaceEmployer';
import DossierPage from './DossierPage';
import './Dashboard.css';

interface SensorData {
  node: string; courant: number;
  vibX: number; vibY: number; vibZ: number; rpm: number;
  pression?: number;
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
  const [darkMode, setDarkMode]             = useState(true);
  const [currentTime, setCurrentTime]       = useState(new Date());
  const [connected, setConnected]           = useState(false);
  const [hasLiveData, setHasLiveData]       = useState(false);
  const [paused, setPaused]                 = useState(false);
  const [latest, setLatest]                 = useState<SensorData>(generateSimData());
  const [latestComp, setLatestComp]         = useState<SensorData>({ node:'compresseur', courant:0, vibX:0, vibY:0, vibZ:0, rpm:0, pression:0 });
  const [showMessaging, setShowMessaging]   = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [alertCount, setAlertCount]         = useState(0);
  const role = localStorage.getItem('role');

  // ── activePage — 'tasks' retiré, 'maintenance' ajouté ──
const [activePage, setActivePage] = useState<
  'dashboard' | 'machines' | 'demandes' | 'maintenance' | 'alertes' | 'rapports' | 'production' | 'EspaceEmployer'|'dossier'
>('dashboard');


  // ── Stats Production depuis MongoDB ──
  const [prodStats, setProdStats] = useState({ totalPcs: 0, totalRevenu: 0, enCours: 0 });

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

  const toggleTheme  = useCallback(() => setDarkMode(p => !p), []);
  const togglePaused = useCallback(() => setPaused(p => !p), []);
  const handleLogout = useCallback(() => { localStorage.clear(); window.location.href = '/'; }, []);
  const handleOpenMessaging = () => { setShowMessaging(true); setUnreadMessages(0); };

  const bg2    = darkMode ? 'bg-[#0f172a]'    : 'bg-white';
  const bgCard = darkMode ? 'bg-slate-800/50' : 'bg-white';
  const border = darkMode ? 'border-white/[0.08]' : 'border-slate-200';
  const txt1   = darkMode ? 'text-white'      : 'text-slate-900';
  const txt2   = darkMode ? 'text-slate-400'  : 'text-slate-500';
  const txtMut = darkMode ? 'text-slate-500'  : 'text-slate-400';

  // ── navItems — 'tasks' retiré, 'maintenance' ajouté ──
  const navItems = [
    { key: 'dashboard'   as const, icon: <LayoutDashboard size={18} />, label: 'Tableau de Bord' },
    { key: 'production'  as const, icon: <Package size={18} />,         label: 'Production' },
    { key: 'dossier'     as const, icon: <FolderOpen size={18} />,      label: 'Dossier' },
    { key: 'machines'    as const, icon: <Settings size={18} />,        label: 'Machines' },
    { key: 'maintenance' as const, icon: <Wrench size={18} />,          label: 'Maintenance' },
    { key: 'alertes'     as const, icon: <Bell size={18} />,            label: 'Alertes', badge: alertCount },
    { key: 'rapports'    as const, icon: <BarChart2 size={18} />,       label: 'Rapports' },
{ key: 'EspaceEmployer' as const, icon: <BarChart2 size={18} />, label: 'Espace Employé' },
    ...(role === 'admin' ? [{ key: 'demandes' as const, icon: <UserPlus size={18} />, label: "Demandes d'accès" }] : []),
  ];



  return (
    <div className={`flex min-h-screen w-screen max-w-[100vw] overflow-x-hidden relative font-sans ${darkMode ? 'bg-[#0a0e27] text-white' : 'bg-slate-100 text-slate-900'}`}>

      {/* ── SIDEBAR ── */}
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
              {navItems.map(item => (
                <li key={item.key}
                  onClick={() => { setActivePage(item.key as typeof activePage); if (item.key === 'alertes') setAlertCount(0); }}
                  className={`flex items-center gap-3 px-3 py-3 rounded-[10px] cursor-pointer transition-all duration-300 text-sm font-medium
                    ${activePage === item.key
                      ? 'text-[#00d4ff] border border-[rgba(0,212,255,0.2)]'
                      : `${txt2} border border-transparent hover:bg-[rgba(0,212,255,0.1)] hover:text-[#00d4ff]`}`}
                  style={activePage === item.key ? { background: 'linear-gradient(135deg,rgba(0,102,255,0.2),rgba(0,212,255,0.2))' } : {}}>
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
                <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                  {unreadMessages}
                </span>
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

        {/* ── Content ── */}
        {activePage === 'machines'     ? <div className="flex-1 overflow-y-auto"><MachinesPage /></div>
        : activePage === 'demandes'    ? <div className="flex-1 overflow-y-auto"><DemandesPage /></div>
        : activePage === 'EspaceEmployer'  ? <div className="flex-1 overflow-y-auto"><EspaceEmployer /></div>
        : activePage === 'alertes'     ? <div className="flex-1 overflow-y-auto"><AlertesPage /></div>
        : activePage === 'production'  ? <div className="flex-1 overflow-y-auto"><ProductionPage /></div>
        : activePage === 'dossier'     ? <div className="flex-1 overflow-y-auto"><DossierPage /></div>
        : activePage === 'maintenance' ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-3">
            <div style={{ fontSize: 48 }}>🔧</div>
            <div className="text-white font-semibold text-lg">Section Maintenance</div>
            <div className="text-slate-500 text-sm">Bientôt disponible</div>
          </div>
        )
        : activePage === 'rapports'    ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-3">
            <div style={{ fontSize: 48 }}>📊</div>
            <div className="text-white font-semibold text-lg">Section Rapports</div>
            <div className="text-slate-500 text-sm">Bientôt disponible</div>
          </div>

        )
        : (
          /* ── DASHBOARD PRINCIPAL ── */
          <div className="flex-1 p-6 overflow-y-auto overflow-x-hidden min-w-0 w-full">

            {/* Title */}
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

            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Production Totale', value: `${prodStats.totalPcs.toLocaleString()} pcs`, color: '#3b82f6', icon: '📦', sub: 'MongoDB' },
                { label: 'Revenu Estimé',     value: `${prodStats.totalRevenu.toLocaleString()} DT`, color: '#22c55e', icon: '💰', sub: 'MongoDB' },
                { label: 'Pièces En cours',   value: `${prodStats.enCours} pièces`, color: '#f59e0b', icon: '🔄', sub: 'En production' },
                { label: 'Alertes actives',   value: `${alertCount}`, color: alertCount > 0 ? '#ef4444' : '#22c55e', icon: '🚨', sub: 'Machines' },
              ].map(k => (
                <div key={k.label} className={`${bgCard} border ${border} rounded-xl p-4`}>
                  <div className="flex items-center justify-between mb-3">
                    <span style={{ fontSize: 22 }}>{k.icon}</span>
                    <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: k.color + '20', color: k.color }}>{k.sub}</span>
                  </div>
                  <div className="text-[22px] font-bold" style={{ color: k.color }}>{k.value}</div>
                  <div className={`text-[11px] ${txtMut} mt-1`}>{k.label}</div>
                </div>
              ))}
            </div>

            {/* ── Santé des Machines ── */}
            <div className={`${bgCard} border ${border} rounded-xl p-5`}>
              <div className="flex items-center gap-2 mb-6">
                <Heart size={15} className="text-[#00d4ff]" />
                <span className={`text-sm font-semibold ${txt1}`}>Santé des Machines</span>
              </div>
              <div className="grid grid-cols-2 gap-6">
                {[
                  {
                    name: 'Rectifieuse', node: 'ESP32-NODE-01', color: '#3b82f6', value: sante,
                    sensors: [
                      { label: 'Courant',   val: `${latest.courant} A`,         color: latest.courant > 15 ? '#ef4444' : '#22c55e' },
                      { label: 'Vibration', val: `${latest.vibX.toFixed(2)} g`, color: latest.vibX > 2 ? '#f97316' : '#3b82f6' },
                      { label: 'RPM',       val: `${latest.rpm}`,               color: '#a855f7' },
                    ]
                  },
                  {
                    name: 'Compresseur ABAC', node: 'compresseur', color: '#06b6d4', value: santeComp,
                    sensors: [
                      { label: 'Courant',   val: `${latestComp.courant.toFixed(1)} A`,           color: latestComp.courant > 15 ? '#ef4444' : '#22c55e' },
                      { label: 'Vibration', val: `${latestComp.vibX.toFixed(2)} g`,              color: latestComp.vibX > 2 ? '#f97316' : '#3b82f6' },
                      { label: 'Pression',  val: `${(latestComp.pression ?? 0).toFixed(1)} bar`, color: '#06b6d4' },
                    ]
                  },
                ].map((machine, i) => (
                  <div key={i} className={`${darkMode ? 'bg-slate-900/40' : 'bg-slate-50'} rounded-xl p-5 border ${border}`}>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className={`text-sm font-bold ${txt1}`}>{i === 0 ? '⚙️' : '🔧'} {machine.name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{machine.node}</div>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="relative" style={{ width: 70, height: 70 }}>
                          <ResponsiveContainer width={70} height={70}>
                            <PieChart>
                              <Pie
                                data={[{ value: machine.value }, { value: 100 - machine.value }]}
                                cx={35} cy={35} innerRadius={26} outerRadius={34}
                                startAngle={90} endAngle={-270} dataKey="value" stroke="none">
                                <Cell fill={machine.color} />
                                <Cell fill={darkMode ? '#1e293b' : '#e2e8f0'} />
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[13px] font-bold" style={{ color: machine.color }}>
                            {machine.value.toFixed(0)}%
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-500 mt-1">Santé</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {machine.sensors.map(s => (
                        <div key={s.label} className={`${darkMode ? 'bg-slate-800/60' : 'bg-white'} rounded-lg p-2.5 text-center border ${border}`}>
                          <div className="text-[15px] font-bold" style={{ color: s.color }}>{s.val}</div>
                          <div className={`text-[10px] ${txtMut} mt-1`}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1 bg-slate-700/50 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${machine.value}%`, background: machine.value > 70 ? '#22c55e' : machine.value > 40 ? '#f97316' : '#ef4444' }} />
                      </div>
                      <span className={`text-[11px] font-bold ${txt2}`}>
                        {machine.value > 70 ? '✅ Bon' : machine.value > 40 ? '⚠️ Moyen' : '🔴 Critique'}
                      </span>
                    </div>
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
