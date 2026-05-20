export const RECTIFIEUSE_NODE = 'ESP32-NODE-01';
export const RECTIFIEUSE_NODE_ALIASES = [RECTIFIEUSE_NODE, 'ESP32-NODE-03'] as const;
export const COMPRESSEUR_NODE = 'ESP32-NODE-02';
export const COMPRESSEUR_NODE_ALIASES = [
  COMPRESSEUR_NODE,
  'ESP32-COMP-01',
  'ESP32-COMPRESSOR-01',
  'COMP1',
  'COMPRESSOR_01',
  'compresseur',
] as const;

const normalizeNode = (value: unknown) => String(value ?? '').trim().toLowerCase();

const hasExactAliasMatch = (value: unknown, aliases: readonly string[]) => {
  const normalized = normalizeNode(value);
  if (!normalized) return false;
  return aliases.some((alias) => normalized === normalizeNode(alias));
};

export const isRectifieuseNode = (value: unknown) => (
  hasExactAliasMatch(value, RECTIFIEUSE_NODE_ALIASES) || /rectifi/i.test(String(value ?? ''))
);

export const isCompresseurNode = (value: unknown) => (
  hasExactAliasMatch(value, COMPRESSEUR_NODE_ALIASES) || /compresseur|compress|comp\d*/i.test(String(value ?? ''))
);

export const canonicalNodeForMachine = (machineId: string, fallbackNode?: string | null) => {
  if (machineId === 'rectifieuse') return RECTIFIEUSE_NODE;
  if (machineId === 'compresseur') return COMPRESSEUR_NODE;
  return fallbackNode ?? '';
};

export const sensorBelongsToMachine = (machineId: string, node: string | null | undefined) => {
  if (machineId === 'rectifieuse') return isRectifieuseNode(node);
  if (machineId === 'compresseur') return isCompresseurNode(node);
  return normalizeNode(machineId) === normalizeNode(node);
};
