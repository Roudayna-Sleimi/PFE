const RECTIFIEUSE_NODE = 'ESP32-NODE-01';
const RECTIFIEUSE_NODE_ALIASES = [RECTIFIEUSE_NODE, 'ESP32-NODE-03'];
const COMPRESSEUR_NODE = 'ESP32-NODE-02';
const COMPRESSEUR_NODE_ALIASES = [
  COMPRESSEUR_NODE,
  'ESP32-COMP-01',
  'ESP32-COMPRESSOR-01',
  'COMP1',
  'COMPRESSOR_01',
  'compresseur',
];

const uniqueStrings = (values = []) => Array.from(
  new Set(
    values
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )
);

const hasExactAliasMatch = (value, aliases = []) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return aliases.some((alias) => normalized === String(alias || '').trim().toLowerCase());
};

const isRectifieuseNode = (value = '') => (
  hasExactAliasMatch(value, RECTIFIEUSE_NODE_ALIASES) || /rectifi/i.test(String(value || ''))
);

const isCompresseurNode = (value = '') => (
  hasExactAliasMatch(value, COMPRESSEUR_NODE_ALIASES) || /compresseur|compress|comp\d*/i.test(String(value || ''))
);

const canonicalNodeForMachine = (machineId, fallbackNode = null) => {
  if (machineId === 'rectifieuse') return RECTIFIEUSE_NODE;
  if (machineId === 'compresseur') return COMPRESSEUR_NODE;
  return fallbackNode;
};

const nodeAliasesForMachine = (machineId, extraNode = null) => {
  if (machineId === 'rectifieuse') return uniqueStrings([...RECTIFIEUSE_NODE_ALIASES, extraNode]);
  if (machineId === 'compresseur') return uniqueStrings([...COMPRESSEUR_NODE_ALIASES, extraNode]);
  return uniqueStrings([extraNode]);
};

module.exports = {
  RECTIFIEUSE_NODE,
  RECTIFIEUSE_NODE_ALIASES,
  COMPRESSEUR_NODE,
  COMPRESSEUR_NODE_ALIASES,
  isRectifieuseNode,
  isCompresseurNode,
  canonicalNodeForMachine,
  nodeAliasesForMachine,
};
