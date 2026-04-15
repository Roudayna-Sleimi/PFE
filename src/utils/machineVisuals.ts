import type { LucideIcon } from 'lucide-react';
import { Cog, Drill, Gauge, Wrench, Zap } from 'lucide-react';

export type MachineIconKind = 'gear' | 'wrench' | 'bolt' | 'drill';

export interface MachineVisual {
  image: string;
  alt: string;
  Icon: LucideIcon;
}

const FALLBACK_IMAGE = 'https://picsum.photos/seed/cnc-fallback/1400/900';

const ICON_BY_KIND: Record<MachineIconKind, LucideIcon> = {
  gear: Cog,
  wrench: Wrench,
  bolt: Zap,
  drill: Drill,
};

const VISUALS_BY_ID: Record<string, MachineVisual> = {
  'haas-cnc': {
    image: 'https://picsum.photos/seed/haas-cnc/1400/900',
    alt: 'HAAS CNC milling machine',
    Icon: Cog,
  },
  'agie-cut': {
    image: 'https://picsum.photos/seed/agie-cut-edm/1400/900',
    alt: 'Agie Cut EDM machine',
    Icon: Zap,
  },
  rectifieuse: {
    image: 'https://picsum.photos/seed/rectifieuse-surface/1400/900',
    alt: 'Surface grinding machine',
    Icon: Gauge,
  },
  'agie-drill': {
    image: 'https://picsum.photos/seed/agie-drill/1400/900',
    alt: 'Agie Drill EDM machine',
    Icon: Drill,
  },
  compresseur: {
    image: 'https://picsum.photos/seed/abac-compressor/1400/900',
    alt: 'ABAC industrial compressor',
    Icon: Wrench,
  },
  'tour-cnc': {
    image: 'https://picsum.photos/seed/mazak-lathe/1400/900',
    alt: 'Mazak CNC lathe machine',
    Icon: Cog,
  },
};

const pickByName = (name = ''): MachineVisual | null => {
  const n = name.toLowerCase();
  if (n.includes('haas')) return VISUALS_BY_ID['haas-cnc'];
  if (n.includes('agie') && n.includes('cut')) return VISUALS_BY_ID['agie-cut'];
  if (n.includes('agie') && n.includes('drill')) return VISUALS_BY_ID['agie-drill'];
  if (n.includes('rectifi')) return VISUALS_BY_ID.rectifieuse;
  if (n.includes('compresseur') || n.includes('abac')) return VISUALS_BY_ID.compresseur;
  if (n.includes('mazak') || n.includes('tour cnc')) return VISUALS_BY_ID['tour-cnc'];
  return null;
};

export const getMachineVisual = (params: { id?: string; name?: string; icon?: MachineIconKind }): MachineVisual => {
  const byId = params.id ? VISUALS_BY_ID[params.id] : null;
  if (byId) return byId;
  const byName = pickByName(params.name);
  if (byName) return byName;
  return {
    image: FALLBACK_IMAGE,
    alt: params.name || 'Machine industrielle',
    Icon: ICON_BY_KIND[params.icon || 'gear'],
  };
};

export const getFallbackMachineImage = () => FALLBACK_IMAGE;
