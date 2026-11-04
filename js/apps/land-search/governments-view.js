// The Governments tab: every state, county, city/town/township/borough/village
// and tribal nation, picked from drop-downs (live from the Census Bureau). Each
// level gets a card where you record its map-data link, website, contacts and
// parcels of interest, mark whether it's of interest, and track it in the pipeline.
import { h } from '../../ui.js';
import { STATES, stateByFips } from './config.js';
import * as src from './sources.js';
import { tribes } from './institutions.js';
import { boundsOf } from './geo.js';
import { sites, savedFor, INTEREST, CATEGORY } from './data.js';
import { recordEditor, interestBadge } from './record-editor.js';
import { stateContacts, countyContacts, municipalityContacts, searchUrl } from './contacts.js';

const MARK = { yes: '★ ', maybe: '? ', no: '✕ ' };

export function governmentsView(ctx) {
  const ui = (ctx.state.gov ??= {});
  const el = h('div', { class: 'land-page land-gov-page' });
  let counties = []; let munis = []; let tribeList = []; let countyRings = [];
  let status = '';
  const suggestions = new Map(); // record key -> Wikidata info
  let ctl = null;

  // Record keys / bases for each level.
  const st = () => stateByFips(ui.stateFips);
  const stateBase = () => ({ key: `gov:state:${st().abbr}`, category: 'state', name: st().name, kind: 'State', stateAbbr: st().abbr });
  const countyBase = (c) => ({ key: `gov:county:${ui.stateFips}${c.fips}`, category: 'county', name: `${c.name}, ${st().abbr}`, kind: 'County', stateAbbr: st().abbr });
  const muniBase = (m) => ({ key: `gov:muni:${m.geoid}`, category: 'municipality', name: `${m.name}, ${st().abbr}`, kind: m.kind === 'place' ? 'Incorporated place' : 'Town / township', stateAbbr: st().abbr, lat: m.lat, lng: m.lng });
  const tribeBase = (t) => ({ key: `gov:tribe:${t.geoid}`, category: 'tribe', name: t.name, kind: t.kind, stateAbbr: st().abbr, acres: t.acres, lat: t.center?.lat, lng: t.center?.lng });
  const mark = (key) => MARK[savedFor(key)?.interest] ?? '';

  // ---- Drop-downs -------------------------------------------------------------

  const stateSel = h('select', { class: 'input', 'aria-label': 'State', onchange: () => pickState(stateSel.value) });
  const countySel = h('select', { class: 'input', 'aria-label': 'County', onchange: () => pickCounty(countySel.value) });
  const muniSel = h('select', { class: 'input', 'aria-label': 'City, town or township', onchange: () => { ui.muniId = muniSel.value; ctx.persist(); render(); } });
  const tribeSel = h('select', { class: 'input', 'aria-label': 'Tribal nation', onchange: () => { ui.tribeId = tribeSel.value; ctx.persist(); render(); } });

  function fillSelects() {
    stateSel.replaceChildren(h('option', { value: '' }, 'Pick a state…'),
      ...STATES.map((s) => h('option', { value: s.fips, selected: s.fips === ui.stateFips }, `${mark(`gov:state:${s.abbr}`)}${s.name}`)));
    countySel.replaceChildren(h('option', { value: '' }, counties.length ? `Counties (${counties.length})…` : ui.stateFips ? 'Loading counties…' : 'County'),
      ...counties.map((c) => h('option', { value: c.fips, selected: c.fips === ui.countyFips }, `${mark(countyBase(c).key)}${c.name}`)));
    muniSel.replaceChildren(h('option', { value: '' }, munis.length ? `Cities, towns & townships (${munis.length})…` : ui.countyFips ? 'Loading…' : 'City / town / township'),
      ...munis.map((m) => h('option', { value: m.id, selected: m.id === ui.muniId }, `${mark(muniBase(m).key)}${m.name}`)));
    tribeSel.replaceChildren(h('option', { value: '' }, tribeList.length ? `Tribal nations (${tribeList.length})…` : 'Tribal nations'),
      ...tribeList.map((t) => h('option', { value: t.geoid, selected: t.geoid === ui.tribeId }, `${mark(tribeBase(t).key)}${t.name}`)));
    countySel.disabled = !counties.length; muniSel.disabled = !munis.length; tribeSel.disabled = !tribeList.length;
  }

  async function pickState(fips, keep = false) {
    ctl?.abort(); ctl = new AbortController(); const { signal } = ctl;
    ui.stateFips = fips;
    if (!keep) { ui.countyFips = ''; ui.muniId = ''; ui.tribeId = ''; }
    ctx.persist();
    counties = []; munis = []; tribeList = []; countyRings = []; status = '';
    render();
    if (!fips) return;
    try {
      counties = await src.counties(fips, signal);
      render();
      const shape = await src.stateShape(fips, signal);
      tribes(st(), boundsOf(shape), signal).then((r) => { if (ui.stateFips === fips) { tribeList = r.items.sort((a, b) => a.name.localeCompare(b.name)); render(); } }).catch(() => {});
      if (keep && ui.countyFips) await pickCounty(ui.countyFips, true);
    } catch (err) {
      if (!signal.aborted) { status = `Couldn’t load ${st().name} from the Census Bureau: ${err.message}`; render(); }
    }
  }

  async function pickCounty(fips, keep = false) {
    const { signal } = ctl;
    ui.countyFips = fips;
    if (!keep) ui.muniId = '';
    ctx.persist();
    munis = []; render();
    if (!fips) return;
    try {
      countyRings = await src.countyShape(ui.stateFips, fips, signal);
      munis = await src.municipalities(ui.stateFips, fips, countyRings, signal);
      render();
    } catch (err) {
      if (!signal.aborted) { status = `Couldn’t load the county’s cities and towns: ${err.message}`; render(); }
    }
  }

  // ---- Cards ------------------------------------------------------------------

  function suggestFor(key, lookup) {
    if (!suggestions.has(key)) {
      const entry = { loading: true };
      suggestions.set(key, entry);
      lookup().then((info) => Object.assign(entry, { loading: false, website: info?.website ?? '', phone: info?.phone ?? '', office: info?.office ?? null, leaders: info?.leaders ?? [], wikidata: info?.wikidata }))
        .catch((err) => Object.assign(entry, { loading: false, error: err.message }))
        .finally(render);
    }
    return suggestions.get(key);
  }

  function card(base, lookup, extraLinks = []) {
    const r = savedFor(base.key);
    const suggest = lookup ? suggestFor(base.key, lookup) : null;
    return h('section', { class: 'land-card land-gov-card', style: `--c:${INTEREST[r?.interest ?? ''].color}` },
      h('div', { class: 'land-card-head' },
        h('div', {}, h('h2', {}, base.name), h('span', { class: 'muted small' }, CATEGORY[base.category] ?? base.kind)),
        interestBadge(r)),
      h('div', { class: 'land-links' },
        link(searchUrl(`${base.name} official website`), 'Find website'),
        link(searchUrl(`${base.name} GIS parcel map viewer`), 'Find GIS / parcel map'),
        link(searchUrl(`${base.name} property for sale surplus land`), 'Surplus property'),
        ...extraLinks,
        suggest?.wikidata ? link(suggest.wikidata, 'Wikidata') : null),
      recordEditor(base, { suggest }));
  }
  const link = (href, label) => h('a', { class: 'land-link', href, target: '_blank', rel: 'noopener' }, label);

  function tracked() {
    if (!st()) return null;
    const mine = sites.all().filter((s) => s.stateAbbr === st().abbr && ['state', 'county', 'municipality', 'tribe'].includes(s.category) && (s.interest || s.mapUrl || s.parcels?.length || s.notes));
    if (!mine.length) return null;
    const counts = Object.fromEntries(Object.keys(INTEREST).map((k) => [k, mine.filter((s) => (s.interest ?? '') === k).length]));
    return h('details', { class: 'land-card land-tracked' },
      h('summary', {}, `Reviewed in ${st().name}: `, ...Object.entries(INTEREST).filter(([k]) => counts[k]).map(([k, i]) => h('span', { class: 'land-interest-badge', style: `--c:${i.color}` }, `${counts[k]} ${i.label.toLowerCase()}`))),
      h('ul', { class: 'land-site-list' }, ...mine.sort((a, b) => a.name.localeCompare(b.name)).map((s) => h('li', { class: 'land-site-row' },
        h('button', { type: 'button', class: 'land-site-main', onclick: () => ctx.go('pipeline', { siteId: s.id }) },
          h('strong', {}, s.name), h('span', { class: 'muted small' }, [CATEGORY[s.category], s.parcels?.length ? `${s.parcels.length} parcel${s.parcels.length === 1 ? '' : 's'} of interest` : null].filter(Boolean).join(' · '))),
        interestBadge(s)))));
  }

  // ---- Render -------------------------------------------------------------------

  let pending = false;
  const editing = () => el.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
  el.addEventListener('focusout', () => setTimeout(() => { if (pending) render(); }, 0));

  function render() {
    if (editing()) { pending = true; return; }
    pending = false;
    fillSelects();
    const s = st();
    const county = counties.find((c) => c.fips === ui.countyFips);
    const muni = munis.find((m) => m.id === ui.muniId);
    const tribe = tribeList.find((t) => t.geoid === ui.tribeId);
    const scroll = el.scrollTop;
    el.replaceChildren(...[
      h('section', { class: 'land-card land-gov-picker' },
        h('div', { class: 'land-gov-selects' },
          h('label', { class: 'land-form-field' }, h('span', { class: 'land-label' }, 'State'), stateSel),
          h('label', { class: 'land-form-field' }, h('span', { class: 'land-label' }, 'County'), countySel),
          h('label', { class: 'land-form-field' }, h('span', { class: 'land-label' }, 'City / town / township'), muniSel),
          h('label', { class: 'land-form-field' }, h('span', { class: 'land-label' }, 'Tribal nation'), tribeSel)),
        h('p', { class: 'muted small' }, '★ interested · ? maybe · ✕ not interested. Pick a government to record its map-data link, website, contacts and parcels of interest. Cities, towns, townships, boroughs and villages come from the Census Bureau.'),
        status ? h('p', { class: 'land-err small' }, status) : null),
      tracked(),
      s ? card(stateBase(), () => stateContacts(s.abbr)) : null,
      s && county ? card(countyBase(county), () => countyContacts(ui.stateFips, county.fips)) : null,
      s && muni ? card(muniBase(muni), () => municipalityContacts({ geoid: muni.geoid, name: muni.name, stateFips: ui.stateFips })) : null,
      s && tribe ? card(tribeBase(tribe), null, [link('https://www.bia.gov/service/tribal-leaders-directory', 'BIA Tribal Leaders Directory')]) : null,
    ].filter(Boolean));
    el.scrollTop = scroll;
  }

  const off = sites.subscribe(render);
  render();
  if (ui.stateFips) pickState(ui.stateFips, true);
  return { el, destroy() { off(); ctl?.abort(); } };
}
