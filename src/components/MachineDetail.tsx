import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', { transports: ['websocket'] });
import { ArrowLeft, Settings, Wrench, Activity } from 'lucide-react';
import PiecesTab from './Piecestab';
import MaintenanceTab from './MaintenanceTab';

interface Machine {
  id: string;
  name: string;
  model: string;
  node: string;
  ip: string;
  sensors: string[];
  icon: 'gear' | 'wrench';
  sante: number;
  status: 'En marche' | 'Avertissement' | 'Arrêt';
  protocol: string;
  broker: string;
  latence: string;
  uptime: string;
  chipModel: string;
  machId: string;
  vibration: number;
  courant: number;
  rpm: number;
  fonctions?: { title: string; desc: string }[];
}

interface Props {
  machine: Machine;
  onBack: () => void;
}

const getTabs = (machineId: string) => {
  const base = ['Capteurs', 'Fonctions', 'Maintenance', 'Historique'];
  if (machineId === 'rectifieuse') return ['Capteurs', 'Fonctions', 'Pièces', 'Maintenance', 'Historique'];
  return base;
};

const tabIcon: Record<string, string> = {
  Capteurs: '🔌',
  Fonctions: '⚡',
  Pièces: '⚙️',
  Maintenance: '🔧',
  Historique: '📋',
};

const statusStyle = (status: Machine['status']) => {
  if (status === 'En marche')     return { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)' };
  if (status === 'Avertissement') return { color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)' };
  return { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' };
};

const santeColor = (v: number) => v >= 70 ? '#22c55e' : v >= 40 ? '#f97316' : '#ef4444';

const sensorTag = (label: string, color: string) => (
  <span key={label} style={{
    fontSize: 10, padding: '2px 8px', borderRadius: 5, fontWeight: 700,
    background: color + '22', border: `1px solid ${color}66`, color,
  }}>{label}</span>
);

interface LiveData {
  vibration: number;
  courant: number;
  rpm: number;
  isLive: boolean;
}

const MachineDetail: React.FC<Props> = ({ machine, onBack }) => {
  const [activeTab, setActiveTab] = useState('Capteurs');
  const [live, setLive] = useState<LiveData>({
    vibration: machine.vibration,
    courant: machine.courant,
    rpm: machine.rpm,
    isLive: false,
  });
  const st = statusStyle(machine.status);

  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    return () => { socket.off('connect'); socket.off('disconnect'); };
  }, []);

  // Live ESP32 data
  useEffect(() => {
    const handler = (data: { node: string; courant: number; vibX: number; vibY: number; vibZ: number; rpm: number }) => {
      if (data.node !== machine.node) return;
      const vib = parseFloat(Math.sqrt(data.vibX**2 + data.vibY**2 + data.vibZ**2).toFixed(2));
      setLive({ vibration: vib, courant: data.courant, rpm: data.rpm, isLive: true });
    };
    socket.on('sensor-data', handler);
    return () => { socket.off('sensor-data', handler); };
  }, [machine.node]);

  // Simulation when not connected
  useEffect(() => {
    if (isConnected) return;
    const interval = setInterval(() => {
      const t = Date.now();
      const baseVib = machine.id === 'rectifieuse' ? 1.4 : 2.8;
      const baseCou = machine.id === 'rectifieuse' ? 12.3 : 18.5;
      const baseRpm = machine.id === 'rectifieuse' ? 3096 : 1450;
      setLive(prev => ({
        ...prev,
        vibration: parseFloat((baseVib + Math.sin(t / 2000) * 0.4 + Math.random() * 0.2).toFixed(2)),
        courant:   parseFloat((baseCou + Math.sin(t / 3000) * 2 + Math.random() * 0.5).toFixed(1)),
        rpm:       Math.round(baseRpm + Math.sin(t / 4000) * 80 + Math.random() * 30),
        isLive: false,
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, [isConnected, machine.id]);

  const vibPct   = Math.min(100, (live.vibration / 5) * 100);
  const couPct   = Math.min(100, (live.courant / 30) * 100);
  const rpmPct   = Math.min(100, (live.rpm / 4000) * 100);

  return (
    <div className="md-page">

      {/* Back */}
      <button onClick={onBack} className="md-back-btn">
        <ArrowLeft size={16} /> Retour aux machines
      </button>

      {/* Machine header card */}
      <div className="md-header-card">
        <div className="md-icon-box">
          {machine.icon === 'gear' ? <Settings size={26} color="#94a3b8" /> : <Wrench size={26} color="#94a3b8" />}
        </div>

        <div className="md-info">
          <div className="md-machine-name">{machine.name}</div>
          <div className="md-machine-model">{machine.model}</div>
          <div className="md-tags">
            {sensorTag(machine.node, '#22c55e')}
            {sensorTag(machine.ip, '#a855f7')}
            {sensorTag(machine.chipModel, '#3b82f6')}
            <span className="md-tag-muted">{machine.machId}</span>
          </div>
        </div>

        <div className="md-side">
          <span className="md-status-badge" style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.color }}>
            <span className="md-status-dot" style={{ background: st.color }} />
            {machine.status}
          </span>
          <span className="md-sante" style={{ color: santeColor(machine.sante) }}>
            {machine.sante}% santé
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="md-tabs">
        {getTabs(machine.id).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`md-tab-btn${activeTab === tab ? ' active' : ''}`}
          >
            {tabIcon[tab]} {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Capteurs' && (
        <div className="md-capteurs-grid">
          <div className="md-card">
            <div className="md-card-title-row">
              <Activity size={16} color="#3b82f6" />
              <span className="md-card-title">Mesures en Temps Réel</span>
              <span className={`md-live-badge ${live.isLive ? 'live' : 'sim'}`}>
                {live.isLive ? '● LIVE' : '◎ SIMULATION'}
              </span>
            </div>

            {/* Vibration */}
            <div className="md-metric">
              <div className="md-metric-row">
                <div className="md-metric-left">
                  <span className="md-metric-label">Vibration</span>
                  {sensorTag('ADXL345', '#3b82f6')}
                  {sensorTag('GPIO21/22 I2C', '#06b6d4')}
                </div>
                <span className="md-metric-value" style={{ color: '#3b82f6' }}>{live.vibration}</span>
              </div>
              <div className="md-bar-bg">
                <div className="md-bar-fill md-bar-vib" style={{ width: `${vibPct}%` }} />
              </div>
            </div>

            {/* Courant */}
            <div className="md-metric">
              <div className="md-metric-row">
                <div className="md-metric-left">
                  <span className="md-metric-label">Courant électrique</span>
                  {sensorTag('SCT-013', '#f97316')}
                  {sensorTag('GPIO34 ADC', '#a855f7')}
                </div>
                <span className="md-metric-value" style={{ color: '#f97316' }}>{live.courant}</span>
              </div>
              <div className="md-bar-bg">
                <div className="md-bar-fill md-bar-cou" style={{ width: `${couPct}%` }} />
              </div>
            </div>

            {/* RPM */}
            <div className="md-metric" style={{ marginBottom: 24 }}>
              <div className="md-metric-row">
                <div className="md-metric-left">
                  <span className="md-metric-label">Vitesse rotation</span>
                  {sensorTag('Hall Sensor', '#22c55e')}
                  {sensorTag('GPIO35', '#06b6d4')}
                </div>
                <span className="md-metric-value" style={{ color: '#22c55e' }}>{live.rpm}</span>
              </div>
              <div className="md-bar-bg">
                <div className="md-bar-fill md-bar-rpm" style={{ width: `${rpmPct}%` }} />
              </div>
            </div>

            {/* LEDs */}
            <div className="md-leds">
              {[
                { label: 'D12 GREEN', color: '#22c55e', on: true },
                { label: 'D14 YEL',   color: '#fbbf24', on: false },
                { label: 'D27 RED',   color: '#ef4444', on: false },
                { label: 'D26 BLK',   color: '#475569', on: false },
              ].map(led => (
                <div key={led.label} className="md-led-item">
                  <div className="md-led-dot" style={{
                    background: led.on ? led.color : 'rgba(255,255,255,0.08)',
                    boxShadow: led.on ? `0 0 8px ${led.color}` : 'none',
                  }} />
                  <span className="md-led-label">{led.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Fonctions' && machine.fonctions && (
        <div>
          <div className="md-fonctions-title-row">
            <span style={{ fontSize: 16 }}>⚡</span>
            <span className="md-fonctions-title">Fonctions de la Machine</span>
          </div>
          <div className="md-fonctions-list">
            {machine.fonctions.map((f, i) => (
              <div key={i} className="md-fonction-card">
                <div className="md-fonction-title">▸ {f.title}</div>
                <div className="md-fonction-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'Pièces' && <PiecesTab machineId={machine.id} />}
      {activeTab === 'Maintenance' && <MaintenanceTab machineId={machine.id} />}

      {activeTab !== 'Capteurs' && activeTab !== 'Fonctions' && activeTab !== 'Pièces' && activeTab !== 'Maintenance' && (
        <div className="md-soon-card">
          <div className="md-soon-icon">{tabIcon[activeTab]}</div>
          <div className="md-soon-title">Section {activeTab}</div>
          <div className="md-soon-sub">Bientôt disponible</div>
        </div>
      )}
    </div>
  );
};

export default MachineDetail;