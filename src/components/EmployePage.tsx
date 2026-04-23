import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { getMachineVisual, type MachineIconKind } from "../utils/machineVisuals";
import { useTheme } from "../hooks/useTheme";

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
  ref?: string;
  machine: string;
  machineChain?: string[];
  currentMachine?: string | null;
  history?: Array<{ machine: string; action: "entered" | "completed"; by?: string; at?: string }>;
  employe?: string;
  quantite: number;
  quantiteProduite?: number;
  quantiteRuban?: number;
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

interface EmployeeWorkState {
  machineStatus: "started" | "paused" | "stopped";
  currentPieceId: string | null;
}

interface TrackingEvent {
  type: "start" | "pause" | "resume" | "stop";
  time: Date;
  pieceCount?: number;
  rubanQuantity?: number;
}

interface ProductionSession {
  machine: Machine;
  piece: Piece;
  startTime: Date;
  statut: "en_cours" | "pause" | "terminee";
  events: TrackingEvent[];
}

type Step = "pieces" | "machines" | "production";

interface DimensionFields {
  largeur: string;
  longueur: string;
  hauteur: string;
}

interface PieceDraft extends DimensionFields {
  ref: string;
  quantite: number;
  matiereType: string;
  matiereReference: string;
  matiere: boolean;
}

const normalizeStatus = (status?: string) => {
  const raw = String(status || "").toLowerCase();
  if (!raw) return "Arrêté";
  if (raw.includes("termin")) return "Termine";
  if (raw.includes("contr")) return "Controle";
  if (raw.includes("arret") || raw.includes("stop")) return "Arrêté";
  if (raw.includes("cours")) return "En cours";
  return "Arrêté";
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const emptyPieceDraft = (): PieceDraft => ({
  ref: "",
  largeur: "",
  longueur: "",
  hauteur: "",
  quantite: 0,
  matiereType: "",
  matiereReference: "",
  matiere: false,
});

const hasCompletedHistory = (piece?: Piece | null) =>
  Boolean(piece?.history?.some((entry) => entry?.action === "completed"));

const parseDimension = (value?: string): DimensionFields => {
  const raw = String(value || "").trim();
  if (!raw) return { largeur: "", longueur: "", hauteur: "" };

  const labelled = {
    largeur: raw.match(/largeur\s*:\s*([^|]+)/i)?.[1]?.trim() || "",
    longueur: raw.match(/longueur\s*:\s*([^|]+)/i)?.[1]?.trim() || "",
    hauteur: raw.match(/hauteur\s*:\s*([^|]+)/i)?.[1]?.trim() || "",
  };

  if (labelled.largeur || labelled.longueur || labelled.hauteur) return labelled;

  const parts = raw.split(/x|×|\||,/i).map((part) => part.trim()).filter(Boolean);
  return {
    largeur: parts[0] || "",
    longueur: parts[1] || "",
    hauteur: parts[2] || "",
  };
};

const formatDimension = ({ largeur, longueur, hauteur }: DimensionFields) => (
  [
    largeur.trim() ? `Largeur: ${largeur.trim()}` : "",
    longueur.trim() ? `Longueur: ${longueur.trim()}` : "",
    hauteur.trim() ? `Hauteur: ${hauteur.trim()}` : "",
  ].filter(Boolean).join(" | ")
);

const fmt = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const getPieceInfoRows = (piece: Piece, machineName?: string) => [
  { label: "Piece", value: piece.nom },
  { label: "Reference", value: piece.ref || "Non renseignee" },
  { label: "Dimension", value: piece.dimension || "Non renseignee" },
  { label: "Quantite demandee", value: `${piece.quantite || 0} pcs` },
  { label: "Quantite produite", value: `${piece.quantiteProduite || 0} pcs` },
  { label: "Type matiere", value: piece.matiereType || "Non renseigne" },
  { label: "Reference matiere", value: piece.matiereReference || "Non renseignee" },
  { label: "Disponibilite matiere", value: piece.matiere ? "Disponible" : "Manquante", danger: !piece.matiere },
  { label: "Machine", value: machineName || piece.currentMachine || piece.machine || "Non renseignee" },
  { label: "Statut", value: normalizeStatus(piece.status) },
];

const materialOptions: Record<string, string[]> = {
  Aluminium: ["2017", "5083", "7075"],
  Bronze: ["B12"],
  Acier: ["42CD4", "40CMD8", "Z160", "Z40", "XC48", "E24"],
  Inox: ["304", "316L"],
  Plastique: ["POM noir", "POM blanc", "PEEK", "PA6", "NYLON"],
};

const getMachineAccent = (machine: Machine) => {
  const haystack = `${machine.name || ""} ${machine.type || ""}`.toLowerCase();
  if (haystack.includes("tour") || haystack.includes("tournage")) return "#38bdf8";
  if (haystack.includes("per") || haystack.includes("drill")) return "#a3e635";
  if (haystack.includes("taraud")) return "#f59e0b";
  if (haystack.includes("agie") || haystack.includes("edm")) return "#60a5fa";
  if (haystack.includes("rectif")) return "#f472b6";
  return "#5eead4";
};

const PieceInfoGrid: React.FC<{ piece: Piece; machineName?: string; statusLabel?: string }> = ({ piece, machineName, statusLabel }) => {
  const { darkMode } = useTheme();
  return (
    <div style={{ display: "grid", gap: 9, fontSize: 14 }}>
      {getPieceInfoRows({ ...piece, status: statusLabel || piece.status }, machineName).map((row) => (
        <div
          key={row.label}
          style={{
            display: "grid",
            gridTemplateColumns: "150px 1fr",
            gap: 10,
            alignItems: "center",
            padding: "8px 0",
            borderBottom: darkMode ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(15,23,42,0.08)",
          }}
        >
          <span style={{ color: "var(--app-subtle)" }}>{row.label}</span>
          <strong style={{ color: row.danger ? "var(--app-danger)" : "var(--app-text)" }}>{row.value}</strong>
        </div>
      ))}
    </div>
  );
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
        borderRadius: 18,
        overflow: "hidden",
        border: "1px solid var(--app-border)",
        background: "linear-gradient(180deg, var(--app-card-alt), var(--app-inset))",
        display: "grid",
        placeItems: "center",
        cursor: previewUrl && plan.isPreviewable ? "pointer" : "default",
        position: "relative",
      }}
    >
      {previewUrl && plan.isImage ? (
        <img
          src={previewUrl}
          alt={plan.name || piece.nom}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            objectPosition: "center",
            display: "block",
            padding: compact ? 8 : 12,
            boxSizing: "border-box",
          }}
        />
      ) : previewUrl && plan.isPdf ? (
        <iframe title={plan.name || piece.nom} src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0`} style={{ width: "100%", height: "100%", border: "none", pointerEvents: "none" }} />
      ) : (
        <div style={{ display: "grid", gap: 8, justifyItems: "center", color: "var(--app-subtle)", padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: compact ? 20 : 28, fontWeight: 900, letterSpacing: 0 }}>{plan.isCad ? "CAD" : "PLAN"}</div>
          <div style={{ fontSize: 12 }}>{plan.name || "Aucun plan associe"}</div>
        </div>
      )}
      {plan.name && (
        <div style={{ position: "absolute", left: 10, right: 10, bottom: 10, padding: "8px 10px", borderRadius: 12, background: "var(--app-surface)", color: "var(--app-text)", fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", boxShadow: "none" }}>
          {plan.name}
        </div>
      )}
    </div>
  );
};

const EmployePage: React.FC = () => {
  const navigate = useNavigate();
  const { darkMode, toggleTheme } = useTheme();
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
  const [sessionRuban, setSessionRuban] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pieceDraft, setPieceDraft] = useState<PieceDraft>(emptyPieceDraft);
  const [savingPiece, setSavingPiece] = useState(false);
  const [pieceSaveError, setPieceSaveError] = useState("");
  const [workState, setWorkState] = useState<EmployeeWorkState>({ machineStatus: "stopped", currentPieceId: null });
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgText, setMsgText] = useState("");
  const [unread, setUnread] = useState(0);
  const [isCompactLayout, setIsCompactLayout] = useState(() => (typeof window !== "undefined" ? window.innerWidth < 1100 : false));

  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const theme = useMemo(() => (
    {
      bg: "var(--app-bg)",
      aside: "var(--app-card)",
      section: "var(--app-card)",
      card: "var(--app-card)",
      inset: "var(--app-surface)",
      border: "var(--app-border)",
      text: "var(--app-heading)",
      textSoft: "var(--app-text)",
      muted: "var(--app-muted)",
      subtle: "var(--app-subtle)",
      accent: "var(--app-accent)",
      accentStrong: "var(--app-accent-strong)",
      accentSoft: "var(--app-accent-soft)",
      success: "var(--app-success)",
      warning: "var(--app-warning)",
      danger: "var(--app-danger)",
      inputBg: "var(--app-surface-strong)",
      shadow: "none",
      primary: "linear-gradient(135deg,var(--app-accent),var(--app-accent-strong))",
      secondary: "var(--app-surface)",
    }
  ), [darkMode]);
  const cardStyle: React.CSSProperties = {
    background: theme.card,
    border: `1px solid ${theme.border}`,
    borderRadius: 22,
    padding: 22,
    boxShadow: theme.shadow,
  };
  const sectionCardStyle: React.CSSProperties = {
    background: theme.section,
    border: `1px solid ${theme.border}`,
    borderRadius: 26,
    padding: 26,
    boxShadow: theme.shadow,
  };
  const primaryButton: React.CSSProperties = {
    padding: "14px 18px",
    borderRadius: 16,
    border: "none",
    cursor: "pointer",
    background: theme.primary,
    color: "white",
    fontWeight: 800,
    fontSize: 14,
    boxShadow: "none",
  };
  const secondaryButton: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: 16,
    border: `1px solid ${theme.border}`,
    cursor: "pointer",
    background: theme.secondary,
    color: theme.text,
    fontWeight: 700,
    fontSize: 13,
    backdropFilter: "none",
  };
  const inputBaseStyle: React.CSSProperties = {
    width: "100%",
    borderRadius: 16,
    border: `1px solid ${theme.border}`,
    background: theme.inputBg,
    color: theme.text,
    padding: "12px 14px",
    boxSizing: "border-box",
    boxShadow: "none",
  };
  const bigInputStyle: React.CSSProperties = {
    ...inputBaseStyle,
    fontSize: 24,
    fontWeight: 900,
    padding: "14px 16px",
  };
  const subtlePanelStyle: React.CSSProperties = {
    borderRadius: 20,
    border: `1px solid ${theme.border}`,
    background: theme.inset,
    padding: 18,
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 11,
    color: theme.muted,
    marginBottom: 6,
    fontWeight: 700,
    letterSpacing: 0.2,
  };
  const stepDescriptions: Record<Step, { title: string; text: string }> = {
    pieces: {
      title: "Selection et preparation",
      text: "Choisissez une piece, completez seulement les informations utiles, puis passez a la machine.",
    },
    machines: {
      title: "Choix machine",
      text: "Selectionnez la machine de travail puis lancez la production directement depuis cette etape.",
    },
    production: {
      title: "Suivi de production",
      text: "Saisissez la production de la session, le ruban utilise et enregistrez proprement la fin du cycle.",
    },
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [machinesRes, piecesRes, messagesRes, dossiersData, employeeDashboard] = await Promise.all([
          fetch(`${BASE_URL}/api/machines`, { headers: authHeaders }),
          fetch(`${BASE_URL}/api/pieces`, { headers: authHeaders }),
          fetch(`${BASE_URL}/api/messages/admin`, { headers: authHeaders }),
          fetch(`${BASE_URL}/api/dossiers`, { headers: authHeaders })
            .then((response) => response.ok ? response.json() : [])
            .catch(() => []),
          fetch(`${BASE_URL}/api/employe/me/dashboard`, { headers: authHeaders })
            .then((response) => response.ok ? response.json() : null)
            .catch(() => null),
        ]);
        const [machinesData, piecesData, messagesData] = await Promise.all([machinesRes.json(), piecesRes.json(), messagesRes.json()]);
        const dossierDocs = Array.isArray(dossiersData) ? dossiersData : [];
        setWorkState({
          machineStatus: employeeDashboard?.user?.machineStatus || "stopped",
          currentPieceId: employeeDashboard?.user?.currentPieceId || null,
        });
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
    if (typeof window === "undefined") return undefined;
    const onResize = () => setIsCompactLayout(window.innerWidth < 1100);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const socket = io(BASE_URL, { transports: ["websocket"] });
    socketRef.current = socket;
    socket.emit("user-online", { username, role: "employe" });
    socket.on("direct-message", (data: Message) => {
      setMessages((prev) => [...prev, data]);
      if (tab !== "messages") setUnread((prev) => prev + 1);
    });
    socket.on("employee-machine-updated", (payload: { username?: string; machineStatus?: "started" | "paused" | "stopped"; currentPieceId?: string | null }) => {
      if (payload?.username !== username) return;
      setWorkState({
        machineStatus: payload.machineStatus || "stopped",
        currentPieceId: payload.currentPieceId || null,
      });
    });
    socket.on("piece-progressed", (updatedPiece: Piece) => {
      const mergePiece = (piece: Piece): Piece => ({
        ...piece,
        ...updatedPiece,
        planDocumentId: updatedPiece.planDocumentId || piece.planDocumentId,
        planPath: updatedPiece.planPath || piece.planPath,
        planName: updatedPiece.planName || piece.planName,
        planMimeType: updatedPiece.planMimeType || piece.planMimeType,
        ref: updatedPiece.ref || piece.ref,
        quantiteRuban: updatedPiece.quantiteRuban ?? piece.quantiteRuban,
        dimension: updatedPiece.dimension || piece.dimension,
        matiereType: updatedPiece.matiereType || piece.matiereType,
        matiereReference: updatedPiece.matiereReference || piece.matiereReference,
      });
      setPieces((prev) => prev.map((piece) => (piece._id === updatedPiece._id ? mergePiece(piece) : piece)));
      setSelectedPiece((prev) => (prev?._id === updatedPiece._id ? mergePiece(prev) : prev));
      setSession((prev) => (prev?.piece._id === updatedPiece._id ? { ...prev, piece: mergePiece(prev.piece) } : prev));
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

  useEffect(() => {
    if (!selectedPiece) {
      setPieceDraft(emptyPieceDraft());
      setPieceSaveError("");
      return;
    }

    const dimensions = parseDimension(selectedPiece.dimension);
    setPieceSaveError("");
    setPieceDraft({
      ...dimensions,
      ref: selectedPiece.ref || "",
      quantite: toNumber(selectedPiece.quantite, 0),
      matiereType: selectedPiece.matiereType || "",
      matiereReference: selectedPiece.matiereReference || "",
      matiere: Boolean(selectedPiece.matiere),
    });
  }, [selectedPiece]);

  const myPieces = useMemo(() => {
    return pieces.filter((piece) => {
      const direct = piece.employe === username;
      const viaTask = (piece.taches || []).some((task) => task.employe === username);
      return direct || viaTask;
    }).sort((a, b) => {
      const aDone = normalizeStatus(a.status) === "Termine" ? 1 : 0;
      const bDone = normalizeStatus(b.status) === "Termine" ? 1 : 0;
      return aDone - bDone;
    });
  }, [pieces, username]);

  const totalProducedInSession = saved
    ? toNumber(session?.piece.quantiteProduite, 0)
    : toNumber(session?.piece.quantiteProduite, 0) + count;
  const totalRubanInSession = saved
    ? toNumber(session?.piece.quantiteRuban, 0)
    : toNumber(session?.piece.quantiteRuban, 0) + sessionRuban;
  const progressPct = Math.round((totalProducedInSession / Math.max(1, session?.piece.quantite ?? 1)) * 100);
  const selectedMaterialReferences = useMemo(
    () => (pieceDraft.matiereType ? materialOptions[pieceDraft.matiereType] || [] : []),
    [pieceDraft.matiereType]
  );
  const getVisibleStatus = (piece: Piece) => {
    const baseStatus = normalizeStatus(piece.status);
    if (baseStatus === "Controle") return baseStatus;
    const isSessionPiece = session?.piece._id === piece._id && (session.statut === "en_cours" || session.statut === "pause");
    const isActivePiece = workState.currentPieceId === piece._id && (workState.machineStatus === "started" || workState.machineStatus === "paused");
    if (baseStatus === "Termine" && hasCompletedHistory(piece)) return baseStatus;
    return isSessionPiece || isActivePiece ? "En cours" : "Arrêté";
  };

  const saveSelectedPiece = async () => {
    if (!selectedPiece) return null;
    setSavingPiece(true);
    setPieceSaveError("");
    try {
      const payload = {
        ref: pieceDraft.ref,
        quantite: toNumber(pieceDraft.quantite, 0),
        matiere: pieceDraft.matiere,
        dimension: formatDimension(pieceDraft),
        matiereType: pieceDraft.matiereType,
        matiereReference: pieceDraft.matiereReference,
      };

      const response = await fetch(`${BASE_URL}/api/pieces/${selectedPiece._id}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setPieceSaveError(errorData?.message || "Enregistrement impossible. Verifiez la piece puis reessayez.");
        return null;
      }
      const serverPiece = await response.json();
      const updatedPiece = {
        ...selectedPiece,
        ...payload,
        ...serverPiece,
        ref: serverPiece?.ref ?? payload.ref ?? selectedPiece.ref,
        quantite: toNumber(serverPiece?.quantite ?? payload.quantite, toNumber(selectedPiece.quantite, 0)),
        quantiteProduite: toNumber(serverPiece?.quantiteProduite, toNumber(selectedPiece.quantiteProduite, 0)),
        dimension: serverPiece?.dimension ?? payload.dimension ?? selectedPiece.dimension,
        matiereType: serverPiece?.matiereType ?? payload.matiereType ?? selectedPiece.matiereType,
        matiereReference: serverPiece?.matiereReference ?? payload.matiereReference ?? selectedPiece.matiereReference,
        matiere: serverPiece?.matiere ?? payload.matiere ?? selectedPiece.matiere,
      };
      setPieces((prev) => prev.map((piece) => (piece._id === updatedPiece._id ? { ...piece, ...updatedPiece } : piece)));
      setSelectedPiece((prev) => (prev?._id === updatedPiece._id ? { ...prev, ...updatedPiece } : prev));
      return updatedPiece;
    } catch (error) {
      console.error(error);
      setPieceSaveError("Erreur reseau pendant l'enregistrement du formulaire.");
      return null;
    } finally {
      setSavingPiece(false);
    }
  };

  const postMachineAction = async (action: "started" | "paused" | "stopped", pieceId?: string, pieceCount?: number, rubanQuantity?: number) => {
    try {
      await fetch(`${BASE_URL}/api/employe/machine/action`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          action,
          activity: action === "started" ? `Production: ${selectedPiece?.nom}` : action === "paused" ? "Pause operateur" : "Cycle termine",
          pieceId: pieceId || null,
          pieceCount: pieceCount || null,
          rubanQuantity: rubanQuantity || null,
          machineName: selectedMachine?.name || null,
        }),
      });
    } catch (error) {
      console.error(error);
    }
  };

  const startSession = async () => {
    if (!selectedPiece || !selectedMachine) return;
    const activePiece = pieces.find((piece) => piece._id === selectedPiece._id) || selectedPiece;
    await postMachineAction("started", activePiece._id);
    setWorkState({ machineStatus: "started", currentPieceId: activePiece._id });
    const now = new Date();
    setSession({
      machine: selectedMachine,
      piece: { ...activePiece, status: normalizeStatus(activePiece.status) === "Termine" ? activePiece.status : "En cours" },
      startTime: now,
      statut: "en_cours",
      events: [{ type: "start", time: now }],
    });
    setElapsed(0);
    setCount(0);
    setSessionRuban(0);
    setSaved(false);
    setIsPaused(false);
    setStep("production");
  };

  const togglePause = async () => {
    if (!session) return;
    const now = new Date();
    if (isPaused) {
      await postMachineAction("started", session.piece._id);
      setWorkState({ machineStatus: "started", currentPieceId: session.piece._id });
      setSession((prev) => prev ? { ...prev, statut: "en_cours", events: [...prev.events, { type: "resume", time: now }] } : prev);
      setIsPaused(false);
      return;
    }
    await postMachineAction("paused");
    setWorkState({ machineStatus: "paused", currentPieceId: session.piece._id });
    setSession((prev) => prev ? { ...prev, statut: "pause", events: [...prev.events, { type: "pause", time: now }] } : prev);
    setIsPaused(true);
  };

  const stopSession = async () => {
    if (!session) return;
    const endTime = new Date();
    await postMachineAction("stopped", session.piece._id, count, sessionRuban);
    setWorkState({ machineStatus: "stopped", currentPieceId: null });
    setSession((prev) => prev ? {
      ...prev,
      statut: "terminee",
      piece: {
        ...prev.piece,
        quantiteProduite: toNumber(prev.piece.quantiteProduite, 0) + count,
        quantiteRuban: toNumber(prev.piece.quantiteRuban, 0) + sessionRuban,
      },
      events: [...prev.events, { type: "stop", time: endTime, pieceCount: count, rubanQuantity: sessionRuban }],
    } : prev);
    setSaved(true);
  };

  const resetWorkflow = (target: Step) => {
    setStep(target);
    setSession(null);
    setElapsed(0);
    setCount(0);
    setSessionRuban(0);
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
    if (target === "machines") return Boolean(selectedPiece && getVisibleStatus(selectedPiece) !== "Termine");
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
    { key: "production", label: "Production", detail: session ? (saved ? "Session enregistree" : "En cours") : "Apres demarrage" },
  ];
  const currentStepMeta = stepDescriptions[step];
  const getStatusTheme = (statusLabel: string) => {
    if (statusLabel === "En cours") return { bg: theme.accentSoft, text: theme.accent };
    if (statusLabel === "Termine") return { bg: darkMode ? "rgba(52,211,153,0.16)" : "rgba(5,150,105,0.12)", text: theme.success };
    if (statusLabel === "Controle") return { bg: darkMode ? "rgba(251,191,36,0.16)" : "rgba(217,119,6,0.12)", text: theme.warning };
    return { bg: darkMode ? "rgba(148,163,184,0.14)" : "rgba(100,116,139,0.12)", text: theme.muted };
  };
  const selectedPieceStatus = selectedPiece ? getVisibleStatus(selectedPiece) : "Arrete";

  return (
    <div style={{ minHeight: "100vh", height: isCompactLayout ? "auto" : "100vh", overflow: isCompactLayout ? "visible" : "hidden", display: "flex", flexDirection: isCompactLayout ? "column" : "row", background: theme.bg, color: theme.text, fontFamily: "'Sora','Manrope','Segoe UI',system-ui,sans-serif" }}>
      <aside style={{ width: isCompactLayout ? "100%" : 292, minWidth: isCompactLayout ? 0 : 292, minHeight: isCompactLayout ? "auto" : "100vh", position: isCompactLayout ? "relative" : "sticky", top: 0, alignSelf: isCompactLayout ? "stretch" : "flex-start", overflowY: isCompactLayout ? "visible" : "auto", flexShrink: 0, borderRight: isCompactLayout ? "none" : `1px solid ${theme.border}`, borderBottom: isCompactLayout ? `1px solid ${theme.border}` : "none", background: theme.aside, padding: isCompactLayout ? 18 : 24, display: "flex", flexDirection: "column", gap: 18, backdropFilter: "blur(18px)", boxShadow: "none" }}>
        <div style={{ borderBottom: `1px solid ${theme.border}`, paddingBottom: 18, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 0.2, color: theme.text }}>CNC Pulse</div>
              <div style={{ fontSize: 12, color: theme.muted, marginTop: 4 }}>Espace employe</div>
            </div>
            <button onClick={toggleTheme} style={{ ...secondaryButton, padding: "10px 12px", minWidth: 90 }}>
              {darkMode ? "Clair" : "Sombre"}
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, background: theme.inset, border: `1px solid ${theme.border}` }}>
            <div style={{ width: 42, height: 42, borderRadius: 14, background: theme.primary, color: "white", display: "grid", placeItems: "center", fontWeight: 900 }}>
              {String(username || "E").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: theme.text }}>{username}</div>
              <div style={{ fontSize: 11, color: theme.muted }}>Session employee active</div>
            </div>
          </div>
        </div>

        <nav style={{ display: "grid", gap: 10 }}>
          <div style={{ color: theme.subtle, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Flux de travail</div>
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
                  borderRadius: 18,
                  border: active ? `1px solid ${theme.accent}66` : `1px solid ${theme.border}`,
                  background: active ? `linear-gradient(135deg, ${theme.accentSoft}, ${darkMode ? "rgba(37,99,235,0.12)" : "rgba(14,165,233,0.08)"})` : theme.inset,
                  color: enabled ? active ? theme.accent : theme.textSoft : theme.subtle,
                  padding: "14px",
                  cursor: enabled ? "pointer" : "not-allowed",
                  opacity: enabled ? 1 : 0.58,
                  boxShadow: active ? (darkMode ? "0 16px 30px rgba(14,165,233,0.12)" : "none") : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 12, display: "grid", placeItems: "center", background: active ? theme.accentSoft : theme.inset, fontWeight: 900 }}>
                    {index + 1}
                  </span>
                  <span>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 800 }}>{item.label}</span>
                    <span style={{ display: "block", fontSize: 11, color: active ? theme.textSoft : enabled ? theme.muted : theme.subtle, marginTop: 3 }}>{item.detail}</span>
                  </span>
                </div>
              </button>
            );
          })}
        </nav>


        <div style={{ marginTop: "auto", display: "grid", gap: 10 }}>
          <button onClick={() => { localStorage.clear(); navigate("/"); }} style={{ ...secondaryButton, width: "100%", color: theme.danger, borderColor: darkMode ? "rgba(248,113,113,0.24)" : "rgba(220,38,38,0.18)", background: darkMode ? "rgba(127,29,29,0.12)" : "rgba(254,242,242,0.9)" }}>Quitter</button>
        </div>
      </aside>

      {tab === "workflow" && (
        <main style={{ flex: 1, minWidth: 0, height: isCompactLayout ? "auto" : "100vh", overflowY: isCompactLayout ? "visible" : "auto", padding: isCompactLayout ? 16 : 24 }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
            <div>
              <div style={{ color: theme.accent, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.2 }}>Espace employe</div>
              <h1 style={{ margin: "4px 0 0", fontSize: 34, lineHeight: 1.05, color: theme.text }}>Flux de production</h1>
            </div>
            <button
              onClick={() => {
                setTab("messages");
                setUnread(0);
              }}
              style={{ ...secondaryButton, display: "flex", alignItems: "center", gap: 10, background: unread > 0 ? theme.accentSoft : theme.secondary, borderColor: unread > 0 ? `${theme.accent}55` : theme.border }}
            >
              Messages
              {unread > 0 && <span style={badge(theme.accentSoft, theme.accent)}>{unread}</span>}
            </button>
          </div>

          <div style={{ ...sectionCardStyle, marginBottom: 22, display: "grid", gridTemplateColumns: isCompactLayout ? "1fr" : "minmax(320px, 1fr) auto", gap: 18, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, width: "fit-content", padding: "7px 12px", borderRadius: 999, background: theme.accentSoft, color: theme.accent, fontSize: 11, fontWeight: 800, letterSpacing: 0.4 }}>
                Etape {workflowSteps.findIndex((item) => item.key === step) + 1}
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: theme.accent }} />
                {currentStepMeta.title}
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: theme.text }}>{workflowSteps.find((item) => item.key === step)?.label || "Pieces"}</div>
              <div style={{ color: theme.muted, fontSize: 14, maxWidth: 620, lineHeight: 1.7 }}>
                {currentStepMeta.text}
              </div>
            </div>
            <div style={{ display: "grid", gap: 10, minWidth: 220 }}>
              <div style={{ ...subtlePanelStyle, padding: 14 }}>
                <div style={{ color: theme.subtle, fontSize: 11, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>Employe</div>
                <div style={{ color: theme.text, fontWeight: 800 }}>{username}</div>
              </div>
              <div style={{ ...subtlePanelStyle, padding: 14 }}>
                <div style={{ color: theme.subtle, fontSize: 11, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>Pieces assignees</div>
                <div style={{ color: theme.text, fontWeight: 800 }}>{myPieces.length}</div>
              </div>
            </div>
          </div>

          {step === "pieces" && (
            <div style={sectionCardStyle}>
              {!selectedPiece ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
                    <div>
                      <h2 style={{ margin: 0, color: theme.text }}>Liste des pieces</h2>
                      <p style={{ color: theme.muted, margin: "8px 0 0", maxWidth: 640, lineHeight: 1.7 }}>
                        Choisissez une piece pour consulter son plan, verifier les donnees importantes et preparer la production sans melanger les informations.
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ ...subtlePanelStyle, minWidth: 132, padding: 14 }}>
                        <div style={{ color: theme.subtle, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Pieces</div>
                        <div style={{ color: theme.text, fontSize: 24, fontWeight: 900, marginTop: 6 }}>{myPieces.length}</div>
                      </div>
                      <div style={{ ...subtlePanelStyle, minWidth: 132, padding: 14 }}>
                        <div style={{ color: theme.subtle, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>En cours</div>
                        <div style={{ color: theme.accent, fontSize: 24, fontWeight: 900, marginTop: 6 }}>
                          {myPieces.filter((piece) => getVisibleStatus(piece) === "En cours").length}
                        </div>
                      </div>
                    </div>
                  </div>
                  {loading ? <div style={{ ...cardStyle, color: theme.muted }}>Chargement...</div> : myPieces.length === 0 ? <div style={{ ...cardStyle, color: theme.muted }}>Aucune piece assignee pour le moment.</div> : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
                      {myPieces.map((piece) => {
                        const statusLabel = getVisibleStatus(piece);
                        const statusTone = getStatusTheme(statusLabel);
                        return (
                          <button
                            key={piece._id}
                            onClick={() => { setSelectedPiece(piece); setSelectedMachine(null); }}
                            style={{
                              ...cardStyle,
                              textAlign: "left",
                              cursor: "pointer",
                              color: theme.text,
                              transition: "transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease",
                              display: "grid",
                              gap: 14,
                            }}
                          >
                            <PiecePlanPreview piece={piece} height={150} compact />
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                              <div>
                                <div style={{ fontSize: 18, fontWeight: 900, color: theme.text }}>{piece.nom}</div>
                                <div style={{ fontSize: 12, color: theme.muted, marginTop: 4 }}>
                                  {piece.currentMachine || piece.machine || "Machine non definie"}
                                </div>
                              </div>
                              <span style={badge(statusTone.bg, statusTone.text)}>{statusLabel}</span>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
                              <div style={{ ...subtlePanelStyle, padding: 12 }}>
                                <div style={{ color: theme.subtle, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Reference</div>
                                <div style={{ color: theme.text, fontSize: 14, fontWeight: 800, marginTop: 6 }}>{piece.ref || "Non renseignee"}</div>
                              </div>
                              <div style={{ ...subtlePanelStyle, padding: 12 }}>
                                <div style={{ color: theme.subtle, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Production</div>
                                <div style={{ color: theme.text, fontSize: 14, fontWeight: 800, marginTop: 6 }}>
                                  {piece.quantiteProduite || 0} / {piece.quantite || 0}
                                </div>
                              </div>
                              <div style={{ ...subtlePanelStyle, padding: 12 }}>
                                <div style={{ color: theme.subtle, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Dimension</div>
                                <div style={{ color: theme.text, fontSize: 13, fontWeight: 700, marginTop: 6 }}>
                                  {piece.dimension || "Non renseignee"}
                                </div>
                              </div>
                              <div style={{ ...subtlePanelStyle, padding: 12 }}>
                                <div style={{ color: theme.subtle, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Matiere</div>
                                <div style={{ color: piece.matiere ? theme.success : theme.danger, fontSize: 13, fontWeight: 800, marginTop: 6 }}>
                                  {piece.matiere ? "Disponible" : "Manquante"}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <h2 style={{ margin: 0, color: theme.text }}>{selectedPiece.nom}</h2>
                        <span style={badge(getStatusTheme(selectedPieceStatus).bg, getStatusTheme(selectedPieceStatus).text)}>{selectedPieceStatus}</span>
                      </div>
                      <div style={{ color: theme.muted, marginTop: 8, maxWidth: 620 }}>
                        Verifiez le plan, completez seulement les champs utiles, puis passez a la machine quand la piece est prete.
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button onClick={() => resetWorkflow("pieces")} style={secondaryButton}>Changer la piece</button>
                      <button
                        onClick={async () => {
                          if (getVisibleStatus(selectedPiece) === "Termine") return;
                          const updatedPiece = await saveSelectedPiece();
                          if (!updatedPiece) return;
                          if (getVisibleStatus(updatedPiece) === "Termine") return;
                          setStep("machines");
                        }}
                        disabled={getVisibleStatus(selectedPiece) === "Termine" || savingPiece}
                        style={{ ...primaryButton, opacity: getVisibleStatus(selectedPiece) === "Termine" || savingPiece ? 0.55 : 1, cursor: getVisibleStatus(selectedPiece) === "Termine" || savingPiece ? "not-allowed" : "pointer" }}
                      >
                        {getVisibleStatus(selectedPiece) === "Termine" ? "Piece terminee" : "Choisir une machine"}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: isCompactLayout ? "1fr" : "minmax(280px, 1.1fr) minmax(280px, 0.9fr)", gap: 16 }}>
                    <div style={{ ...cardStyle, display: "grid", gap: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 900, color: theme.text }}>Plan de fabrication</div>
                        <span style={badge(theme.accentSoft, theme.accent)}>{selectedPiece.currentMachine || selectedPiece.machine || "Machine non definie"}</span>
                      </div>
                      <PiecePlanPreview piece={selectedPiece} height={270} />
                      <div style={{ ...subtlePanelStyle, padding: 14, display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 }}>
                        <div>
                          <div style={{ color: theme.subtle, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Reference</div>
                          <div style={{ color: theme.text, fontWeight: 800, marginTop: 6 }}>{selectedPiece.ref || "Non renseignee"}</div>
                        </div>
                        <div>
                          <div style={{ color: theme.subtle, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Production</div>
                          <div style={{ color: theme.text, fontWeight: 800, marginTop: 6 }}>{selectedPiece.quantiteProduite || 0} / {selectedPiece.quantite || 0}</div>
                        </div>
                        <div>
                          <div style={{ color: theme.subtle, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Matiere</div>
                          <div style={{ color: selectedPiece.matiere ? theme.success : theme.danger, fontWeight: 800, marginTop: 6 }}>
                            {selectedPiece.matiere ? "Disponible" : "A verifier"}
                          </div>
                        </div>
                      </div>
                      <div style={{ color: theme.muted, fontSize: 12 }}>Double clic sur le plan pour l'ouvrir dans une nouvelle fenetre quand le format est lisible.</div>
                    </div>

                    <div>
                      <div style={{ ...cardStyle, display: "grid", gap: 16 }}>
                        <div>
                          <div style={{ fontWeight: 900, color: theme.text }}>Formulaire piece</div>
                          <div style={{ color: theme.muted, fontSize: 12, marginTop: 6 }}>
                            Remplissez seulement les champs utiles avant de passer a la machine.
                          </div>
                        </div>
                        <div style={{ ...subtlePanelStyle, display: "grid", gap: 12 }}>
                          <div style={{ color: theme.subtle, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.1, fontWeight: 800 }}>Identite</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
                            <div>
                              <label style={labelStyle}>Reference</label>
                              <input value={pieceDraft.ref} onChange={(event) => setPieceDraft((prev) => ({ ...prev, ref: event.target.value }))} placeholder="REF-001" style={inputBaseStyle} />
                            </div>
                            <div>
                              <label style={labelStyle}>Quantite requise</label>
                              <input type="number" value={pieceDraft.quantite} onChange={(event) => setPieceDraft((prev) => ({ ...prev, quantite: toNumber(event.target.value, 0) }))} style={inputBaseStyle} />
                            </div>
                          </div>
                          <div style={{ ...subtlePanelStyle, padding: 14 }}>
                            <div style={{ color: theme.subtle, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.1, fontWeight: 800 }}>Production</div>
                            <div style={{ color: theme.text, fontSize: 14, fontWeight: 800, marginTop: 8 }}>
                              {selectedPiece.quantiteProduite || 0} / {selectedPiece.quantite || 0}
                            </div>
                            <div style={{ color: theme.muted, fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
                              La quantite produite se saisit seulement dans l etape production, apres le choix de la machine.
                            </div>
                          </div>
                        </div>
                        <div style={{ ...subtlePanelStyle, display: "grid", gap: 12 }}>
                          <div style={{ color: theme.subtle, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.1, fontWeight: 800 }}>Dimensions</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
                            <div>
                              <label style={labelStyle}>Largeur</label>
                              <input value={pieceDraft.largeur} onChange={(event) => setPieceDraft((prev) => ({ ...prev, largeur: event.target.value }))} placeholder="120 mm" style={inputBaseStyle} />
                            </div>
                            <div>
                              <label style={labelStyle}>Longueur</label>
                              <input value={pieceDraft.longueur} onChange={(event) => setPieceDraft((prev) => ({ ...prev, longueur: event.target.value }))} placeholder="40 mm" style={inputBaseStyle} />
                            </div>
                            <div>
                              <label style={labelStyle}>Hauteur</label>
                              <input value={pieceDraft.hauteur} onChange={(event) => setPieceDraft((prev) => ({ ...prev, hauteur: event.target.value }))} placeholder="12 mm" style={inputBaseStyle} />
                            </div>
                          </div>
                        </div>
                        <div style={{ ...subtlePanelStyle, display: "grid", gap: 12 }}>
                          <div style={{ color: theme.subtle, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.1, fontWeight: 800 }}>Matiere</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
                            <div>
                              <label style={labelStyle}>Type matiere</label>
                              <select
                                value={pieceDraft.matiereType}
                                onChange={(event) => setPieceDraft((prev) => ({ ...prev, matiereType: event.target.value, matiereReference: "" }))}
                                style={inputBaseStyle}
                                title="Type matiere"
                              >
                                <option value="">Choisir une matiere</option>
                                {Object.keys(materialOptions).map((materialType) => (
                                  <option key={materialType} value={materialType}>{materialType}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label style={labelStyle}>Reference matiere</label>
                              <select
                                value={pieceDraft.matiereReference}
                                onChange={(event) => setPieceDraft((prev) => ({ ...prev, matiereReference: event.target.value }))}
                                style={inputBaseStyle}
                                title="Reference matiere"
                                disabled={!pieceDraft.matiereType}
                              >
                                <option value="">Choisir une reference</option>
                                {selectedMaterialReferences.map((reference) => (
                                  <option key={reference} value={reference}>{reference}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <label style={{ ...subtlePanelStyle, display: "flex", alignItems: "center", gap: 10, padding: 14, color: theme.text, fontSize: 13, fontWeight: 700 }}>
                            <input type="checkbox" checked={pieceDraft.matiere} onChange={(event) => setPieceDraft((prev) => ({ ...prev, matiere: event.target.checked }))} />
                            Matiere disponible
                          </label>
                        </div>
                        <div style={{ display: "grid", gap: 10 }}>
                          <button onClick={saveSelectedPiece} disabled={savingPiece} style={{ ...primaryButton, width: "100%", opacity: savingPiece ? 0.7 : 1, cursor: savingPiece ? "wait" : "pointer" }}>
                            {savingPiece ? "Enregistrement..." : "Enregistrer le formulaire"}
                          </button>
                          {pieceSaveError && (
                            <div style={{ color: theme.danger, fontSize: 12, lineHeight: 1.6 }}>
                              {pieceSaveError}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {step === "machines" && selectedPiece && (
            <div style={sectionCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ margin: 0, color: theme.text }}>Choix de la machine</h2>
                  <div style={{ color: theme.muted, marginTop: 6 }}>
                    Piece selectionnee: <span style={{ color: theme.success, fontWeight: 800 }}>{selectedPiece.nom}</span>
                  </div>
                </div>
                <button onClick={() => resetWorkflow("pieces")} style={secondaryButton}>Retour aux pieces</button>
              </div>
              <div style={{ ...subtlePanelStyle, marginBottom: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                <div>
                  <div style={{ color: theme.subtle, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Statut</div>
                  <div style={{ color: getStatusTheme(selectedPieceStatus).text, fontWeight: 900, marginTop: 6 }}>{selectedPieceStatus}</div>
                </div>
                <div>
                  <div style={{ color: theme.subtle, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Machine actuelle</div>
                  <div style={{ color: theme.text, fontWeight: 900, marginTop: 6 }}>{selectedPiece.currentMachine || selectedPiece.machine || "Non definie"}</div>
                </div>
                <div>
                  <div style={{ color: theme.subtle, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Quantite</div>
                  <div style={{ color: theme.text, fontWeight: 900, marginTop: 6 }}>{selectedPiece.quantiteProduite || 0} / {selectedPiece.quantite || 0}</div>
                </div>
              </div>
              <div style={{ ...cardStyle, marginBottom: 16, padding: 18, color: theme.muted, lineHeight: 1.7 }}>
                Choisissez la machine qui va travailler cette piece. La machine deja utilisee reste marquee pour garder le suivi clair.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
                {machines.map((machine) => {
                  const visual = getMachineVisual({ id: machine.id, name: machine.name, icon: machine.icon, imageUrl: machine.imageUrl });
                  const Icon = visual.Icon;
                  const accent = getMachineAccent(machine);
                  const isCurrent = machine.name === (selectedPiece.currentMachine || selectedPiece.machine);
                  const isSelected = selectedMachine?.id === machine.id;
                  return (
                    <button
                      key={machine.id}
                      onClick={() => { setSelectedMachine(machine); }}
                      style={{
                        ...cardStyle,
                        textAlign: "left",
                        cursor: "pointer",
                        color: theme.text,
                        padding: 0,
                        overflow: "hidden",
                        borderRadius: 22,
                        border: isSelected || isCurrent ? `1px solid ${accent}` : `1px solid ${theme.border}`,
                      }}
                    >
                      <div style={{ height: 132, position: "relative", overflow: "hidden", background: darkMode ? "#020617" : "#dbeafe" }}>
                        <img src={visual.image} alt={visual.alt} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.64, display: "block" }} />
                        <div style={{ position: "absolute", inset: 0, background: darkMode ? `linear-gradient(135deg, rgba(2,6,23,0.2), ${accent}33)` : `linear-gradient(135deg, rgba(255,255,255,0.2), ${accent}20)` }} />
                        <div style={{ position: "absolute", left: 14, top: 14, width: 44, height: 44, borderRadius: 14, background: darkMode ? "rgba(2,6,23,0.72)" : "rgba(255,255,255,0.82)", border: `1px solid ${accent}55`, display: "grid", placeItems: "center", color: accent }}>
                          <Icon size={21} />
                        </div>
                        {isCurrent && (
                          <span style={{ position: "absolute", right: 12, top: 12, ...badge(`${accent}22`, accent) }}>Etape actuelle</span>
                        )}
                        {isSelected && (
                          <span style={{ position: "absolute", left: 12, bottom: 12, ...badge(`${accent}22`, accent) }}>Selectionnee</span>
                        )}
                      </div>
                      <div style={{ padding: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 900, color: theme.text }}>{machine.name}</div>
                            <div style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>
                              {[machine.marque, machine.model].filter(Boolean).join(" - ") || "Modele non renseigne"}
                            </div>
                          </div>
                          <span style={badge(darkMode ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)", theme.textSoft)}>{machine.type || "Machine"}</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                          <div style={{ ...subtlePanelStyle, padding: 12 }}>
                            <div style={{ color: theme.subtle, fontSize: 10, textTransform: "uppercase", fontWeight: 800 }}>Connexion</div>
                            <div style={{ color: machine.hasSensors ? theme.success : theme.textSoft, fontSize: 12, fontWeight: 800, marginTop: 4 }}>{machine.hasSensors ? "Capteurs" : "Manuel"}</div>
                          </div>
                          <div style={{ padding: 12, borderRadius: 16, background: `${accent}12`, border: `1px solid ${accent}33` }}>
                            <div style={{ color: theme.subtle, fontSize: 10, textTransform: "uppercase", fontWeight: 800 }}>Action</div>
                            <div style={{ color: accent, fontSize: 12, fontWeight: 900, marginTop: 4 }}>Selectionner</div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {selectedMachine && (
                <div style={{ ...cardStyle, marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ color: theme.subtle, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, fontWeight: 800 }}>Machine choisie</div>
                    <div style={{ color: theme.text, fontSize: 20, fontWeight: 900 }}>{selectedMachine.name}</div>
                    <div style={{ color: selectedPiece.matiere ? theme.success : theme.danger, fontSize: 13, fontWeight: 700 }}>
                      {selectedPiece.matiere ? "Matiere disponible, vous pouvez demarrer." : "Matiere a verifier avant demarrage."}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <button onClick={() => setSelectedMachine(null)} style={secondaryButton}>Changer</button>
                    <button disabled={!selectedPiece.matiere} onClick={startSession} style={{ ...primaryButton, cursor: selectedPiece.matiere ? "pointer" : "not-allowed", opacity: selectedPiece.matiere ? 1 : 0.55 }}>
                      Demarrer la production
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === "production" && session && (
            <div style={sectionCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
                <div>
                  <h2 style={{ margin: 0, color: theme.text }}>Production en cours</h2>
                  <div style={{ color: theme.muted, marginTop: 8 }}>
                    {session.piece.nom} sur {session.machine.name}
                  </div>
                </div>
                <span style={badge(isPaused ? (darkMode ? "rgba(251,191,36,0.16)" : "rgba(217,119,6,0.12)") : theme.accentSoft, isPaused ? theme.warning : theme.accent)}>
                  {isPaused ? "Pause" : saved ? "Session enregistree" : "En cours"}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16, marginBottom: 16 }}>
                <div style={cardStyle}>
                  <div style={{ color: theme.subtle, marginBottom: 8 }}>Temps</div>
                  <div style={{ fontSize: 30, fontWeight: 900, color: theme.accent }}>{fmt(elapsed)}</div>
                </div>
                <div style={cardStyle}>
                  <div style={{ color: theme.subtle, marginBottom: 8 }}>Pieces faites</div>
                  <input
                    type="number"
                    min={0}
                    value={count}
                    onChange={(event) => setCount(toNumber(event.target.value, 0))}
                    disabled={saved}
                    style={bigInputStyle}
                  />
                  <div style={{ fontSize: 12, color: theme.subtle, marginTop: 10 }}>Entrez juste un nombre.</div>
                </div>
                <div style={cardStyle}>
                  <div style={{ color: theme.subtle, marginBottom: 8 }}>Quantite ruban</div>
                  <input
                    type="number"
                    min={0}
                    value={sessionRuban}
                    onChange={(event) => setSessionRuban(toNumber(event.target.value, 0))}
                    disabled={saved}
                    style={bigInputStyle}
                  />
                  <div style={{ fontSize: 12, color: theme.subtle, marginTop: 10 }}>Total ruban apres session: {totalRubanInSession}</div>
                </div>
                <div style={cardStyle}>
                  <div style={{ color: theme.subtle, marginBottom: 8 }}>Objectif</div>
                  <div style={{ fontSize: 30, fontWeight: 900, color: theme.warning }}>{progressPct}%</div>
                  <div style={{ fontSize: 12, color: theme.subtle }}>{totalProducedInSession} / {session.piece.quantite} pcs</div>
                </div>
              </div>
              <div style={{ ...cardStyle, marginBottom: 16, display: "grid", gap: 16 }}>
                <div style={{ marginBottom: 14 }}>
                  <PiecePlanPreview piece={session.piece} height={220} />
                </div>
                <PieceInfoGrid piece={session.piece} machineName={session.machine.name} />
                <div style={{ marginTop: 4, paddingTop: 14, borderTop: `1px solid ${theme.border}`, fontSize: 13, color: theme.textSoft }}>
                  Quantite produite / quantite requise: <strong style={{ color: theme.text }}>{totalProducedInSession} / {session.piece.quantite}</strong>
                </div>
              </div>
              {!saved ? (
                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={togglePause} style={{ ...primaryButton, flex: 1, background: isPaused ? "linear-gradient(135deg,#1d4ed8,#0ea5e9)" : "linear-gradient(135deg,#b45309,#f59e0b)" }}>
                    {isPaused ? "Reprendre" : "Pause"}
                  </button>
                  <button onClick={stopSession} style={{ ...primaryButton, flex: 1, background: "linear-gradient(135deg,#7f1d1d,#ef4444)" }}>
                    Arreter et enregistrer
                  </button>
                </div>
              ) : (
                <div style={cardStyle}>
                  <div style={{ color: theme.success, fontWeight: 800, marginBottom: 12 }}>Session enregistree.</div>
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
        <main style={{ flex: 1, minWidth: 0, height: isCompactLayout ? "auto" : "100vh", overflowY: isCompactLayout ? "visible" : "auto", padding: isCompactLayout ? 16 : 24 }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
            <div>
              <div style={{ color: theme.accent, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.2 }}>Messages</div>
              <h1 style={{ margin: "4px 0 0", fontSize: 30, lineHeight: 1.1, color: theme.text }}>Discussion avec l'administrateur</h1>
            </div>
            <button onClick={() => setTab("workflow")} style={secondaryButton}>Retour au travail</button>
          </div>
          <div style={{ ...cardStyle, minHeight: 460, display: "flex", flexDirection: "column" }}>
            <div style={{ fontWeight: 900, marginBottom: 14, color: theme.text }}>Discussion avec l'administrateur</div>
            <div style={{ flex: 1, overflowY: "auto", marginBottom: 14 }}>
              {messages.map((msg) => {
                const isMe = msg.from === username;
                return (
                  <div key={msg._id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", marginBottom: 10 }}>
                    <div style={{ maxWidth: "70%", background: isMe ? theme.primary : theme.inset, color: isMe ? "white" : theme.text, padding: "10px 14px", borderRadius: 16, border: isMe ? "none" : `1px solid ${theme.border}` }}>
                      <div style={{ fontSize: 13, lineHeight: 1.6 }}>{msg.text}</div>
                      <div style={{ fontSize: 10, color: isMe ? "rgba(255,255,255,0.72)" : theme.subtle, marginTop: 4 }}>{new Date(msg.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={msgEndRef} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <input value={msgText} onChange={(e) => setMsgText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} placeholder="Ecrire un message..." style={{ ...inputBaseStyle, flex: 1 }} />
              <button onClick={sendMessage} style={{ ...primaryButton, padding: "12px 16px" }}>Envoyer</button>
            </div>
          </div>
        </div>
        </main>
      )}
    </div>
  );
};

export default EmployePage;
