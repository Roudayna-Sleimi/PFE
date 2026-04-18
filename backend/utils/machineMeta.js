const { slugify } = require('./slugify');

// Title: Build machine metadata from a human machine name.
const machineMeta = (name = '') => {
  const normalizedName = String(name || '');
  const isRectifieuse = /rectifi/i.test(normalizedName);
  const isCompresseur = /compresse/i.test(normalizedName);

  if (isRectifieuse) return { id: 'rectifieuse', hasSensors: true, node: 'ESP32-NODE-03' };
  if (isCompresseur) return { id: 'compresseur', hasSensors: true, node: 'compresseur' };

  return {
    id: slugify(normalizedName) || `machine-${Date.now()}`,
    hasSensors: false,
    node: null,
  };
};

module.exports = {
  machineMeta,
};
