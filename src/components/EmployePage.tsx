import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { getMachineVisual, type MachineIconKind } from "../utils/machineVisuals";

const BASE_URL = "http://localhost:5000";

interface Machine {
  id: string;
  name: string;
  model?: string;
  marque?: string;
  type?: string;
  imageUrl?: string;
  icon?: MachineIconKind;
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
  quantiteProduite?: number;
  prix: number;
  status: string;
  matiere: boolean;
  dimension?: string;
  matiereType?: string;
  matiereReference?: string;
  taches?: Tache[];
  solidworksPath?: string | null;
  planDocumentId?: string;
  planPath?: string;
  planName?: string;
  planMimeType?: string;
}

interface DossierDocument {
  _id: string;
  originalName: string;
  mimeType?: string;
  publicPath?: string;
  pieceName: string;
}

const getFileExtension = (filename = "") => {
  const ext = filename.includes(".") ? filename.split(".").pop() || "" : "";
  return ext.trim().toLowerCase();
};

const guessPlanMimeType = (filename = "") => {
  const ext = getFileExtension(filename);
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"].includes(ext)) return ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  if (ext === "pdf") return "application/pdf";
  return "";
};

const resolveAssetUrl = (path?: string | null) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
};

const getPiecePlan = (piece: Piece) => {
  const path = piece.planPath || piece.solidworksPath || "";
  const name = piece.planName || (path ? path.split("/").pop() || "Plan" : "");
  const mimeType = piece.planMimeType || guessPlanMimeType(name || path);
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";
  const isCad = /\.(sldprt|sldasm|slddrw|step|stp|iges|igs|dxf|dwg)$/i.test(name || path);
  return { path, name, mimeType, isImage, isPdf, isCad, isPreviewable: isImage || isPdf };
};

const normalizeKey = (value = "") => String(value || "").trim().toLowerCase();
const getDocumentMimeType = (doc: DossierDocument) => doc.mimeType || guessPlanMimeType(doc.originalName);
const isImageDocument = (doc: DossierDocument) => getDocumentMimeType(doc).startsWith("image/");
const isPdfDocument = (doc: DossierDocument) => getDocumentMimeType(doc) === "application/pdf" || /\.pdf$/i.test(doc.originalName || "");
const isCadDocument = (doc: DossierDocument) => /\.(sldprt|sldasm|slddrw|step|stp|iges|igs|dxf|dwg)$/i.test(doc.originalName || "");

const getPrimaryPlanDocument = (piece: Piece, docs: DossierDocument[]) => {
  const linkedDocs = docs.filter((doc) => normalizeKey(doc.pieceName) === normalizeKey(piece.nom));
  return linkedDocs.find(isImageDocument) || linkedDocs.find(isPdfDocument) || linkedDocs.find(isCadDocument) || null;
};

const enrichPieceWithPlan = (piece: Piece, docs: DossierDocument[]): Piece => {
  if (piece.planDocumentId || piece.planPath || piece.solidworksPath) return piece;
  const doc = getPrimaryPlanDocument(piece, docs);
  if (!doc) return piece;
  return {
    ...piece,
    planDocumentId: doc._id,
    planPath: doc.publicPath || "",
    planName: doc.originalName || "",
    planMimeType: getDocumentMimeType(doc),
  };
};

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

const getPieceInfoRows = (piece: Piece, machineName?: string) => [
  { label: "Piece", value: piece.nom },
  { label: "Dimension", value: piece.dimension || "Non renseignee" },
  { label: "Quantite demandee", value: `${piece.quantite || 0} pcs` },
  { label: "Quantite produite", value: `${piece.quantiteProduite || 0} pcs` },
  { label: "Type matiere", value: piece.matiereType || "Non renseigne" },
  { label: "Reference matiere", value: piece.matiereReference || "Non renseignee" },
  { label: "Disponibilite matiere", value: piece.matiere ? "Disponible" : "Manquante", danger: !piece.matiere },
  { label: "Machine", value: machineName || piece.currentMachine || piece.machine || "Non renseignee" },
  { label: "Statut", value: normalizeStatus(piece.status) },
];

const getMachineAccent = (machine: Machine) => {
  const haystack = `${machine.name || ""} ${machine.type || ""}`.toLowerCase();
  if (haystack.includes("tour") || haystack.includes("tournage")) return "#38bdf8";
  if (haystack.includes("per") || haystack.includes("drill")) return "#a3e635";
  if (haystack.includes("taraud")) return "#f59e0b";
  if (haystack.includes("agie") || haystack.includes("edm")) return "#60a5fa";
  if (haystack.includes("rectif")) return "#f472b6";
  return "#5eead4";
};

const PieceInfoGrid: React.FC<{ piece: Piece; machineName?: string }> = ({ piece, machineName }) => (
  <div style={{ display: "grid", gap: 9, fontSize: 14 }}>
    {getPieceInfoRows(piece, machineName).map((row) => (
      <div key={row.label} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ color: "#94a3b8" }}>{row.label}</span>
        <strong style={{ color: row.danger ? "#f87171" : "#f8fafc" }}>{row.value}</strong>
      </div>
    ))}
  </div>
);

const PieceConsignes: React.FC<{ piece: Piece; machineName?: string }> = ({ piece, machineName }) => {
  const plan = getPiecePlan(piece);
  const items = [
    plan.name ? `Verifier le plan "${plan.name}" avant le demarrage.` : "Verifier le plan associe avant le demarrage.",
    `Controler la matiere: type ${piece.matiereType || "non renseigne"}, reference ${piece.matiereReference || "non renseignee"}.`,
    `Preparer ${piece.quantite || 0} piece(s) selon la dimension: ${piece.dimension || "non renseignee"}.`,
    `Machine de travail: ${machineName || piece.currentMachine || piece.machine || "non renseignee"}.`,
  ];

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((item, index) => (
        <div key={item} style={{ display: "flex", gap: 10, alignItems: "flex-start", color: "#cbd5e1", fontSize: 13, lineHeight: 1.5 }}>
          <span style={{ width: 24, height: 24, borderRadius: 8, display: "grid", placeItems: "center", background: "rgba(20,184,166,0.13)", color: "#5eead4", fontWeight: 900, flex: "0 0 auto" }}>{index + 1}</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 8,
  padding: 18,
};

const sectionCardStyle: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(10,15,28,0.96))",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 8,
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
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  background: "linear-gradient(135deg,#0f766e,#14b8a6)",
  color: "white",
  fontWeight: 800,
  fontSize: 14,
};

const secondaryButton: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.18)",
  cursor: "pointer",
  background: "rgba(255,255,255,0.04)",
  color: "white",
  fontWeight: 700,
  fontSize: 13,
};

const PiecePlanPreview: React.FC<{ piece: Piece; height?: number; compact?: boolean }> = ({ piece, height = 150, compact = false }) => {
  const plan = getPiecePlan(piece);
  const directUrl = resolveAssetUrl(plan.path);
  const shouldDownloadPlan = !directUrl && Boolean(piece.planDocumentId) && plan.isPreviewable;
  const downloadKey = `${piece.planDocumentId || ""}-${plan.mimeType}-${plan.name}`;
  const [downloadedPlan, setDownloadedPlan] = useState({ key: "", url: "" });
  const downloadUrl = downloadedPlan.key === downloadKey ? downloadedPlan.url : "";
  const previewUrl = directUrl || downloadUrl;

  useEffect(() => {
    if (!shouldDownloadPlan || !piece.planDocumentId) return;

    let objectUrl = "";
    let cancelled = false;
    const token = localStorage.getItem("token") || "";

    fetch(`${BASE_URL}/api/dossiers/${piece.planDocumentId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Plan introuvable");
        const rawBlob = await response.blob();
        const blob = rawBlob.type === plan.mimeType || !plan.mimeType ? rawBlob : new Blob([rawBlob], { type: plan.mimeType });
        objectUrl = window.URL.createObjectURL(blob);
        if (!cancelled) setDownloadedPlan({ key: downloadKey, url: objectUrl });
      })
      .catch(() => {
        if (!cancelled) setDownloadedPlan((prev) => (prev.key === downloadKey ? { key: "", url: "" } : prev));
      });

    return () => {
      cancelled = true;
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
  }, [downloadKey, piece.planDocumentId, plan.mimeType, shouldDownloadPlan]);

  const openPlan = () => {
    if (!previewUrl || !plan.isPreviewable) return;
    window.open(previewUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      onDoubleClick={openPlan}
      title={previewUrl && plan.isPreviewable ? "Double clic pour ouvrir le plan" : undefined}
      style={{
        height,
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid rgba(148,163,184,0.18)",
        background: "rgba(2,6,23,0.72)",
        display: "grid",
        placeItems: "center",
        cursor: previewUrl && plan.isPreviewable ? "pointer" : "default",
        position: "relative",
      }}
    >
      {previewUrl && plan.isImage ? (
        <img src={previewUrl} alt={plan.name || piece.nom} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : previewUrl && plan.isPdf ? (
        <iframe title={plan.name || piece.nom} src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0`} style={{ width: "100%", height: "100%", border: "none", pointerEvents: "none" }} />
      ) : (
        <div style={{ display: "grid", gap: 8, justifyItems: "center", color: "#94a3b8", padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: compact ? 20 : 28, fontWeight: 900, letterSpacing: 0 }}>{plan.isCad ? "CAD" : "PLAN"}</div>
          <div style={{ fontSize: 12 }}>{plan.name || "Aucun plan associe"}</div>
        </div>
      )}
      {plan.name && (
        <div style={{ position: "absolute", left: 8, right: 8, bottom: 8, padding: "6px 8px", borderRadius: 8, background: "rgba(2,6,23,0.72)", color: "#dbeafe", fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {plan.name}
        </div>
      )}
    </div>
  );
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
        const [machinesRes, piecesRes, messagesRes, dossiersData] = await Promise.all([
          fetch(`${BASE_URL}/api/machines`, { headers: authHeaders }),
          fetch(`${BASE_URL}/api/pieces`, { headers: authHeaders }),
          fetch(`${BASE_URL}/api/messages/admin`, { headers: authHeaders }),
          fetch(`${BASE_URL}/api/dossiers`, { headers: authHeaders })
            .then((response) => response.ok ? response.json() : [])
            .catch(() => []),
        ]);
        const [machinesData, piecesData, messagesData] = await Promise.all([machinesRes.json(), piecesRes.json(), messagesRes.json()]);
        const dossierDocs = Array.isArray(dossiersData) ? dossiersData : [];
        setMachines(Array.isArray(machinesData) ? machinesData.filter((m) => !String(m.name || "").toLowerCase().includes("compresseur")) : []);
        setPieces(Array.isArray(piecesData) ? piecesData.map((piece) => enrichPieceWithPlan(piece, dossierDocs)) : []);
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
      const mergePiece = (piece: Piece): Piece => ({
        ...piece,
        ...updatedPiece,
        planDocumentId: updatedPiece.planDocumentId || piece.planDocumentId,
        planPath: updatedPiece.planPath || piece.planPath,
        planName: updatedPiece.planName || piece.planName,
        planMimeType: updatedPiece.planMimeType || piece.planMimeType,
        dimension: updatedPiece.dimension || piece.dimension,
        matiereType: updatedPiece.matiereType || piece.matiereType,
        matiereReference: updatedPiece.matiereReference || piece.matiereReference,
      });
      setPieces((prev) => prev.map((piece) => (piece._id === updatedPiece._id ? mergePiece(piece) : piece)));
      setSelectedPiece((prev) => (prev?._id === updatedPiece._id ? mergePiece(prev) : prev));
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

  const canOpenStep = (target: Step) => {
    if (target === "pieces") return true;
    if (target === "machines") return Boolean(selectedPiece);
    if (target === "confirm") return Boolean(selectedPiece && selectedMachine);
    return Boolean(session);
  };

  const openWorkflowStep = (target: Step) => {
    if (!canOpenStep(target)) return;
    setTab("workflow");
    setStep(target);
  };

  const workflowSteps: { key: Step; label: string; detail: string }[] = [
    { key: "pieces", label: "Pieces", detail: selectedPiece ? selectedPiece.nom : `${myPieces.length} piece(s)` },
    { key: "machines", label: "Machines", detail: selectedMachine ? selectedMachine.name : selectedPiece ? "Choisir une machine" : "Choisir une piece" },
    { key: "confirm", label: "Confirmation", detail: selectedPiece && selectedMachine ? "Pret a demarrer" : "Piece et machine" },
    { key: "production", label: "Production", detail: session ? (saved ? "Session enregistree" : "En cours") : "Apres confirmation" },
  ];

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "radial-gradient(circle at top, #14213d 0%, #0a0f1c 42%, #050816 100%)", color: "white", fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
      <aside style={{ width: 260, minWidth: 260, minHeight: "100vh", borderRight: "1px solid rgba(148,163,184,0.16)", background: "rgba(11,18,32,0.92)", padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ borderBottom: "1px solid rgba(148,163,184,0.16)", paddingBottom: 18 }}>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0.2 }}>CNC Pulse</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Espace employe</div>
          <div style={{ marginTop: 12, ...badge("rgba(20,184,166,0.12)", "#5eead4") }}>{username}</div>
        </div>

        <nav style={{ display: "grid", gap: 10 }}>
          <div style={{ color: "rgba(255,255,255,0.36)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Flux de travail</div>
          {workflowSteps.map((item, index) => {
            const active = tab === "workflow" && step === item.key;
            const enabled = canOpenStep(item.key);
            return (
              <button
                key={item.key}
                onClick={() => openWorkflowStep(item.key)}
                disabled={!enabled}
                style={{
                  width: "100%",
                  textAlign: "left",
                  borderRadius: 8,
                  border: active ? "1px solid rgba(20,184,166,0.38)" : "1px solid rgba(148,163,184,0.1)",
                  background: active ? "linear-gradient(135deg,rgba(20,184,166,0.2),rgba(59,130,246,0.1))" : "rgba(255,255,255,0.03)",
                  color: enabled ? active ? "#5eead4" : "#cbd5e1" : "#475569",
                  padding: "13px",
                  cursor: enabled ? "pointer" : "not-allowed",
                  opacity: enabled ? 1 : 0.58,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 8, display: "grid", placeItems: "center", background: active ? "rgba(20,184,166,0.18)" : "rgba(148,163,184,0.08)", fontWeight: 900 }}>
                    {index + 1}
                  </span>
                  <span>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 800 }}>{item.label}</span>
                    <span style={{ display: "block", fontSize: 11, color: active ? "#99f6e4" : enabled ? "#94a3b8" : "#64748b", marginTop: 3 }}>{item.detail}</span>
                  </span>
                </div>
              </button>
            );
          })}
        </nav>

        <div style={{ marginTop: "auto", display: "grid", gap: 10 }}>
          <button onClick={() => { localStorage.clear(); navigate("/"); }} style={{ ...badge("rgba(239,68,68,0.14)", "#f87171"), cursor: "pointer", width: "100%", padding: "11px 12px" }}>Quitter</button>
        </div>
      </aside>

      {tab === "workflow" && (
        <main style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 24 }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
            <div>
              <div style={{ color: "#5eead4", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.2 }}>Espace employe</div>
              <h1 style={{ margin: "4px 0 0", fontSize: 30, lineHeight: 1.1 }}>Flux de production</h1>
            </div>
            <button
              onClick={() => {
                setTab("messages");
                setUnread(0);
              }}
              style={{ ...secondaryButton, display: "flex", alignItems: "center", gap: 10, background: unread > 0 ? "rgba(20,184,166,0.14)" : "rgba(255,255,255,0.05)", borderColor: unread > 0 ? "rgba(20,184,166,0.34)" : "rgba(148,163,184,0.18)" }}
            >
              Messages
              {unread > 0 && <span style={badge("rgba(20,184,166,0.22)", "#5eead4")}>{unread}</span>}
            </button>
          </div>

          <div style={{ ...sectionCardStyle, marginBottom: 20, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>{workflowSteps.find((item) => item.key === step)?.label || "Pieces"}</div>
              <div style={{ color: "#94a3b8", fontSize: 14, maxWidth: 560 }}>
                Selectionnez une piece, verifiez son plan et ses details, choisissez une machine, puis demarrez la production.
              </div>
            </div>
            <div style={{ display: "grid", gap: 8, minWidth: 180 }}>
              <div style={{ ...badge("rgba(20,184,166,0.12)", "#5eead4"), justifySelf: "start" }}>Employe: {username}</div>
              <div style={{ ...badge("rgba(59,130,246,0.12)", "#93c5fd"), justifySelf: "start" }}>Pieces actives: {myPieces.length}</div>
            </div>
          </div>

          {step === "pieces" && (
            <div style={sectionCardStyle}>
              {!selectedPiece ? (
                <>
                  <h2 style={{ marginTop: 0, marginBottom: 6 }}>Liste des pieces</h2>
                  <p style={{ color: "#94a3b8", marginTop: 0 }}>Choisissez une piece pour voir le plan, la dimension, la matiere et la quantite enregistree.</p>
                  {loading ? <div style={cardStyle}>Chargement...</div> : myPieces.length === 0 ? <div style={cardStyle}>Aucune piece assignee pour le moment.</div> : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
                      {myPieces.map((piece) => (
                        <button key={piece._id} onClick={() => { setSelectedPiece(piece); setSelectedMachine(null); }} style={{ ...cardStyle, textAlign: "left", cursor: "pointer", color: "white", boxShadow: "0 10px 24px rgba(2,6,23,0.22)", transition: "transform 0.18s ease, border-color 0.18s ease" }}>
                          <div style={{ marginBottom: 12 }}>
                            <PiecePlanPreview piece={piece} height={132} compact />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                            <strong>{piece.nom}</strong>
                            <span style={badge("rgba(56,189,248,0.14)", "#38bdf8")}>{normalizeStatus(piece.status)}</span>
                          </div>
                          <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7 }}>
                            <div>Machine actuelle: <span style={{ color: "#38bdf8" }}>{piece.currentMachine || piece.machine}</span></div>
                            <div>Dimension: <span style={{ color: "white" }}>{piece.dimension || "Non renseignee"}</span></div>
                            <div>Quantite: <span style={{ color: "white" }}>{piece.quantite} pcs</span></div>
                            <div>Type matiere: <span style={{ color: "white" }}>{piece.matiereType || "Non renseigne"}</span></div>
                            <div>Reference: <span style={{ color: "white" }}>{piece.matiereReference || "Non renseignee"}</span></div>
                            <div>Disponibilite: <span style={{ color: piece.matiere ? "#34d399" : "#f87171" }}>{piece.matiere ? "Disponible" : "Manquante"}</span></div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
                    <div>
                      <h2 style={{ margin: 0 }}>{selectedPiece.nom}</h2>
                      <div style={{ color: "#94a3b8", marginTop: 6 }}>Detail de la piece avant le choix de la machine.</div>
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button onClick={() => resetWorkflow("pieces")} style={secondaryButton}>Changer la piece</button>
                      <button onClick={() => setStep("machines")} style={primaryButton}>Choisir une machine</button>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1.1fr) minmax(280px, 0.9fr)", gap: 16 }}>
                    <div style={cardStyle}>
                      <div style={{ fontWeight: 800, marginBottom: 12 }}>Plan de fabrication</div>
                      <PiecePlanPreview piece={selectedPiece} height={270} />
                      <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 10 }}>Double clic sur le plan pour l'ouvrir dans une nouvelle fenetre quand le format est lisible.</div>
                    </div>

                    <div style={{ display: "grid", gap: 16 }}>
                      <div style={cardStyle}>
                        <div style={{ fontWeight: 800, marginBottom: 12 }}>Donnees enregistrees</div>
                        <PieceInfoGrid piece={selectedPiece} />
                      </div>

                      <div style={cardStyle}>
                        <div style={{ fontWeight: 800, marginBottom: 12 }}>Consignes de fabrication</div>
                        <PieceConsignes piece={selectedPiece} />
                      </div>
                    </div>
                  </div>
                </>
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
              <div style={{ ...cardStyle, marginBottom: 16, padding: 16, background: "rgba(15,23,42,0.82)" }}>
                <div style={{ fontSize: 13, color: "#94a3b8" }}>
                  Choisissez la machine qui va travailler cette piece. La machine actuelle reste marquee par un badge.
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
                {machines.map((machine) => {
                  const visual = getMachineVisual({ id: machine.id, name: machine.name, icon: machine.icon, imageUrl: machine.imageUrl });
                  const Icon = visual.Icon;
                  const accent = getMachineAccent(machine);
                  const isCurrent = machine.name === (selectedPiece.currentMachine || selectedPiece.machine);
                  return (
                    <button
                      key={machine.id}
                      onClick={() => { setSelectedMachine(machine); setStep("confirm"); }}
                      style={{
                        textAlign: "left",
                        cursor: "pointer",
                        color: "white",
                        padding: 0,
                        overflow: "hidden",
                        borderRadius: 8,
                        border: isCurrent ? `1px solid ${accent}` : "1px solid rgba(148,163,184,0.14)",
                        background: "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(8,13,25,0.96))",
                        boxShadow: "0 18px 35px rgba(2,6,23,0.26)",
                      }}
                    >
                      <div style={{ height: 118, position: "relative", overflow: "hidden", background: "#020617" }}>
                        <img src={visual.image} alt={visual.alt} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.64, display: "block" }} />
                        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, rgba(2,6,23,0.15), ${accent}33)` }} />
                        <div style={{ position: "absolute", left: 14, top: 14, width: 42, height: 42, borderRadius: 8, background: "rgba(2,6,23,0.72)", border: `1px solid ${accent}66`, display: "grid", placeItems: "center", color: accent }}>
                          <Icon size={21} />
                        </div>
                        {isCurrent && (
                          <span style={{ position: "absolute", right: 12, top: 12, ...badge(`${accent}22`, accent) }}>Etape actuelle</span>
                        )}
                      </div>
                      <div style={{ padding: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 900 }}>{machine.name}</div>
                            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
                              {[machine.marque, machine.model].filter(Boolean).join(" - ") || "Modele non renseigne"}
                            </div>
                          </div>
                          <span style={badge("rgba(255,255,255,0.06)", "#cbd5e1")}>{machine.type || "Machine"}</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                          <div style={{ padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(148,163,184,0.1)" }}>
                            <div style={{ color: "#64748b", fontSize: 10, textTransform: "uppercase", fontWeight: 800 }}>Connexion</div>
                            <div style={{ color: machine.hasSensors ? "#34d399" : "#cbd5e1", fontSize: 12, fontWeight: 800, marginTop: 4 }}>{machine.hasSensors ? "Capteurs" : "Manuel"}</div>
                          </div>
                          <div style={{ padding: 10, borderRadius: 8, background: `${accent}12`, border: `1px solid ${accent}33` }}>
                            <div style={{ color: "#64748b", fontSize: 10, textTransform: "uppercase", fontWeight: 800 }}>Action</div>
                            <div style={{ color: accent, fontSize: 12, fontWeight: 900, marginTop: 4 }}>Selectionner</div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
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
                  <div style={{ fontWeight: 800, marginBottom: 12 }}>Plan et donnees</div>
                  <div style={{ marginBottom: 14 }}>
                    <PiecePlanPreview piece={selectedPiece} height={180} />
                  </div>
                  <PieceInfoGrid piece={selectedPiece} machineName={selectedMachine.name} />
                </div>
                <div style={cardStyle}>
                  <div style={{ fontWeight: 800, marginBottom: 12 }}>Consignes de fabrication</div>
                  <PieceConsignes piece={selectedPiece} machineName={selectedMachine.name} />
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
                <div style={{ marginBottom: 14 }}>
                  <PiecePlanPreview piece={session.piece} height={220} />
                </div>
                <PieceInfoGrid piece={session.piece} machineName={session.machine.name} />
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
        </main>
      )}

      {tab === "messages" && (
        <main style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 24 }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
            <div>
              <div style={{ color: "#5eead4", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.2 }}>Messages</div>
              <h1 style={{ margin: "4px 0 0", fontSize: 30, lineHeight: 1.1 }}>Discussion avec l'administrateur</h1>
            </div>
            <button onClick={() => setTab("workflow")} style={secondaryButton}>Retour au travail</button>
          </div>
          <div style={{ ...cardStyle, minHeight: 460, display: "flex", flexDirection: "column" }}>
            <div style={{ fontWeight: 800, marginBottom: 14 }}>Discussion avec l'administrateur</div>
            <div style={{ flex: 1, overflowY: "auto", marginBottom: 14 }}>
              {messages.map((msg) => {
                const isMe = msg.from === username;
                return (
                  <div key={msg._id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", marginBottom: 10 }}>
                    <div style={{ maxWidth: "70%", background: isMe ? "linear-gradient(135deg,#1e40af,#2563eb)" : "rgba(255,255,255,0.05)", padding: "10px 14px", borderRadius: 8 }}>
                      <div style={{ fontSize: 13 }}>{msg.text}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{new Date(msg.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={msgEndRef} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <input value={msgText} onChange={(e) => setMsgText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} placeholder="Ecrire un message..." style={{ flex: 1, borderRadius: 8, border: "1px solid rgba(56,189,248,0.14)", background: "rgba(4,10,18,0.9)", color: "white", padding: "12px 14px" }} />
              <button onClick={sendMessage} style={{ ...badge("rgba(56,189,248,0.14)", "#38bdf8"), cursor: "pointer" }}>Envoyer</button>
            </div>
          </div>
        </div>
        </main>
      )}
    </div>
  );
};

export default EmployePage;
