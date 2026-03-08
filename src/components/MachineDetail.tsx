import React, { useState } from 'react';
import { ArrowLeft, Settings, Wrench, Wifi, Activity } from 'lucide-react';
import PiecesTab from './Piecestab';

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

const TABS = ['Capteurs', 'Fonctions', 'Pièces', 'Maintenance', 'Historique'];

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

const MachineDetail: React.FC<Props> = ({ machine, onBack }) => {
  const [activeTab, setActiveTab] = useState('Capteurs');
  const st = statusStyle(machine.status);

  const vibPct   = Math.min(100, (machine.vibration / 5) * 100);
  const couPct   = Math.min(100, (machine.courant / 30) * 100);
  const rpmPct   = Math.min(100, (machine.rpm / 4000) * 100);

  return (
    <div style={{ padding: '28px 40px', color: '#e2e8f0', minHeight: '100vh' }}>

      {/* Back */}
      <button onClick={onBack} style={{
        background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer',
        fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 24, padding: 0,
      }}>
        <ArrowLeft size={16} /> Retour aux machines
      </button>

      {/* Machine header card */}
      <div style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: '20px 28px', marginBottom: 24,
        display: 'flex', alignItems: 'center', gap: 20,
      }}>
        {/* Icon */}
        <div style={{
          width: 60, height: 60, borderRadius: 14,
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {machine.icon === 'gear' ? <Settings size={26} color="#94a3b8" /> : <Wrench size={26} color="#94a3b8" />}
        </div>

        {/* Info */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginBottom: 4 }}>
            {machine.name}
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>{machine.model}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sensorTag(machine.node, '#22c55e')}
            {sensorTag(machine.ip, '#a855f7')}
            {sensorTag(machine.chipModel, '#3b82f6')}
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, fontWeight: 700, color: '#64748b', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {machine.machId}
            </span>
          </div>
        </div>

        {/* Status + santé */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <span style={{
            fontSize: 12, fontWeight: 600, padding: '5px 14px', borderRadius: 20,
            display: 'flex', alignItems: 'center', gap: 6,
            background: st.bg, border: `1px solid ${st.border}`, color: st.color,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.color, display: 'inline-block' }} />
            {machine.status}
          </span>
          <span style={{ fontSize: 18, fontWeight: 800, color: santeColor(machine.sante) }}>
            {machine.sante}% santé
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 0 }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            background: activeTab === tab ? '#3b82f6' : 'transparent',
            border: 'none', borderRadius: '8px 8px 0 0',
            padding: '10px 20px', cursor: 'pointer',
            color: activeTab === tab ? '#fff' : '#64748b',
            fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
            transition: 'all 0.15s',
          }}>
            {tabIcon[tab]} {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Capteurs' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* Mesures en Temps Réel */}
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14, padding: '24px 28px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
              <Activity size={16} color="#3b82f6" />
              <span style={{ fontWeight: 700, fontSize: 15 }}>Mesures en Temps Réel</span>
            </div>

            {/* Vibration */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>Vibration</span>
                  {sensorTag('ADXL345', '#3b82f6')}
                  {sensorTag('GPIO21/22 I2C', '#06b6d4')}
                </div>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#3b82f6' }}>{machine.vibration}</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                <div style={{ height: '100%', width: `${vibPct}%`, background: 'linear-gradient(90deg,#3b82f6,#06b6d4)', borderRadius: 3, transition: 'width 0.5s' }} />
              </div>
            </div>

            {/* Courant */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>Courant électrique</span>
                  {sensorTag('SCT-013', '#f97316')}
                  {sensorTag('GPIO34 ADC', '#a855f7')}
                </div>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#f97316' }}>{machine.courant}</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                <div style={{ height: '100%', width: `${couPct}%`, background: 'linear-gradient(90deg,#f97316,#fbbf24)', borderRadius: 3, transition: 'width 0.5s' }} />
              </div>
            </div>

            {/* RPM */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>Vitesse rotation</span>
                  {sensorTag('Hall Sensor', '#22c55e')}
                  {sensorTag('GPIO35', '#06b6d4')}
                </div>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#22c55e' }}>{machine.rpm}</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                <div style={{ height: '100%', width: `${rpmPct}%`, background: 'linear-gradient(90deg,#22c55e,#86efac)', borderRadius: 3, transition: 'width 0.5s' }} />
              </div>
            </div>

            {/* LED indicators */}
            <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 8 }}>
              {[
                { label: 'D12 GREEN', color: '#22c55e', on: true },
                { label: 'D14 YEL',   color: '#fbbf24', on: false },
                { label: 'D27 RED',   color: '#ef4444', on: false },
                { label: 'D26 BLK',   color: '#475569', on: false },
              ].map(led => (
                <div key={led.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%',
                    background: led.on ? led.color : 'rgba(255,255,255,0.08)',
                    boxShadow: led.on ? `0 0 8px ${led.color}` : 'none',
                  }} />
                  <span style={{ fontSize: 10, color: '#475569' }}>{led.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Statut Connexion */}
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14, padding: '24px 28px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
              <Wifi size={16} color="#3b82f6" />
              <span style={{ fontWeight: 700, fontSize: 15 }}>Statut Connexion</span>
            </div>

            {[
              { label: 'Nœud',        value: machine.node,     color: '#3b82f6' },
              { label: 'Adresse IP',  value: machine.ip,       color: '#e2e8f0' },
              { label: 'Protocole',   value: machine.protocol, color: '#06b6d4' },
              { label: 'Broker MQTT', value: machine.broker,   color: '#a855f7' },
              { label: 'Latence',     value: machine.latence,  color: '#22c55e' },
              { label: 'Uptime',      value: machine.uptime,   color: '#e2e8f0' },
            ].map(row => (
              <div key={row.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>{row.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: row.color }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'Fonctions' && machine.fonctions && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <span style={{ fontWeight: 700, fontSize: 17 }}>Fonctions de la Machine</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {machine.fonctions.map((f, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 12, padding: '16px 20px',
              }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#e2e8f0', marginBottom: 4 }}>
                  ▸ {f.title}
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'Pièces' && <PiecesTab machineId={machine.id} />}

      {activeTab !== 'Capteurs' && activeTab !== 'Fonctions' && activeTab !== 'Pièces' && (
        <div style={{
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14, padding: '60px 28px', textAlign: 'center', color: '#475569',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>{tabIcon[activeTab]}</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Section {activeTab}</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Bientôt disponible</div>
        </div>
      )}
    </div>
  );
};

export default MachineDetail;