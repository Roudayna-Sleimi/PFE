import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";

const BASE_URL = "http://localhost:5000";

// ─── Types ───────────────────────────────────────────────
interface Sensor {
  node: string; courant: number;
  vibX: number; vibY: number; vibZ: number;
  rpm: number; pression?: number; createdAt: string;
}
interface Task {
  _id: string; titre: string; description: string;
  priorite: string; statut: string; deadline: string | null; assigneA: string;
}
interface Message {
  _id: string; from: string; fromRole: string;
  to: string; text: string; createdAt: string;
}
interface Piece {
  _id: string; nom: string; machine: string;
  quantite: number; prix: number;
  status: 'Terminé' | 'En cours' | 'Contrôle';
  matiere: boolean;
}
interface Pointage {
  date: string;         // YYYY-MM-DD
  heureEntree: string;  // HH:MM
  heureSortie?: string;
  machine: string;
  piecesProduites: number;
}

// ─── Helpers ─────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10);
const nowTime  = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const diffHeures = (debut: string, fin: string): string => {
  const [h1, m1] = debut.split(':').map(Number);
  const [h2, m2] = fin.split(':').map(Number);
  const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (diff <= 0) return '0h 00min';
  return `${Math.floor(diff / 60)}h ${String(diff % 60).padStart(2, '0')}min`;
};

// ─── Machines par employé ────────────────────────────────
// Chaque employé est lié à une ou plusieurs machines par leur nom
const MACHINES_PAR_EMPLOYE: Record<string, string[]> = {
  'Ali Ben Salem':    ['Rectifieuse de Surface'],
  'Mohamed Triki':    ['Agie Cut Classic'],
  'Sami Gharbi':      ['Rectifieuse de Surface', 'Compresseur ABAC FORMULA 7.5'],
  'Youssef Mrad':     ['Agie Drill'],
  'Karim Nasri':      ['HAAS CNC Milling Machine', 'Tour CNC MAZAK'],
};

const LIVE_MACHINES_NODES: Record<string, string> = {
  'Rectifieuse de Surface':        'ESP32-NODE-03',
  'Compresseur ABAC FORMULA 7.5':  'compresseur',
};

interface PieceTracking {
  _id: string;
  nom: string;
  currentMachine?: string | null;
  machineChain?: string[];
  status: string;
}

const EmployePage: React.FC = () => {
  const navigate  = useNavigate();
  const token     = localStorage.getItem("token") || "";
  const username  = localStorage.getItem("username") || "";
  const socketRef = useRef<Socket | null>(null);

  const [tab, setTab]             = useState<"machines" | "pieces" | "pointage" | "taches" | "messages">("machines");
  const [rectData, setRectData]   = useState<Sensor | null>(null);
  const [compData, setCompData]   = useState<Sensor | null>(null);
  const [tasks, setTasks]         = useState<Task[]>([]);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [pieces, setPieces]       = useState<Piece[]>([]);
  const [msgText, setMsgText]     = useState("");
  const [unreadMsg, setUnreadMsg] = useState(0);
  const [assignedMachine, setAssignedMachine] = useState('Rectifieuse');
  const [machineStatus, setMachineStatus] = useState<'started'|'paused'|'stopped'>('stopped');
  const [currentActivity, setCurrentActivity] = useState('');
  const [machinePieces, setMachinePieces] = useState<PieceTracking[]>([]);
  const [pieceCounts, setPieceCounts] = useState<Record<string, string>>({});
  const msgEndRef = useRef<HTMLDivElement>(null);

  // Pointage
  const [initialPointage] = useState(() => {
    const empty = {
      historique: [] as Pointage[],
      today: null as Pointage | null,
      machine: "",
      piecesProduites: 0,
      enTravail: false,
    };

    const saved = localStorage.getItem(`pointage_${username}`);
    if (!saved) return empty;

    try {
      const parsed: Pointage[] = JSON.parse(saved);
      const today = parsed.find(p => p.date === todayStr()) ?? null;
      const enTravail = Boolean(today && !today.heureSortie);
      return {
        historique: parsed,
        today: enTravail ? today : null,
        machine: enTravail && today ? today.machine : "",
        piecesProduites: enTravail && today ? today.piecesProduites : 0,
        enTravail,
      };
    } catch {
      return empty;
    }
  });

  const [pointageAujourdhui, setPointageAujourdhui] = useState<Pointage | null>(initialPointage.today);
  const [historique, setHistorique]                 = useState<Pointage[]>(initialPointage.historique);
  const [machineSelectee, setMachineSelectee]       = useState(initialPointage.machine);
  const [piecesProduites, setPiecesProduites]       = useState(initialPointage.piecesProduites);
  const [enTravail, setEnTravail]                   = useState(initialPointage.enTravail);

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // Machines de cet employé
  const mesMachines = MACHINES_PAR_EMPLOYE[username] || [];

  // ── Init ──
  useEffect(() => {
    // Sensors history
    fetch(`${BASE_URL}/api/employe/me/dashboard`, { headers })
      .then(r => r.json())
      .then((data: { machine?: string; user?: { machineStatus?: 'started'|'paused'|'stopped'; currentActivity?: string }; pieces?: PieceTracking[] }) => {
        if (data?.machine) setAssignedMachine(data.machine);
        if (data?.user?.machineStatus) setMachineStatus(data.user.machineStatus);
        if (typeof data?.user?.currentActivity === 'string') setCurrentActivity(data.user.currentActivity);
        if (Array.isArray(data?.pieces)) setMachinePieces(data.pieces);
      })
      .catch(() => {});

    fetch(`${BASE_URL}/api/sensors/history`, { headers })
      .then(r => r.json())
      .then((data: Sensor[]) => {
        const rect = [...data].reverse().find(s => s.node !== 'compresseur');
        const comp = [...data].reverse().find(s => s.node === 'compresseur');
        if (rect) setRectData(rect);
        if (comp) setCompData(comp);
      }).catch(() => {});

    // Tasks
    fetch(`${BASE_URL}/api/tasks`, { headers })
      .then(r => r.json()).then(setTasks).catch(() => {});

    // Messages
    fetch(`${BASE_URL}/api/messages/admin`, { headers })
      .then(r => r.json()).then(setMessages).catch(() => {});

    // Pièces de ses machines
    fetch(`${BASE_URL}/api/pieces`, { headers })
      .then(r => r.json())
      .then((data: Piece[]) => {
        if (Array.isArray(data)) {
          const miennes = data.filter(p => mesMachines.includes(p.machine));
          setPieces(miennes);
        }
      }).catch(() => {});

  }, []);

  // ── Socket ──
  useEffect(() => {
    const socket = io(BASE_URL, { transports: ["websocket"] });
    socketRef.current = socket;
    socket.emit("user-online", { username, role: "employe" });

    socket.on("sensor-data", (data: Sensor) => {
      if (data.node === 'compresseur') setCompData(data);
      else setRectData(data);
    });

    socket.on("alert", (data: { severity: string; message: string; node: string }) => {
      const alertDiv = document.createElement('div');
      alertDiv.style.cssText = `
        position:fixed;top:80px;right:24px;z-index:9999;
        padding:16px 20px;border-radius:12px;font-size:13px;font-weight:600;
        color:white;max-width:350px;cursor:pointer;
        background:${data.severity === 'critical' ? '#ef4444' : '#f59e0b'};
        box-shadow:0 8px 24px rgba(0,0,0,0.3);
        border-left:4px solid ${data.severity === 'critical' ? '#b91c1c' : '#d97706'};
      `;
      alertDiv.innerHTML = `
        <div>${data.severity === 'critical' ? '🚨 CRITIQUE' : '⚠️ ATTENTION'}</div>
        <div style="font-weight:400;opacity:.9;margin-top:4px">${data.message}</div>
      `;
      alertDiv.onclick = () => alertDiv.remove();
      document.body.appendChild(alertDiv);
      setTimeout(() => alertDiv.remove(), 8000);
    });

    socket.on("nouvelle-task", (data: Task) => {
      if (data.assigneA === username) setTasks(prev => [data, ...prev]);
    });
    socket.on("task-updated", (data: Task) => {
      setTasks(prev => prev.map(t => t._id === data._id ? data : t));
    });
    socket.on("direct-message", (data: Message) => {
      setMessages(prev => [...prev, data]);
      if (tab !== 'messages') setUnreadMsg(prev => prev + 1);
    });

    socket.on('employee-machine-updated', (payload: { username: string; machineStatus?: 'started'|'paused'|'stopped'; currentActivity?: string; machine?: string }) => {
      if (payload.username !== username) return;
      if (payload.machineStatus) setMachineStatus(payload.machineStatus);
      if (payload.currentActivity !== undefined) setCurrentActivity(payload.currentActivity);
      if (payload.machine) setAssignedMachine(payload.machine);
    });

    socket.on('piece-progressed', (piece: PieceTracking) => {
      if (piece.currentMachine && piece.currentMachine !== assignedMachine) return;
      setMachinePieces(prev => {
        const idx = prev.findIndex(p => p._id === piece._id);
        if (idx === -1) return [piece, ...prev];
        const next = [...prev];
        next[idx] = piece;
        return next;
      });
    });

    return () => { socket.disconnect(); };
  }, [assignedMachine, tab, username]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Pointage ──
  const pointer = (type: 'entree' | 'sortie') => {
    if (type === 'entree') {
      if (!machineSelectee) return alert('Choisissez une machine');
      const nouveau: Pointage = {
        date: todayStr(), heureEntree: nowTime(), machine: machineSelectee, piecesProduites: 0,
      };
      setPointageAujourdhui(nouveau);
      setEnTravail(true);
      const updated = [...historique.filter(p => p.date !== todayStr()), nouveau];
      setHistorique(updated);
      localStorage.setItem(`pointage_${username}`, JSON.stringify(updated));
    } else {
      if (!pointageAujourdhui) return;
      const updated_p: Pointage = { ...pointageAujourdhui, heureSortie: nowTime(), piecesProduites };
      setPointageAujourdhui(updated_p);
      setEnTravail(false);
      const updated = historique.map(p => p.date === todayStr() ? updated_p : p);
      setHistorique(updated);
      localStorage.setItem(`pointage_${username}`, JSON.stringify(updated));
    }
  };

  const updateTask = async (id: string, statut: string) => {
    const res = await fetch(`${BASE_URL}/api/tasks/${id}`, {
      method: "PATCH", headers, body: JSON.stringify({ statut }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTasks(prev => prev.map(t => t._id === id ? updated : t));
    }
  };

  const sendMessage = () => {
    if (!msgText.trim()) return;
    socketRef.current?.emit("send-direct-message", {
      from: username, fromRole: "employe", to: "admin", text: msgText.trim(),
    });
    setMsgText("");
  };

  const updateMachineAction = async (action: 'started'|'paused'|'stopped', opts?: { pieceId?: string; pieceCount?: number }) => {
    const activity = action === 'started' ? 'Production en cours' : action === 'paused' ? 'Pause operateur' : 'Cycle termine';
    if (action === 'stopped' && (!opts?.pieceId || !opts?.pieceCount || opts.pieceCount <= 0)) {
      alert('Le nombre de pieces est obligatoire pour Terminer.');
      return;
    }
    const res = await fetch(`${BASE_URL}/api/employe/machine/action`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, activity, pieceId: opts?.pieceId || null, pieceCount: opts?.pieceCount || null }),
    });
    if (!res.ok) return;
    const data: { machineStatus?: 'started'|'paused'|'stopped'; currentActivity?: string } = await res.json();
    if (data.machineStatus) setMachineStatus(data.machineStatus);
    if (typeof data.currentActivity === 'string') setCurrentActivity(data.currentActivity);
  };

  const terminerPiece = async (pieceId: string) => {
    const count = Number(pieceCounts[pieceId] || 0);
    await updateMachineAction('stopped', { pieceId, pieceCount: count });
  };

  const santeRect = rectData ? parseFloat(Math.max(0, Math.min(100, 100 - (rectData.vibX + rectData.vibY + rectData.vibZ) * 5)).toFixed(0)) : 0;
  const santeComp = compData ? parseFloat(Math.max(0, Math.min(100, 100 - (compData.vibX + compData.vibY + compData.vibZ) * 5)).toFixed(0)) : 0;

  const navItems = [
    { key: "machines" as const, icon: "🏭", label: "Mes Machines" },
    { key: "pieces"   as const, icon: "⚙️", label: "Mes Pièces" },
    { key: "pointage" as const, icon: "🕐", label: "Pointage" },
    { key: "taches"   as const, icon: "✅", label: "Mes Tâches" },
    { key: "messages" as const, icon: "💬", label: "Messages", badge: unreadMsg },
  ];

  const s = (color: string) => ({ color, fontWeight: 700 });

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:"#0a0e27", color:"white", fontFamily:"sans-serif" }}>

      {/* ── MAIN ── */}
      <main style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <header style={{ background:"#0f172a", padding:"0 24px", height:60, display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #1e293b", flexShrink:0 }}>
          <span style={{ fontSize:16, fontWeight:700 }}>
            {tab==="machines" ? "🏭 Mes Machines" : tab==="pieces" ? "⚙️ Mes Pièces" : tab==="pointage" ? "🕐 Pointage" : tab==="taches" ? "✅ Mes Tâches" : "💬 Messages"}
          </span>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ fontSize:12, color:"#475569" }}>Bonjour, {username}</div>
            <button
              onClick={() => { localStorage.clear(); navigate("/"); }}
              title="Déconnexion"
              style={{ height:34, padding:"0 12px", borderRadius:10, background:"transparent", border:"1px solid #1e293b", color:"#f87171", cursor:"pointer", fontSize:12, fontWeight:700 }}
            >
              🚪
            </button>
          </div>
        </header>

        <div style={{ background:"#0f172a", borderBottom:"1px solid #1e293b", padding:"10px 16px", display:"flex", gap:8, overflowX:"auto", flexShrink:0 }}>
          {navItems.map(item => (
            <button
              key={item.key}
              onClick={() => { setTab(item.key); if (item.key === 'messages') setUnreadMsg(0); }}
              style={{
                display:"flex",
                alignItems:"center",
                gap:8,
                padding:"8px 12px",
                borderRadius:999,
                border:"1px solid #1e293b",
                cursor:"pointer",
                fontSize:12,
                fontWeight:700,
                background: tab===item.key ? "linear-gradient(135deg,rgba(0,102,255,0.22),rgba(0,212,255,0.18))" : "#0a1228",
                color: tab===item.key ? "#00d4ff" : "#94a3b8",
                whiteSpace:"nowrap",
              }}
            >
              <span style={{ fontSize:14 }}>{item.icon}</span>
              <span>{item.label}</span>
              {'badge' in item && (item as { badge: number }).badge > 0 && (
                <span style={{ marginLeft:2, background:"#ef4444", borderRadius:"50%", width:18, height:18, fontSize:10, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", color:"white" }}>
                  {(item as { badge: number }).badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:24 }}>

          {/* ══ MES MACHINES ══ */}
          {tab === "machines" && (
            <div style={{ maxWidth:800 }}>
              {mesMachines.length === 0 && (
                <div style={{ textAlign:"center", color:"#475569", padding:"60px 0" }}>Aucune machine assignée à votre compte.</div>
              )}

              {mesMachines.length > 0 && (
                <div style={{ background: "#0f172a", borderRadius: 16, padding: 18, marginBottom: 16, border: "1px solid #1e293b" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "white" }}>Machine assignee: {assignedMachine}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>
                        Statut: <span style={{ color: machineStatus === "started" ? "#22c55e" : machineStatus === "paused" ? "#f59e0b" : "#ef4444", fontWeight: 700 }}>
                          {machineStatus === "started" ? "Demarree" : machineStatus === "paused" ? "En pause" : "Arretee"}
                        </span> · {currentActivity || "Aucune activite"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => updateMachineAction('started')} style={{ background: "#166534", color: "white", border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontWeight: 600 }}>Demarrer</button>
                      <button onClick={() => updateMachineAction('paused')} style={{ background: "#92400e", color: "white", border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontWeight: 600 }}>Pause</button>
                      <span style={{ fontSize: 11, color: "#94a3b8", alignSelf: "center" }}>Terminer se fait par piece avec quantite ci-dessous.</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Pieces associees a cette machine</div>
                    {machinePieces.length === 0 ? (
                      <div style={{ fontSize: 12, color: "#475569" }}>Aucune piece active.</div>
                    ) : (
                      machinePieces.map((piece) => (
                        <div key={piece._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1px solid #1e293b" }}>
                          <div style={{ fontSize: 13, color: "white" }}>
                            {piece.nom} <span style={{ color: "#64748b", fontSize: 11 }}>({piece.status})</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input
                              type="number"
                              min={1}
                              placeholder="Nb"
                              value={pieceCounts[piece._id] || ""}
                              onChange={(e) => setPieceCounts((prev) => ({ ...prev, [piece._id]: e.target.value }))}
                              style={{ width: 70, background: "#1e293b", color: "white", border: "1px solid #334155", borderRadius: 6, padding: "5px 8px", fontSize: 12 }}
                            />
                            <button onClick={() => terminerPiece(piece._id)} style={{ background: "#991b1b", color: "white", border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>
                              Terminer
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
              {mesMachines.map(machineName => {
                const isRect = machineName.includes('Rectifieuse');
                const isComp = machineName.includes('Compresseur');
                const data   = isRect ? rectData : isComp ? compData : null;
                const sante  = isRect ? santeRect : isComp ? santeComp : 80;
                const hasLive = isRect || isComp;
                return (
                  <div key={machineName} style={{ background:"#0f172a", borderRadius:16, padding:20, marginBottom:16, border:`1px solid ${data ? "#22c55e44" : "#1e293b"}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                      <div>
                        <h3 style={{ margin:0, fontSize:15, fontWeight:700 }}>
                          {isComp ? '🔧' : '⚙️'} {machineName}
                        </h3>
                        <span style={{ fontSize:11, color:"#475569" }}>
                          {LIVE_MACHINES_NODES[machineName] || '—'}
                        </span>
                      </div>
                      <span style={{ padding:"4px 12px", borderRadius:20, fontSize:11, fontWeight:700, background: hasLive && data ? "#14532d" : "#1e293b", color: hasLive && data ? "#4ade80" : "#475569", border:`1px solid ${hasLive && data ? "#22c55e44" : "#334155"}` }}>
                        {hasLive ? (data ? "✅ EN MARCHE" : "⭕ ARRÊT") : "📋 FONCTIONNEL"}
                      </span>
                    </div>

                    {hasLive && (
                      <>
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12, marginBottom:12 }}>
                          {[
                            { label:"Courant",    value:`${data?.courant?.toFixed(1) ?? 0} A`,   color:(data?.courant??0)>15 ? "#ef4444":"#22c55e", alert:(data?.courant??0)>15 },
                            { label:"Vibration",  value:`${data?.vibX?.toFixed(2) ?? 0} g`,      color:(data?.vibX??0)>2 ? "#f97316":"#3b82f6",     alert:(data?.vibX??0)>2 },
                            isComp
                              ? { label:"Pression",   value:`${data?.pression?.toFixed(1) ?? 0} bar`, color:"#06b6d4", alert:false }
                              : { label:"RPM",        value:`${data?.rpm ?? 0}`,                       color:"#a855f7", alert:false },
                          ].map(s => (
                            <div key={s.label} style={{ background:"#1e293b", borderRadius:10, padding:"14px 10px", textAlign:"center", border:s.alert?"1px solid rgba(239,68,68,0.3)":"1px solid #334155" }}>
                              <p style={{ margin:0, fontSize:22, fontWeight:700, color:s.color }}>{s.value}</p>
                              <p style={{ margin:"5px 0 0", fontSize:11, color:"#64748b" }}>{s.label}</p>
                            </div>
                          ))}
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ flex:1, background:"#1e293b", borderRadius:999, height:6 }}>
                            <div style={{ height:6, borderRadius:999, width:`${sante}%`, background:sante>70?"#22c55e":sante>40?"#f97316":"#ef4444", transition:"width 0.5s" }} />
                          </div>
                          <span style={{ fontSize:12, fontWeight:700, color:"#94a3b8", whiteSpace:"nowrap" }}>Santé {sante.toFixed(0)}%</span>
                        </div>
                      </>
                    )}

                    {!hasLive && (
                      <div style={{ background:"#1e293b", borderRadius:10, padding:"14px 16px", color:"#64748b", fontSize:13 }}>
                        Cette machine n'est pas équipée de capteurs temps réel. Consultez l'onglet Pièces pour son activité.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ══ MES PIÈCES ══ */}
          {tab === "pieces" && (
            <div style={{ maxWidth:800 }}>
              <p style={{ color:"#475569", fontSize:13, marginBottom:20 }}>{pieces.length} pièce(s) sur vos machines</p>
              {pieces.length === 0 && <div style={{ textAlign:"center", color:"#475569", padding:"60px 0" }}>Aucune pièce trouvée</div>}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                {pieces.map(piece => {
                  const colors = { 'Terminé':'#22c55e', 'En cours':'#3b82f6', 'Contrôle':'#f59e0b' };
                  const color  = colors[piece.status];
                  return (
                    <div key={piece._id} style={{ background:"#0f172a", borderRadius:14, padding:16, border:`1px solid #1e293b`, borderLeft:`4px solid ${color}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                        <div style={{ fontWeight:700, fontSize:14 }}>{piece.nom}</div>
                        <span style={{ padding:"2px 8px", borderRadius:6, fontSize:10, fontWeight:700, background:`${color}22`, color }}>{piece.status}</span>
                      </div>
                      <div style={{ fontSize:11, color:"#475569", marginBottom:10 }}>🏭 {piece.machine}</div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                        <div style={{ background:"#1e293b", borderRadius:8, padding:"10px 8px", textAlign:"center" }}>
                          <div style={{ fontSize:22, ...s("#3b82f6") }}>{piece.quantite}</div>
                          <div style={{ fontSize:10, color:"#64748b" }}>pcs</div>
                        </div>
                        <div style={{ background:"#1e293b", borderRadius:8, padding:"10px 8px", textAlign:"center" }}>
                          <div style={{ fontSize:16,  ...s("#22c55e") }}>{(piece.quantite * piece.prix).toLocaleString()} DT</div>
                          <div style={{ fontSize:10, color:"#64748b" }}>valeur</div>
                        </div>
                      </div>
                      {!piece.matiere && <div style={{ marginTop:8, fontSize:11, color:"#ef4444" }}>⚠️ Matière manquante</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══ POINTAGE ══ */}
          {tab === "pointage" && (
            <div style={{ maxWidth:600 }}>
              <h3 style={{ fontSize:16, fontWeight:700, marginBottom:20 }}>🕐 Pointage du jour — {new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })}</h3>

              {/* Carte entrée/sortie */}
              <div style={{ background:"#0f172a", borderRadius:16, padding:24, border:"1px solid #1e293b", marginBottom:20 }}>
                {!enTravail ? (
                  <>
                    <p style={{ color:"#64748b", fontSize:13, marginBottom:16 }}>Sélectionnez votre machine et pointez votre entrée :</p>
                    <select
                      value={machineSelectee}
                      onChange={e => setMachineSelectee(e.target.value)}
                      title="Machine de travail"
                      style={{ width:"100%", background:"#1e293b", border:"1px solid #334155", borderRadius:8, padding:"10px 14px", color:"white", fontSize:13, marginBottom:14, outline:"none" }}>
                      <option value="">Choisir une machine</option>
                      {mesMachines.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <button onClick={() => pointer('entree')}
                      style={{ width:"100%", padding:"12px", borderRadius:10, border:"none", cursor:"pointer", background:"linear-gradient(135deg,#22c55e,#16a34a)", color:"white", fontSize:14, fontWeight:700 }}>
                      ▶ Pointer l'entrée — {nowTime()}
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
                      <span style={{ width:10, height:10, borderRadius:"50%", background:"#22c55e", display:"inline-block" }} />
                      <span style={{ fontSize:13, color:"#22c55e", fontWeight:700 }}>En service sur : {machineSelectee}</span>
                    </div>
                    <div style={{ background:"#1e293b", borderRadius:10, padding:"12px 16px", marginBottom:16, fontSize:13, color:"#94a3b8" }}>
                      ⏰ Entrée à <strong style={{ color:"white" }}>{pointageAujourdhui?.heureEntree}</strong>
                      {' — '}Durée en cours : <strong style={{ color:"#00d4ff" }}>{diffHeures(pointageAujourdhui?.heureEntree || '00:00', nowTime())}</strong>
                    </div>
                    <div style={{ marginBottom:14 }}>
                      <label style={{ fontSize:12, color:"#64748b", display:"block", marginBottom:6 }}>Nombre de pièces produites aujourd'hui :</label>
                      <input type="number" min={0}  title="Nombre de pièces produites"
  placeholder="0" value={piecesProduites}                        onChange={e => setPiecesProduites(Number(e.target.value))}
                        style={{ width:"100%", background:"#1e293b", border:"1px solid #334155", borderRadius:8, padding:"10px 14px", color:"white", fontSize:13, outline:"none", boxSizing:"border-box" }} />
                    </div>
                    <button onClick={() => pointer('sortie')}
                      style={{ width:"100%", padding:"12px", borderRadius:10, border:"none", cursor:"pointer", background:"linear-gradient(135deg,#ef4444,#b91c1c)", color:"white", fontSize:14, fontWeight:700 }}>
                      ⏹ Pointer la sortie — {nowTime()}
                    </button>
                  </>
                )}
              </div>

              {/* Historique */}
              {historique.length > 0 && (
                <>
                  <h4 style={{ fontSize:14, fontWeight:700, color:"#94a3b8", marginBottom:12 }}>📋 Historique des pointages</h4>
                  {[...historique].reverse().map((p, i) => (
                    <div key={i} style={{ background:"#0f172a", borderRadius:12, padding:"14px 16px", marginBottom:10, border:"1px solid #1e293b" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                        <span style={{ fontSize:13, fontWeight:700 }}>{new Date(p.date).toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' })}</span>
                        <span style={{ fontSize:11, color:"#475569" }}>{p.machine}</span>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                        <div style={{ background:"#1e293b", borderRadius:8, padding:"8px", textAlign:"center" }}>
                          <div style={{ fontSize:15, fontWeight:700, color:"#22c55e" }}>{p.heureEntree}</div>
                          <div style={{ fontSize:10, color:"#64748b" }}>Entrée</div>
                        </div>
                        <div style={{ background:"#1e293b", borderRadius:8, padding:"8px", textAlign:"center" }}>
                          <div style={{ fontSize:15, fontWeight:700, color: p.heureSortie ? "#ef4444" : "#f59e0b" }}>{p.heureSortie || '—'}</div>
                          <div style={{ fontSize:10, color:"#64748b" }}>Sortie</div>
                        </div>
                        <div style={{ background:"#1e293b", borderRadius:8, padding:"8px", textAlign:"center" }}>
                          <div style={{ fontSize:15, fontWeight:700, color:"#00d4ff" }}>
                            {p.heureSortie ? diffHeures(p.heureEntree, p.heureSortie) : '—'}
                          </div>
                          <div style={{ fontSize:10, color:"#64748b" }}>Durée</div>
                        </div>
                      </div>
                      {p.piecesProduites > 0 && (
                        <div style={{ marginTop:8, fontSize:12, color:"#94a3b8" }}>
                          ⚙️ {p.piecesProduites} pièces produites
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ══ TÂCHES ══ */}
          {tab === "taches" && (
            <div style={{ maxWidth:800 }}>
              <p style={{ color:"#475569", fontSize:13, marginBottom:20 }}>{tasks.length} tâche(s) assignée(s)</p>
              {tasks.length === 0 && <p style={{ color:"#475569", textAlign:"center", padding:"60px 0" }}>Aucune tâche assignée</p>}
              {tasks.map(task => {
                const colors: Record<string,string>  = { "à faire":"#3b82f6", "en cours":"#f59e0b", "terminée":"#22c55e" };
                const pColors: Record<string,string> = { "haute":"#ef4444", "moyenne":"#f59e0b", "basse":"#22c55e" };
                const color  = colors[task.statut]   || "#3b82f6";
                const pColor = pColors[task.priorite] || "#f59e0b";
                return (
                  <div key={task._id} style={{ background:"#0f172a", borderRadius:14, padding:16, marginBottom:12, border:"1px solid #1e293b", borderLeft:`4px solid ${color}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8, gap:8 }}>
                      <h4 style={{ margin:0, fontSize:14, fontWeight:600, flex:1 }}>{task.titre}</h4>
                      <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                        <span style={{ padding:"2px 8px", borderRadius:6, fontSize:10, fontWeight:700, background:`${pColor}22`, color:pColor }}>{task.priorite}</span>
                        <span style={{ padding:"2px 8px", borderRadius:6, fontSize:10, fontWeight:700, background:`${color}22`, color }}>{task.statut}</span>
                      </div>
                    </div>
                    {task.description && <p style={{ margin:"0 0 10px", fontSize:12, color:"#64748b" }}>{task.description}</p>}
                    {task.deadline && <p style={{ margin:"0 0 10px", fontSize:11, color:"#475569" }}>📅 {new Date(task.deadline).toLocaleDateString('fr-FR')}</p>}
                    <div style={{ display:"flex", gap:8 }}>
                      {task.statut === "à faire" && (
                        <button onClick={() => updateTask(task._id, "en cours")}
                          style={{ background:"#1e40af", color:"white", border:"none", padding:"7px 16px", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:600 }}>
                          ▶ Commencer
                        </button>
                      )}
                      {task.statut === "en cours" && (
                        <button onClick={() => updateTask(task._id, "terminée")}
                          style={{ background:"#14532d", color:"#4ade80", border:"1px solid #22c55e44", padding:"7px 16px", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:600 }}>
                          ✅ Terminer
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ══ MESSAGES ══ */}
          {tab === "messages" && (
            <div style={{ maxWidth:800, display:"flex", flexDirection:"column", height:"calc(100vh - 160px)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", background:"#0f172a", borderRadius:"14px 14px 0 0", border:"1px solid #1e293b", borderBottom:"none" }}>
                <div style={{ width:38, height:38, borderRadius:"50%", background:"linear-gradient(135deg,#0066ff,#00d4ff)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:700 }}>A</div>
                <div>
                  <div style={{ fontSize:14, fontWeight:700 }}>Admin</div>
                  <div style={{ fontSize:11, color:"#22c55e" }}>● En ligne</div>
                </div>
              </div>
              <div style={{ flex:1, overflowY:"auto", background:"#080d1a", padding:"16px", border:"1px solid #1e293b", borderTop:"none", borderBottom:"none" }}>
                {messages.length === 0 && (
                  <div style={{ textAlign:"center", color:"#334155", marginTop:60 }}>
                    <div style={{ fontSize:40, marginBottom:12 }}>💬</div>
                    <div style={{ fontSize:14 }}>Aucun message — Commencez la conversation</div>
                  </div>
                )}
                {messages.map((msg, i) => {
                  const isMe = msg.from === username;
                  return (
                    <div key={i} style={{ display:"flex", justifyContent:isMe?"flex-end":"flex-start", marginBottom:8, gap:8, alignItems:"flex-end" }}>
                      {!isMe && (
                        <div style={{ width:28, height:28, borderRadius:"50%", background:"linear-gradient(135deg,#0066ff,#00d4ff)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0 }}>A</div>
                      )}
                      <div style={{ maxWidth:"65%", display:"flex", flexDirection:"column", alignItems:isMe?"flex-end":"flex-start" }}>
                        <div style={{ padding:"10px 14px", borderRadius:isMe?"18px 18px 4px 18px":"18px 18px 18px 4px", background:isMe?"linear-gradient(135deg,#1e40af,#3b82f6)":"#1e293b", fontSize:13, lineHeight:1.5 }}>
                          {msg.text}
                        </div>
                        <div style={{ fontSize:10, color:"#334155", marginTop:3 }}>
                          {new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}
                        </div>
                      </div>
                      {isMe && (
                        <div style={{ width:28, height:28, borderRadius:"50%", background:"#334155", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0 }}>
                          {username.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={msgEndRef} />
              </div>
              <div style={{ display:"flex", gap:10, padding:"12px 14px", background:"#0f172a", borderRadius:"0 0 14px 14px", border:"1px solid #1e293b", borderTop:"1px solid #1e293b" }}>
                <input value={msgText} onChange={e => setMsgText(e.target.value)} onKeyDown={e => e.key==="Enter" && sendMessage()}
                  placeholder="Écrire un message..."
                  style={{ flex:1, background:"#1e293b", border:"1px solid #334155", borderRadius:24, padding:"10px 18px", color:"white", fontSize:13, outline:"none" }} />
                <button onClick={sendMessage}
                  style={{ width:42, height:42, borderRadius:"50%", background:"linear-gradient(135deg,#0066ff,#00d4ff)", color:"white", border:"none", cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  ➤
                </button>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default EmployePage;
