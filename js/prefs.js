import { load, save } from './storage.js';

export const WALLPAPERS = {
  aurora: 'radial-gradient(at 15% 20%, #4f46e5 0, transparent 50%), radial-gradient(at 85% 25%, #db2777 0, transparent 45%), radial-gradient(at 50% 95%, #0891b2 0, transparent 55%), linear-gradient(#0b1020, #0b1020)',
  sunset: 'linear-gradient(135deg, #f97316, #db2777 50%, #6d28d9)',
  ocean: 'linear-gradient(160deg, #0ea5e9, #1e3a8a)',
  forest: 'linear-gradient(160deg, #059669, #064e3b 55%, #0f172a)',
  dawn: 'linear-gradient(160deg, #fde68a, #fbcfe8 50%, #bfdbfe)',
  slate: 'linear-gradient(160deg, #334155, #0b0f19)',
};

export const ACCENTS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];

const DEFAULTS = { theme: 'auto', wallpaper: 'aurora', accent: ACCENTS[0] };

let prefs = { ...DEFAULTS, ...load('prefs', {}) };

export const getPrefs = () => prefs;

export function setPrefs(patch) {
  prefs = { ...prefs, ...patch };
  save('prefs', prefs);
  applyPrefs();
}

export function applyPrefs() {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.style.setProperty('--wallpaper', WALLPAPERS[prefs.wallpaper] ?? WALLPAPERS.aurora);
  root.style.setProperty('--accent', prefs.accent);
}
