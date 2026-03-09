import React, { useState } from 'react';
import { Settings, Wrench, ChevronRight } from 'lucide-react';
import MachineDetail from './Machinedetail';

interface Machine {
  id: string; name: string; model: string; node: string; ip: string;
  sensors: string[]; icon: 'gear' | 'wrench'; sante: number;
  status: 'En marche' | 'Avertissement' | 'Arrêt';
  protocol: string; broker: string; latence: string; uptime: string;
  chipModel: string; machId: string; vibration: number; courant: number; rpm: number;
  fonctions?: { title: string; desc: string }[];
}

const MACHINES: Machine[] = [
  {
    id: 'rectifieuse', name: 'Rectifieuse de Surface',
    model: 'Surface Grinding Machine – Modèle SG-400',
    node: 'ESP32-NODE-01', ip: '192.168.1.101',
    sensors: ['ADXL345', 'SCT-013', 'Hall Sensor'], icon: 'gear',
    sante: 71, status: 'En marche',
    protocol: 'WiFi 2.4GHz + BT', broker: '192.168.1.10:1883',
    latence: '12 ms', uptime: '14h 32min',
    chipModel: 'ESP32-WROOM-32D', machId: 'MACH-RCT-001',
    vibration: 1.4, courant: 12.3, rpm: 3096,
    fonctions: [
      { title: 'Rectification plane', desc: 'Surfaçage de pièces métalliques avec précision ±0.01mm' },
      { title: 'Rectification cylindrique', desc: 'Finition de surfaces cylindriques internes/externes' },
      { title: 'Dressage de meule', desc: 'Reconditionnement automatique de la meule abrasive' },
      { title: 'Refroidissement liquide', desc: 'Arrosage continu pour éviter la surchauffe pièce' },
    ],
  },
  {
    id: 'compresseur', name: 'Compresseur ABAC FORMULA 7.5',
    model: 'ABAC FORMULA 7.5 – Compresseur à vis 7.5 kW / 270 L',
    node: 'ESP32-NODE-02', ip: '192.168.1.102',
    sensors: ['ADXL345', 'DIRIS A41', 'GY-BME280'], icon: 'wrench',
    sante: 55, status: 'Avertissement',
    protocol: 'WiFi 2.4GHz', broker: '192.168.1.10:1883',
    latence: '18 ms', uptime: '8h 15min',
    chipModel: 'ESP32-WROOM-32D', machId: 'MACH-CMP-002',
    vibration: 2.8, courant: 18.5, rpm: 1450,
    fonctions: [
      { title: "Compression à vis", desc: "Compression continue de l'air par vis hélicoïdale" },
      { title: 'Régulation de pression', desc: 'Maintien automatique entre 7 et 10 bars' },
      { title: "Séchage de l'air", desc: "Élimination de l'humidité par sécheur intégré" },
      { title: 'Surveillance thermique', desc: 'Protection contre la surchauffe moteur et compresseur' },
    ],
  },
];

const statusStyle = (s: Machine['status']) => {
  if (s === 'En marche')     return { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)' };
  if (s === 'Avertissement') return { color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)' };
  return { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' };
};
const santeColor = (v: number) => v >= 70 ? '#22c55e' : v >= 40 ? '#f97316' : '#ef4444';
const SC: Record<string, string> = {
  'ADXL345':'#3b82f6','SCT-013':'#06b6d4','Hall Sensor':'#a855f7',
  'DIRIS A41':'#f97316','GY-BME280':'#22c55e',
};

const MachinesPage: React.FC = () => {
  const [selected, setSelected] = useState<Machine | null>(null);
  if (selected) return <MachineDetail machine={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="machines-page">
      <div className="machines-page-header">
        <h2>Machines Industrielles</h2>
        <p>Cliquez sur une machine pour afficher ses détails</p>
      </div>
      <div className="machines-list">
        {MACHINES.map(m => {
          const st = statusStyle(m.status);
          return (
            <div key={m.id} onClick={() => setSelected(m)} className="machine-card">
              <div className="machine-card-inner">
                <div className="machine-icon-box">
                  {m.icon==='gear' ? <Settings size={22} color="#94a3b8"/> : <Wrench size={22} color="#94a3b8"/>}
                </div>
                <div className="machine-info">
                  <div className="machine-name">{m.name}</div>
                  <div className="machine-model">{m.model}</div>
                  <div className="machine-tags">
                    <span className="machine-tag machine-tag-node">{m.node}</span>
                    <span className="machine-tag machine-tag-ip">{m.ip}</span>
                    {m.sensors.map(s => (
                      <span key={s} className="machine-tag" style={{ background:(SC[s]||'#94a3b8')+'22', border:`1px solid ${(SC[s]||'#94a3b8')}55`, color:SC[s]||'#94a3b8' }}>{s}</span>
                    ))}
                  </div>
                </div>
                <div className="machine-side">
                  <span className="machine-sante" style={{ color: santeColor(m.sante) }}>{m.sante}%</span>
                  <span className="machine-status-badge" style={{ background:st.bg, border:`1px solid ${st.border}`, color:st.color }}>
                    <span className="machine-status-dot" style={{ background:st.color }}/>{m.status}
                  </span>
                </div>
                <ChevronRight size={18} color="#475569"/>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MachinesPage;