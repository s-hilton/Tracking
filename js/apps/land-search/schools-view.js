// The School districts tab: every school district in a state (filter by county),
// each with the same record as a government: map-data link, website, contacts,
// parcels of interest, interest and pipeline.
import { h } from '../../ui.js';
import { STATES, stateByFips } from './config.js';
import * as src from './sources.js';
import { pointInRings } from './geo.js';
import { sites, savedFor, INTEREST } from './data.js';
import { recordEditor, interestBadge } from './record-editor.js';
import { searchUrl } from './contacts.js';
import { schoolDistricts, districtKind } from './schools.js';

const MARK = { yes: '★ ', maybe: '? ', no: '✕ ' };

export function schoolsView(ctx) {
  const ui = (ctx.state.schools ??= {});
  ui.stateFips ??= ctx.state.gov?.stateFips ?? '';
  const el = h('div', { class: 'land-page land-gov-page' });
  let counties = []; let countyRings = []; let districts = []; let info = null;
  let status = ''; let loading = false;
  let ctl = null;

  const st = () => stateByFips(ui.stateFips);
  const baseOf = (d) => ({
    key: `gov:school:${d.leaid}`, category: 'school', name: d.name, kind: districtKind(d), stateAbbr: st()?.abbr ?? '',
    phone: d.phone ?? '', address: d.address ?? '', lat: d.lat, lng: d.lng,
    source: info?.sources ?? '', sourceUrl: `https://nces.ed.gov/ccd/districtsearch/district_detail.asp?ID2=${d.leaid}`,
  });
  const mark = (d) => MARK[savedFor(`gov:school:${d.leaid}`)?.interest] ?? '';
  const inCounty = (d) => !ui.countyFips || d.countyFips === ui.countyFips || (countyRings.length && Number.isFinite(d.lat) && pointInRings(d.lat, d.lng, countyRings));
  const shown = () => districts.filter(inCounty);

  const stateSel = h('select', { class: 'input', 'aria-label': 'State', onchange: () => pickState(stateSel.value) });
  const countySel = h('select', { class: 'input', 'aria-label': 'County', onchange: () => pickCounty(countySel.value) });
  const districtSel = h('select', { class: 'input', 'aria-label': 'School district', onchange: () => { ui.leaid = districtSel.value; ctx.persist(); render(); } });

  function fillSelects() {
    stateSel.replaceChildren(h('option', { value: '' }, 'Pick a state…'),
      ...STATES.map((s) => h('option', { value: s.fips, selected: s.fips === ui.stateFips }, s.name)));
    countySel.replaceChildren(h('option', { value: '' }, counties.length ? 'All counties' : 'County'),
      ...counties.map((c) => h('option', { value: c.fips, selected: c.fips === ui.countyFips }, c.name)));
    const list = shown();
    districtSel.replaceChildren(h('option', { value: '' }, loading ? 'Loading school districts…' : list.length ? `School districts (${list.length})…` : 'School district'),
      ...list.map((d) => h('option', { value: d.leaid, selected: d.leaid === ui.leaid }, `${mark(d)}${d.name}`)));
    countySel.disabled = !counties.length; districtSel.disabled = !list.length;
  }

  async function pickState(fips, keep = false) {
    ctl?.abort(); ctl = new AbortController(); const { signal } = ctl;
    ui.stateFips = fips;
    if (!keep) { ui.countyFips = ''; ui.leaid = ''; }
    ctx.persist();
    counties = []; countyRings = []; districts = []; info = null; status = '';
    loading = Boolean(fips);
    render();
    if (!fips) return;
    src.counties(fips, signal).then((c) => { counties = c; render(); if (keep && ui.countyFips) pickCounty(ui.countyFips, true); }).catch(() => {});
    try {
      info = await schoolDistricts(fips);
      if (signal.aborted) return;
      districts = info.items;
    } catch (err) {
      if (!signal.aborted) status = `Couldn’t load school districts: ${err.message}`;
    }
    loading = false;
    render();
  }

  async function pickCounty(fips, keep = false) {
    ui.countyFips = fips;
    if (!keep) ui.leaid = '';
    ctx.persist();
    countyRings = [];
    render();
    if (!fips) return;
    try { countyRings = await src.countyShape(ui.stateFips, fips, ctl.signal); render(); } catch { /* the directory's county still filters */ }
  }

  const link = (href, label) => h('a', { class: 'land-link', href, target: '_blank', rel: 'noopener' }, label);

  function card(d) {
    const base = baseOf(d);
    const r = savedFor(base.key);
    const row = (label, value) => (value ? h('div', { class: 'land-row' }, h('dt', {}, label), h('dd', {}, value)) : null);
    return h('section', { class: 'land-card land-gov-card', style: `--c:${INTEREST[r?.interest ?? ''].color}` },
      h('div', { class: 'land-card-head' },
        h('div', {}, h('h2', {}, d.name), h('span', { class: 'muted small' }, `School district · ${districtKind(d)}${d.grades ? ` · grades ${d.grades}` : ''}`)),
        interestBadge(r)),
      h('dl', { class: 'land-dl' },
        row('Enrollment', d.enrollment ? `${d.enrollment.toLocaleString()} students` : null),
        row('Schools', d.schools ? String(d.schools) : null),
        row('District area', d.acres ? `${Math.round(d.acres).toLocaleString()} acres` : null),
        row('Office', d.address),
        row('County', d.countyName)),
      h('div', { class: 'land-links' },
        link(searchUrl(`${d.name} ${st()?.name ?? ''} official website`), 'Find website'),
        link(searchUrl(`${d.name} superintendent`), 'Superintendent'),
        link(searchUrl(`${d.name} school board members`), 'School board'),
        link(searchUrl(`${d.name} facilities director operations`), 'Facilities / operations'),
        link(searchUrl(`${d.name} surplus property land for sale lease`), 'Surplus land'),
        link(base.sourceUrl, 'NCES district page'),
        Number.isFinite(d.lat) ? link(`https://www.google.com/maps/@?api=1&map_action=map&center=${d.lat},${d.lng}&zoom=12&basemap=satellite`, 'Google Maps satellite') : null),
      recordEditor(base));
  }

  function tracked() {
    if (!st()) return null;
    const mine = sites.all().filter((s) => s.stateAbbr === st().abbr && s.category === 'school' && (s.interest || s.mapUrl || s.parcels?.length || s.notes));
    if (!mine.length) return null;
    const counts = Object.fromEntries(Object.keys(INTEREST).map((k) => [k, mine.filter((s) => (s.interest ?? '') === k).length]));
    return h('details', { class: 'land-card land-tracked' },
      h('summary', {}, `School districts reviewed in ${st().name}: `, ...Object.entries(INTEREST).filter(([k]) => counts[k]).map(([k, i]) => h('span', { class: 'land-interest-badge', style: `--c:${i.color}` }, `${counts[k]} ${i.label.toLowerCase()}`))),
      h('ul', { class: 'land-site-list' }, ...mine.sort((a, b) => a.name.localeCompare(b.name)).map((s) => h('li', { class: 'land-site-row' },
        h('button', { type: 'button', class: 'land-site-main', onclick: () => { ui.leaid = s.sourceKey.split(':').pop(); ctx.persist(); render(); } },
          h('strong', {}, s.name), h('span', { class: 'muted small' }, s.parcels?.length ? `${s.parcels.length} parcel${s.parcels.length === 1 ? '' : 's'} of interest` : 'School district')),
        interestBadge(s)))));
  }

  let pending = false;
  const editing = () => el.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
  el.addEventListener('focusout', () => setTimeout(() => { if (pending) render(); }, 0));

  function render() {
    if (editing()) { pending = true; return; }
    pending = false;
    fillSelects();
    const d = districts.find((x) => x.leaid === ui.leaid);
    const scroll = el.scrollTop;
    el.replaceChildren(...[
      h('section', { class: 'land-card land-gov-picker' },
        h('div', { class: 'land-gov-selects' },
          h('label', { class: 'land-form-field' }, h('span', { class: 'land-label' }, 'State'), stateSel),
          h('label', { class: 'land-form-field' }, h('span', { class: 'land-label' }, 'County'), countySel),
          h('label', { class: 'land-form-field' }, h('span', { class: 'land-label' }, 'School district'), districtSel)),
        h('p', { class: 'muted small' }, '★ interested · ? maybe · ✕ not interested. Districts from the Census Bureau, with phone, office, enrollment and school counts from the NCES district directory. A district is listed under the county of its office and the county at its middle.'),
        info?.partial ? h('p', { class: 'muted small' }, info.partial) : null,
        status ? h('p', { class: 'land-err small' }, status, ' ', h('button', { type: 'button', class: 'link-btn', onclick: () => pickState(ui.stateFips, true) }, 'Try again')) : null),
      tracked(),
      d ? card(d) : null,
    ].filter(Boolean));
    el.scrollTop = scroll;
  }

  const off = sites.subscribe(render);
  render();
  if (ui.stateFips) pickState(ui.stateFips, true);
  return { el, destroy() { off(); ctl?.abort(); } };
}
