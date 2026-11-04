// The Institutions tab: universities & colleges, tribal nations and museums,
// filtered by state → county → city/town, on a list and a map.
import { h } from '../../ui.js';
import { STATES, stateByFips } from './config.js';
import * as src from './sources.js';
import { INST_TYPES, colleges, museums } from './institutions.js';
import { collegeContacts, itemContacts, searchUrl } from './contacts.js';
import { boundsOf, pointInRings, formatAcres } from './geo.js';
import { loadLeaflet, BASEMAPS } from './leaflet.js';
import { sites, savedFor, INTEREST } from './data.js';
import { recordEditor, interestBadge } from './record-editor.js';

// Museums and planetariums come from the same lookup.
const LOADERS = { college: colleges, museum: museums };

export function institutionsView(ctx) {
  const ui = (ctx.state.inst ??= {});
  ui.types ??= { college: true, museum: true, planetarium: true };
  ui.types.planetarium ??= true; delete ui.types.tribe;
  ui.control ??= { Public: true, 'Private nonprofit': true, 'Private for-profit': false };
  ui.fourYearOnly ??= false;
  ui.scienceOnly ??= false;
  ui.q ??= '';
  ui.stateFips ??= ctx.state.stateFips ?? '';

  let L = null; let map = null; let markers = null; let outline = null;
  let destroyed = false;
  let stateRings = []; let area = { rings: [], label: '' };
  let countyList = []; let muniList = [];
  let items = { college: [], museum: [], planetarium: [] };
  let status = {}; let notes = {}; let collegeSource = '';
  let selected = null; let contacts = null;
  let pickCtl = null; let loadCtl = null; let contactCtl = null;

  const mapEl = h('div', { class: 'land-map', role: 'region', 'aria-label': 'Map of institutions' });
  const side = h('aside', { class: 'land-side' });
  const el = h('div', { class: 'land-mapview' }, side, h('div', { class: 'land-map-wrap' }, mapEl));

  const stateSel = h('select', { class: 'input', 'aria-label': 'State', onchange: () => pickState(stateSel.value, true) },
    h('option', { value: '' }, 'Pick a state…'),
    ...STATES.map((s) => h('option', { value: s.fips, selected: s.fips === ui.stateFips }, s.name)));
  const countySel = h('select', { class: 'input', 'aria-label': 'County', disabled: true, onchange: () => pickCounty(countySel.value, true) });
  const muniSel = h('select', { class: 'input', 'aria-label': 'City or town', disabled: true, onchange: () => pickMuni(muniSel.value, true) });
  const persistDraw = () => { ctx.persist(); draw(); };
  const check = (obj, key, label, color, after = persistDraw) => h('label', { class: 'land-check' },
    h('input', { type: 'checkbox', checked: Boolean(obj[key]), onchange: (e) => { obj[key] = e.target.checked; after(); } }),
    color ? h('span', { class: 'land-swatch', style: `--c:${color}` }) : null, label);
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search by name…', value: ui.q, oninput: (e) => { ui.q = e.target.value; persistDraw(); } });

  const filterBox = h('details', { class: 'land-filter-box', open: true }, h('summary', {}, 'Filters'),
    h('div', { class: 'land-filters' },
      h('div', { class: 'land-field' }, h('span', { class: 'land-label' }, 'Where'), stateSel, countySel, muniSel),
      h('div', { class: 'land-field' }, h('span', { class: 'land-label' }, 'Show'),
        ...Object.entries(INST_TYPES).map(([k, t]) => check(ui.types, k, t.label, t.color, () => { ctx.persist(); loadAll(); }))),
      h('div', { class: 'land-field' }, h('span', { class: 'land-label' }, 'Colleges'),
        ...Object.keys(ui.control).map((k) => check(ui.control, k, k)),
        check(ui, 'fourYearOnly', '4-year only')),
      h('div', { class: 'land-field' }, h('span', { class: 'land-label' }, 'Museums'),
        check(ui, 'scienceOnly', 'Science & space museums only')),
      search));
  const results = h('div', { class: 'land-results' });
  side.append(filterBox, results);
  requestAnimationFrame(() => { if (el.clientWidth && el.clientWidth < 700) filterBox.open = false; });

  function options(sel, list, placeholder, current) {
    sel.replaceChildren(h('option', { value: '' }, placeholder), ...list.map((x) => h('option', { value: x.fips ?? x.id, selected: (x.fips ?? x.id) === current }, x.name)));
    sel.disabled = !list.length;
  }

  // ---- Area ------------------------------------------------------------------

  async function pickState(fips, fit) {
    pickCtl?.abort(); pickCtl = new AbortController(); const { signal } = pickCtl;
    ui.stateFips = fips; ui.countyFips = ''; ui.muniId = ''; ctx.persist();
    countyList = []; muniList = []; stateRings = []; area = { rings: [], label: '' };
    options(countySel, [], 'All counties'); options(muniSel, [], 'All cities & towns');
    items = { college: [], museum: [], planetarium: [] }; selected = null;
    draw();
    if (!fips) return;
    try {
      const [shape, list] = await Promise.all([src.stateShape(fips, signal), src.counties(fips, signal)]);
      stateRings = shape; countyList = list;
      options(countySel, list, 'All counties', '');
      setArea(shape, stateByFips(fips).name, fit);
      loadAll();
    } catch (err) {
      if (!signal.aborted) { status.error = `Couldn’t load ${stateByFips(fips).name} from the Census Bureau: ${err.message}`; draw(); }
    }
  }

  async function pickCounty(fips, fit) {
    pickCtl?.abort(); pickCtl = new AbortController(); const { signal } = pickCtl;
    ui.countyFips = fips; ui.muniId = ''; countySel.value = fips; ctx.persist();
    muniList = []; options(muniSel, [], 'All cities & towns');
    if (!fips) { setArea(stateRings, stateByFips(ui.stateFips).name, fit); loadAll(); return; }
    try {
      const shape = await src.countyShape(ui.stateFips, fips, signal);
      setArea(shape, `${countyList.find((c) => c.fips === fips)?.name}, ${stateByFips(ui.stateFips).abbr}`, fit);
      loadAll();
      muniList = await src.municipalities(ui.stateFips, fips, shape, signal);
      options(muniSel, muniList, `All cities & towns (${muniList.length})`, '');
    } catch (err) {
      if (!signal.aborted) { status.error = `Couldn’t load the county: ${err.message}`; draw(); }
    }
  }

  async function pickMuni(id, fit) {
    pickCtl?.abort(); pickCtl = new AbortController(); const { signal } = pickCtl;
    ui.muniId = id; muniSel.value = id; ctx.persist();
    if (!id) return pickCounty(ui.countyFips, fit);
    const m = muniList.find((x) => x.id === id);
    try { setArea(await src.municipalityShape(m, signal), `${m.name}, ${stateByFips(ui.stateFips).abbr}`, fit); loadAll(); } catch (err) {
      if (!signal.aborted) { status.error = `Couldn’t load ${m.name}: ${err.message}`; draw(); }
    }
  }

  function setArea(rings, label, fit) {
    area = { rings: rings ?? [], label };
    const b = boundsOf(area.rings);
    if (map) {
      outline?.remove();
      outline = area.rings.length ? L.polygon(area.rings, { color: '#6366f1', weight: 2, fill: false, dashArray: '6 4', interactive: false }).addTo(map) : null;
      if (fit && b) map.flyToBounds([[b.s, b.w], [b.n, b.e]], { padding: [20, 20], duration: 0.8 });
    }
    draw();
  }

  async function restore() {
    const { countyFips, muniId } = ui;
    if (!ui.stateFips) return;
    await pickState(ui.stateFips, true);
    if (countyFips && countyList.some((c) => c.fips === countyFips)) {
      await pickCounty(countyFips, true);
      if (muniId && muniList.some((m) => m.id === muniId)) await pickMuni(muniId, true);
    }
  }

  // ---- Data --------------------------------------------------------------------

  function loadAll() {
    const st = stateByFips(ui.stateFips);
    if (!st) return;
    loadCtl?.abort(); loadCtl = new AbortController(); const { signal } = loadCtl;
    const areaBox = ui.countyFips && area.rings !== stateRings ? boundsOf(area.rings) : null;
    for (const [type, load] of Object.entries(LOADERS)) {
      const wanted = type === 'museum' ? ui.types.museum || ui.types.planetarium : ui.types[type];
      if (!wanted) { status[type] = ''; continue; }
      if (type === 'museum' && !areaBox) { status.museum = 'pick'; items.museum = []; items.planetarium = []; continue; }
      status[type] = 'loading';
      (type === 'college' ? load(st, signal) : load(st, areaBox, signal))
        .then((r) => {
          if (signal.aborted || ui.stateFips !== st.fips) return;
          if (type === 'museum') {
            items.museum = r.items.filter((x) => x.type === 'museum');
            items.planetarium = r.items.filter((x) => x.type === 'planetarium');
          } else items[type] = r.items;
          status[type] = '';
          if (type === 'college') collegeSource = r.source;
          notes[type] = r.partial ?? null;
          draw();
        })
        .catch((err) => { if (!signal.aborted) { status[type] = `error:${err.message}`; draw(); } });
    }
    draw();
  }

  // ---- Filtering & drawing -------------------------------------------------------------

  function inArea(it) {
    const rings = area.rings.length ? area.rings : stateRings;
    if (!rings.length) return true;
    if (it.type === 'college' && it.countyFips && !ui.muniId && ui.countyFips) return it.countyFips === ui.countyFips;
    return Boolean(it.center && pointInRings(it.center.lat, it.center.lng, rings));
  }

  function visible() {
    const q = ui.q.trim().toLowerCase();
    return Object.entries(items).filter(([type]) => ui.types[type]).flatMap(([, list]) => list).filter((it) => {
      if (q && !`${it.name} ${it.city ?? ''} ${it.operator ?? ''}`.toLowerCase().includes(q)) return false;
      if (it.type === 'college' && it.control && !ui.control[it.control]) return false;
      if (it.type === 'college' && ui.fourYearOnly && it.level && it.level !== '4-year') return false;
      if (it.type === 'museum' && ui.scienceOnly && !it.science) return false;
      return inArea(it);
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  let drawFrame = 0;
  function draw() { cancelAnimationFrame(drawFrame); drawFrame = requestAnimationFrame(drawNow); }
  let pendingDraw = false;
  side.addEventListener('focusout', () => setTimeout(() => { if (pendingDraw) draw(); }, 0));
  function drawNow() {
    if (side.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) && document.activeElement.type !== 'search') { pendingDraw = true; return; }
    pendingDraw = false;
    const list = visible();
    renderSide(list);
    if (!map) return;
    markers.clearLayers();
    for (const it of list) {
      const color = INST_TYPES[it.type].color;
      const on = selected?.id === it.id;
      const rec = savedFor(it.id);
      const ring = rec?.interest ? INTEREST[rec.interest].color : '#fff';
      const layer = L.circleMarker([it.center.lat, it.center.lng], { radius: on ? 9 : rec?.interest ? 8 : 6, color: ring, weight: rec?.interest ? 3 : 1.5, fillColor: color, fillOpacity: 0.95 });
      layer.bindTooltip(it.name, { sticky: true }).on('click', () => select(it));
      layer.addTo(markers);
    }
  }

  function statusLine(type) {
    const s = status[type];
    if (!s) return null;
    const label = type === 'museum' ? 'museums & planetariums' : INST_TYPES[type].label.toLowerCase();
    if (s === 'loading') return h('li', { class: 'muted' }, `Loading ${label}…`);
    if (s === 'pick') return h('li', { class: 'muted' }, 'Pick a county (or city/town) to load its museums and planetariums.');
    return h('li', { class: 'land-err' }, `Couldn’t load ${label}: ${s.slice(6)} `,
      h('button', { type: 'button', class: 'link-btn', onclick: () => loadAll() }, 'Try again'));
  }

  function renderSide(list) {
    if (selected) { results.replaceChildren(detail(selected)); return; }
    if (!ui.stateFips) { results.replaceChildren(h('p', { class: 'muted small' }, 'Pick a state to list its universities and colleges, tribal nations and museums.')); return; }
    const counts = Object.fromEntries(Object.keys(INST_TYPES).map((t) => [t, list.filter((x) => x.type === t).length]));
    const lines = [...Object.keys(LOADERS).map(statusLine), status.error ? h('li', { class: 'land-err' }, status.error) : null,
      ...Object.entries(notes).filter(([t, n]) => n && ui.types[t]).map(([, n]) => h('li', { class: 'muted' }, n)),
      collegeSource === 'osm' && ui.types.college ? h('li', { class: 'muted' }, 'The college directory was unreachable, so colleges come from OpenStreetMap (less detail).') : null].filter(Boolean);
    const shown = list.slice(0, 300);
    results.replaceChildren(...[
      lines.length ? h('ul', { class: 'land-status' }, ...lines) : null,
      h('h3', { class: 'land-results-head' }, `${list.length} in ${area.label || stateByFips(ui.stateFips).name}`),
      h('p', { class: 'muted small' }, Object.entries(INST_TYPES).filter(([t]) => ui.types[t]).map(([t, x]) => `${counts[t]} ${x.label.toLowerCase()}`).join(' · ')),
      h('ol', { class: 'land-list' }, ...shown.map((it) => h('li', {},
        h('button', { type: 'button', onclick: () => select(it, true) },
          h('span', { class: 'land-swatch', style: `--c:${INST_TYPES[it.type].color}` }),
          h('span', { class: 'land-list-main' }, h('strong', {}, it.name), h('span', { class: 'muted small' }, [it.kind, it.city].filter(Boolean).join(' · '))),
          interestBadge(savedFor(it.id)))))),
      list.length > shown.length ? h('p', { class: 'muted small' }, `Showing the first ${shown.length}; search or narrow the area to see the rest.`) : null,
    ].filter(Boolean));
  }

  // ---- Detail -----------------------------------------------------------------------

  function select(it, fly = false) {
    selected = it; contacts = 'loading';
    draw();
    side.scrollTo({ top: results.offsetTop - side.offsetTop, behavior: 'smooth' });
    if (fly && map) {
      const b = it.rings?.length ? boundsOf(it.rings) : null;
      if (b) map.flyToBounds([[b.s, b.w], [b.n, b.e]], { padding: [30, 30], duration: 0.6 });
      else map.flyTo([it.center.lat, it.center.lng], 15, { duration: 0.6 });
    }
    contactCtl?.abort(); contactCtl = new AbortController(); const { signal } = contactCtl;
    const lookup = it.type === 'college' && it.unitid ? collegeContacts(it.unitid, signal) : itemContacts(it.wikidata, signal);
    lookup.then((c) => { if (selected === it) { contacts = c; draw(); } })
      .catch((err) => { if (!signal.aborted && selected === it) { contacts = { error: err.message }; draw(); } });
  }

  const baseOf = (it) => ({
    key: it.id, category: it.type, name: it.name, kind: it.kind, stateAbbr: stateByFips(ui.stateFips)?.abbr ?? '',
    website: it.website ?? '', phone: it.phone ?? '', address: it.address ?? '', lat: it.center?.lat, lng: it.center?.lng,
    source: it.source, sourceUrl: it.osm ?? '', contacts: it.head ? [{ name: it.head.name, title: it.head.title, email: '', phone: '' }] : [],
  });

  function detail(it) {
    const row = (label, value) => (value ? h('div', { class: 'land-row' }, h('dt', {}, label), h('dd', {}, value)) : null);
    const link = (href, label) => h('a', { class: 'land-link', href, target: '_blank', rel: 'noopener' }, label);
    const c = contacts && contacts !== 'loading' && !contacts.error ? contacts : null;
    const suggest = contacts === 'loading' ? { loading: true } : contacts?.error ? { error: contacts.error }
      : { website: c?.website ?? '', phone: c?.phone ?? '', office: c?.office ?? null, leaders: [...(it.head ? [{ name: it.head.name }] : []), ...(c?.leaders ?? []).filter((l) => l.name !== it.head?.name)] };
    if (it.head && !c?.office) suggest.office = it.head.title;
    const { lat, lng } = it.center ?? {};
    return h('div', { class: 'land-detail' },
      h('button', { type: 'button', class: 'link-btn', onclick: () => { selected = null; draw(); } }, '← Back to list'),
      h('h3', {}, it.name),
      h('p', { class: 'muted small' }, `${it.kind} · from ${it.source}`),
      it.tags?.length ? h('div', { class: 'land-chips' }, ...it.tags.map((t) => h('span', { class: 'land-chip' }, t))) : null,
      h('dl', { class: 'land-dl' },
        row('Size', it.size || (it.acres ? formatAcres(it.acres) : null)),
        row('Run by', it.operator),
        row('Address', it.address)),
      h('div', { class: 'land-links' },
        it.type === 'college' ? link(searchUrl(`${it.name} facilities real estate office`), 'Facilities / real estate') : null,
        it.type === 'college' ? link(searchUrl(`${it.name} astronomy physics department`), 'Astronomy / physics dept') : null,
        it.type === 'college' ? link(searchUrl(`${it.name} electrical aerospace engineering department`), 'EE / aerospace dept') : null,
        it.type === 'college' ? link(searchUrl(`${it.name} office of research partnerships`), 'Research partnerships') : null,
        it.type !== 'college' ? link(searchUrl(`${it.name} director contact`), 'Director / leadership') : null,
        it.center ? link(`https://www.google.com/maps/@?api=1&map_action=map&center=${lat},${lng}&zoom=16&basemap=satellite`, 'Google Maps satellite') : null,
        it.osm ? link(it.osm, 'OpenStreetMap record') : null,
        c?.wikidata ? link(c.wikidata, 'Wikidata') : null),
      recordEditor(baseOf(it), { suggest }),
      savedFor(it.id)?.interest === 'yes' ? h('button', { type: 'button', class: 'btn small', onclick: () => ctx.go('pipeline', { siteId: savedFor(it.id).id }) }, 'Open in Pipeline') : null);
  }

  // ---- Map --------------------------------------------------------------------------

  draw();
  let resize = null;
  loadLeaflet().then((mod) => {
    if (destroyed) return;
    L = mod;
    map = L.map(mapEl).setView([39.5, -98.5], 4);
    const b = BASEMAPS[ctx.state.basemap] ?? BASEMAPS.map;
    L.tileLayer(b.url, { maxZoom: b.max, attribution: b.attribution }).addTo(map);
    markers = L.featureGroup().addTo(map);
    resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(mapEl);
    setArea(area.rings, area.label, true);
    // Arriving from the Pipeline's "Show on map".
    if (ctx.state.instFocus) { const f = ctx.state.instFocus; ctx.state.instFocus = null; ctx.persist(); setTimeout(() => map.flyTo([f.lat, f.lng], 15, { duration: 0.6 }), 900); }
  }).catch(() => mapEl.replaceChildren(h('p', { class: 'land-offline' }, 'The map needs an internet connection.')));
  restore();
  const offSites = sites.subscribe(() => draw());

  return {
    el,
    destroy() {
      destroyed = true; cancelAnimationFrame(drawFrame); offSites();
      [pickCtl, loadCtl, contactCtl].forEach((x) => x?.abort());
      resize?.disconnect(); map?.remove();
    },
  };
}
