import React, { useState, useEffect, useMemo, useCallback } from 'react';
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

const Dashboard: React.FC = () => {
  const [darkMode, setDarkMode] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ✅ GÉNÉRATEUR PSEUDO-ALÉATOIRE DÉTERMINISTE
  const createRandomGenerator = (initialSeed: number) => {
    let seed = initialSeed;
    return (min: number, max: number) => {
      const x = Math.sin(seed++) * 10000;
      return min + (x - Math.floor(x)) * (max - min);
    };
  };

  // Données vibrations CORRIGÉES
  const vibrationData = useMemo(() => {
    const random = createRandomGenerator(42);
    return Array.from({ length: 20 }, (_, i) => ({
      time: `14:4${7 + Math.floor(i / 10)}:${30 + (i % 10) * 3}`,
      rectifieuse: 1.5 + Math.sin(i * 0.5) * 1.2 + random(0, 0.5),
      compresseur: 1.2 + Math.cos(i * 0.4) * 0.8 + random(0, 0.4),
    }));
  }, []);

  // Données santé
  const healthData = useMemo(() => [
    { name: 'Rectifieuse', value: 56, color: '#3b82f6' },
    { name: 'Compresseur', value: 67, color: '#06b6d4' },
  ], []);

  // Données courant CORRIGÉES
  const currentData = useMemo(() => {
    const random = createRandomGenerator(123);
    return Array.from({ length: 15 }, (_, i) => ({
      time: i,
      sct013: 12 + Math.sin(i * 0.3) * 3 + random(0, 1),
      diris: 15 + Math.cos(i * 0.4) * 2 + random(0, 1),
    }));
  }, []);

  // Données pression/température
  const pressureTempData = useMemo(() => 
    Array.from({ length: 15 }, (_, i) => ({
      time: i,
      pression: 8 + Math.sin(i * 0.3) * 0.8,
      temperature: 65 + Math.sin(i * 0.4) * 10,
    })), 
  []);

  const toggleTheme = useCallback(() => {
    setDarkMode(prev => !prev);
  }, []);

  return (
    <div className={`dashboard ${darkMode ? 'dark' : 'light'}`}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon">
            <Activity size={24} />
          </div>
          <div className="logo-text">
            <h1>CNC Pulse</h1>
            <span>Supervision Industrielle</span>
          </div>
        </div>

        <nav className="nav">
          <div className="nav-section">
            <span className="nav-label">NAVIGATION</span>
            <ul>
              <li className="active">
                <LayoutDashboard size={18} />
                <span>Tableau de Bord</span>
              </li>
              <li>
                <Settings size={18} />
                <span>Machines</span>
              </li>
              <li>
                <AlertTriangle size={18} />
                <span>Alertes</span>
              </li>
              <li>
                <BarChart3 size={18} />
                <span>Analytics</span>
              </li>
              <li>
                <FileText size={18} />
                <span>Rapports</span>
              </li>
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
                <span className="status-dot green"></span>
                ESP32-NODE-01
              </span>
              <span className="node-tab">
                <span className="status-dot blue"></span>
                ESP32-NODE-02
              </span>
            </div>
            <div className="refresh-badge">
              <span className="refresh-icon">⟳</span>
              <span>Rafraîchissement : 3s</span>
            </div>
          </div>

          <div className="header-right">
            <div className="theme-toggle" onClick={toggleTheme}>
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </div>
            <span className="mae-badge">MAE : 14:49:30</span>
            <span className="latency-badge">Latence : 12ms</span>
            <button className="pause-btn">
              <Pause size={14} />
              Pause
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
                  weekday: 'long', 
                  day: 'numeric', 
                  month: 'long', 
                  year: 'numeric' 
                })}
              </div>
              <div className="time">
                {currentTime.toLocaleTimeString('fr-FR')}
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon purple">
                <Settings size={20} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Machines Actives</span>
                <div className="stat-value">2<span className="stat-total">/ 2</span></div>
                <span className="stat-trend up">▲ 100% disponibilité</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon pink">
                <Heart size={20} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Santé Moyenne</span>
                <div className="stat-value">61.2<span className="stat-unit">%</span></div>
                <span className="stat-trend stable">▲ Stable</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon orange">
                <Bell size={20} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Alertes Actives</span>
                <div className="stat-value">3</div>
                <span className="stat-alerts">
                  <span className="alert-critical">1 critique</span>
                  <span className="alert-separator">•</span>
                  <span className="alert-warning">2 alertes</span>
                </span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon green">
                <Wifi size={20} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Nœuds ESP32</span>
                <div className="stat-value">2<span className="stat-suffix">actifs</span></div>
                <span className="stat-badge">WiFi • Latence 12ms</span>
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
                  <span className="legend-color rectifieuse"></span>
                  Rectifieuse
                </span>
                <span className="legend-item">
                  <span className="legend-color compresseur"></span>
                  Compresseur
                </span>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={vibrationData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#1e293b' : '#e2e8f0'} />
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 10 }}
                    stroke={darkMode ? '#475569' : '#64748b'}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis 
                    tick={{ fontSize: 11 }}
                    stroke={darkMode ? '#475569' : '#64748b'}
                    domain={[0, 3.5]}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: darkMode ? '#0f172a' : '#fff',
                      border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`,
                      borderRadius: '8px'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="rectifieuse" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="compresseur" 
                    stroke="#06b6d4" 
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card small">
              <div className="chart-header">
                <Heart size={16} className="heart-icon" />
                <h3>Santé des Machines</h3>
              </div>
              <div className="health-gauges">
                {healthData.map((item, index) => (
                  <div key={index} className="gauge-item">
                    <div className="gauge-chart">
                      <ResponsiveContainer width={100} height={100}>
                        <PieChart>
                          <Pie
                            data={[
                              { value: item.value },
                              { value: 100 - item.value }
                            ]}
                            cx={50}
                            cy={50}
                            innerRadius={35}
                            outerRadius={45}
                            startAngle={90}
                            endAngle={-270}
                            dataKey="value"
                            stroke="none"
                          >
                            <Cell fill={item.color} />
                            <Cell fill={darkMode ? '#1e293b' : '#e2e8f0'} />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      {/* ✅ Style inline remplacé par className */}
                      <div className={`gauge-value gauge-color-${index}`}>
                        {item.value}%
                      </div>
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
                <Zap size={16} className="zap-icon" />
                <h3>Courant Électrique (A)</h3>
              </div>
              <div className="chart-legend">
                <span className="legend-item">
                  <span className="legend-color sct013"></span>
                  SCT-013 Rect.
                </span>
                <span className="legend-item">
                  <span className="legend-color diris"></span>
                  DIRIS Comp.
                </span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={currentData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#1e293b' : '#e2e8f0'} />
                  <XAxis hide />
                  <YAxis 
                    tick={{ fontSize: 11 }}
                    stroke={darkMode ? '#475569' : '#64748b'}
                    domain={[10, 20]}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: darkMode ? '#0f172a' : '#fff',
                      border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`,
                      borderRadius: '8px'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="sct013" 
                    stroke="#f97316" 
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="diris" 
                    stroke="#a855f7" 
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <Thermometer size={16} className="temp-icon" />
                <h3>Pression & Température GY-BME280</h3>
              </div>
              <div className="chart-legend">
                <span className="legend-item">
                  <span className="legend-color pression"></span>
                  Pression (bar)
                </span>
                <span className="legend-item">
                  <span className="legend-color temperature"></span>
                  Temp. (°C)
                </span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={pressureTempData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#1e293b' : '#e2e8f0'} />
                  <XAxis hide />
                  <YAxis 
                    yAxisId="left"
                    tick={{ fontSize: 11 }}
                    stroke={darkMode ? '#475569' : '#64748b'}
                    domain={[7, 9]}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    stroke={darkMode ? '#475569' : '#64748b'}
                    domain={[55, 75]}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: darkMode ? '#0f172a' : '#fff',
                      border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`,
                      borderRadius: '8px'
                    }}
                  />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="pression" 
                    stroke="#eab308" 
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="temperature" 
                    stroke="#f472b6" 
                    strokeWidth={2}
                    dot={false}
                  />
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
