// The Map tab: filters on the left (state → county → municipality, layers, size),
// the map on the right. Data for whatever is on screen loads live as you move.
import { h } from '../../ui.js';
import { loadLeaflet, BASEMAPS } from './leaflet.js';
import { STATES, stateByFips, parcelStatus, regionOf } from './config.js';
import * as src from './sources.js';
import { boundsOf, pointInRings, formatAcres, formatDistance } from './geo.js';
import { parcelService, governmentParcels, chooseParcelService, parcelAt } from './parcels.js';
import { countyContacts, municipalityContacts, searchUrl } from './contacts.js';
import { sites, saveSite, savedFor, STAGES } from './data.js';

// Each layer loads once you're zoomed in this far (keeps requests small).
const MIN_ZOOM = { land: 9, buildings: 12, power: 11, parcels: 14 };
const LAND_COLOR = '#16a34a';
const POWER_COLOR = '#ea580c';
const PARCEL_COLOR = '#db2777';

export function mapView(ctx) {
  const ui = ctx.state;
  ui.layers ??= { land: true, library: true, townhall: true, community_centre: true, fire_station: false, power: false };
  ui.layers.parcels ??= true;
  ui.basemap ??= 'map';
  ui.insideOnly ??= true;

  let L = null; let map = null; let tiles = null;
  let groups = {};
  let destroyed = false;
  let countyList = []; let muniList = [];
  let area = { rings: [], label: '' }; // the selected state / county / municipality outline
  let data = { land: [], buildings: [], power: null, parcels: [] };
  let status = { land: '', buildings: '', power: '', parcels: '' };
  let parcelInfo = null; // { county, status, service, candidates } for the county in view
  let selected = null; let selectedPower = null; let selectedGov = null;
  let loadCtl = null; let pickCtl = null; let powerCtl = null; let govCtl = null;

  const mapEl = h('div', { class: 'land-map', role: 'region', 'aria-label': 'Map of publicly owned land' });
  const side = h('aside', { class: 'land-side' });
  const el = h('div', { class: 'land-mapview' }, side, h('div', { class: 'land-map-wrap' }, mapEl));

  // ---- Filters ----------------------------------------------------------

  const stateSel = h('select', { class: 'input', 'aria-label': 'State', onchange: () => pickState(stateSel.value, { fit: true }) },
    h('option', { value: '' }, 'All states'),
    ...STATES.map((s) => h('option', { value: s.fips, selected: s.fips === ui.stateFips }, s.name)));
  const countySel = h('select', { class: 'input', 'aria-label': 'County', disabled: true, onchange: () => pickCounty(countySel.value, { fit: true }) });
  const muniSel = h('select', { class: 'input', 'aria-label': 'City or town', disabled: true, onchange: () => pickMuni(muniSel.value, { fit: true }) });

  const num = (key, label) => h('label', { class: 'land-num' }, h('span', { class: 'muted' }, label),
    h('input', { class: 'input', type: 'number', min: 0, step: 'any', inputMode: 'decimal', placeholder: 'any', value: ui[key] || '',
      onchange: (e) => { ui[key] = Number(e.target.value) || 0; ctx.persist(); reload(); } }));

  const check = (key, label, color) => h('label', { class: 'land-check' },
    h('input', { type: 'checkbox', checked: Boolean(ui.layers[key]), onchange: (e) => { ui.layers[key] = e.target.checked; ctx.persist(); reload(); } }),
    color ? h('span', { class: 'land-swatch', style: `--c:${color}` }) : null, label);

  const filters = h('div', { class: 'land-filters' },
    h('div', { class: 'land-field' }, h('span', { class: 'land-label' }, 'Where'), stateSel, countySel, muniSel,
      h('label', { class: 'land-check small' }, h('input', { type: 'checkbox', checked: ui.insideOnly, onchange: (e) => { ui.insideOnly = e.target.checked; ctx.persist(); draw(); } }), 'Only list results inside the selected area')),
    h('div', { class: 'land-field' }, h('span', { class: 'land-label' }, 'Show'),
      check('parcels', 'Government-owned parcels (zoom in)', PARCEL_COLOR),
      check('land', 'Local-government land (parks, open space)', LAND_COLOR),
      ...Object.entries(src.BUILDING_KINDS).map(([k, b]) => check(k, b.label, b.color)),
      check('power', 'Power lines & substations', POWER_COLOR)),
    h('div', { class: 'land-field' }, h('span', { class: 'land-label' }, 'Size (acres)'),
      h('div', { class: 'land-nums' }, num('minAcres', 'Min'), num('maxAcres', 'Max'))),
    h('div', { class: 'land-field' }, h('span', { class: 'land-label' }, 'Base map'),
      h('div', { class: 'land-seg' }, ...Object.entries(BASEMAPS).map(([k, b]) => h('button', {
        type: 'button', class: `land-seg-btn${ui.basemap === k ? ' on' : ''}`,
        onclick: (e) => { ui.basemap = k; ctx.persist(); setBasemap(); e.currentTarget.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === e.currentTarget)); },
      }, b.label)))));

  const results = h('div', { class: 'land-results' });
  const filterBox = h('details', { class: 'land-filter-box', open: true }, h('summary', {}, 'Filters'), filters);
  side.append(filterBox, results);
  // On a phone-sized window, start with the filters folded so results show first.
  requestAnimationFrame(() => { if (el.clientWidth && el.clientWidth < 700) filterBox.open = false; });

  function options(sel, list, placeholder, current) {
    sel.replaceChildren(h('option', { value: '' }, placeholder), ...list.map((x) => h('option', { value: x.fips ?? x.id, selected: (x.fips ?? x.id) === current }, x.name)));
    sel.disabled = !list.length;
  }

  // ---- Picking an area --------------------------------------------------

  async function pickState(fips, { fit } = {}) {
    pickCtl?.abort(); pickCtl = new AbortController(); const { signal } = pickCtl;
    ui.stateFips = fips || ''; ui.countyFips = ''; ui.muniId = '';
    ctx.persist();
    countyList = []; muniList = [];
    options(countySel, [], 'All counties'); options(muniSel, [], 'All cities & towns');
    area = { rings: [], label: '' };
    drawArea(); draw();
    if (!fips) { if (fit) map?.flyTo([39.5, -98.5], 4); return; }
    countySel.replaceChildren(h('option', {}, 'Loading counties…'));
    try {
      const [shape, list] = await Promise.all([src.stateShape(fips, signal), src.counties(fips, signal)]);
      countyList = list;
      options(countySel, list, 'All counties', ui.countyFips);
      setArea(shape, stateByFips(fips).name, fit);
    } catch (err) {
      if (signal.aborted) return;
      countySel.replaceChildren(h('option', {}, 'Couldn’t load counties'));
      showError(`Couldn’t load ${stateByFips(fips)?.name ?? 'state'} from the Census Bureau: ${err.message}`);
    }
  }

  async function pickCounty(fips, { fit } = {}) {
    pickCtl?.abort(); pickCtl = new AbortController(); const { signal } = pickCtl;
    ui.countyFips = fips || ''; ui.muniId = '';
    countySel.value = ui.countyFips;
    ctx.persist();
    muniList = [];
    options(muniSel, [], 'All cities & towns');
    if (!fips) return pickState(ui.stateFips, { fit });
    muniSel.replaceChildren(h('option', {}, 'Loading cities & towns…'));
    try {
      const shape = await src.countyShape(ui.stateFips, fips, signal);
      setArea(shape, `${countyList.find((c) => c.fips === fips)?.name ?? 'County'}, ${stateByFips(ui.stateFips).abbr}`, fit);
      muniList = await src.municipalities(ui.stateFips, fips, shape, signal);
      options(muniSel, muniList, `All cities & towns (${muniList.length})`, ui.muniId);
    } catch (err) {
      if (signal.aborted) return;
      muniSel.replaceChildren(h('option', {}, 'Couldn’t load cities & towns'));
      showError(`Couldn’t load the county from the Census Bureau: ${err.message}`);
    }
  }

  async function pickMuni(id, { fit } = {}) {
    pickCtl?.abort(); pickCtl = new AbortController(); const { signal } = pickCtl;
    ui.muniId = id || '';
    muniSel.value = ui.muniId;
    ctx.persist();
    if (!id) return pickCounty(ui.countyFips, { fit });
    const m = muniList.find((x) => x.id === id);
    if (!m) return;
    try {
      setArea(await src.municipalityShape(m, signal), `${m.name}, ${stateByFips(ui.stateFips).abbr}`, fit);
    } catch (err) {
      if (!signal.aborted) showError(`Couldn’t load ${m.name}: ${err.message}`);
    }
  }

  function setArea(rings, label, fit) {
    area = { rings: rings ?? [], label };
    drawArea();
    const b = boundsOf(area.rings);
    if (fit && b && map) map.flyToBounds([[b.s, b.w], [b.n, b.e]], { padding: [20, 20], duration: 0.8 });
    draw();
  }

  // Restore the saved selection without moving the map.
  async function restore() {
    const { countyFips, muniId } = ui;
    if (!ui.stateFips) return;
    await pickState(ui.stateFips);
    if (countyFips && countyList.some((c) => c.fips === countyFips)) {
      await pickCounty(countyFips);
      if (muniId && muniList.some((m) => m.id === muniId)) await pickMuni(muniId);
    }
  }

  // ---- Loading data for the view ------------------------------------------

  let reloadTimer = 0;
  function reload() { clearTimeout(reloadTimer); reloadTimer = setTimeout(loadView, 500); }

  async function loadView() {
    if (!map) return;
    loadCtl?.abort(); loadCtl = new AbortController(); const { signal } = loadCtl;
    const z = map.getZoom();
    const bb = map.getBounds();
    const box = { s: bb.getSouth(), w: bb.getWest(), n: bb.getNorth(), e: bb.getEast() };
    const kinds = Object.keys(src.BUILDING_KINDS).filter((k) => ui.layers[k]);

    const job = (key, enabled, min, run, apply) => {
      if (!enabled) { status[key] = ''; apply(null); return null; }
      if (z < min) { status[key] = 'zoom'; apply(null); return null; }
      status[key] = 'loading';
      return run().then((r) => { if (!signal.aborted) { status[key] = ''; apply(r); draw(); } })
        .catch((err) => { if (!signal.aborted) { status[key] = `error:${err.message}`; draw(); } });
    };

    job('land', ui.layers.land, MIN_ZOOM.land,
      () => src.publicLand(box, { minAcres: ui.minAcres, maxAcres: ui.maxAcres, zoom: z }, signal),
      (r) => { data.land = r?.features ?? []; data.landMore = r?.more; });
    job('buildings', kinds.length, MIN_ZOOM.buildings,
      () => src.publicBuildings(box, kinds, signal),
      (r) => { data.buildings = r ?? []; });
    job('parcels', ui.layers.parcels, MIN_ZOOM.parcels, async () => {
      const c = map.getCenter();
      const at = await src.countyAt({ lat: c.lat, lng: c.lng }, signal);
      const st = at && stateByFips(at.stateFips);
      if (!st) { parcelInfo = null; return null; }
      const county = { abbr: st.abbr, fips: at.fips, name: at.name, stateName: st.name, box: boundsOf(at.rings) };
      parcelInfo = { county, status: 'searching' }; draw();
      const r = await parcelService(county, signal);
      parcelInfo = { county, ...r };
      return r.service ? governmentParcels(r.service, box, { zoom: z, countyName: county.name }, signal) : null;
    }, (r) => { data.parcels = r?.features ?? []; data.parcelsMore = r?.more; });
    job('power', ui.layers.power, MIN_ZOOM.power,
      () => src.powerGrid(box, signal),
      (r) => { data.power = r; });
    draw();
  }

  // ---- Drawing -----------------------------------------------------------

  function sizeOk(f) {
    if (f.acres == null) return !(ui.minAcres > 0); // unknown size only shows with no minimum
    return (!(ui.minAcres > 0) || f.acres >= ui.minAcres) && (!(ui.maxAcres > 0) || f.acres <= ui.maxAcres);
  }
  const inArea = (f) => !ui.insideOnly || !area.rings.length || !f.center || pointInRings(f.center.lat, f.center.lng, area.rings);

  function visible() {
    return [...data.parcels, ...data.land, ...data.buildings].filter(sizeOk);
  }

  function drawArea() {
    if (!map) return;
    groups.area.clearLayers();
    if (area.rings.length) L.polygon(area.rings, { color: '#6366f1', weight: 2, fill: false, dashArray: '6 4', interactive: false }).addTo(groups.area);
  }

  function styleFor(f) {
    const color = f.category === 'parcel' ? PARCEL_COLOR : f.category === 'land' ? LAND_COLOR : src.BUILDING_KINDS[f.buildingKind]?.color ?? '#64748b';
    const on = selected?.id === f.id;
    return { color, weight: on ? 3 : 1.5, fillColor: color, fillOpacity: on ? 0.45 : 0.25, radius: on ? 9 : 6 };
  }

  function draw() {
    renderSide();
    if (!map) return;
    groups.features.clearLayers();
    for (const f of visible()) {
      const style = styleFor(f);
      const layer = f.rings.length
        ? L.polygon(f.rings, style)
        : L.circleMarker([f.center.lat, f.center.lng], { ...style, fillOpacity: 0.85 });
      layer.bindTooltip(`${f.name}${f.acres ? ` · ${formatAcres(f.acres)}` : ''}`, { sticky: true });
      layer.on('click', (e) => { L.DomEvent.stopPropagation(e); select(f); });
      layer.addTo(groups.features);
    }
    groups.pick.clearLayers();
    if (selected?.unmatched && selected.rings.length) {
      L.polygon(selected.rings, { color: '#64748b', weight: 3, fillOpacity: 0.15, dashArray: '5 4' }).addTo(groups.pick);
    }
    groups.saved.clearLayers();
    for (const site of sites.all()) {
      if (site.lat == null) continue;
      L.marker([site.lat, site.lng], {
        icon: L.divIcon({ className: 'land-star-wrap', html: `<span class="land-star" style="--c:${STAGES[site.stage]?.color ?? '#64748b'}">★</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
        title: `${site.name} (saved · ${STAGES[site.stage]?.label ?? site.stage})`,
        zIndexOffset: 1000,
      }).on('click', () => ctx.go('pipeline', { siteId: site.id })).addTo(groups.saved);
    }
    groups.power.clearLayers();
    if (data.power && ui.layers.power && status.power !== 'zoom') {
      for (const line of data.power.lines) {
        L.polyline(line.pts, { color: POWER_COLOR, weight: 2, opacity: 0.8 })
          .bindTooltip(['Power line', src.formatVoltage(line.voltage), line.operator].filter(Boolean).join(' · '), { sticky: true }).addTo(groups.power);
      }
      for (const sub of data.power.substations) {
        const b = boundsOf([sub.pts]);
        L.circleMarker([(b.s + b.n) / 2, (b.w + b.e) / 2], { radius: 5, color: POWER_COLOR, fillColor: '#fff', fillOpacity: 1, weight: 2 })
          .bindTooltip(['Substation', sub.name, src.formatVoltage(sub.voltage)].filter(Boolean).join(' · ')).addTo(groups.power);
      }
    }
  }

  function showError(message) {
    if (message && /no owner-name field|No layers/.test(message)) message += '. Pick the parcels layer itself (its link ends in a number).';
    status.error = message;
    renderSide();
  }

  function parcelNote() {
    const { county, status: st, service, candidates } = parcelInfo;
    const where = `${county.name}, ${county.abbr}`;
    if (st === 'searching') return h('p', { class: 'land-note planned' }, `Looking for ${where}’s free parcel service…`);
    if (st === 'not-covered') {
      return h('p', { class: 'land-note todo' }, h('strong', {}, `⚠ Parcel data not connected for ${where} — ask Claude to add it. `),
        'You’re seeing local-government parks/open space and public buildings only.');
    }
    if (st === 'none') {
      return h('div', { class: 'land-note todo' }, h('strong', {}, `⚠ No free parcel service with owner names found for ${where} — ask Claude to add one. `),
        'Some counties only sell parcel data or keep it on their own website.', pasteLink(county));
    }
    const others = (candidates ?? []).filter((c) => c.url !== service.url);
    return h('div', { class: 'land-note ok' },
      h('div', {}, h('strong', {}, `Parcels for ${where}: `), service.title,
        service.pinned ? ' (connected by Claude)' : ' (found automatically)'),
      service.pinned ? null : h('details', { class: 'land-switch' }, h('summary', {}, 'Wrong source? Change it'),
        h('ul', {}, ...others.map((c) => h('li', {}, h('button', { type: 'button', class: 'link-btn', onclick: () => switchService(county, c.url) }, c.title))),
          h('li', {}, h('button', { type: 'button', class: 'link-btn', onclick: () => switchService(county, null) }, 'Search again'))), pasteLink(county)),
      h('div', { class: 'small muted' }, 'Tip: click any parcel on the map to see who owns it, even if it isn’t highlighted.'));
  }

  // Connect a county by hand: paste its ArcGIS parcel service or layer link.
  function pasteLink(county) {
    const input = h('input', { class: 'input', type: 'url', placeholder: 'https://…/arcgis/rest/services/…/MapServer/0' });
    return h('details', { class: 'land-switch' }, h('summary', {}, 'Have the county’s parcel GIS link? Paste it'),
      h('form', { class: 'land-paste', onsubmit: (e) => { e.preventDefault(); if (input.value.trim()) switchService(county, input.value.trim()); } },
        input, h('button', { class: 'btn small', type: 'submit' }, 'Use it')));
  }

  async function switchService(county, url) {
    try { await chooseParcelService(county, url); } catch (err) { showError(`Couldn’t use that source: ${err.message}`); return; }
    data.parcels = []; loadView();
  }

  function coverageNote() {
    if (parcelInfo && ui.layers.parcels && map?.getZoom() >= MIN_ZOOM.parcels) return parcelNote();
    const st = stateByFips(ui.stateFips);
    if (!st) return h('p', { class: 'land-note' }, 'Pick a state to see what’s connected there. Coverage tab lists every source.');
    const county = countyList.find((c) => c.fips === ui.countyFips);
    const where = county ? `${county.name}, ${st.abbr}` : st.name;
    const s = parcelStatus(st.abbr, ui.countyFips);
    if (s === 'connected') return h('p', { class: 'land-note ok' }, `✓ Parcel data connected for ${where}.`);
    if (s === 'auto') {
      return h('p', { class: 'land-note planned' }, h('strong', {}, 'Zoom in to street level to load government-owned parcels. '),
        `${where} is in your ${regionOf(st.abbr)} focus area: Land Search finds each county’s free parcel service automatically.`);
    }
    return h('p', { class: 'land-note todo' }, h('strong', {}, `⚠ Parcel data not connected for ${where} — ask Claude to add it. `),
      'You’re seeing local-government parks/open space and public buildings only.');
  }

  function layerStatus(key, label) {
    const s = status[key];
    if (!s) return null;
    if (s === 'zoom') return h('li', { class: 'muted' }, `Zoom in closer to load ${label}.`);
    if (s === 'loading') return h('li', { class: 'muted' }, `Loading ${label}…`);
    return h('li', { class: 'land-err' }, `Couldn’t load ${label}: ${s.slice(6)}`);
  }

  function renderSide() {
    if (selected) { results.replaceChildren(detail(selected)); return; }
    const list = visible().filter(inArea).sort((a, b) => (b.acres ?? -1) - (a.acres ?? -1));
    const shown = list.slice(0, 200);
    const statusLines = [
      layerStatus('parcels', 'government-owned parcels'),
      layerStatus('land', 'public land'),
      layerStatus('buildings', 'public buildings'),
      layerStatus('power', 'power lines'),
      status.error ? h('li', { class: 'land-err' }, status.error) : null,
      data.parcelsMore && ui.layers.parcels && status.parcels === '' ? h('li', { class: 'muted' }, 'More parcels here than one load returns: zoom in to see them all.') : null,
      data.landMore && ui.layers.land && status.land === '' ? h('li', { class: 'muted' }, 'More public land here than one load returns: zoom in to see it all.') : null,
    ].filter(Boolean);
    results.replaceChildren(...[
      coverageNote(),
      statusLines.length ? h('ul', { class: 'land-status' }, ...statusLines) : null,
      h('h3', { class: 'land-results-head' }, `${list.length} site${list.length === 1 ? '' : 's'}${area.label && ui.insideOnly ? ` in ${area.label}` : ' in view'}`),
      list.length ? h('ol', { class: 'land-list' }, ...shown.map((f) => h('li', {},
        h('button', { type: 'button', onclick: () => select(f, { fly: true }) },
          h('span', { class: 'land-swatch', style: `--c:${styleFor(f).color}` }),
          h('span', { class: 'land-list-main' }, h('strong', {}, f.name), h('span', { class: 'muted small' }, [f.kind, f.owner].filter(Boolean).join(' · '))),
          f.acres ? h('span', { class: 'land-acres' }, formatAcres(f.acres)) : null))))
        : h('p', { class: 'muted small' }, map && map.getZoom() < MIN_ZOOM.land ? 'Pick a county or zoom in to start loading sites.' : 'Nothing matches here. Try another area or loosen the size filter.'),
      list.length > shown.length ? h('p', { class: 'muted small' }, `Showing the largest ${shown.length}.`) : null,
    ].filter(Boolean));
  }

  // ---- A selected site ---------------------------------------------------

  function select(f, { fly = false } = {}) {
    selected = f; selectedPower = null; selectedGov = null;
    draw();
    side.scrollTo({ top: results.offsetTop - side.offsetTop, behavior: 'smooth' });
    if (fly && map && f.center) {
      const b = boundsOf(f.rings);
      if (b) map.flyToBounds([[b.s, b.w], [b.n, b.e]], { padding: [40, 40], maxZoom: 17, duration: 0.6 });
      else map.flyTo([f.center.lat, f.center.lng], 17, { duration: 0.6 });
    }
    powerCtl?.abort(); powerCtl = new AbortController(); const { signal } = powerCtl;
    if (f.center) {
      selectedPower = 'loading';
      src.nearestPower(f.center, signal)
        .then((r) => { if (selected === f) { selectedPower = r; renderSide(); } })
        .catch((err) => { if (!signal.aborted && selected === f) { selectedPower = { error: err.message }; renderSide(); } });
    }
    govCtl?.abort(); govCtl = new AbortController();
    if (f.center) loadGovernments(f, govCtl.signal);
  }

  // The county and city/town at a site, with contacts and leadership from Wikidata.
  async function loadGovernments(f, signal) {
    selectedGov = 'loading';
    const done = () => { if (selected === f) renderSide(); };
    try {
      const [county, muni] = await Promise.all([src.countyAt(f.center, signal), src.municipalityAt(f.center, signal)]);
      const st = county && stateByFips(county.stateFips);
      const govs = [];
      if (muni) govs.push({ label: muni.name, kind: 'City / town', lookup: () => municipalityContacts(muni, signal) });
      if (county) govs.push({ label: `${county.name}${st ? `, ${st.abbr}` : ''}`, kind: 'County', lookup: () => countyContacts(county.stateFips, county.fips, signal) });
      selectedGov = govs.map((g) => ({ ...g, info: 'loading' }));
      done();
      await Promise.all(selectedGov.map(async (g) => {
        try { g.info = await g.lookup(); } catch (err) { if (signal.aborted) return; g.info = { error: err.message }; }
        done();
      }));
    } catch (err) {
      if (!signal.aborted) { selectedGov = { error: err.message }; done(); }
    }
  }

  function governments() {
    if (!selectedGov) return null;
    if (selectedGov === 'loading') return h('p', { class: 'muted small' }, 'Finding the city/town and county here…');
    if (selectedGov.error) return h('p', { class: 'land-err small' }, `Couldn’t look up the local government: ${selectedGov.error}`);
    if (!selectedGov.length) return h('p', { class: 'muted small' }, 'No local government found at this spot.');
    const link = (href, label) => h('a', { class: 'land-link', href, target: '_blank', rel: 'noopener' }, label);
    return h('div', { class: 'land-govs' }, ...selectedGov.map((g) => {
      const i = g.info && g.info !== 'loading' && !g.info.error ? g.info : null;
      const council = g.kind === 'County' ? 'board of supervisors commissioners' : 'mayor city council members';
      return h('div', { class: 'land-gov' },
        h('strong', {}, g.label), h('span', { class: 'muted small' }, ` · ${g.kind}`),
        g.info === 'loading' ? h('div', { class: 'muted small' }, 'Looking up on Wikidata…') : null,
        g.info?.error ? h('div', { class: 'land-err small' }, `Wikidata: ${g.info.error}`) : null,
        i?.leaders?.length ? h('div', { class: 'small' }, `${i.office ?? 'Head of government'}: `, i.leaders.map((l) => `${l.name}${l.since ? ` (since ${l.since})` : ''}`).join(', ')) : null,
        i?.phone ? h('div', { class: 'small' }, `Phone: ${i.phone}`) : null,
        g.info !== 'loading' && !i?.leaders?.length ? h('div', { class: 'muted small' }, 'Current leadership not on Wikidata; use the links below.') : null,
        h('div', { class: 'land-links' },
          i?.website ? link(i.website, 'Official website') : link(searchUrl(`${g.label} official government website`), 'Find official website'),
          link(searchUrl(`${g.label} ${council}`), g.kind === 'County' ? 'Commissioners / supervisors' : 'Mayor & council'),
          i?.wikidata ? link(i.wikidata, 'Wikidata') : null));
    }));
  }

  // Save to the pipeline, with the local government's leaders as starting contacts.
  function saveButton(f) {
    const saved = savedFor(f.id);
    if (saved) {
      return h('button', { type: 'button', class: 'btn small land-saved', onclick: () => ctx.go('pipeline', { siteId: saved.id }) },
        `★ Saved · ${STAGES[saved.stage]?.label ?? saved.stage} — open in Pipeline`);
    }
    return h('button', { type: 'button', class: 'btn primary small', onclick: () => {
      const govs = Array.isArray(selectedGov) ? selectedGov : [];
      const infos = govs.map((g) => ({ g, i: g.info && g.info !== 'loading' && !g.info.error ? g.info : null }));
      const contacts = infos.flatMap(({ g, i }) => (i?.leaders ?? []).map((l) => ({ name: l.name, title: `${i.office ?? 'Head of government'} (${g.label})`, email: '', phone: '' })));
      saveSite(f, {
        contacts,
        website: f.website || infos.find(({ i }) => i?.website)?.i.website || '',
        phone: f.phone || infos.find(({ i }) => i?.phone)?.i.phone || '',
      });
    } }, '☆ Save as site');
  }

  function closeDetail() { selected = null; powerCtl?.abort(); govCtl?.abort(); draw(); }

  function detail(f) {
    const row = (label, value) => (value ? h('div', { class: 'land-row' }, h('dt', {}, label), h('dd', {}, value)) : null);
    const link = (href, label) => h('a', { class: 'land-link', href, target: '_blank', rel: 'noopener' }, label);
    const { lat, lng } = f.center ?? {};
    const search = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    const place = [area.label].filter(Boolean).join('');
    const owner = f.owner || '';

    let power;
    if (selectedPower === 'loading') power = h('p', { class: 'muted small' }, 'Finding the nearest power line and substation…');
    else if (selectedPower?.error) power = h('p', { class: 'land-err small' }, `Couldn’t check power: ${selectedPower.error}`);
    else if (selectedPower) {
      const { line, substation } = selectedPower;
      power = h('dl', { class: 'land-dl' },
        row('Nearest power line', line.x ? `${formatDistance(line.d)}${line.x.voltage ? ` · ${src.formatVoltage(line.x.voltage)}` : ''}` : 'None mapped within 15 mi'),
        row('Nearest substation', substation.x ? `${formatDistance(substation.d)}${substation.x.name ? ` · ${substation.x.name}` : ''}` : 'None mapped within 15 mi'));
    }

    return h('div', { class: 'land-detail' },
      h('button', { type: 'button', class: 'link-btn', onclick: closeDetail }, '← Back to results'),
      h('h3', {}, f.name),
      h('p', { class: 'muted small' }, `${f.kind} · from ${f.source}`),
      saveButton(f),
      h('dl', { class: 'land-dl' },
        row('Owner', owner || 'Not recorded in this source'),
        row('Owner type', f.ownerType),
        row('Parcel ID', f.parcelId),
        row('Land use', f.landUse),
        row('Managed by', f.manager && f.manager !== owner ? f.manager : null),
        row('Size', f.acres ? formatAcres(f.acres) : 'Unknown'),
        row('Public access', f.access),
        row('Address', f.address),
        row('Phone', f.phone),
        row('Location', f.center ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : null)),
      f.category === 'parcel' && f.unmatched ? h('p', { class: 'land-note small' }, 'This owner name doesn’t read like a local government, so it isn’t highlighted. If you know it’s publicly owned, save it anyway and tell Claude the owner name so it gets recognised.') : null,
      f.category === 'parcel' && !f.unmatched ? h('p', { class: 'land-note small' }, 'Picked out because the owner’s name reads like a local government. Confirm with the county assessor before reaching out.') : null,
      f.source === 'OpenStreetMap' ? h('p', { class: 'land-note small' }, 'Ownership from OpenStreetMap isn’t confirmed. Check the county assessor’s records before reaching out.') : null,
      h('h4', {}, 'Power & fiber'),
      power,
      h('div', { class: 'land-links' },
        f.center ? link(src.fccBroadbandUrl(f.center), 'Broadband / fiber at this spot (FCC map)') : null),
      h('h4', {}, 'Government here'),
      governments(),
      h('h4', {}, 'Reach out'),
      h('div', { class: 'land-links' },
        f.website ? link(f.website, 'Website') : null,
        owner ? link(search(`${owner} official website`), `Find ${owner}’s website`) : null,
        owner ? link(search(`${owner} parks department contact`), 'Parks department') : null,
        owner ? link(search(`${owner} real estate property management department`), 'Real estate / property office') : null,
        owner ? link(search(`${owner} public works department contact`), 'Public works') : null,
        !owner && place ? link(search(`${place} government property contact`), `Search ${place} government`) : null),
      h('p', { class: 'muted small' }, '“Save as site” arrives in stage 4.'),
      h('h4', {}, 'Look at it'),
      h('div', { class: 'land-links' },
        f.center ? link(`https://www.google.com/maps/@?api=1&map_action=map&center=${lat},${lng}&zoom=18&basemap=satellite`, 'Google Maps satellite') : null,
        f.osm ? link(f.osm, 'OpenStreetMap record') : null,
        f.sourceUrl ? link(f.sourceUrl, 'Parcel data source') : null));
  }

  // ---- Map ----------------------------------------------------------------

  function setBasemap() {
    if (!map) return;
    tiles?.remove();
    const b = BASEMAPS[ui.basemap] ?? BASEMAPS.map;
    tiles = L.tileLayer(b.url, { maxZoom: b.max, attribution: b.attribution }).addTo(map);
    tiles.bringToBack();
  }

  renderSide();
  let resize = null;
  loadLeaflet().then((mod) => {
    if (destroyed) return;
    L = mod;
    const v = ui.view ?? { lat: 39.5, lng: -98.5, zoom: 4 };
    map = L.map(mapEl, { zoomControl: true }).setView([v.lat, v.lng], v.zoom);
    setBasemap();
    groups = { area: L.layerGroup().addTo(map), features: L.featureGroup().addTo(map), power: L.layerGroup().addTo(map), saved: L.layerGroup().addTo(map), pick: L.layerGroup().addTo(map) };
    resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(mapEl);
    // Click any parcel to see who owns it, government or not.
    let inspectCtl = null;
    map.on('click', (e) => {
      if (!ui.layers.parcels || map.getZoom() < MIN_ZOOM.parcels || !parcelInfo?.service) return;
      inspectCtl?.abort(); inspectCtl = new AbortController();
      parcelAt(parcelInfo.service, { lat: e.latlng.lat, lng: e.latlng.lng }, { countyName: parcelInfo.county.name }, inspectCtl.signal)
        .then((f) => { if (f) select(f); })
        .catch((err) => { if (!inspectCtl.signal.aborted) showError(`Couldn’t look up that parcel: ${err.message}`); });
    });
    map.on('moveend', () => {
      const c = map.getCenter();
      ui.view = { lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), zoom: map.getZoom() };
      ctx.persist();
      reload();
    });
    drawArea();
    loadView();
  }).catch(() => {
    mapEl.replaceChildren(h('p', { class: 'land-offline' }, 'The map needs an internet connection.'));
  });
  restore();
  const offSites = sites.subscribe(() => draw());

  return {
    el,
    destroy() {
      destroyed = true; clearTimeout(reloadTimer); offSites();
      [loadCtl, pickCtl, powerCtl, govCtl].forEach((c) => c?.abort());
      resize?.disconnect(); map?.remove();
    },
  };
}
