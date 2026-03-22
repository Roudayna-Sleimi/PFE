import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";

const BASE_URL = "http://localhost:5000";

interface Sensor {
  node: string;
  courant: number;
  vibX: number;
  vibY: number;
  vibZ: number;
  rpm: number;
  createdAt: string;
}

interface Task {
  _id: string;
  titre: string;
  description: string;
  priorite: string;
  statut: string;
  deadline: string | null;
  assigneA: string;
}

interface Message {
  _id: string;
  from: string;
  fromRole: string;
  to: string;
  text: string;
  createdAt: string;
}

const EmployePage: React.FC = () => {
  const navigate = useNavigate();
  const token    = localStorage.getItem("token") || "";
  const username = localStorage.getItem("username") || "";
  const socketRef = useRef<Socket | null>(null);

  const [tab, setTab]           = useState<"machines" | "taches" | "messages">("machines");
  const [sensors, setSensors]   = useState<Sensor[]>([]);
  const [tasks, setTasks]       = useState<Task[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgText, setMsgText]   = useState("");
  const msgEndRef = useRef<HTMLDivElement>(null);

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // ── Load data ──
  useEffect(() => {
    fetch(`${BASE_URL}/api/sensors/history`, { headers })
      .then(r => r.json()).then(setSensors).catch(() => {});

    fetch(`${BASE_URL}/api/tasks`, { headers })
      .then(r => r.json()).then(setTasks).catch(() => {});

    fetch(`${BASE_URL}/api/messages/admin`, { headers })
      .then(r => r.json()).then(setMessages).catch(() => {});
  }, []);

  // ── Socket.IO ──
  useEffect(() => {
    const socket = io(BASE_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.emit("user-online", { username, role: "employe" });

    socket.on("sensor-data", (data: Sensor) => {
      setSensors(prev => [...prev.slice(-49), data]);
    });

    socket.on("nouvelle-task", (data: Task) => {
      if (data.assigneA === username) {
        setTasks(prev => [data, ...prev]);
      }
    });

    socket.on("task-updated", (data: Task) => {
      setTasks(prev => prev.map(t => t._id === data._id ? data : t));
    });

    socket.on("direct-message", (data: Message) => {
      setMessages(prev => [...prev, data]);
    });

    return () => { socket.disconnect(); };
  }, []);

  // Auto scroll messages
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Update task status ──
  const updateTask = async (id: string, statut: string) => {
    await fetch(`${BASE_URL}/api/tasks/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ statut }),
    });
  };

  // ── Send message ──
  const sendMessage = () => {
    if (!msgText.trim()) return;
    socketRef.current?.emit("send-direct-message", {
      from: username,
      fromRole: "employe",
      to: "admin",
      text: msgText.trim(),
    });
    setMsgText("");
  };

  // ── Logout ──
  const logout = () => {
    localStorage.clear();
    navigate("/");
  };

  const lastSensor = sensors.length > 0 ? sensors[sensors.length - 1] : null;

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", color: "white", fontFamily: "sans-serif" }}>

      {/* Header */}
      <div style={{ background: "#1e293b", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #334155" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#3b82f6" }}>CNC Pulse</h1>
          <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Bonjour, {username}</p>
        </div>
        <button onClick={logout} style={{ background: "transparent", border: "1px solid #334155", color: "#94a3b8", padding: "6px 14px", borderRadius: 8, cursor: "pointer" }}>
          Déconnexion
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: "#1e293b", borderBottom: "1px solid #334155" }}>
        {(["machines", "taches", "messages"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: "14px", background: "transparent",
            border: "none", borderBottom: tab === t ? "2px solid #3b82f6" : "2px solid transparent",
            color: tab === t ? "#3b82f6" : "#64748b", cursor: "pointer", fontSize: 13, fontWeight: 600,
            textTransform: "capitalize"
          }}>
            {t === "machines" ? "🏭 Machines" : t === "taches" ? "✅ Mes Tâches" : "💬 Messages"}
          </button>
        ))}
      </div>

      <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>

        {/* ── Machines Tab ── */}
        {tab === "machines" && (
          <div>
            {["rectifieuse", "compresseur"].map(node => {
              const isActive = lastSensor?.node === node;
              return (
                <div key={node} style={{
                  background: "#1e293b", borderRadius: 14, padding: 20, marginBottom: 16,
                  border: `1px solid ${isActive ? "#22c55e44" : "#334155"}`
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 16, textTransform: "capitalize" }}>
                      {node === "rectifieuse" ? "Rectifieuse" : "Compresseur ABAC"}
                    </h3>
                    <span style={{
                      padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                      background: isActive ? "#14532d" : "#450a0a",
                      color: isActive ? "#4ade80" : "#f87171"
                    }}>
                      {isActive ? "EN MARCHE" : "ARRÊT"}
                    </span>
                  </div>
                  {lastSensor && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                      {[
                        { label: "Courant", value: `${lastSensor.courant ?? 0} A`, alert: (lastSensor.courant ?? 0) > 15 },
                        { label: "Vibration X", value: `${lastSensor.vibX ?? 0} g`, alert: (lastSensor.vibX ?? 0) > 2 },
                        { label: "RPM", value: `${lastSensor.rpm ?? 0}`, alert: false },
                      ].map(s => (
                        <div key={s.label} style={{ background: "#0f172a", borderRadius: 10, padding: "12px", textAlign: "center" }}>
                          <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: s.alert ? "#f87171" : "#3b82f6" }}>{s.value}</p>
                          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#64748b" }}>{s.label}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Tâches Tab ── */}
        {tab === "taches" && (
          <div>
            <h2 style={{ fontSize: 18, marginBottom: 16 }}>Mes Tâches ({tasks.length})</h2>
            {tasks.length === 0 && (
              <p style={{ color: "#64748b" }}>Aucune tâche assignée</p>
            )}
            {tasks.map(task => {
              const colors: Record<string, string> = {
                "à faire": "#3b82f6",
                "en cours": "#f59e0b",
                "terminée": "#22c55e",
              };
              const color = colors[task.statut] || "#3b82f6";
              return (
                <div key={task._id} style={{
                  background: "#1e293b", borderRadius: 12, padding: 16,
                  marginBottom: 12, border: "1px solid #334155"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <h4 style={{ margin: 0, fontSize: 14 }}>{task.titre}</h4>
                    <span style={{
                      padding: "3px 10px", borderRadius: 8, fontSize: 11,
                      background: `${color}22`, color
                    }}>{task.statut}</span>
                  </div>
                  {task.description && (
                    <p style={{ margin: "0 0 10px", fontSize: 12, color: "#64748b" }}>{task.description}</p>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    {task.statut === "à faire" && (
                      <button onClick={() => updateTask(task._id, "en cours")} style={{
                        background: "#1e40af", color: "white", border: "none",
                        padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12
                      }}>Commencer</button>
                    )}
                    {task.statut === "en cours" && (
                      <button onClick={() => updateTask(task._id, "terminée")} style={{
                        background: "#14532d", color: "#4ade80", border: "none",
                        padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12
                      }}>Terminer</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Messages Tab ── */}
        {tab === "messages" && (
          <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 220px)" }}>
            <h2 style={{ fontSize: 18, marginBottom: 16 }}>💬 Messages — Admin</h2>
            <div style={{
              flex: 1, overflowY: "auto", background: "#1e293b",
              borderRadius: 12, padding: 16, marginBottom: 12
            }}>
              {messages.length === 0 && (
                <p style={{ color: "#64748b", textAlign: "center" }}>Aucun message</p>
              )}
              {messages.map((msg, i) => {
                const isMe = msg.from === username;
                return (
                  <div key={i} style={{
                    display: "flex", justifyContent: isMe ? "flex-end" : "flex-start",
                    marginBottom: 10
                  }}>
                    <div style={{
                      maxWidth: "70%", padding: "10px 14px", borderRadius: 12,
                      background: isMe ? "#1e40af" : "#0f172a",
                      fontSize: 13
                    }}>
                      {msg.text}
                    </div>
                  </div>
                );
              })}
              <div ref={msgEndRef} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                value={msgText}
                onChange={e => setMsgText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendMessage()}
                placeholder="Écrire un message..."
                style={{
                  flex: 1, background: "#1e293b", border: "1px solid #334155",
                  borderRadius: 10, padding: "10px 14px", color: "white", fontSize: 13
                }}
              />
              <button onClick={sendMessage} style={{
                background: "#1e40af", color: "white", border: "none",
                padding: "10px 20px", borderRadius: 10, cursor: "pointer", fontSize: 13
              }}>Envoyer</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default EmployePage;