// The map: everyone pinned where they live, on an old paper map in a wooden frame.
// Leaflet draws the map (loaded the first time the map opens); OpenStreetMap
// provides the tiles and finds each "Lives in" place (see geo.js).
import { h, loadStyles } from '../../ui.js';
import { contacts, displayName, sortedContacts } from './data.js';
import { placeOf, locateAll } from './geo.js';

const LEAFLET = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist';
let leafletPromise = null;
function loadLeaflet() {
  loadStyles(`${LEAFLET}/leaflet.css`);
  leafletPromise ??= import(`${LEAFLET}/leaflet-src.esm.js`).catch((err) => { leafletPromise = null; throw err; });
  return leafletPromise;
}

// People who live in the same place share one pin.
function groupByPlace() {
  const groups = new Map();
  const missing = []; const notFound = []; let pending = 0;
  for (const c of sortedContacts()) {
    const where = placeOf(c);
    if (!c.location?.trim()) missing.push(c);
    else if (where === false) notFound.push(c);
    else if (!where) pending++;
    else {
      const key = `${where.lat.toFixed(3)},${where.lng.toFixed(3)}`;
      if (!groups.has(key)) groups.set(key, { key, ...where, label: c.location.trim(), people: [] });
      groups.get(key).people.push(c);
    }
  }
  return { places: [...groups.values()].sort((a, b) => b.people.length - a.people.length || a.label.localeCompare(b.label)), missing, notFound, pending };
}

const PINS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#9333ea', '#0891b2'];

export function mapView(ctx) {
  let L = null;
  let map = null;
  let markers = new Map(); // place key -> marker
  let stopLookups = () => {};
  let destroyed = false;
  let status = '';
  const mapEl = h('div', { class: 'rdx-map', role: 'region', 'aria-label': 'Map of where everyone lives' });
  const side = h('aside', { class: 'rdx-map-side' });
  const frame = h('div', { class: 'rdx-map-frame' }, mapEl);
  const el = h('div', { class: 'rdx-mapview' }, side, frame);

  function popupFor(place) {
    return h('div', { class: 'rdx-map-slip' },
      h('strong', { class: 'rdx-typed' }, place.label),
      h('ul', {}, ...place.people.map((c) => h('li', {},
        h('button', { type: 'button', class: 'rdx-name-link', onclick: () => ctx.openContact(c.id) }, displayName(c)),
        c.company ? h('span', { class: 'rdx-dim small' }, ` · ${c.company}`) : null))));
  }

  function pinIcon(place, i) {
    const n = place.people.length;
    return L.divIcon({
      className: 'rdx-map-pin-wrap',
      html: `<span class="rdx-map-pin" style="--pin:${PINS[i % PINS.length]}"><span class="rdx-map-pin-head"></span>${n > 1 ? `<span class="rdx-map-count">${n}</span>` : ''}</span>`,
      iconSize: [28, 34],
      iconAnchor: [9, 32],
      popupAnchor: [4, -30],
    });
  }

  function drawSide(data) {
    const { places, missing, notFound, pending } = data;
    const people = places.reduce((n, p) => n + p.people.length, 0);
    const personLink = (c, hint) => h('li', {},
      h('button', { type: 'button', class: 'rdx-name-link', onclick: () => ctx.edit(c.id, { focus: 'Name & work' }) }, displayName(c)),
      hint ? h('span', { class: 'rdx-dim small' }, ` ${hint}`) : null);
    side.replaceChildren(...[
      h('header', {},
        h('h2', { class: 'rdx-typed' }, 'Where everyone lives'),
        h('p', { class: 'rdx-dim small' }, `${people} ${people === 1 ? 'person' : 'people'} in ${places.length} place${places.length === 1 ? '' : 's'}`)),
      status || pending ? h('p', { class: 'rdx-map-status' }, status || `Finding ${pending} more…`) : null,
      places.length ? h('ol', { class: 'rdx-map-places' }, ...places.map((p) => h('li', {},
        h('button', { type: 'button', onclick: () => focusPlace(p.key) },
          h('span', {}, p.label), h('span', { class: 'rdx-count muted-count' }, String(p.people.length)))))) : null,
      notFound.length ? h('details', { class: 'rdx-map-more', open: true },
        h('summary', {}, `Couldn’t find (${notFound.length})`),
        h('p', { class: 'rdx-dim small' }, 'Try a clearer city, like “Portland, Oregon”.'),
        h('ul', {}, ...notFound.map((c) => personLink(c, `“${c.location}”`)))) : null,
      missing.length ? h('details', { class: 'rdx-map-more' },
        h('summary', {}, `No city yet (${missing.length})`),
        h('p', { class: 'rdx-dim small' }, 'Tap a name to add where they live.'),
        h('ul', {}, ...missing.map((c) => personLink(c)))) : null,
      !contacts.all().length ? h('p', { class: 'rdx-blank' }, 'Add some cards with a “Lives in” city to see them here.') : null,
    ].filter(Boolean));
  }

  function focusPlace(key) {
    const m = markers.get(key);
    if (!m || !map) return;
    map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 9), { duration: 0.8 });
    m.openPopup();
  }

  function draw({ fit = false } = {}) {
    const data = groupByPlace();
    drawSide(data);
    if (!map) return;
    const seen = new Set();
    data.places.forEach((place, i) => {
      seen.add(place.key);
      const existing = markers.get(place.key);
      if (existing) {
        existing.setIcon(pinIcon(place, i));
        existing.setPopupContent(popupFor(place));
      } else {
        const m = L.marker([place.lat, place.lng], { icon: pinIcon(place, i), title: `${place.label}: ${place.people.map(displayName).join(', ')}`, riseOnHover: true })
          .bindPopup(popupFor(place), { className: 'rdx-map-popup', minWidth: 180, maxWidth: 280 })
          .addTo(map);
        markers.set(place.key, m);
      }
    });
    for (const [key, m] of markers) if (!seen.has(key)) { m.remove(); markers.delete(key); }
    if (fit && data.places.length) {
      map.fitBounds(L.latLngBounds(data.places.map((p) => [p.lat, p.lng])).pad(0.3), { maxZoom: 10 });
    }
    // Arriving from someone's card: open their pin.
    const focusId = ctx.state.mapFocus;
    if (focusId) {
      const place = data.places.find((p) => p.people.some((c) => c.id === focusId));
      if (place) { ctx.state.mapFocus = null; focusPlace(place.key); }
    }
  }

  draw();
  let resize = null;
  loadLeaflet().then((mod) => {
    if (destroyed) return;
    L = mod;
    map = L.map(mapEl, { worldCopyJump: true, zoomControl: true, attributionControl: true }).setView([30, -20], 2);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(map);
    resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(mapEl);
    draw({ fit: true });
    // Keep everyone in view as places are found, until you move the map yourself.
    let moved = false;
    map.on('dragstart', () => { moved = true; });
    mapEl.addEventListener('wheel', () => { moved = true; }, { passive: true });
    map.on('popupopen', () => { moved = true; });
    let shown = markers.size;
    stopLookups = locateAll(({ left, current, error }) => {
      status = error ? `Couldn’t look up places right now (${error}). They’ll be found next time.` : left ? `Finding ${current}… (${left} to go)` : '';
      draw({ fit: !moved && markers.size > shown });
      shown = markers.size;
    });
  }).catch(() => {
    mapEl.replaceChildren(h('p', { class: 'rdx-map-offline rdx-typed' }, 'The map needs an internet connection. Everyone’s places are still listed on the left.'));
  });

  return {
    el,
    update: () => draw(),
    destroy() { destroyed = true; stopLookups(); resize?.disconnect(); map?.remove(); },
  };
}
