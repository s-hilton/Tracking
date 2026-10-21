// Finding "Lives in" places on the map. Places are looked up with OpenStreetMap's
// Nominatim service, one at a time (its rules allow one request a second), and
// remembered twice: on the card itself (so it syncs) and in a per-device cache
// keyed by the place text (so ten people in Boston cost one lookup).
import { load, save } from '../../storage.js';
import { contacts } from './data.js';

const CACHE_KEY = 'rolodex:geo';
const SEARCH = 'https://nominatim.openstreetmap.org/search';
const GAP_MS = 1100;
const RETRY_MISSES_AFTER = 7 * 86400000; // try a place that wasn't found again after a week

const keyOf = (place) => place.trim().toLowerCase().replace(/\s+/g, ' ');

let cache = load(CACHE_KEY, {});
const remember = (place, value) => { cache[keyOf(place)] = value; save(CACHE_KEY, cache); };

// { lat, lng } when known, false when it couldn't be found, null when not looked up
// yet (or there's no place to look up).
export function placeOf(c) {
  const place = c.location?.trim();
  if (!place) return null;
  if (c.geoFor === place && c.lat != null && c.lng != null) return { lat: c.lat, lng: c.lng };
  const hit = cache[keyOf(place)];
  if (hit?.lat != null) return hit;
  if (hit?.miss && Date.now() - hit.at < RETRY_MISSES_AFTER) return false;
  return null;
}

// Write cached coordinates onto cards that don't have them yet (no network needed).
function stampCards(place, { lat, lng }) {
  for (const c of contacts.all()) {
    if (c.location?.trim() && keyOf(c.location) === keyOf(place) && (c.geoFor !== c.location.trim() || c.lat !== lat || c.lng !== lng)) {
      contacts.upsert({ ...c, lat, lng, geoFor: c.location.trim() });
    }
  }
}

async function lookUp(place, signal) {
  const url = `${SEARCH}?format=jsonv2&limit=1&addressdetails=0&q=${encodeURIComponent(place)}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json', 'Accept-Language': navigator.language || 'en' } });
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
  const [hit] = await res.json();
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
}

// Finds every place not on the map yet. onProgress({ left, current }) after each.
// Returns a function that stops the lookups (e.g. when the map closes).
export function locateAll(onProgress) {
  const controller = new AbortController();
  (async () => {
    // Cards whose place is already in this device's cache just need stamping.
    for (const c of contacts.all()) {
      const known = c.location?.trim() && cache[keyOf(c.location)];
      if (known?.lat != null && placeOf(c) && (c.geoFor !== c.location.trim())) stampCards(c.location, known);
    }
    const todo = [...new Map(contacts.all()
      .filter((c) => c.location?.trim() && placeOf(c) === null)
      .map((c) => [keyOf(c.location), c.location.trim()])).values()];
    for (let i = 0; i < todo.length; i++) {
      if (controller.signal.aborted) return;
      onProgress?.({ left: todo.length - i, current: todo[i] });
      try {
        const found = await lookUp(todo[i], controller.signal);
        if (found) { remember(todo[i], found); stampCards(todo[i], found); } else remember(todo[i], { miss: true, at: Date.now() });
      } catch (err) {
        if (controller.signal.aborted) return;
        onProgress?.({ left: todo.length - i, current: todo[i], error: err.message || 'Lookup failed' });
        return; // offline or refused: stop quietly, the next visit tries again
      }
      if (i < todo.length - 1) await new Promise((r) => setTimeout(r, GAP_MS));
    }
    onProgress?.({ left: 0 });
  })();
  return () => controller.abort();
}
