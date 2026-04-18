export interface MachineFunction {
  title: string;
  desc: string;
}

interface MachineFunctionSource {
  name?: string;
  marque?: string;
  model?: string;
  type?: string;
  fonctions?: MachineFunction[];
}

const normalizeText = (value = '') =>
  String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const functionPresets: Record<string, MachineFunction[]> = {
  fraisage: [
    { title: 'Fraisage CNC', desc: 'Usinage de poches, contours et surfaces planes.' },
    { title: 'Percage coordonne', desc: 'Percage selon les coordonnees de la piece.' },
    { title: 'Finition', desc: 'Passe de finition pour ameliorer la surface.' },
  ],
  tournage: [
    { title: 'Tournage exterieur', desc: 'Chariotage et dressage des pieces cylindriques.' },
    { title: 'Filetage', desc: 'Realisation de filetages internes et externes.' },
    { title: 'Alesage', desc: 'Usinage interieur avec controle du diametre.' },
  ],
  percage: [
    { title: 'Percage', desc: 'Creation de trous simples ou profonds.' },
    { title: 'Pointage', desc: 'Preparation des positions avant percage.' },
    { title: 'Chanfreinage', desc: 'Finition des entrees de trous.' },
  ],
  taraudage: [
    { title: 'Taraudage', desc: 'Creation de filetages internes.' },
    { title: 'Controle filetage', desc: 'Verification de la conformite des pas.' },
    { title: 'Pre-percage', desc: 'Preparation du diametre avant taraudage.' },
  ],
  rectification: [
    { title: 'Rectification plane', desc: 'Surfacage de pieces metalliques avec haute precision.' },
    { title: 'Rectification cylindrique', desc: 'Finition des surfaces cylindriques.' },
    { title: 'Dressage de meule', desc: 'Reconditionnement de la meule abrasive.' },
  ],
  edmCut: [
    { title: 'Decoupe fil EDM', desc: 'Decoupe de formes complexes par electroerosion a fil.' },
    { title: 'Contour de precision', desc: 'Usinage precis des profils et matrices.' },
    { title: 'Pieces trempees', desc: 'Decoupe de matieres dures sans effort mecanique.' },
  ],
  edmDrill: [
    { title: 'Percage EDM', desc: 'Percage par electroerosion sur matieres dures.' },
    { title: 'Micro-percage', desc: 'Realisation de petits diametres avec precision.' },
    { title: 'Trou de depart', desc: 'Preparation des trous pour la decoupe fil.' },
  ],
  compresseur: [
    { title: 'Air comprime', desc: 'Alimentation pneumatique de l atelier.' },
    { title: 'Regulation pression', desc: 'Maintien de la pression reseau.' },
    { title: 'Surveillance energie', desc: 'Suivi du courant, vibration et pression.' },
  ],
};

export const getMachineFunctions = (machine: MachineFunctionSource = {}): MachineFunction[] => {
  if (Array.isArray(machine.fonctions) && machine.fonctions.length > 0) {
    return machine.fonctions;
  }

  const haystack = normalizeText(`${machine.name || ''} ${machine.marque || ''} ${machine.model || ''} ${machine.type || ''}`);
  if (haystack.includes('compresseur')) return functionPresets.compresseur;
  if (haystack.includes('rectif')) return functionPresets.rectification;
  if (haystack.includes('agie cut') || haystack.includes('edm cut') || haystack.includes('electroerosion a fil')) return functionPresets.edmCut;
  if (haystack.includes('agie drill') || haystack.includes('edm drill') || haystack.includes('percage edm')) return functionPresets.edmDrill;
  if (haystack.includes('tour') || haystack.includes('tournage')) return functionPresets.tournage;
  if (haystack.includes('taraud')) return functionPresets.taraudage;
  if (haystack.includes('perca') || haystack.includes('drill')) return functionPresets.percage;
  return functionPresets.fraisage;
};
