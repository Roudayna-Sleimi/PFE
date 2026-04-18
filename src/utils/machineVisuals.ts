import type { LucideIcon } from 'lucide-react';
import { Cog, Drill, Gauge, Wrench, Zap } from 'lucide-react';

export type MachineIconKind = 'gear' | 'wrench' | 'bolt' | 'drill';

export interface MachineVisual {
  image: string;
  alt: string;
  Icon: LucideIcon;
}

const FALLBACK_IMAGE = 'https://commons.wikimedia.org/wiki/Special:FilePath/CNC_milling_machine.jpg?width=1400';

const ICON_BY_KIND: Record<MachineIconKind, LucideIcon> = {
  gear: Cog,
  wrench: Wrench,
  bolt: Zap,
  drill: Drill,
};

const VISUALS_BY_ID: Record<string, MachineVisual> = {
  'haas-cnc': {
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/CNC_milling_machine.jpg?width=1400',
    alt: 'Fraiseuse CNC HAAS',
    Icon: Cog,
  },
  'agie-cut': {
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Ona_AE300_(Wire_EDM_Cutting_Machine).jpg?width=1400',
    alt: 'Machine Agie Cut',
    Icon: Zap,
  },
  rectifieuse: {
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Gear_Grinding_Machine_(21032515005).jpg?width=1400',
    alt: 'Rectifieuse plane',
    Icon: Gauge,
  },
  'agie-drill': {
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Small_hole_drilling_EDM.jpg?width=1400',
    alt: 'Machine Agie Drill',
    Icon: Drill,
  },
  compresseur: {
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/2016-06-13_21_MV-LISA_1074_Kompressoren.jpg?width=1400',
    alt: 'Compresseur industriel ABAC',
    Icon: Wrench,
  },
  'tour-cnc': {
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/MoriSeikiLathe.jpg?width=1400',
    alt: 'Tour CNC Mazak',
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

const resolveImageUrl = (imageUrl?: string) => {
  if (!imageUrl) return '';
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return `http://localhost:5000${imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`}`;
};

export const getMachineVisual = (params: { id?: string; name?: string; icon?: MachineIconKind; imageUrl?: string }): MachineVisual => {
  const customImage = resolveImageUrl(params.imageUrl);
  if (customImage) {
    return {
      image: customImage,
      alt: params.name || 'Machine industrielle',
      Icon: ICON_BY_KIND[params.icon || 'gear'],
    };
  }

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
