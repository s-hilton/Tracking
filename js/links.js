import { load, save } from './storage.js';

// Websites the user has pinned to the dashboard. Each opens in its own window.
const DEFAULT_LINKS = [
  {
    id: 'map',
    name: 'Map',
    icon: '🗺️',
    color: '#0d9488',
    url: 'https://www.openstreetmap.org/export/embed.html?bbox=-0.25%2C51.45%2C0.05%2C51.56&layer=mapnik',
  },
];

export const getLinks = () => load('links', DEFAULT_LINKS);

export function saveLinks(links) {
  save('links', links);
  window.dispatchEvent(new Event('apps-changed'));
}

// Accepts "example.com" or a full URL; returns a normalized http(s) URL or null.
export function normalizeUrl(input) {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
