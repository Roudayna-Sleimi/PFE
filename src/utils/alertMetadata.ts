export interface AlertAiMeta {
  source?: string | null;
  label?: string | null;
  score?: number | null;
  summary?: string | null;
  contributor?: string | null;
  trigger?: string | null;
  proba?: Record<string, number> | null;
  model?: string | null;
  version?: string | null;
}

export interface AlertSnapshot {
  vibX?: number | null;
  vibY?: number | null;
  vibZ?: number | null;
  courant?: number | null;
  rpm?: number | null;
  pression?: number | null;
  [key: string]: number | null | undefined;
}

export interface AlertRecord {
  _id: string;
  machineId?: string | null;
  node?: string | null;
  type?: string;
  severity: 'critical' | 'warning' | 'info' | string;
  message: string;
  status?: string;
  createdAt: string;
  lastObservedAt?: string;
  occurrenceCount?: number;
  ai?: AlertAiMeta;
  sensorSnapshot?: AlertSnapshot;
}

const ANALYSIS_LABELS: Record<string, string> = {
  normal: 'Comportement normal',
  warning: 'Risque a surveiller',
  critical: 'Risque critique',
};

const SOURCE_LABELS: Record<string, string> = {
  rules: 'Rules',
  manual: 'Manuel',
  'rules-threshold': 'Rules',
  'lstm-inference': 'LSTM',
  'backend-maintenance-assessment': 'Analyse backend',
};

const TRIGGER_LABELS: Record<string, string> = {
  'current-threshold': 'Seuil courant',
  'vibration-threshold': 'Seuil vibration',
  'pressure-threshold': 'Seuil pression',
};

const alertRecency = (alert: Pick<AlertRecord, 'createdAt' | 'lastObservedAt'>) => (
  new Date(alert.lastObservedAt || alert.createdAt).getTime()
);

export const sortAlertsByRecency = <T extends Pick<AlertRecord, 'createdAt' | 'lastObservedAt'>>(alerts: T[]) => (
  [...alerts].sort((left, right) => alertRecency(right) - alertRecency(left))
);

export const upsertAlertEntry = <T extends Pick<AlertRecord, '_id' | 'createdAt' | 'lastObservedAt'>>(
  alerts: T[],
  incoming: T,
  limit = 50,
) => {
  const filtered = alerts.filter((item) => item._id !== incoming._id);
  return sortAlertsByRecency([incoming, ...filtered]).slice(0, limit);
};

export const formatAlertSource = (source?: string | null) => {
  if (!source) return 'Source inconnue';
  return SOURCE_LABELS[source] || source;
};

export const formatAlertTrigger = (trigger?: string | null) => {
  if (!trigger) return null;
  return TRIGGER_LABELS[trigger] || trigger;
};

export const formatAlertAnalysis = (ai?: AlertAiMeta | null) => {
  if (!ai) return 'Analyse indisponible';
  if (ai.summary) {
    if (typeof ai.score === 'number' && ai.score > 0) return `${ai.summary} (${Math.round(ai.score)}/100)`;
    return ai.summary;
  }
  if (ai.label) return ANALYSIS_LABELS[ai.label] || ai.label;
  return 'Analyse indisponible';
};

export const isActiveAlert = (alert: Pick<AlertRecord, 'status'>) => alert.status !== 'resolved';
