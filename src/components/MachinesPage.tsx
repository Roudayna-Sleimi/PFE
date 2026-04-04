import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X, RefreshCw, Zap, Thermometer, Activity } from 'lucide-react';
import { io } from 'socket.io-client';
import MachineDetail from './MachineDetail';

const socket = io('http://localhost:5000', { transports: ['websocket'] });

// ─── Types ───────────────────────────────────────────────
interface Probleme { severity: 'critical' | 'warning'; title: string; desc: string; time: string; }

interface Machine {
  id: string;
  name: string;
  model: string;
  type: string;
  node: string;
  ip: string;
  icon: 'gear' | 'wrench' | 'bolt' | 'drill';
  sensors: string[];
  status: 'En marche' | 'Avertissement' | 'Arrêt' | 'En maintenance';
  sante: number;
  production: number;
  objectif: number;
  efficacite: number;
  heures: number;
  temperature: number;
  courant: number;
  vibration: number;
  rpm: number;
  protocol: string;
  broker: string;
  latence: string;
  uptime: string;
  chipModel: string;
  machId: string;
  problems: Probleme[];
  fonctions?: { title: string; desc: string }[];
}

// ─── Données initiales ────────────────────────────────────
const INITIAL_MACHINES: Machine[] = [
  {
    id: 'haas-cnc', name: 'HAAS CNC Milling Machine', model: 'HAAS VF-2SS', type: 'Fraiseuse CNC',
    node: 'ESP32-NODE-01', ip: '192.168.1.101', icon: 'gear',
    sensors: ['ADXL345', 'SCT-013', 'Hall Sensor'], status: 'En marche',
    sante: 85, production: 686, objectif: 700, efficacite: 93.6, heures: 156,
    temperature: 43.5, courant: 2.7, vibration: 0.60, rpm: 3200,
    protocol: 'WiFi 2.4GHz', broker: '192.168.1.10:1883', latence: '12 ms', uptime: '14h 32min',
    chipModel: 'ESP32-WROOM-32D', machId: 'MACH-HAAS-001',
    problems: [
      { severity: 'warning', title: 'Vibration légère', desc: 'Vibration légèrement élevée sur axe Z', time: '2h' },
      { severity: 'warning', title: 'Huile à vérifier', desc: 'Niveau huile lubrification à contrôler', time: '1j' },
    ],
    fonctions: [
      { title: 'Fraisage 3 axes',      desc: 'Usinage de précision sur 3 axes simultanés ±0.005mm' },
      { title: 'Perçage haute vitesse', desc: "Perçage jusqu'à 12000 RPM avec changement automatique" },
      { title: 'Filetage CNC',          desc: 'Taraudage et filetage rigide sur pièces métalliques' },
      { title: 'Contournage',           desc: 'Usinage de contours complexes avec compensation de rayon' },
    ],
  },
  {
    id: 'agie-cut', name: 'Agie Cut Classic', model: 'AgieCharmilles CUT 20 P', type: 'Électroérosion à fil',
    node: 'ESP32-NODE-02', ip: '192.168.1.102', icon: 'bolt',
    sensors: ['ADXL345', 'DIRIS A41'], status: 'En marche',
    sante: 78, production: 458, objectif: 450, efficacite: 91.3, heures: 142,
    temperature: 45.1, courant: 6.3, vibration: 0.47, rpm: 0,
    protocol: 'WiFi 2.4GHz', broker: '192.168.1.10:1883', latence: '15 ms', uptime: '12h 10min',
    chipModel: 'ESP32-WROOM-32D', machId: 'MACH-AGIE-002',
    problems: [
      { severity: 'warning',  title: 'Fil usé',            desc: 'Remplacement du fil EDM recommandé',     time: '3h' },
      { severity: 'critical', title: 'Température élevée', desc: 'Température diélectrique > seuil (45°C)', time: '30min' },
    ],
    fonctions: [
      { title: 'Découpe fil EDM',     desc: 'Électroérosion à fil pour contours précis ±0.003mm' },
      { title: 'Découpe conique',     desc: "Découpe avec inclinaison de fil jusqu'à 30°" },
      { title: 'Rinçage automatique', desc: 'Rinçage diélectrique haute pression intégré' },
    ],
  },
  {
    id: 'rectifieuse', name: 'Rectifieuse de Surface', model: 'Surface Grinding SG-400', type: 'Rectification plane',
    node: 'ESP32-NODE-03', ip: '192.168.1.103', icon: 'gear',
    sensors: ['ADXL345', 'SCT-013', 'Hall Sensor'], status: 'En marche',
    sante: 71, production: 312, objectif: 350, efficacite: 88.4, heures: 98,
    temperature: 38.2, courant: 12.3, vibration: 1.4, rpm: 3096,
    protocol: 'WiFi 2.4GHz', broker: '192.168.1.10:1883', latence: '12 ms', uptime: '8h 45min',
    chipModel: 'ESP32-WROOM-32D', machId: 'MACH-RCT-003',
    problems: [],
    fonctions: [
      { title: 'Rectification plane',       desc: 'Surfaçage de pièces métalliques avec précision ±0.01mm' },
      { title: 'Rectification cylindrique', desc: 'Finition de surfaces cylindriques internes/externes' },
      { title: 'Dressage de meule',         desc: 'Reconditionnement automatique de la meule abrasive' },
    ],
  },
  {
    id: 'agie-drill', name: 'Agie Drill', model: 'AgieCharmilles DRILL 20', type: 'Perçage EDM',
    node: 'ESP32-NODE-04', ip: '192.168.1.104', icon: 'drill',
    sensors: ['ADXL345', 'SCT-013'], status: 'En maintenance',
    sante: 42, production: 89, objectif: 200, efficacite: 44.5, heures: 34,
    temperature: 51.8, courant: 3.1, vibration: 2.1, rpm: 0,
    protocol: 'WiFi 2.4GHz', broker: '192.168.1.10:1883', latence: '22 ms', uptime: '3h 20min',
    chipModel: 'ESP32-WROOM-32D', machId: 'MACH-DRL-004',
    problems: [
      { severity: 'critical', title: 'En maintenance', desc: 'Remplacement électrode tubulaire en cours', time: '1h' },
    ],
    fonctions: [
      { title: 'Perçage EDM rapide', desc: "Perçage électroérosion de trous jusqu'à Ø0.3mm" },
      { title: 'Perçage multi-axes', desc: 'Perçage incliné avec rotation électrode intégrée' },
    ],
  },
  {
    id: 'compresseur', name: 'Compresseur ABAC FORMULA 7.5', model: 'ABAC FORMULA 7.5 – 270L', type: 'Compresseur à vis',
    node: 'ESP32-NODE-05', ip: '192.168.1.105', icon: 'wrench',
    sensors: ['ADXL345', 'DIRIS A41', 'GY-BME280'], status: 'Avertissement',
    sante: 55, production: 0, objectif: 0, efficacite: 72.0, heures: 210,
    temperature: 68.4, courant: 18.5, vibration: 2.8, rpm: 1450,
    protocol: 'WiFi 2.4GHz', broker: '192.168.1.10:1883', latence: '18 ms', uptime: '18h 15min',
    chipModel: 'ESP32-WROOM-32D', machId: 'MACH-CMP-005',
    problems: [
      { severity: 'critical', title: 'Température critique', desc: 'Température compresseur 68°C (seuil: 65°C)', time: '10min' },
      { severity: 'warning',  title: 'Vibration élevée',    desc: 'Vibration moteur anormale détectée',         time: '2h' },
    ],
    fonctions: [
      { title: 'Compression à vis',      desc: "Compression continue de l'air par vis hélicoïdale" },
      { title: 'Régulation de pression', desc: 'Maintien automatique entre 7 et 10 bars' },
      { title: "Séchage de l'air",       desc: "Élimination de l'humidité par sécheur intégré" },
    ],
  },
  {
    id: 'tour-cnc', name: 'Tour CNC MAZAK', model: 'MAZAK QT-PRIMOS 150', type: 'Tour à commande numérique',
    node: 'ESP32-NODE-06', ip: '192.168.1.106', icon: 'gear',
    sensors: ['ADXL345', 'SCT-013', 'Hall Sensor'], status: 'En marche',
    sante: 90, production: 523, objectif: 500, efficacite: 96.2, heures: 178,
    temperature: 41.0, courant: 8.4, vibration: 0.38, rpm: 4200,
    protocol: 'WiFi 2.4GHz', broker: '192.168.1.10:1883', latence: '10 ms', uptime: '22h 05min',
    chipModel: 'ESP32-WROOM-32D', machId: 'MACH-TRN-006',
    problems: [],
    fonctions: [
      { title: 'Tournage CNC',        desc: 'Tournage de précision pièces cylindriques ±0.005mm' },
      { title: 'Filetage automatique', desc: 'Filetage intérieur/extérieur sur gamme complète' },
      { title: 'Perçage axial',        desc: 'Perçage centré haute précision sur axe de rotation' },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────
const statusConfig = {
  'En marche':      { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)',  dot: '#22c55e' },
  'Avertissement':  { color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)', dot: '#f97316' },
  'Arrêt':          { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  dot: '#ef4444' },
  'En maintenance': { color: '#a855f7', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)', dot: '#a855f7' },
};

// ─── Composant principal ──────────────────────────────────
const MachinesPage: React.FC = () => {
  const [machines, setMachines]     = useState<Machine[]>(INITIAL_MACHINES);
  const [filtre, setFiltre]         = useState<'Toutes' | 'En marche' | 'En maintenance' | 'Avertissement'>('Toutes');
  const [selected, setSelected]     = useState<Machine | null>(null);
  const [showForm, setShowForm]     = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [newMachine, setNewMachine] = useState({ name: '', type: '', model: '' });

  // ── Simulation live sensors ──
  useEffect(() => {
    const interval = setInterval(() => {
      setMachines(prev => prev.map(m => {
        if (m.status === 'En maintenance') return m;
        const newTemp = parseFloat((m.temperature + (Math.random() - 0.5) * 1.2).toFixed(1));
        const newVib  = parseFloat((m.vibration  + (Math.random() - 0.5) * 0.15).toFixed(2));
        const newCou  = parseFloat((m.courant    + (Math.random() - 0.5) * 0.3).toFixed(1));
        const newProd = m.production > 0 ? m.production + Math.floor(Math.random() * 2) : 0;
        const newEff  = parseFloat(Math.max(60, Math.min(99, m.efficacite + (Math.random() - 0.5) * 0.5)).toFixed(1));
        return {
          ...m,
          temperature: Math.max(30, Math.min(80, newTemp)),
          vibration:   Math.max(0.1, Math.min(4, newVib)),
          courant:     Math.max(0.5, Math.min(25, newCou)),
          production:  newProd,
          efficacite:  newEff,
        };
      }));
      setLastUpdate(new Date());
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // ── Socket live ──
  useEffect(() => {
    socket.on('sensor-data', (data: { node: string; courant: number; vibX: number; vibY: number; vibZ: number; rpm: number }) => {
      setMachines(prev => prev.map(m => {
        if (m.node !== data.node) return m;
        const vib = parseFloat(Math.sqrt(data.vibX**2 + data.vibY**2 + data.vibZ**2).toFixed(2));
        return { ...m, courant: data.courant, vibration: vib, rpm: data.rpm };
      }));
    });
    return () => { socket.off('sensor-data'); };
  }, []);

  const filtrees = filtre === 'Toutes' ? machines : machines.filter(m => m.status === filtre);
  const refresh  = useCallback(() => setLastUpdate(new Date()), []);

  const ajouterMachine = () => {
    if (!newMachine.name || !newMachine.type) return;
    const m: Machine = {
      id:          `machine-${Date.now()}`,
      name:        newMachine.name,
      model:       newMachine.model || 'Modèle inconnu',
      type:        newMachine.type,
      node:        `ESP32-NODE-0${machines.length + 1}`,
      ip:          `192.168.1.${110 + machines.length}`,
      icon:        'gear',
      sensors:     [],
      status:      'En marche',
      sante:       80, production: 0, objectif: 100,
      efficacite:  85, heures: 0, temperature: 35,
      courant:     5,  vibration: 0.5, rpm: 0,
      protocol:    'WiFi 2.4GHz', broker: '192.168.1.10:1883',
      latence:     '15 ms', uptime: '0h 00min',
      chipModel:   'ESP32-WROOM-32D',
      machId:      `MACH-NEW-${Date.now().toString().slice(-4)}`,
      problems:    [], fonctions: [],
    };
    setMachines(prev => [...prev, m]);
    setShowForm(false);
    setNewMachine({ name: '', type: '', model: '' });
  };

  if (selected) return <MachineDetail machine={selected} onBack={() => setSelected(null)} />;

  const totalProblemes = machines.reduce((s, m) => s + m.problems.length, 0);

  return (
    <div className="flex-1 p-6 overflow-y-auto min-w-0 w-full" style={{ background: 'transparent' }}>

      {/* Header */}
      <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Gestion des Machines</h2>
          <p className="text-sm text-slate-500">{machines.length} machines actives</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-slate-500">Mise à jour : {lastUpdate.toLocaleTimeString('fr-FR')}</span>
          <button onClick={refresh} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer border-none"
            style={{ background: 'linear-gradient(135deg,#0066ff,#00d4ff)' }}>
            <RefreshCw size={14} /> Actualiser
          </button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer border-none"
            style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}>
            <Plus size={14} /> Ajouter Machine
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {([
          { key: 'Toutes',         label: 'Toutes',             count: machines.length },
          { key: 'En marche',      label: '✅ Opérationnelles',  count: machines.filter(m => m.status === 'En marche').length },
          { key: 'En maintenance', label: '🔧 En maintenance',   count: machines.filter(m => m.status === 'En maintenance').length },
          { key: 'Avertissement',  label: '⚠️ Avec problèmes',   count: totalProblemes },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setFiltre(f.key as typeof filtre)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer border transition-all"
            style={{
              background:  filtre === f.key ? 'linear-gradient(135deg,rgba(0,102,255,0.3),rgba(0,212,255,0.3))' : 'rgba(30,41,59,0.5)',
              borderColor: filtre === f.key ? 'rgba(0,212,255,0.5)' : 'rgba(255,255,255,0.08)',
              color:       filtre === f.key ? '#00d4ff' : '#94a3b8',
            }}>
            {f.label}
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{ background: filtre === f.key ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.08)', color: filtre === f.key ? '#00d4ff' : '#64748b' }}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Grille */}
      <div className="grid grid-cols-2 gap-5">
        {filtrees.map(machine => {
          const st  = statusConfig[machine.status];
          const pct = machine.objectif > 0 ? Math.min(100, (machine.production / machine.objectif) * 100) : 0;
          return (
            <div key={machine.id} onClick={() => setSelected(machine)}
              className="rounded-xl cursor-pointer transition-all duration-300"
              style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,212,255,0.3)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)'; }}>

              <div className="p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: st.dot, boxShadow: `0 0 6px ${st.dot}` }} />
                    <span className="text-[15px] font-bold text-white">{machine.name}</span>
                  </div>
                  {machine.problems.length > 0 && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', color: '#f97316' }}>
                      ⚠️ {machine.problems.length} problème{machine.problems.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 ml-4">{machine.type}</p>
              </div>

              <div className="mx-5 my-4 h-32 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 48, opacity: 0.6 }}>
                  {machine.icon === 'gear' ? '⚙️' : machine.icon === 'bolt' ? '⚡' : machine.icon === 'drill' ? '🔩' : '🔧'}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 px-5 mb-4">
                {[
                  { label: 'Production', value: machine.objectif > 0 ? `${machine.production}` : '—', color: '#3b82f6' },
                  { label: 'Efficacité', value: `${machine.efficacite}%`,                             color: '#00d4ff' },
                  { label: 'Heures',     value: `${machine.heures}h`,                                 color: '#a855f7' },
                ].map(s => (
                  <div key={s.label} className="rounded-lg p-3 text-center"
                    style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="text-xs text-slate-500 mb-1">{s.label}</div>
                    <div className="text-[18px] font-bold" style={{ color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {machine.objectif > 0 && (
                <div className="px-5 mb-4">
                  <div className="flex justify-between text-[11px] text-slate-500 mb-1.5">
                    <span>Objectif: {machine.objectif} pcs</span>
                    <span style={{ color: pct >= 100 ? '#22c55e' : '#00d4ff' }}>{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: pct >= 100 ? '#22c55e' : 'linear-gradient(90deg,#0066ff,#00d4ff)' }} />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 px-5 pb-4 flex-wrap">
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }}>
                  ● LIVE
                </span>
                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                  <Thermometer size={11} color="#f97316" /> {machine.temperature.toFixed(1)}°C
                </span>
                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                  <Zap size={11} color="#3b82f6" /> {machine.courant.toFixed(1)}A
                </span>
                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                  <Activity size={11} color="#a855f7" /> {machine.vibration.toFixed(2)} mm/s
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Ajouter — sans node et objectif */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: '100%', maxWidth: 420, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>+ Nouvelle Machine</div>
              <button onClick={() => setShowForm(false)} aria-label="Fermer" title="Fermer"
                style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Nom de la machine *', key: 'name',  placeholder: 'ex: HAAS CNC VF-3' },
                { label: 'Type / Catégorie *',  key: 'type',  placeholder: 'ex: Fraiseuse CNC' },
                { label: 'Modèle',              key: 'model', placeholder: 'ex: HAAS VF-3SS' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>{label}</label>
                  <input placeholder={placeholder}
                    value={(newMachine as Record<string, string>)[key]}
                    onChange={e => setNewMachine(p => ({ ...p, [key]: e.target.value }))}
                    style={{ width: '100%', background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 12px', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}
              <button onClick={ajouterMachine}
                style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#0066ff,#00d4ff)', color: 'white', fontSize: 14, fontWeight: 700, marginTop: 4 }}>
                ✅ Ajouter la machine
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MachinesPage;