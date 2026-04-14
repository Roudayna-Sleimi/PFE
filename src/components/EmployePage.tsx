import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";

const BASE_URL = "http://localhost:5000";

interface Machine {
  id: string;
  name: string;
  model?: string;
  hasSensors?: boolean;
}

interface Tache {
  _id: string;
  titre: string;
  description?: string;
  statut: string;
  employe?: string;
}

interface Piece {
  _id: string;
  nom: string;
  machine: string;
  machineChain?: string[];
  currentMachine?: string | null;
  employe?: string;
  quantite: number;
  prix: number;
  status: string;
  matiere: boolean;
  taches?: Tache[];
}

interface Message {
  _id: string;
  from: string;
  to: string;
  text: string;
  createdAt: string;
}

interface TrackingEvent {
  type: "start" | "pause" | "resume" | "stop";
  time: Date;
  pieceCount?: number;
}

interface ProductionSession {
  machine: Machine;
  piece: Piece;
  startTime: Date;
  statut: "en_cours" | "pause" | "terminee";
  events: TrackingEvent[];
}

type Step = "pieces" | "machines" | "confirm" | "production";

const normalizeStatus = (status?: string) => {
  if (!status) return "En cours";
  if (status.includes("Termin")) return "Termine";
  if (status.includes("Contr")) return "Controle";
  return "En cours";
};

const fmt = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const cardStyle: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 14,
  padding: 18,
};

const sectionCardStyle: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(10,15,28,0.96))",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 20,
  padding: 22,
  boxShadow: "0 20px 45px rgba(2,6,23,0.35)",
};

const badge = (bg: string, color: string): React.CSSProperties => ({
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  background: bg,
  color,
  border: "1px solid rgba(148,163,184,0.18)",
});

const primaryButton: React.CSSProperties = {
  padding: "14px 18px",
  borderRadius: 12,
  border: "none",
  cursor: "pointer",
  background: "linear-gradient(135deg,#0f766e,#14b8a6)",
  color: "white",
  fontWeight: 800,
  fontSize: 14,
};

const secondaryButton: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.18)",
  cursor: "pointer",
  background: "rgba(255,255,255,0.04)",
  color: "white",
  fontWeight: 700,
  fontSize: 13,
};

const EmployePage: React.FC = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("token") || "";
  const username = localStorage.getItem("username") || "";
  const socketRef = useRef<Socket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgEndRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<"workflow" | "messages">("workflow");
  const [step, setStep] = useState<Step>("pieces");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<ProductionSession | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [count, setCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [saved, setSaved] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgText, setMsgText] = useState("");
  const [unread, setUnread] = useState(0);

  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [machinesRes, piecesRes, messagesRes] = await Promise.all([
          fetch(`${BASE_URL}/api/machines`, { headers: authHeaders }),
          fetch(`${BASE_URL}/api/pieces`, { headers: authHeaders }),
          fetch(`${BASE_URL}/api/messages/admin`, { headers: authHeaders }),
        ]);
        const [machinesData, piecesData, messagesData] = await Promise.all([machinesRes.json(), piecesRes.json(), messagesRes.json()]);
        setMachines(Array.isArray(machinesData) ? machinesData.filter((m) => !String(m.name || "").toLowerCase().includes("compresseur")) : []);
        setPieces(Array.isArray(piecesData) ? piecesData : []);
        setMessages(Array.isArray(messagesData) ? messagesData : []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const socket = io(BASE_URL, { transports: ["websocket"] });
    socketRef.current = socket;
    socket.emit("user-online", { username, role: "employe" });
    socket.on("direct-message", (data: Message) => {
      setMessages((prev) => [...prev, data]);
      if (tab !== "messages") setUnread((prev) => prev + 1);
    });
    socket.on("piece-progressed", (updatedPiece: Piece) => {
      setPieces((prev) => prev.map((piece) => (piece._id === updatedPiece._id ? { ...piece, ...updatedPiece } : piece)));
      setSelectedPiece((prev) => (prev?._id === updatedPiece._id ? { ...prev, ...updatedPiece } : prev));
    });
    return () => {
      socket.disconnect();
    };
  }, [tab, username]);

  useEffect(() => {
    if (session && !isPaused && session.statut === "en_cours") {
      timerRef.current = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session, isPaused]);

  const myPieces = useMemo(() => {
    return pieces.filter((piece) => {
      const direct = piece.employe === username;
      const viaTask = (piece.taches || []).some((task) => task.employe === username);
      return (direct || viaTask) && normalizeStatus(piece.status) !== "Termine";
    });
  }, [pieces, username]);

  const progressPct = Math.min(100, Math.round((count / Math.max(1, session?.piece.quantite ?? 1)) * 100));

  const postMachineAction = async (action: "started" | "paused" | "stopped", pieceId?: string, pieceCount?: number) => {
    try {
      await fetch(`${BASE_URL}/api/employe/machine/action`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          action,
          activity: action === "started" ? `Production: ${selectedPiece?.nom}` : action === "paused" ? "Pause operateur" : "Cycle termine",
          pieceId: pieceId || null,
          pieceCount: pieceCount || null,
          machineName: selectedMachine?.name || null,
        }),
      });
    } catch (error) {
      console.error(error);
    }
  };

  const startSession = async () => {
    if (!selectedPiece || !selectedMachine) return;
    await postMachineAction("started", selectedPiece._id);
    const now = new Date();
    setSession({ machine: selectedMachine, piece: selectedPiece, startTime: now, statut: "en_cours", events: [{ type: "start", time: now }] });
    setElapsed(0);
    setCount(0);
    setSaved(false);
    setIsPaused(false);
    setStep("production");
  };

  const togglePause = async () => {
    if (!session) return;
    const now = new Date();
    if (isPaused) {
      await postMachineAction("started", session.piece._id);
      setSession((prev) => prev ? { ...prev, statut: "en_cours", events: [...prev.events, { type: "resume", time: now }] } : prev);
      setIsPaused(false);
      return;
    }
    await postMachineAction("paused");
    setSession((prev) => prev ? { ...prev, statut: "pause", events: [...prev.events, { type: "pause", time: now }] } : prev);
    setIsPaused(true);
  };

  const stopSession = async () => {
    if (!session) return;
    const endTime = new Date();
    await postMachineAction("stopped", session.piece._id, count);
    try {
      await fetch(`${BASE_URL}/api/production/sessions`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          employee_id: username,
          machine_id: session.machine.id,
          machine_name: session.machine.name,
          piece_id: session.piece._id,
          piece_name: session.piece.nom,
          start_time: session.startTime,
          end_time: endTime,
          total_pieces: count,
          duree_secondes: elapsed,
          statut: "terminee",
          events: session.events,
        }),
      });
    } catch (error) {
      console.error(error);
    }
    setSession((prev) => prev ? { ...prev, statut: "terminee", events: [...prev.events, { type: "stop", time: endTime, pieceCount: count }] } : prev);
    setSaved(true);
  };

  const resetWorkflow = (target: Step) => {
    setStep(target);
    setSession(null);
    setElapsed(0);
    setCount(0);
    setIsPaused(false);
    setSaved(false);
    if (target === "pieces") {
      setSelectedPiece(null);
      setSelectedMachine(null);
    }
    if (target === "machines") {
      setSelectedMachine(null);
    }
  };

  const sendMessage = () => {
    if (!msgText.trim()) return;
    socketRef.current?.emit("send-direct-message", { from: username, fromRole: "employe", to: "admin", text: msgText.trim() });
    setMessages((prev) => [...prev, { _id: String(Date.now()), from: username, to: "admin", text: msgText.trim(), createdAt: new Date().toISOString() }]);
    setMsgText("");
  };

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(circle at top, #14213d 0%, #0a0f1c 42%, #050816 100%)", color: "white", fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid rgba(148,163,184,0.18)", background: "rgba(11,18,32,0.88)", backdropFilter: "blur(14px)", position: "sticky", top: 0, zIndex: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.3 }}>CNC Pulse</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Interface operateur</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={() => { setTab("workflow"); }} style={{ ...badge(tab === "workflow" ? "rgba(56,189,248,0.14)" : "rgba(255,255,255,0.06)", tab === "workflow" ? "#38bdf8" : "rgba(255,255,255,0.5)") }}>Production</button>
          <button onClick={() => { setTab("messages"); setUnread(0); }} style={{ ...badge(tab === "messages" ? "rgba(56,189,248,0.14)" : "rgba(255,255,255,0.06)", tab === "messages" ? "#38bdf8" : "rgba(255,255,255,0.5)") }}>
            Messages {unread > 0 ? `(${unread})` : ""}
          </button>
          <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>{username}</span>
          <button onClick={() => { localStorage.clear(); navigate("/"); }} style={{ ...badge("rgba(239,68,68,0.14)", "#f87171"), cursor: "pointer" }}>Quitter</button>
        </div>
      </header>

      {tab === "workflow" && (
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: 24 }}>
          <div style={{ ...sectionCardStyle, marginBottom: 18, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Production</div>
              <div style={{ color: "#94a3b8", fontSize: 14, maxWidth: 560 }}>
                Selectionnez une piece, choisissez une machine, puis demarrez la production dans une interface simple et claire.
              </div>
            </div>
            <div style={{ display: "grid", gap: 8, minWidth: 180 }}>
              <div style={{ ...badge("rgba(20,184,166,0.12)", "#5eead4"), justifySelf: "start" }}>Employe: {username}</div>
              <div style={{ ...badge("rgba(59,130,246,0.12)", "#93c5fd"), justifySelf: "start" }}>Pieces actives: {myPieces.length}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
            {["pieces", "machines", "confirm", "production"].map((item, index) => (
              <span key={item} style={{ ...badge(step === item ? "rgba(56,189,248,0.14)" : "rgba(255,255,255,0.06)", step === item ? "#38bdf8" : "rgba(255,255,255,0.35)") }}>
                {index + 1}. {item}
              </span>
            ))}
          </div>

          {step === "pieces" && (
            <div style={sectionCardStyle}>
              <h2 style={{ marginTop: 0, marginBottom: 6 }}>Liste des pieces</h2>
              <p style={{ color: "#94a3b8", marginTop: 0 }}>Choisissez une piece, puis une machine, puis lancez la production.</p>
              {loading ? <div style={cardStyle}>Chargement...</div> : myPieces.length === 0 ? <div style={cardStyle}>Aucune piece assignee pour le moment.</div> : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
                  {myPieces.map((piece) => (
                    <button key={piece._id} onClick={() => { setSelectedPiece(piece); setSelectedMachine(null); setStep("machines"); }} style={{ ...cardStyle, textAlign: "left", cursor: "pointer", color: "white", boxShadow: "0 10px 24px rgba(2,6,23,0.22)", transition: "transform 0.18s ease, border-color 0.18s ease" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                        <strong>{piece.nom}</strong>
                        <span style={badge("rgba(56,189,248,0.14)", "#38bdf8")}>{normalizeStatus(piece.status)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7 }}>
                        <div>Machine actuelle: <span style={{ color: "#38bdf8" }}>{piece.currentMachine || piece.machine}</span></div>
                        <div>Quantite: <span style={{ color: "white" }}>{piece.quantite} pcs</span></div>
                        <div>Matiere: <span style={{ color: piece.matiere ? "#34d399" : "#f87171" }}>{piece.matiere ? "Disponible" : "Manquante"}</span></div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === "machines" && selectedPiece && (
            <div style={sectionCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0 }}>Choix de la machine</h2>
                  <div style={{ color: "#94a3b8", marginTop: 6 }}>Piece selectionnee: <span style={{ color: "#34d399" }}>{selectedPiece.nom}</span></div>
                </div>
                <button onClick={() => resetWorkflow("pieces")} style={secondaryButton}>Retour aux pieces</button>
              </div>
              <div style={{ ...cardStyle, marginBottom: 16, padding: 16 }}>
                <div style={{ fontSize: 13, color: "#94a3b8" }}>
                  Toutes les machines sont visibles. La machine actuelle de la piece reste indiquee par le badge "Etape actuelle".
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 }}>
                {machines.map((machine) => (
                  <button key={machine.id} onClick={() => { setSelectedMachine(machine); setStep("confirm"); }} style={{ ...cardStyle, textAlign: "left", cursor: "pointer", color: "white", padding: 16, transition: "transform 0.18s ease, border-color 0.18s ease" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong>{machine.name}</strong>
                      {machine.name === (selectedPiece.currentMachine || selectedPiece.machine) && <span style={badge("rgba(56,189,248,0.14)", "#38bdf8")}>Etape actuelle</span>}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 13, color: "#94a3b8" }}>
                      {machine.model || "Machine disponible"}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 12, color: machine.hasSensors ? "#34d399" : "#cbd5e1" }}>
                      {machine.hasSensors ? "Capteurs actifs" : "Mode manuel"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === "confirm" && selectedPiece && selectedMachine && (
            <div style={sectionCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 12 }}>
                <h2 style={{ margin: 0 }}>Confirmation</h2>
                <button onClick={() => resetWorkflow("machines")} style={secondaryButton}>Retour machines</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div style={cardStyle}>
                  <div style={{ fontWeight: 800, marginBottom: 12 }}>Resume</div>
                  <div style={{ display: "grid", gap: 10, fontSize: 14 }}>
                    <div>Piece: <strong>{selectedPiece.nom}</strong></div>
                    <div>Machine: <strong>{selectedMachine.name}</strong></div>
                    <div>Quantite: <strong>{selectedPiece.quantite} pcs</strong></div>
                    <div>Prix: <strong>{selectedPiece.prix} DT</strong></div>
                    <div>Matiere: <strong style={{ color: selectedPiece.matiere ? "#34d399" : "#f87171" }}>{selectedPiece.matiere ? "Disponible" : "Manquante"}</strong></div>
                  </div>
                </div>
                <div style={cardStyle}>
                  <div style={{ fontWeight: 800, marginBottom: 12 }}>Instructions</div>
                  {selectedPiece.taches?.length ? selectedPiece.taches.map((task) => (
                    <div key={task._id} style={{ padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ fontWeight: 700 }}>{task.titre}</div>
                      {task.description && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginTop: 4 }}>{task.description}</div>}
                    </div>
                  )) : <div style={{ color: "#94a3b8" }}>Aucune instruction definie.</div>}
                </div>
              </div>
              <button disabled={!selectedPiece.matiere} onClick={startSession} style={{ ...primaryButton, width: "100%", cursor: selectedPiece.matiere ? "pointer" : "not-allowed", opacity: selectedPiece.matiere ? 1 : 0.55 }}>
                Demarrer la production
              </button>
            </div>
          )}

          {step === "production" && session && (
            <div style={sectionCardStyle}>
              <h2 style={{ marginTop: 0, marginBottom: 16 }}>Production en cours</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 16 }}>
                <div style={cardStyle}><div style={{ color: "rgba(255,255,255,0.38)", marginBottom: 8 }}>Temps</div><div style={{ fontSize: 30, fontWeight: 900, color: "#38bdf8" }}>{fmt(elapsed)}</div></div>
                <div style={cardStyle}><div style={{ color: "rgba(255,255,255,0.38)", marginBottom: 8 }}>Pieces</div><div style={{ fontSize: 30, fontWeight: 900, color: "#34d399", marginBottom: 10 }}>{count}</div><div style={{ display: "flex", gap: 8 }}><button onClick={() => setCount((prev) => Math.max(0, prev - 1))} disabled={saved || count === 0} style={secondaryButton}>-</button><button onClick={() => setCount((prev) => prev + 1)} disabled={saved} style={secondaryButton}>+</button></div></div>
                <div style={cardStyle}><div style={{ color: "rgba(255,255,255,0.38)", marginBottom: 8 }}>Objectif</div><div style={{ fontSize: 30, fontWeight: 900, color: "#fbbf24" }}>{progressPct}%</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)" }}>{session.piece.quantite} pcs demandes</div></div>
              </div>
              <div style={{ ...cardStyle, marginBottom: 16 }}>
                <div style={{ marginBottom: 8 }}>Piece: <strong>{session.piece.nom}</strong></div>
                <div>Machine: <strong>{session.machine.name}</strong></div>
              </div>
              {!saved ? (
                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={togglePause} style={{ ...primaryButton, flex: 1, background: isPaused ? "linear-gradient(135deg,#0369a1,#0ea5e9)" : "linear-gradient(135deg,#92400e,#f59e0b)" }}>
                    {isPaused ? "Reprendre" : "Pause"}
                  </button>
                  <button onClick={stopSession} style={{ ...primaryButton, flex: 1, background: "linear-gradient(135deg,#7f1d1d,#ef4444)" }}>
                    Arreter et enregistrer
                  </button>
                </div>
              ) : (
                <div style={cardStyle}>
                  <div style={{ color: "#34d399", fontWeight: 800, marginBottom: 12 }}>Session enregistree.</div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <button onClick={() => resetWorkflow("pieces")} style={{ ...primaryButton, flex: 1 }}>Nouvelle piece</button>
                    <button onClick={() => resetWorkflow("machines")} style={{ ...secondaryButton, flex: 1 }}>Autre machine</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "messages" && (
        <div style={{ maxWidth: 820, margin: "0 auto", padding: 24 }}>
          <div style={{ ...cardStyle, minHeight: 460, display: "flex", flexDirection: "column" }}>
            <div style={{ fontWeight: 800, marginBottom: 14 }}>Discussion avec l'administrateur</div>
            <div style={{ flex: 1, overflowY: "auto", marginBottom: 14 }}>
              {messages.map((msg) => {
                const isMe = msg.from === username;
                return (
                  <div key={msg._id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", marginBottom: 10 }}>
                    <div style={{ maxWidth: "70%", background: isMe ? "linear-gradient(135deg,#1e40af,#2563eb)" : "rgba(255,255,255,0.05)", padding: "10px 14px", borderRadius: 14 }}>
                      <div style={{ fontSize: 13 }}>{msg.text}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{new Date(msg.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={msgEndRef} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <input value={msgText} onChange={(e) => setMsgText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} placeholder="Ecrire un message..." style={{ flex: 1, borderRadius: 12, border: "1px solid rgba(56,189,248,0.14)", background: "rgba(4,10,18,0.9)", color: "white", padding: "12px 14px" }} />
              <button onClick={sendMessage} style={{ ...badge("rgba(56,189,248,0.14)", "#38bdf8"), cursor: "pointer" }}>Envoyer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployePage;
