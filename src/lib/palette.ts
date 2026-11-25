import { COLOR_IDS, type ColorId } from '../types';

export const PALETTE: Record<ColorId, string> = {
  blue: '#3b82f6',
  green: '#22c55e',
  purple: '#a855f7',
  orange: '#f97316',
  red: '#ef4444',
  gray: '#94a3b8',
  teal: '#14b8a6'
};

export const DEFAULT_FOLDER_COLOR = '#f5b942';
export const PALETTE_IDS = COLOR_IDS;
export const colorHex = (c?: string): string => (c && PALETTE[c as ColorId]) || DEFAULT_FOLDER_COLOR;
