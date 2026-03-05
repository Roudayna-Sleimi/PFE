import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { io } from 'socket.io-client';
import { 
  LayoutDashboard, 
  Settings, 
  AlertTriangle, 
  BarChart3, 
  FileText, 
  Activity,
  Heart,
  Bell,
  Wifi,
  Zap,
  Thermometer,
  Pause,
  Sun,
  Moon
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import './Dashboard.css';

// ═══ Types ═══
interface SensorData {
  node:      string;
  courant:   number;
  vibX:      number;
  vibY:      number;
  vibZ:      number;
  rpm:       number;
  ts?:       number;
}

interface ChartPoint {
  time:   string;
  vibX:   number;
  vibY:   number;
  vibZ:   number;
  courant: number;
  rpm:    number;
}

const MAX_POINTS = 20;
const socket = io('http://localhost:5000');

const Dashboard: React.FC = () => {
  const [darkMode, setDarkMode]       = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [connected, setConnected]     = useState(false);
  const [paused, setPaused]           = useState(false);

  // Dernière donnée reçue
  const [latest, setLatest] = useState<SensorData>({
    node: 'ESP32-NODE-01', courant: 0, vibX: 0, vibY: 0, vibZ: 0, rpm: 0
  });

  // Historique pour les charts
  const [chartData, setChartData] = useState<ChartPoint[]>([]);

  // ═══ Horloge ═══
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ═══ Socket.IO ═══
  useEffect(() => {
    socket.on('connect', () => {
      console.log('✅ Socket connecté');
      setConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('❌ Socket déconnecté');
      setConnected(false);
    });

    socket.on('sensor-data', (data: SensorData) => {
      if (paused) return;

      setLatest(data);

      const now = new Date();
      const timeLabel = now.toLocaleTimeString('fr-FR');

      setChartData(prev => {
        const newPoint: ChartPoint = {
          time:    timeLabel,
          vibX:    parseFloat(data.vibX.toFixed(2)),
          vibY:    parseFloat(data.vibY.toFixed(2)),
          vibZ:    parseFloat(data.vibZ.toFixed(2)),
          courant: parseFloat(data.courant.toFixed(2)),
          rpm:     data.rpm,
        };
        const updated = [...prev, newPoint];
        return updated.length > MAX_POINTS ? updated.slice(-MAX_POINTS) : updated;
      });
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('sensor-data');
    };
  }, [paused]);

  // Santé simulée basée sur les vibrations
  const sante = useMemo(() => {
    const vibTotal = latest.vibX + latest.vibY + latest.vibZ;
    const score = Math.max(0, Math.min(100, 100 - vibTotal * 5));
    return parseFloat(score.toFixed(1));
  }, [latest]);

  const healthData = useMemo(() => [
    { name: 'Rectifieuse', value: sante,      color: '#3b82f6' },
    { name: 'Compresseur', value: sante - 10, color: '#06b6d4' },
  ], [sante]);

  const toggleTheme  = useCallback(() => setDarkMode(prev => !prev), []);
  const togglePaused = useCallback(() => setPaused(prev => !prev), []);

  return (
    <div className={`dashboard ${darkMode ? 'dark' : 'light'}`}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon"><Activity size={24} /></div>
          <div className="logo-text">
            <h1>CNC Pulse</h1>
            <span>Supervision Industrielle</span>
          </div>
        </div>
        <nav className="nav">
          <div className="nav-section">
            <span className="nav-label">NAVIGATION</span>
            <ul>
              <li className="active"><LayoutDashboard size={18} /><span>Tableau de Bord</span></li>
              <li><Settings size={18} /><span>Machines</span></li>
              <li><AlertTriangle size={18} /><span>Alertes</span></li>
              <li><BarChart3 size={18} /><span>Analytics</span></li>
              <li><FileText size={18} /><span>Rapports</span></li>
            </ul>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Header */}
        <header className="header">
          <div className="header-left">
            <div className="node-tabs">
              <span className="node-tab active">
                <span className={`status-dot ${connected ? 'green' : 'red'}`}></span>
                {latest.node}
              </span>
            </div>
            <div className="refresh-badge">
              <span className="refresh-icon">⟳</span>
              <span>{connected ? 'Live MQTT' : 'Déconnecté'}</span>
            </div>
          </div>
          <div className="header-right">
            <div className="theme-toggle" onClick={toggleTheme}>
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </div>
            <span className="mae-badge">RPM : {latest.rpm.toFixed(0)}</span>
            <span className="latency-badge">I : {latest.courant.toFixed(2)} A</span>
            <button className="pause-btn" onClick={togglePaused}>
              <Pause size={14} />
              {paused ? 'Reprendre' : 'Pause'}
            </button>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="dashboard-content">
          <div className="page-header">
            <div>
              <h2>Tableau de Bord</h2>
              <p>Vue d'ensemble — Supervision IoT Industrielle en Temps Réel</p>
            </div>
            <div className="datetime">
              <div className="date">
                {currentTime.toLocaleDateString('fr-FR', { 
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
                })}
              </div>
              <div className="time">{currentTime.toLocaleTimeString('fr-FR')}</div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon purple"><Settings size={20} /></div>
              <div className="stat-content">
                <span className="stat-label">Machines Actives</span>
                <div className="stat-value">2<span className="stat-total">/ 2</span></div>
                <span className="stat-trend up">▲ 100% disponibilité</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon pink"><Heart size={20} /></div>
              <div className="stat-content">
                <span className="stat-label">Santé Moyenne</span>
                <div className="stat-value">{sante}<span className="stat-unit">%</span></div>
                <span className="stat-trend stable">▲ Stable</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon orange"><Bell size={20} /></div>
              <div className="stat-content">
                <span className="stat-label">Courant</span>
                <div className="stat-value">{latest.courant.toFixed(1)}<span className="stat-unit">A</span></div>
                <span className="stat-trend up">RPM : {latest.rpm.toFixed(0)}</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon green"><Wifi size={20} /></div>
              <div className="stat-content">
                <span className="stat-label">Nœud ESP32</span>
                <div className="stat-value">
                  {connected ? '🟢' : '🔴'}
                  <span className="stat-suffix">{connected ? 'Live' : 'Off'}</span>
                </div>
                <span className="stat-badge">MQTT • HiveMQ</span>
              </div>
            </div>
          </div>

          {/* Charts Row 1 */}
          <div className="charts-row">
            <div className="chart-card large">
              <div className="chart-header">
                <Activity size={16} />
                <h3>Vibrations Temps Réel — ADXL345 (mm/s)</h3>
              </div>
              <div className="chart-legend">
                <span className="legend-item">
                  <span className="legend-color rectifieuse"></span>VibX
                </span>
                <span className="legend-item">
                  <span className="legend-color compresseur"></span>VibY
                </span>
                <span className="legend-item">
                  <span className="legend-color sct013"></span>VibZ
                </span>
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

            <div className="chart-card small">
              <div className="chart-header">
                <Heart size={16} />
                <h3>Santé des Machines</h3>
              </div>
              <div className="health-gauges">
                {healthData.map((item, index) => (
                  <div key={index} className="gauge-item">
                    <div className="gauge-chart">
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
                      <div className={`gauge-value gauge-color-${index}`}>{item.value.toFixed(0)}%</div>
                    </div>
                    <span className="gauge-label">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Charts Row 2 */}
          <div className="charts-row">
            <div className="chart-card">
              <div className="chart-header">
                <Zap size={16} />
                <h3>Courant Électrique (A)</h3>
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

            <div className="chart-card">
              <div className="chart-header">
                <Thermometer size={16} />
                <h3>Vitesse Rotation (RPM)</h3>
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
      </main>
    </div>
  );
};

export default Dashboard;