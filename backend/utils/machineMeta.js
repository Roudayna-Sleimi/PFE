const { slugify } = require('./slugify');
const { RECTIFIEUSE_NODE, COMPRESSEUR_NODE } = require('./liveMachineNodes');

// Title: Build machine metadata from a human machine name.
const machineMeta = (name = '') => {
  const normalizedName = String(name || '');
  const isRectifieuse = /rectifi/i.test(normalizedName);
  const isCompresseur = /compresse/i.test(normalizedName);

  if (isRectifieuse) return { id: 'rectifieuse', hasSensors: true, node: RECTIFIEUSE_NODE };
  if (isCompresseur) return { id: 'compresseur', hasSensors: true, node: COMPRESSEUR_NODE };

  return {
    id: slugify(normalizedName) || `machine-${Date.now()}`,
    hasSensors: false,
    node: null,
  };
};

module.exports = {
  machineMeta,
};
