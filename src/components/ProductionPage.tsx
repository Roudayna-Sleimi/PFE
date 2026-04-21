import React, { useMemo, useState, useEffect } from 'react';
import { Package, X, AlertTriangle, CheckCircle, Clock, User, Wrench, TrendingUp, Search } from 'lucide-react';
import DossierPage from './DossierPage';
import type { DossierPieceContext } from './DossierPage';
import { io } from 'socket.io-client';

const APP_BASE = 'http://localhost:5000';
const API = `${APP_BASE}/api`;

// ── Types ──
interface UserAPI {
  _id: string;
  username: string;
  role: string;
}

interface Piece {
  _id: string;
  nom: string;
  machine: string;
  machineChain?: string[];
  currentMachine?: string | null;
  currentStep?: number;
  history?: { machine: string; action: 'entered' | 'completed'; by?: string; at?: string }[];
  employe: string;
  quantite: number;
  quantiteProduite?: number;
  prix: number;
  status: 'Arrêté' | 'En cours' | 'Terminé' | 'Contrôle';
  matiere: boolean;
  dimension?: string;
  matiereType?: string;
  matiereReference?: string;
  solidworksPath?: string;
  planDocumentId?: string;
  planPath?: string;
  planName?: string;
  planMimeType?: string;
}

interface DimensionFields {
  largeur: string;
  longueur: string;
  hauteur: string;
}

interface PieceFormState extends Partial<Piece>, DimensionFields {}

interface MachineApi {
  id: string;
  name: string;
  hasSensors?: boolean;
  node?: string | null;
}

interface DossierDocument {
  _id: string;
  originalName: string;
  mimeType?: string;
  publicPath?: string;
  clientLastName: string;
  clientFirstName: string;
  projectName?: string;
  pieceName: string;
}

const statusConfig = {
  'Arrêté': { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.24)', label: 'Arrêté' },
  'Terminé': { color: '#22c55e', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)', label: 'Termine' },
  'En cours': { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', label: 'En cours' },
  'Contrôle': { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.24)', label: 'Arrêté' },
};

const materialOptions: Record<string, string[]> = {
  Aluminium: ['2017', '5083', '7075'],
  Bronze: ['B12'],
  Acier: ['42CD4', '40CMD8', 'Z160', 'Z40', 'XC48', 'E24'],
  Inox: ['304', '316L'],
  Plastique: ['POM noir', 'POM blanc', 'PEEK', 'PA6', 'NYLON'],
};


const PieceIcon = ({ nom }: { nom: string }) => {
  const icons: Record<string, string> = {
    'engrenage': 'GEAR', 'support': 'SUP', 'plaque': 'PLQ',
    'connecteur': 'CON', 'axe': 'AXE',
  };
  const key = Object.keys(icons).find(k => String(nom || '').toLowerCase().includes(k));
  return <span style={{ fontSize: 24, letterSpacing: 0, color: '#0f766e', fontWeight: 800 }}>{key ? icons[key] : 'PCE'}</span>;
};

const normalizeKey = (value: string) => String(value || '').trim().toLowerCase();
const getClientLabel = (doc: DossierDocument) => `${doc.clientLastName || ''} ${doc.clientFirstName || ''}`.trim() || 'Inconnu';
const isImageDoc = (doc: DossierDocument) => String(doc.mimeType || '').startsWith('image/');
const isPdfDoc = (doc: DossierDocument) => doc.mimeType === 'application/pdf' || /\.pdf$/i.test(doc.originalName || '');
const isCadDoc = (doc: DossierDocument) => /\.(sldprt|sldasm|slddrw|step|stp|iges|igs|dxf|dwg)$/i.test(doc.originalName || '');

const displayMimeByExt: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  ico: 'image/x-icon',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

const cadExtensions = new Set(['stp', 'step', 'sldasm', 'sldprt', 'slddrw', 'igs', 'iges', 'dxf', 'dwg']);

const getFileExtension = (filename = '') => {
  const ext = filename.includes('.') ? filename.split('.').pop() || '' : '';
  return ext.trim().toLowerCase();
};

const getDisplayMimeType = (doc: DossierDocument) => {
  const ext = getFileExtension(doc.originalName);
  if (displayMimeByExt[ext]) return displayMimeByExt[ext];
  if (doc.mimeType && doc.mimeType !== 'application/octet-stream') return doc.mimeType;
  return 'application/octet-stream';
};

const getDocTypeBadge = (doc: DossierDocument | null) => {
  if (!doc) return '';
  const ext = getFileExtension(doc.originalName);
  const mime = String(doc.mimeType || '');
  if (ext === 'pdf' || mime === 'application/pdf') return 'PDF';
  if (displayMimeByExt[ext]?.startsWith('image/') || mime.startsWith('image/')) return 'IMG';
  if (ext === 'sldprt' || ext === 'sldasm' || ext === 'slddrw') return 'SLD';
  if (cadExtensions.has(ext)) return 'CAD';
  return (ext || 'FILE').slice(0, 4).toUpperCase();
};

const readJsonMaybe = async (res: Response) => {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return await res.json();
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: String(text || '').replace(/\s+/g, ' ').trim() };
  }
};

const resolvePublicPathUrl = (publicPath?: string) => {
  if (!publicPath) return '';
  if (/^https?:\/\//i.test(publicPath)) return publicPath;
  return `${APP_BASE}${publicPath.startsWith('/') ? publicPath : `/${publicPath}`}`;
};

const canPreviewInBrowser = (doc: DossierDocument) => {
  const mimeType = getDisplayMimeType(doc);
  return mimeType === 'application/pdf' || mimeType.startsWith('image/');
};

const renderDocumentWindow = (popup: Window, doc: DossierDocument, url: string | null) => {
  const mimeType = getDisplayMimeType(doc);
  const ext = getFileExtension(doc.originalName).toUpperCase() || 'FILE';
  const isPreviewable = canPreviewInBrowser(doc);
  const docBody = popup.document.body;

  popup.document.title = doc.originalName;
  docBody.replaceChildren();
  docBody.style.margin = '0';
  docBody.style.minHeight = '100vh';
  docBody.style.background = '#020617';
  docBody.style.color = '#e2e8f0';
  docBody.style.fontFamily = 'Arial, sans-serif';

  const shell = popup.document.createElement('div');
  shell.style.minHeight = '100vh';
  shell.style.display = 'flex';
  shell.style.flexDirection = 'column';

  const header = popup.document.createElement('div');
  header.style.padding = '12px 16px';
  header.style.borderBottom = '1px solid rgba(255,255,255,0.10)';
  header.style.background = '#0f172a';
  header.style.fontSize = '13px';
  header.style.fontWeight = '700';
  header.style.overflow = 'hidden';
  header.style.textOverflow = 'ellipsis';
  header.style.whiteSpace = 'nowrap';
  header.textContent = doc.originalName;

  const content = popup.document.createElement('div');
  content.style.flex = '1';
  content.style.minHeight = '0';
  content.style.display = 'flex';
  content.style.alignItems = 'center';
  content.style.justifyContent = 'center';

  shell.appendChild(header);
  shell.appendChild(content);
  docBody.appendChild(shell);

  if (isPreviewable && url && mimeType.startsWith('image/')) {
    const image = popup.document.createElement('img');
    image.src = url;
    image.alt = doc.originalName;
    image.style.maxWidth = '100%';
    image.style.maxHeight = 'calc(100vh - 48px)';
    image.style.objectFit = 'contain';
    image.onerror = () => {
      content.replaceChildren();
      const message = popup.document.createElement('div');
      message.style.padding = '24px';
      message.style.textAlign = 'center';
      message.textContent = 'Apercu image non supporte par ce navigateur.';
      content.appendChild(message);
    };
    content.appendChild(image);
    return;
  }

  if (isPreviewable && url && mimeType === 'application/pdf') {
    const frame = popup.document.createElement('iframe');
    frame.title = doc.originalName;
    frame.src = url;
    frame.style.width = '100%';
    frame.style.height = 'calc(100vh - 48px)';
    frame.style.border = 'none';
    content.appendChild(frame);
    return;
  }

  const panel = popup.document.createElement('div');
  panel.style.maxWidth = '520px';
  panel.style.padding = '28px';
  panel.style.textAlign = 'center';
  panel.style.border = '1px solid rgba(255,255,255,0.10)';
  panel.style.background = '#0f172a';
  panel.style.borderRadius = '8px';

  const badge = popup.document.createElement('div');
  badge.style.margin = '0 auto 14px';
  badge.style.width = '72px';
  badge.style.height = '72px';
  badge.style.display = 'grid';
  badge.style.placeItems = 'center';
  badge.style.border = '1px solid rgba(125,211,252,0.28)';
  badge.style.borderRadius = '8px';
  badge.style.color = '#7dd3fc';
  badge.style.fontWeight = '900';
  badge.textContent = cadExtensions.has(ext.toLowerCase()) ? '3D' : ext;

  const title = popup.document.createElement('div');
  title.style.fontSize = '16px';
  title.style.fontWeight = '800';
  title.style.marginBottom = '8px';
  title.textContent = doc.originalName;

  const hint = popup.document.createElement('div');
  hint.style.color = '#94a3b8';
  hint.style.fontSize = '13px';
  hint.style.lineHeight = '1.5';
  hint.textContent = cadExtensions.has(ext.toLowerCase())
    ? 'Apercu CAD non disponible dans le navigateur sans viewer/converter. Aucun telechargement lance.'
    : 'Apercu non disponible pour ce type de fichier. Aucun telechargement lance.';

  panel.appendChild(badge);
  panel.appendChild(title);
  panel.appendChild(hint);
  content.appendChild(panel);
};

const getInitialProductionTab = (): 'production' | 'clients' => {
  if (typeof window === 'undefined') return 'production';
  try {
    const savedTab = window.sessionStorage.getItem('production-main-tab');
    return savedTab === 'clients' ? 'clients' : 'production';
  } catch {
    return 'production';
  }
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizePieceStatus = (status: unknown): Piece['status'] => {
  const raw = normalizeKey(String(status || ''));
  if (raw.includes('termin')) return 'Terminé';
  if (raw.includes('arret') || raw.includes('stop')) return 'Arrêté';
  if (raw.includes('control') || raw.includes('contr')) return 'Contrôle';
  return 'En cours';
};

const getPieceStatusConfig = (status: unknown) => statusConfig[normalizePieceStatus(status)];
const getMachineChain = (piece: Partial<Piece> | null | undefined) => (
  Array.isArray(piece?.machineChain) ? piece.machineChain.filter(Boolean) : []
);

const emptyDimensions = (): DimensionFields => ({
  largeur: '',
  longueur: '',
  hauteur: '',
});

const parseDimension = (value: string | undefined): DimensionFields => {
  const raw = String(value || '').trim();
  if (!raw) return emptyDimensions();

  const labelled = {
    largeur: raw.match(/largeur\s*:\s*([^|]+)/i)?.[1]?.trim() || '',
    longueur: raw.match(/longueur\s*:\s*([^|]+)/i)?.[1]?.trim() || '',
    hauteur: raw.match(/hauteur\s*:\s*([^|]+)/i)?.[1]?.trim() || '',
  };

  if (labelled.largeur || labelled.longueur || labelled.hauteur) return labelled;

  const parts = raw.split(/x|×|\||,/i).map((part) => part.trim()).filter(Boolean);
  return {
    largeur: parts[0] || '',
    longueur: parts[1] || '',
    hauteur: parts[2] || '',
  };
};

const formatDimension = ({ largeur, longueur, hauteur }: DimensionFields) => (
  [
    largeur.trim() ? `Largeur: ${largeur.trim()}` : '',
    longueur.trim() ? `Longueur: ${longueur.trim()}` : '',
    hauteur.trim() ? `Hauteur: ${hauteur.trim()}` : '',
  ].filter(Boolean).join(' | ')
);

const ProductionPage: React.FC = () => {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [mainTab, setMainTab] = useState<'production' | 'clients'>(getInitialProductionTab);
  const [dossierPieceNames, setDossierPieceNames] = useState<string[]>([]);
  const [employes, setEmployes] = useState<string[]>([]);
  const [machines, setMachines] = useState<MachineApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState('Toutes');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);
  const [editingPieceInfo, setEditingPieceInfo] = useState(false);
  const [pieceInfoDraft, setPieceInfoDraft] = useState({
    ...emptyDimensions(),
    matiereType: '',
    matiereReference: '',
  });
  const [newPiece, setNewPiece] = useState<PieceFormState>({ ...emptyDimensions(), matiere: false, status: 'Arrêté' });
  const [dossiers, setDossiers] = useState<DossierDocument[]>([]);
  const [creationContext, setCreationContext] = useState<DossierPieceContext | null>(null);
  const [selectedDossierClient, setSelectedDossierClient] = useState('');
  const [selectedDossierProject, setSelectedDossierProject] = useState('');
  const [chainSteps, setChainSteps] = useState<string[]>([]);
  const [chainNext, setChainNext] = useState('');
  const [selectedDossierPiece, setSelectedDossierPiece] = useState('');
  const [previewDoc, setPreviewDoc] = useState<DossierDocument | null>(null);

  const token = localStorage.getItem('token') || '';
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  useEffect(() => {
    try {
      window.sessionStorage.setItem('production-main-tab', mainTab);
    } catch {
      // optional persistence
    }
  }, [mainTab]);

  // ── Fetch employés (role = 'employe' seulement) ──
  const fetchEmployes = async () => {
    try {
      const res = await fetch(`${API}/users`, { headers });
      const data: UserAPI[] = await res.json();
      if (res.ok && Array.isArray(data)) {
        const noms = data
          .filter((u: UserAPI) => u.role === 'employe')
          .map((u: UserAPI) => u.username);
        setEmployes(noms);
      }
    } catch (err) {
      console.error('Erreur fetch employés:', err);
    }
  };

  // ── Fetch pièces ──
  const fetchPieces = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/pieces`, { headers });
      const data = await res.json();
      setPieces(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erreur fetch pièces:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDossierPieceNames = async () => {
    try {
      const res = await fetch(`${API}/dossiers/piece-names`, { headers });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) setDossierPieceNames(data);
    } catch (err) {
      console.error('Erreur fetch noms pieces dossier:', err);
    }
  };

  const fetchDossiers = async () => {
    try {
      const res = await fetch(`${API}/dossiers`, { headers });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) setDossiers(data);
    } catch (err) {
      console.error('Erreur fetch dossiers:', err);
    }
  };

  useEffect(() => {
    fetchEmployes();
    fetchPieces();
    fetchDossierPieceNames();
    fetchDossiers();

    fetch(`${API}/machines`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((data: MachineApi[]) => {
        if (!Array.isArray(data)) return;
        setMachines(data.filter((m) => m && m.id !== 'compresseur'));
      })
      .catch(() => { });

    // Socket — listen for real-time piece updates
    const socket = io('http://localhost:5000', { transports: ['websocket'] });
    socket.on('piece-progressed', (updatedPiece: Piece) => {
      setPieces(prev => prev.map(p => p._id === updatedPiece._id ? { ...p, ...updatedPiece } : p));
    });
    socket.on('dashboard-refresh', () => {
      fetchPieces();
    });
    return () => { socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stats
  const totalProduction = pieces.reduce((s, p) => s + toNumber(p.quantite), 0);
  const totalProduit = pieces.reduce((s, p) => s + toNumber(p.quantiteProduite), 0);
  const enCours = pieces.filter(p => normalizePieceStatus(p.status) === 'En cours').length;
  const terminees = pieces.filter(p => normalizePieceStatus(p.status) === 'Terminé').length;
  const alertes = pieces.filter(p => !p.matiere);
  const filtrees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pieces.filter((piece) => {
      const statusMatches = filtre === 'Toutes' || normalizePieceStatus(piece.status) === filtre;
      if (!statusMatches) return false;
      if (!q) return true;

      const searchable = [
        piece.nom,
        piece.machine,
        piece.currentMachine,
        piece.employe,
        piece.dimension,
        piece.matiereType,
        piece.matiereReference,
        piece.status,
        ...(piece.machineChain || []),
      ].join(' ').toLowerCase();

      return searchable.includes(q);
    });
  }, [filtre, pieces, search]);

  const dossiersByPiece = useMemo(() => {
    return dossiers.reduce<Record<string, DossierDocument[]>>((acc, doc) => {
      const key = normalizeKey(doc.pieceName);
      if (!key) return acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(doc);
      return acc;
    }, {});
  }, [dossiers]);

  const dossierProjects = useMemo(() => (
    Array.from(new Set(
      dossiers
        .filter((doc) => !selectedDossierClient || getClientLabel(doc) === selectedDossierClient)
        .map((doc) => String(doc.projectName || '').trim() || 'Sans projet'),
    )).sort((a, b) => a.localeCompare(b))
  ), [dossiers, selectedDossierClient]);

  const dossierPieceGroups = useMemo(() => {
    const groups = new Map<string, DossierDocument[]>();
    dossiers
      .filter((doc) => !selectedDossierClient || getClientLabel(doc) === selectedDossierClient)
      .filter((doc) => !selectedDossierProject || (String(doc.projectName || '').trim() || 'Sans projet') === selectedDossierProject)
      .forEach((doc) => {
        const label = String(doc.pieceName || '').trim() || 'Sans pièce';
        const existing = groups.get(label) || [];
        existing.push(doc);
        groups.set(label, existing);
      });

    return Array.from(groups.entries())
      .map(([label, docs]) => ({ label, docs }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [dossiers, selectedDossierClient, selectedDossierProject]);

  const selectedDossierDocs = useMemo(() => (
    dossierPieceGroups.find((group) => group.label === selectedDossierPiece)?.docs || []
  ), [dossierPieceGroups, selectedDossierPiece]);

  const selectedMaterialReferences = useMemo(() => (
    newPiece.matiereType ? materialOptions[newPiece.matiereType] || [] : []
  ), [newPiece.matiereType]);

  const selectedEditMaterialReferences = useMemo(() => (
    pieceInfoDraft.matiereType ? materialOptions[pieceInfoDraft.matiereType] || [] : []
  ), [pieceInfoDraft.matiereType]);

  const openCreatePieceFromDossier = (context: DossierPieceContext) => {
    const cadDoc = context.docs.find((doc) => isCadDoc(doc));
    const planDoc = context.sourceDoc || context.docs.find((doc) => isImageDoc(doc)) || context.docs.find((doc) => isPdfDoc(doc)) || cadDoc || null;

    setCreationContext(context);
    setSelectedDossierClient(context.clientLabel);
    setSelectedDossierProject(context.projectLabel);
    setSelectedDossierPiece(context.pieceLabel);
    setChainSteps([]);
    setChainNext('');
    setNewPiece({
      ...emptyDimensions(),
      nom: context.pieceLabel,
      employe: '',
      quantite: 0,
      matiere: false,
      status: 'Arrêté',
      machine: '',
      matiereType: '',
      matiereReference: '',
      solidworksPath: cadDoc?.publicPath || '',
      planDocumentId: planDoc?._id || '',
      planPath: planDoc?.publicPath || '',
      planName: planDoc?.originalName || '',
      planMimeType: planDoc ? getDisplayMimeType(planDoc) : '',
    });
    setShowForm(true);
  };


  // ── Ajouter pièce ──
  const ajouterPiece = async () => {
    if (!newPiece.nom || !newPiece.employe) return;
    try {
      const effectiveChain = [newPiece.machine, ...chainSteps.filter((m) => m !== newPiece.machine)].filter(Boolean);

      const res = await fetch(`${API}/pieces`, {
        method: 'POST', headers,
        body: JSON.stringify({
          nom: newPiece.nom,
          machine: newPiece.machine,
          ...(effectiveChain.length > 1 ? { machineChain: effectiveChain } : {}),
          employe: newPiece.employe,
          quantite: Number(newPiece.quantite) || 0,
          prix: 0,
          status: 'Arrêté',
          matiere: false,
          dimension: formatDimension(newPiece),
          solidworksPath: newPiece.solidworksPath || null,
          matiereType: newPiece.matiereType || '',
          matiereReference: newPiece.matiereReference || '',
          planDocumentId: newPiece.planDocumentId || '',
          planPath: newPiece.planPath || '',
          planName: newPiece.planName || '',
          planMimeType: newPiece.planMimeType || '',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const createdPiece = {
          ...data,
          dimension: data.dimension || formatDimension(newPiece),
          matiereType: data.matiereType || newPiece.matiereType || '',
          matiereReference: data.matiereReference || newPiece.matiereReference || '',
        };
        setPieces(prev => [createdPiece, ...prev]);
        setShowForm(false);
        setCreationContext(null);
        setNewPiece({ ...emptyDimensions(), matiere: false, status: 'Arrêté' });
        setChainSteps([]);
        setChainNext('');
        setSelectedDossierClient('');
        setSelectedDossierProject('');
        setSelectedDossierPiece('');
      }
    } catch (err) { console.error('Erreur ajout pièce:', err); }
  };

  const progresserPiece = async (pieceId: string) => {
    try {
      const res = await fetch(`${API}/pieces/${pieceId}/progress`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'next' }),
      });
      const updated = await res.json();
      if (res.ok) {
        setPieces(prev => prev.map(p => p._id === updated._id ? updated : p));
        if (selectedPiece?._id === updated._id) setSelectedPiece(updated);
      }
    } catch (err) { console.error('Erreur progression piece:', err); }
  };

  const markMaterialAvailable = async (pieceId: string) => {
    try {
      const res = await fetch(`${API}/pieces/${pieceId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ matiere: true }),
      });
      const updated = await res.json();
      if (res.ok) {
        setPieces(prev => prev.map(p => p._id === updated._id ? updated : p));
        if (selectedPiece?._id === updated._id) setSelectedPiece(updated);
      }
    } catch (err) {
      console.error('Erreur mise a jour matiere:', err);
    }
  };

  const savePieceInfo = async () => {
    if (!selectedPiece) return;
    const payload = {
      dimension: formatDimension(pieceInfoDraft),
      matiereType: pieceInfoDraft.matiereType,
      matiereReference: pieceInfoDraft.matiereReference,
    };

    try {
      const res = await fetch(`${API}/pieces/${selectedPiece._id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        const updatedPiece = { ...selectedPiece, ...data, ...payload };
        setPieces(prev => prev.map(piece => piece._id === updatedPiece._id ? updatedPiece : piece));
        setSelectedPiece(updatedPiece);
        setEditingPieceInfo(false);
      }
    } catch (err) {
      console.error('Erreur mise a jour details piece:', err);
    }
  };

  useEffect(() => {
    if (!selectedPiece) {
      setEditingPieceInfo(false);
      return;
    }
    const dimensions = parseDimension(selectedPiece.dimension);
    setPieceInfoDraft({
      ...dimensions,
      matiereType: selectedPiece.matiereType || '',
      matiereReference: selectedPiece.matiereReference || '',
    });
    setEditingPieceInfo(false);
  }, [selectedPiece]);

  useEffect(() => {
    if (!selectedDossierClient) {
      setSelectedDossierProject('');
      setSelectedDossierPiece('');
      return;
    }
    const projectStillExists = dossierProjects.includes(selectedDossierProject);
    if (!projectStillExists) {
      setSelectedDossierProject('');
      setSelectedDossierPiece('');
    }
  }, [dossierProjects, selectedDossierClient, selectedDossierProject]);

  useEffect(() => {
    if (!selectedDossierProject) {
      setSelectedDossierPiece('');
      return;
    }
    const pieceStillExists = dossierPieceGroups.some((group) => group.label === selectedDossierPiece);
    if (!pieceStillExists) setSelectedDossierPiece('');
  }, [dossierPieceGroups, selectedDossierPiece, selectedDossierProject]);

  useEffect(() => {
    if (!selectedDossierPiece) return;
    const cadDoc = selectedDossierDocs.find((doc) => isCadDoc(doc));
    const planDoc = selectedDossierDocs.find((doc) => isImageDoc(doc)) || selectedDossierDocs.find((doc) => isPdfDoc(doc)) || cadDoc || null;
    setNewPiece((prev) => ({
      ...prev,
      nom: selectedDossierPiece,
      solidworksPath: cadDoc?.publicPath || prev.solidworksPath || undefined,
      planDocumentId: planDoc?._id || '',
      planPath: planDoc?.publicPath || '',
      planName: planDoc?.originalName || '',
      planMimeType: planDoc ? getDisplayMimeType(planDoc) : '',
    }));
  }, [selectedDossierDocs, selectedDossierPiece]);

  const getPieceDocuments = (pieceName: string) => dossiersByPiece[normalizeKey(pieceName)] || [];

  const getPrimaryPreviewDoc = (pieceName: string) => {
    const docs = getPieceDocuments(pieceName);
    return docs.find((doc) => isImageDoc(doc)) || docs.find((doc) => isPdfDoc(doc)) || docs.find((doc) => isCadDoc(doc)) || null;
  };

  const getPiecePreviewDoc = (piece: Piece) => {
    const linkedDoc = getPrimaryPreviewDoc(piece.nom);
    if (linkedDoc) return linkedDoc;

    const planPath = piece.planPath || piece.solidworksPath || '';
    const planName = piece.planName || (planPath ? planPath.split('/').pop() || 'Plan piece' : '');
    if (!planPath && !planName) return null;

    return {
      _id: piece.planDocumentId || `${piece._id}-plan`,
      originalName: planName || 'Plan piece',
      mimeType: piece.planMimeType || displayMimeByExt[getFileExtension(planName || planPath)] || '',
      publicPath: planPath,
      clientLastName: '',
      clientFirstName: '',
      projectName: '',
      pieceName: piece.nom,
    };
  };

  const openDocumentInBrowser = async (doc: DossierDocument) => {
    try {
      if (!canPreviewInBrowser(doc)) {
        const res = await fetch(`${API}/dossiers/${doc._id}/download`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const data = await readJsonMaybe(res);
          throw new Error(data.message || 'Ouverture impossible');
        }

        const rawBlob = await res.blob();
        const mimeType = getDisplayMimeType(doc);
        const blob = rawBlob.type === mimeType ? rawBlob : new Blob([rawBlob], { type: mimeType });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = doc.originalName || 'document';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
        return;
      }

      const popup = window.open('about:blank', '_blank');
      if (!popup) return;
      popup.opener = null;
      popup.document.title = doc.originalName;
      popup.document.body.style.margin = '0';
      popup.document.body.style.minHeight = '100vh';
      popup.document.body.style.display = 'grid';
      popup.document.body.style.placeItems = 'center';
      popup.document.body.style.background = '#0f172a';
      popup.document.body.style.color = '#e2e8f0';
      popup.document.body.style.fontFamily = 'Arial, sans-serif';
      popup.document.body.textContent = `Ouverture de ${doc.originalName}...`;

      const res = await fetch(`${API}/dossiers/${doc._id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await readJsonMaybe(res);
        throw new Error(data.message || 'Ouverture impossible');
      }

      const rawBlob = await res.blob();
      const mimeType = getDisplayMimeType(doc);
      const blob = rawBlob.type === mimeType ? rawBlob : new Blob([rawBlob], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      renderDocumentWindow(popup, doc, url);
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch {
      // Keep the current page stable if the document can't be opened.
    }
  };

  const openDocumentPreview = (doc: DossierDocument | null) => {
    if (!doc) return;
    setPreviewDoc(doc);
  };

  const card: React.CSSProperties = { background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 };
  const inputStyle: React.CSSProperties = { width: '100%', background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 12px', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

  return (
    <div style={{ flex: 1, padding: 24, overflowY: 'auto', minWidth: 0, width: '100%' }}>

      {/* ── Tab Navigation ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(['production', 'clients'] as const).map(tab => (
          <button key={tab} onClick={() => setMainTab(tab)} style={{
            padding: '9px 22px', borderRadius: 10, border: `1px solid ${mainTab === tab ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
            cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
            background: mainTab === tab ? 'linear-gradient(135deg,rgba(0,102,255,0.15),rgba(0,212,255,0.15))' : 'rgba(30,41,59,0.6)',
            color: mainTab === tab ? '#00d4ff' : '#64748b',
          }}>
            {tab === 'production' ? 'Les pièces' : 'Clients'}
          </button>
        ))}
      </div>

      {/* ── Clients Tab ── */}
      {mainTab === 'clients' && (
        <DossierPage
          showAddPieceActions
          onAddPieceFromDossier={openCreatePieceFromDossier}
        />
      )}

      {/* ── Production Tab ── */}
      {mainTab === 'production' && <>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'white' }}>Les pièces</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Gestion des pièces de l'usine</p>
          </div>
        </div>

        {/* ── Stats ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'Requis Total', value: `${totalProduction.toLocaleString()} pcs`, icon: <Package size={20} color="#2563eb" />, color: '#2563eb' },
            { label: 'Produit', value: `${totalProduit.toLocaleString()} pcs`, icon: <CheckCircle size={20} color="#0f766e" />, color: '#0f766e' },
            { label: 'Terminées', value: `${terminees} pièces`, icon: <TrendingUp size={20} color="#475569" />, color: '#475569' },
            { label: 'En cours', value: `${enCours} pièces`, icon: <Clock size={20} color="#475569" />, color: '#475569' },
          ].map(s => (
            <div key={s.label} style={{ ...card, padding: '18px 20px' }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: s.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                {s.icon}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color, marginBottom: 4 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Alertes matière ── */}
        {alertes.length > 0 && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderLeft: '4px solid #ef4444', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <AlertTriangle size={16} color="#ef4444" />
              <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 13 }}>Matière manquante — {alertes.length} pièce(s)</span>
            </div>
            {alertes.map(p => (
              <div key={p._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, color: '#fca5a5', fontSize: 12, marginBottom: 8, padding: '8px 0' }}>
                <div>
                  • {p.nom} — {p.machine} (Responsable: {p.employe})
                </div>
                <button
                  type="button"
                  onClick={() => markMaterialAvailable(p._id)}
                  style={{ padding: '7px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', background: 'rgba(34,197,94,0.18)', color: '#bbf7d0', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}
                >
                  Matière reçue
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Filtres ── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ ...inputStyle, width: 320, maxWidth: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
            <Search size={15} color="#64748b" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher pièce, projet, machine..."
              style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: 'inherit', outline: 'none', fontSize: 13 }}
            />
          </div>
          {['Toutes', 'Arrêté', 'En cours', 'Terminé'].map(f => (
            <button key={f} onClick={() => setFiltre(f)} style={{
              padding: '7px 18px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
              background: filtre === f ? 'linear-gradient(135deg,#0f766e,#2563eb)' : 'rgba(30,41,59,0.6)',
              color: filtre === f ? 'white' : '#64748b',
            }}>{f}</button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#475569', alignSelf: 'center' }}>
            {filtrees.length} pièce(s)
          </span>
        </div>

        {/* ── Galerie ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16, marginBottom: 30 }}>
          {loading ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#475569', padding: '60px 0', fontSize: 14 }}>
              ⏳ Chargement...
            </div>
          ) : filtrees.length === 0 ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#475569', padding: '60px 0', fontSize: 14 }}>
              Aucune pièce — ajoutez-en une !
            </div>
          ) : filtrees.map(piece => {
            const st = getPieceStatusConfig(piece.status);
            const pieceStatus = normalizePieceStatus(piece.status);
            const requiredQty = toNumber(piece.quantite);
            const producedQty = toNumber(piece.quantiteProduite);
            const machineChain = getMachineChain(piece);
            const pieceDocs = getPieceDocuments(piece.nom);
            const previewDoc = getPiecePreviewDoc(piece);
            const previewBadge = getDocTypeBadge(previewDoc);
            return (
              <div key={piece._id} onClick={() => { setSelectedPiece(piece); }}
                style={{
                  ...card,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  transition: 'all 0.2s',
                  borderColor: selectedPiece?._id === piece._id ? 'rgba(15,118,110,0.55)' : 'rgba(255,255,255,0.08)',
                  boxShadow: selectedPiece?._id === piece._id ? '0 18px 40px -28px rgba(15,118,110,0.45)' : 'none',
                  background: selectedPiece?._id === piece._id ? 'rgba(255,255,255,0.05)' : card.background,
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(15,118,110,0.45)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = selectedPiece?._id === piece._id ? 'rgba(15,118,110,0.55)' : 'rgba(255,255,255,0.08)')}>
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    openDocumentPreview(previewDoc);
                  }}
                  style={{ height: 130, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'relative' }}
                  title={previewDoc ? 'Double clic pour ouvrir' : undefined}
                >
                  {previewDoc && isImageDoc(previewDoc) && previewDoc.publicPath ? (
                    <img
                      src={resolvePublicPathUrl(previewDoc.publicPath)}
                      alt={piece.nom}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : previewDoc && isPdfDoc(previewDoc) && previewDoc.publicPath ? (
                    <iframe
                      title={`Plan ${piece.nom}`}
                      src={`${resolvePublicPathUrl(previewDoc.publicPath)}#toolbar=0&navpanes=0&scrollbar=0`}
                      style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
                    />
                  ) : (
                    <div style={{ display: 'grid', justifyItems: 'center', gap: 8, color: '#0f766e' }}>
                      <PieceIcon nom={piece.nom} />
                      {previewBadge && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#0f766e', letterSpacing: 1 }}>{previewBadge}</span>
                      )}
                    </div>
                  )}
                  {previewBadge && (
                    <div style={{ position: 'absolute', top: 10, right: 10, padding: '4px 8px', borderRadius: 999, background: 'rgba(2,6,23,0.72)', color: '#dbeafe', fontSize: 10, fontWeight: 800, letterSpacing: 0.4 }}>
                      {previewBadge}
                    </div>
                  )}
                </div>
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: selectedPiece?._id === piece._id ? '#0f172a' : 'white', marginBottom: 3 }}>{piece.nom}</div>
                  <div style={{ fontSize: 11, color: '#475569', marginBottom: 10 }}>{piece.machine}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
                    Machine actuelle: <span style={{ color: '#0f766e' }}>{piece.currentMachine || piece.machine}</span>
                  </div>
                  <div style={{ display: 'grid', gap: 4, marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: '#cbd5e1' }}>
                      Qté requise: <span style={{ color: '#ffffff', fontWeight: 700 }}>{requiredQty} pcs</span>
                    </div>
                    {piece.dimension && (
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        Dimension: <span style={{ color: '#e2e8f0' }}>{piece.dimension}</span>
                      </div>
                    )}
                    {(piece.matiereType || piece.matiereReference) && (
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        Matière: <span style={{ color: '#e2e8f0' }}>{[piece.matiereType, piece.matiereReference].filter(Boolean).join(' · ')}</span>
                      </div>
                    )}
                  </div>
                  {machineChain.length > 1 && (
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>
                      {machineChain.join(' -> ')}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: st.bg, border: `1px solid ${st.border}`, color: st.color, fontWeight: 600 }}>
                      {st.label}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0f766e' }}>{producedQty}/{requiredQty} pcs</span>
                  </div>
                  {/* Progress bar */}
                  {requiredQty > 0 && (
                    <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 2, background: pieceStatus === 'Terminé' ? '#0f766e' : '#2563eb', width: `${Math.min(100, (producedQty / requiredQty) * 100)}%`, transition: 'width 0.5s' }} />
                    </div>
                  )}
                  {machineChain.length > 1 && pieceStatus !== 'Terminé' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); progresserPiece(piece._id); }}
                      style={{ marginTop: 8, width: '100%', border: 'none', borderRadius: 7, background: '#0f766e', color: 'white', padding: '6px 8px', fontSize: 11, cursor: 'pointer' }}
                    >
                      Avancer dans la chaine
                    </button>
                  )}
                  {!piece.matiere && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                        <AlertTriangle size={11} /> Matière manquante
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); markMaterialAvailable(piece._id); }}
                        style={{ width: '100%', border: 'none', borderRadius: 7, background: 'rgba(15,118,110,0.14)', color: '#0f766e', padding: '6px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}
                      >
                        Confirmer réception matière
                      </button>
                    </div>
                  )}
                  {piece.matiere && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#0f766e', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={11} /> Matière disponible
                    </div>
                  )}
                  <div style={{ marginTop: 8, fontSize: 11, color: '#475569', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <User size={11} /> {piece.employe}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: pieceDocs.length > 0 ? '#0f766e' : '#64748b' }}>
                    {pieceDocs.length > 0 ? `${pieceDocs.length} document(s) liés` : 'Aucun document lié'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ══════════════════════════════════════
          MODAL — Détail Pièce
      ══════════════════════════════════════ */}
        {selectedPiece && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
            <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: '100%', maxWidth: 580, maxHeight: '88vh', overflowY: 'auto' }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}><PieceIcon nom={selectedPiece.nom} /></span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>{selectedPiece.nom}</div>
                    <div style={{ fontSize: 12, color: '#475569' }}>
                      {selectedPiece.currentMachine || selectedPiece.machine} · {getPieceStatusConfig(selectedPiece.status).label}
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelectedPiece(null)} aria-label="Fermer" title="Fermer"
                  style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={16} />
                </button>
              </div>

              <div style={{ padding: '18px 22px' }}>
                    {(() => {
                      const detailPreviewDoc = getPiecePreviewDoc(selectedPiece);
                      const detailPreviewUrl = detailPreviewDoc?.publicPath ? resolvePublicPathUrl(detailPreviewDoc.publicPath) : '';

                      return (
                        <div
                          onDoubleClick={() => openDocumentPreview(detailPreviewDoc)}
                          title={detailPreviewDoc ? 'Double clic pour ouvrir' : undefined}
                          style={{
                            height: 210,
                            borderRadius: 8,
                            overflow: 'hidden',
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: 'rgba(2,6,23,0.72)',
                            display: 'grid',
                            placeItems: 'center',
                            position: 'relative',
                            cursor: detailPreviewDoc ? 'pointer' : 'default',
                            marginBottom: 16,
                          }}
                        >
                          {detailPreviewDoc && isImageDoc(detailPreviewDoc) && detailPreviewUrl ? (
                            <img
                              src={detailPreviewUrl}
                              alt={detailPreviewDoc.originalName || selectedPiece.nom}
                              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#020617' }}
                            />
                          ) : detailPreviewDoc && isPdfDoc(detailPreviewDoc) && detailPreviewUrl ? (
                            <iframe
                              title={detailPreviewDoc.originalName || selectedPiece.nom}
                              src={`${detailPreviewUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                              style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
                            />
                          ) : (
                            <div style={{ display: 'grid', justifyItems: 'center', gap: 8, color: '#94a3b8', textAlign: 'center', padding: 18 }}>
                              <PieceIcon nom={selectedPiece.nom} />
                              <div style={{ fontSize: 12, fontWeight: 700 }}>
                                {detailPreviewDoc && isCadDoc(detailPreviewDoc) ? 'Fichier CAD lie' : 'Aucune image ou plan lie'}
                              </div>
                            </div>
                          )}
                          {detailPreviewDoc && (
                            <div style={{ position: 'absolute', left: 10, right: 10, bottom: 10, padding: '7px 9px', borderRadius: 8, background: 'rgba(2,6,23,0.72)', color: '#dbeafe', fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {detailPreviewDoc.originalName}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {(() => {
                      const chain = getMachineChain(selectedPiece);
                      const currentMachine = selectedPiece.currentMachine || chain[0] || selectedPiece.machine || 'Non définie';
                      const currentIndex = Math.max(0, chain.findIndex((machine) => machine === currentMachine));
                      const safeIndex = chain.length > 0 ? currentIndex : 0;
                      const nextMachine = chain[safeIndex + 1] || (normalizePieceStatus(selectedPiece.status) === 'Terminé' ? 'Terminée' : 'Aucune');

                      const topRows = [
                        { label: 'Machine actuelle', value: currentMachine, icon: <Wrench size={13} /> },
                        { label: 'Position actuelle', value: chain.length > 0 ? `Étape ${safeIndex + 1} / ${chain.length}` : 'Étape 1 / 1', icon: <Clock size={13} /> },
                        { label: 'Machine suivante', value: nextMachine, icon: <TrendingUp size={13} /> },
                        { label: 'Status', value: getPieceStatusConfig(selectedPiece.status).label, icon: <CheckCircle size={13} /> },
                        { label: 'Ordre des machines', value: chain.length > 0 ? chain.join(' -> ') : selectedPiece.machine || 'Non renseigné', icon: <Wrench size={13} />, full: true },
                      ];

                      const detailRows = [
                        { label: 'Première machine', value: selectedPiece.machine || 'Non renseignée', icon: <Wrench size={13} /> },
                        { label: 'Employé', value: selectedPiece.employe, icon: <User size={13} /> },
                        { label: 'Qté requise', value: `${toNumber(selectedPiece.quantite)} pcs`, icon: <Package size={13} /> },
                        { label: 'Qté produite', value: `${toNumber(selectedPiece.quantiteProduite)} pcs`, icon: <CheckCircle size={13} /> },
                        { label: 'Dimension', value: selectedPiece.dimension || 'Non renseignée', icon: <Package size={13} /> },
                        { label: 'Type matière', value: selectedPiece.matiereType || 'Non renseigné', icon: <Package size={13} /> },
                        { label: 'Référence matière', value: selectedPiece.matiereReference || 'Non renseignée', icon: <Package size={13} /> },
                        { label: 'Matière disponible', value: selectedPiece.matiere ? 'Oui' : 'Non', icon: <CheckCircle size={13} /> },
                      ];

                      return (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                            {topRows.map((row) => (
                              <div key={row.label} style={{ background: 'rgba(15,23,42,0.72)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(56,189,248,0.12)', gridColumn: row.full ? '1 / -1' : undefined }}>
                                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                                  {row.icon} {row.label}
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{row.value}</div>
                              </div>
                            ))}
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                            {detailRows.map(row => (
                              <div key={row.label} style={{ background: 'rgba(30,41,59,0.6)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <div style={{ fontSize: 11, color: '#475569', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                                  {row.icon} {row.label}
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>{row.value}</div>
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                    <div style={{ background: 'rgba(30,41,59,0.42)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '14px', marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: editingPieceInfo ? 12 : 0 }}>
                        <div>
                          <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 800 }}>Détails matière et dimension</div>
                          <div style={{ color: '#64748b', fontSize: 11, marginTop: 3 }}>Corriger les champs si la pièce a été ajoutée avant la sauvegarde complète.</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditingPieceInfo(prev => !prev)}
                          style={{ border: '1px solid rgba(125,211,252,0.28)', borderRadius: 8, background: 'rgba(14,165,233,0.12)', color: '#7dd3fc', padding: '8px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}
                        >
                          {editingPieceInfo ? 'Annuler' : 'Modifier'}
                        </button>
                      </div>

                      {editingPieceInfo && (
                        <div style={{ display: 'grid', gap: 12 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                            <div>
                              <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Largeur</label>
                              <input
                                type="text"
                                value={pieceInfoDraft.largeur}
                                onChange={(event) => setPieceInfoDraft(prev => ({ ...prev, largeur: event.target.value }))}
                                placeholder="ex: 120 mm"
                                style={inputStyle}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Longueur</label>
                              <input
                                type="text"
                                value={pieceInfoDraft.longueur}
                                onChange={(event) => setPieceInfoDraft(prev => ({ ...prev, longueur: event.target.value }))}
                                placeholder="ex: 40 mm"
                                style={inputStyle}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Hauteur</label>
                              <input
                                type="text"
                                value={pieceInfoDraft.hauteur}
                                onChange={(event) => setPieceInfoDraft(prev => ({ ...prev, hauteur: event.target.value }))}
                                placeholder="ex: 12 mm"
                                style={inputStyle}
                              />
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Type matière</label>
                              <select
                                value={pieceInfoDraft.matiereType}
                                onChange={(event) => setPieceInfoDraft(prev => ({ ...prev, matiereType: event.target.value, matiereReference: '' }))}
                                style={selectStyle}
                                title="Type matière"
                              >
                                <option value="">Choisir une matière</option>
                                {Object.keys(materialOptions).map((materialType) => (
                                  <option key={materialType} value={materialType}>{materialType}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Référence matière</label>
                              <select
                                value={pieceInfoDraft.matiereReference}
                                onChange={(event) => setPieceInfoDraft(prev => ({ ...prev, matiereReference: event.target.value }))}
                                style={selectStyle}
                                title="Référence matière"
                                disabled={!pieceInfoDraft.matiereType}
                              >
                                <option value="">Choisir une référence</option>
                                {selectedEditMaterialReferences.map((ref) => (
                                  <option key={ref} value={ref}>{ref}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={savePieceInfo}
                            style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#1e40af', color: 'white', fontSize: 13, fontWeight: 800 }}
                          >
                            Enregistrer les détails
                          </button>
                        </div>
                      )}
                    </div>
                    {!selectedPiece.matiere && (
                      <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '12px 16px', marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444', fontSize: 13, fontWeight: 600 }}>
                          <AlertTriangle size={15} /> Matière insuffisante — commande nécessaire
                        </div>
                        <button
                          type="button"
                          onClick={() => markMaterialAvailable(selectedPiece._id)}
                          style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'rgba(34,197,94,0.18)', color: '#bbf7d0', fontSize: 12, fontWeight: 700 }}
                        >
                          Matière reçue
                        </button>
                      </div>
                    )}
                    {getMachineChain(selectedPiece).length > 1 && normalizePieceStatus(selectedPiece.status) !== 'Terminé' && (
                      <button
                        onClick={() => progresserPiece(selectedPiece._id)}
                        style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer', background: '#1e40af', color: 'white', fontSize: 13, fontWeight: 700, marginBottom: 10 }}
                      >
                        Avancer la piece dans la chaine
                      </button>
                    )}
                    <div style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
                      <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 6 }}>Historique de passage</div>
                      {(selectedPiece.history || []).length === 0 ? (
                        <div style={{ fontSize: 11, color: '#64748b' }}>Aucun historique.</div>
                      ) : (
                        (selectedPiece.history || []).slice().reverse().map((entry, idx) => (
                          <div key={`${entry.machine}-${idx}`} style={{ fontSize: 11, color: '#cbd5e1', marginBottom: 4 }}>
                            {entry.action === 'entered' ? 'Entree' : 'Sortie'} · {entry.machine}
                          </div>
                        ))
                      )}
                    </div>
                    <div style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 16px' }}>
                      <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 10 }}>Documents du dossier</div>
                      {getPieceDocuments(selectedPiece.nom).length === 0 ? (
                        <div style={{ fontSize: 11, color: '#64748b' }}>Aucun document lié à cette pièce.</div>
                      ) : (
                        <div style={{ display: 'grid', gap: 8 }}>
                          {getPieceDocuments(selectedPiece.nom).map((doc) => (
                            <div
                              key={doc._id}
                              onDoubleClick={() => openDocumentPreview(doc)}
                              title="Double clic pour ouvrir"
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 10,
                                padding: '10px 12px',
                                borderRadius: 10,
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.05)',
                                cursor: 'pointer',
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.originalName}</div>
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                                  {isImageDoc(doc) ? 'Image' : isPdfDoc(doc) ? 'PDF / Plan' : isCadDoc(doc) ? 'Fichier CAD' : 'Document'}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openDocumentPreview(doc);
                                  }}
                                  style={{ padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'rgba(14,165,233,0.15)', color: '#38bdf8', fontSize: 11, fontWeight: 700 }}
                                >
                                  Ouvrir
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
              </div>
            </div>
          </div>
        )}

        {previewDoc && (
          <div
            onClick={() => setPreviewDoc(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 260, padding: 20 }}
          >
            <div
              onClick={(event) => event.stopPropagation()}
              style={{ width: 'min(960px, 100%)', height: 'min(720px, 90vh)', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ color: 'white', fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {previewDoc.originalName}
                </div>
                <button onClick={() => setPreviewDoc(null)} aria-label="Fermer" title="Fermer" style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={16} />
                </button>
              </div>
              <div style={{ flex: 1, minHeight: 0, background: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isImageDoc(previewDoc) && previewDoc.publicPath ? (
                  <img src={resolvePublicPathUrl(previewDoc.publicPath)} alt={previewDoc.originalName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                ) : isPdfDoc(previewDoc) && previewDoc.publicPath ? (
                  <iframe title={previewDoc.originalName} src={`${resolvePublicPathUrl(previewDoc.publicPath)}#toolbar=0&navpanes=0&scrollbar=0`} style={{ width: '100%', height: '100%', border: 'none' }} />
                ) : (
                  <button type="button" onClick={() => openDocumentInBrowser(previewDoc)} style={{ padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'rgba(15,118,110,0.14)', color: '#0f766e', fontSize: 12, fontWeight: 700 }}>
                    Télécharger le fichier
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </>}

      {/* ══════════════════════════════════════
        MODAL — Ajouter Pièce
    ══════════════════════════════════════ */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>+ Ajouter une pièce depuis le dossier</div>
              <button onClick={() => { setShowForm(false); setCreationContext(null); }} aria-label="Fermer" title="Fermer"
                style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'rgba(30,41,59,0.45)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10, fontWeight: 700 }}>Contexte dossier</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Client</div>
                    <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 700 }}>{creationContext?.clientLabel || selectedDossierClient || '-'}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Projet</div>
                    <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 700 }}>{creationContext?.projectLabel || selectedDossierProject || '-'}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Pièce dossier</div>
                    <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 700 }}>{creationContext?.pieceLabel || selectedDossierPiece || '-'}</div>
                  </div>
                </div>

                {(creationContext?.docs || selectedDossierDocs).length > 0 && (
                  <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                    {(creationContext?.docs || selectedDossierDocs).map((doc) => (
                      <div
                        key={doc._id}
                        onDoubleClick={() => openDocumentPreview(doc)}
                        title="Double clic pour ouvrir"
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 12px',
                          borderRadius: 10,
                          background: 'rgba(255,255,255,0.03)',
                          cursor: 'pointer',
                        }}
                      >
                        <div>
                          <div style={{ color: 'white', fontSize: 12, fontWeight: 700 }}>{doc.originalName}</div>
                          <div style={{ color: '#64748b', fontSize: 11 }}>
                            {isImageDoc(doc) ? 'Image' : isPdfDoc(doc) ? 'PDF / Plan' : isCadDoc(doc) ? 'Fichier CAD' : 'Document'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openDocumentPreview(doc);
                          }}
                          style={{ padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'rgba(14,165,233,0.15)', color: '#38bdf8', fontSize: 11, fontWeight: 700 }}
                        >
                          Ouvrir
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Nom de la pièce</label>
                <input
                  list="dossier-piece-names"
                  placeholder="ex: Engrenage 50mm"
                  value={newPiece.nom || ''}
                  onChange={e => setNewPiece(p => ({ ...p, nom: e.target.value }))}
                  style={inputStyle} />
                <datalist id="dossier-piece-names">
                  {dossierPieceNames.map((pieceName) => (
                    <option key={pieceName} value={pieceName} />
                  ))}
                </datalist>
              </div>


              <div>
                  <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Quantité</label>
                  <input type="number" placeholder="0"
                    value={newPiece.quantite || ''}
                    onChange={e => setNewPiece(p => ({ ...p, quantite: Number(e.target.value) }))}
                    style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                <div>
                  <label htmlFor="select-machine" style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Machine principale</label>
                  <select
                    id="select-machine"
                    title="Machine principale"
                    value={newPiece.machine || ''}
                    onChange={e => {
                      const value = e.target.value;
                      setNewPiece(p => ({ ...p, machine: value }));
                      setChainSteps(prev => prev.filter((name) => name !== value));
                    }}
                    style={selectStyle}
                  >
                    <option value="">Choisir une machine</option>
                    {machines.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Ajouter une autre machine</label>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <select
                      value={chainNext}
                      onChange={(e) => setChainNext(e.target.value)}
                      style={selectStyle}
                      title="Ajouter une machine"
                    >
                      <option value="">Laisser vide</option>
                      {machines
                        .map((m) => m.name)
                        .filter(Boolean)
                        .filter((name) => name !== 'Compresseur ABAC')
                        .filter((name) => name !== newPiece.machine)
                        .filter((name) => !chainSteps.includes(name))
                        .map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        if (!chainNext) return;
                        setChainSteps((prev) => [...prev, chainNext]);
                        setChainNext('');
                      }}
                      style={{ padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#1e40af', color: 'white', fontWeight: 700, whiteSpace: 'nowrap' }}
                    >
                      + Ajouter
                    </button>
                  </div>
                </div>
              </div>

              {(newPiece.machine || chainSteps.length > 0) && (
                <div style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10, fontWeight: 700 }}>Ordre des machines</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {newPiece.machine && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 999, background: 'rgba(34,197,94,0.16)', color: '#bbf7d0', fontSize: 12, fontWeight: 700 }}>
                        1. {newPiece.machine}
                      </span>
                    )}
                    {chainSteps.map((machineName, index) => (
                      <span key={machineName} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 999, background: 'rgba(59,130,246,0.16)', color: '#bfdbfe', fontSize: 12, fontWeight: 700 }}>
                        {index + 2}. {machineName}
                        <button
                          type="button"
                          onClick={() => setChainSteps(prev => prev.filter((name) => name !== machineName))}
                          style={{ width: 18, height: 18, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.16)', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                          title={`Retirer ${machineName}`}
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="select-employe" style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>
                  Employe responsable *
                </label>
                <select
                  id="select-employe"
                  title="Employe responsable"
                  value={newPiece.employe || ''}
                  onChange={e => setNewPiece(p => ({ ...p, employe: e.target.value }))}
                  style={selectStyle}
                >
                  <option value="">
                    {employes.length === 0 ? 'Aucun employe trouve' : 'Choisir un employe'}
                  </option>
                  {employes.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Largeur</label>
                    <input
                      type="text"
                      placeholder="ex: 120 mm"
                      value={newPiece.largeur || ''}
                      onChange={e => setNewPiece(p => ({ ...p, largeur: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Longueur</label>
                    <input
                      type="text"
                      placeholder="ex: 40 mm"
                      value={newPiece.longueur || ''}
                      onChange={e => setNewPiece(p => ({ ...p, longueur: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Hauteur</label>
                    <input
                      type="text"
                      placeholder="ex: 12 mm"
                      value={newPiece.hauteur || ''}
                      onChange={e => setNewPiece(p => ({ ...p, hauteur: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Type de matiere</label>
                  <select
                    value={newPiece.matiereType || ''}
                    onChange={e => setNewPiece(p => ({ ...p, matiereType: e.target.value, matiereReference: '' }))}
                    style={selectStyle}
                    title="Type de matiere"
                  >
                    <option value="">Choisir une matiere</option>
                    {Object.keys(materialOptions).map((materialType) => (
                      <option key={materialType} value={materialType}>{materialType}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Reference matiere</label>
                  <select
                    value={newPiece.matiereReference || ''}
                    onChange={e => setNewPiece(p => ({ ...p, matiereReference: e.target.value }))}
                    style={selectStyle}
                    title="Reference matiere"
                    disabled={!newPiece.matiereType}
                  >
                    <option value="">Choisir une reference</option>
                    {selectedMaterialReferences.map((ref) => (
                      <option key={ref} value={ref}>{ref}</option>
                    ))}
                  </select>
              </div>
              </div>

              <button onClick={ajouterPiece}
                disabled={!newPiece.employe}
                style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', cursor: newPiece.employe ? 'pointer' : 'not-allowed', opacity: newPiece.employe ? 1 : 0.65, background: 'linear-gradient(135deg,#0066ff,#00d4ff)', color: 'white', fontSize: 14, fontWeight: 700, marginTop: 4 }}>
                Ajouter la piece
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductionPage;



