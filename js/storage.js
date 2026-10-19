// Thin wrapper around localStorage. Everything is namespaced so the app
// can find (and erase) its own data without touching anything else.
const PREFIX = 'webtop:';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (err) {
    console.warn('Could not save', key, err);
  }
}

export function remove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}

export function clearAll() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

// crypto.randomUUID only exists in secure contexts, so keep a fallback
// for testing on a phone over plain http on the local network.
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
