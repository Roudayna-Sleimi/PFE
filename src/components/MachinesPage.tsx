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
    <div style={{ padding: '32px 40px', color: '#e2e8f0', minHeight: '100vh' }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: '#f1f5f9' }}>Machines Industrielles</h2>
        <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 14 }}>Cliquez sur une machine pour afficher ses détails</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {MACHINES.map(m => {
          const st = statusStyle(m.status);
          return (
            <div key={m.id} onClick={() => setSelected(m)}
              style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'20px 28px', cursor:'pointer', transition:'border 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.border = '1px solid rgba(59,130,246,0.35)')}
              onMouseLeave={e => (e.currentTarget.style.border = '1px solid rgba(255,255,255,0.07)')}
            >
              <div style={{ display:'flex', alignItems:'center', gap:20 }}>
                <div style={{ width:52,height:52,borderRadius:12,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                  {m.icon==='gear' ? <Settings size={22} color="#94a3b8"/> : <Wrench size={22} color="#94a3b8"/>}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700,fontSize:17,color:'#f1f5f9',marginBottom:4 }}>{m.name}</div>
                  <div style={{ fontSize:12,color:'#64748b',marginBottom:10 }}>{m.model}</div>
                  <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
                    <span style={{ fontSize:11,padding:'3px 10px',borderRadius:6,fontWeight:600,background:'rgba(34,197,94,0.12)',border:'1px solid rgba(34,197,94,0.3)',color:'#22c55e' }}>{m.node}</span>
                    <span style={{ fontSize:11,padding:'3px 10px',borderRadius:6,fontWeight:600,background:'rgba(168,85,247,0.12)',border:'1px solid rgba(168,85,247,0.3)',color:'#a855f7' }}>{m.ip}</span>
                    {m.sensors.map(s => <span key={s} style={{ fontSize:11,padding:'3px 10px',borderRadius:6,fontWeight:600,background:(SC[s]||'#94a3b8')+'22',border:`1px solid ${(SC[s]||'#94a3b8')}55`,color:SC[s]||'#94a3b8' }}>{s}</span>)}
                  </div>
                </div>
                <div style={{ display:'flex',flexDirection:'column',alignItems:'flex-end',gap:10,flexShrink:0 }}>
                  <span style={{ fontSize:22,fontWeight:800,color:santeColor(m.sante) }}>{m.sante}%</span>
                  <span style={{ fontSize:12,fontWeight:600,padding:'4px 12px',borderRadius:20,display:'flex',alignItems:'center',gap:5,background:st.bg,border:`1px solid ${st.border}`,color:st.color }}>
                    <span style={{ width:7,height:7,borderRadius:'50%',background:st.color,display:'inline-block' }}/>{m.status}
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