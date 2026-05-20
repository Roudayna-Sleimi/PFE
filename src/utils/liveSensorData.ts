export interface RawSensorDataPayload {
  node?: string | null;
  courant?: number | string | null;
  vibX?: number | string | null;
  vibY?: number | string | null;
  vibZ?: number | string | null;
  rpm?: number | string | null;
  pression?: number | string | null;
}

export interface SensorDataPayload {
  node: string;
  courant: number;
  vibX: number;
  vibY: number;
  vibZ: number;
  rpm: number;
  pression: number | null;
}

const parseMetric = (value: number | string | null | undefined, fallback = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const parseOptionalMetric = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === '') return null;
  return parseMetric(value, 0);
};

export const normalizeSensorData = (data: RawSensorDataPayload): SensorDataPayload => ({
  node: String(data?.node || ''),
  courant: parseMetric(data?.courant),
  vibX: parseMetric(data?.vibX),
  vibY: parseMetric(data?.vibY),
  vibZ: parseMetric(data?.vibZ),
  rpm: parseMetric(data?.rpm),
  pression: parseOptionalMetric(data?.pression),
});
