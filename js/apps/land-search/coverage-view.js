// The Coverage tab: the note of what Claude has wired up, and what's still to come.
import { h } from '../../ui.js';
import { COVERAGE, FOCUS_REGIONS, STATES, PARCEL_SERVICES, parcelStatus } from './config.js';
import { foundServices } from './parcels.js';
import { CHECKS, runChecks } from './diagnostics.js';

export function coverageView() {
  const byAbbr = Object.fromEntries(STATES.map((s) => [s.abbr, s]));
  const stateChip = (abbr) => {
    const s = parcelStatus(abbr);
    const counties = Object.keys(PARCEL_SERVICES[abbr]?.counties ?? {}).length;
    return h('li', { class: `land-chip ${s}` }, byAbbr[abbr].name,
      h('span', { class: 'small' }, s === 'connected' ? ' ✓ statewide' : counties ? ` · ${counties} counties pinned` : ' · found automatically'));
  };
  return h('div', { class: 'land-page' },
    checksCard(),
    h('section', { class: 'land-card' },
      h('h2', {}, 'What’s connected'),
      h('p', { class: 'muted' }, `Filled in by Claude · last updated ${COVERAGE.updated}. Everything below is live: it is fetched from the source each time you look, nothing is copied.`),
      h('ul', { class: 'land-sources' }, ...COVERAGE.nationwide.map((x) => h('li', {},
        h('strong', {}, x.name), h('span', { class: 'land-tag ok' }, 'Nationwide'),
        h('div', { class: 'small muted' }, x.source), h('div', { class: 'small' }, x.note))))),
    h('section', { class: 'land-card' },
      h('h2', {}, 'Parcel data (every lot with owner names)'),
      h('p', { class: 'muted' }, 'Free parcel data comes from each state or county separately. You picked these regions to go first:'),
      ...Object.entries(FOCUS_REGIONS).map(([region, states]) => h('div', { class: 'land-region' },
        h('h3', {}, region), h('ul', { class: 'land-chips' }, ...states.map(stateChip)))),
      h('p', { class: 'small' }, COVERAGE.parcels),
      foundList(),
      h('p', { class: 'land-note todo' }, h('strong', {}, 'Everywhere else: not connected — ask Claude to add it. '),
        'The map labels those areas too, and still shows local-government parks/open space and public buildings there.')),
    h('section', { class: 'land-card' },
      h('h2', {}, 'Your saved sites'),
      h('p', { class: 'muted' }, COVERAGE.saved)),
    COVERAGE.pending.length ? h('section', { class: 'land-card' },
      h('h2', {}, 'Coming next'),
      h('ul', { class: 'land-sources' }, ...COVERAGE.pending.map((x) => h('li', {},
        h('strong', {}, x.name), h('span', { class: 'land-tag planned' }, x.when), h('div', { class: 'small muted' }, x.where))))) : null);
}

// Parcel services found so far on this device, county by county.
function foundList() {
  const found = foundServices().sort((a, b) => a.county.localeCompare(b.county));
  if (!found.length) return h('p', { class: 'muted small' }, 'No counties looked at yet on this device. Zoom in on one in the Map tab.');
  return h('details', { class: 'land-found' },
    h('summary', {}, `Parcel sources found on this device (${found.length})`),
    h('ul', {}, ...found.map((f) => h('li', { class: 'small' },
      h('strong', {}, f.county), ' — ',
      h('a', { class: 'land-a', href: f.url, target: '_blank', rel: 'noopener' }, f.title),
      f.chosen ? ' (picked by you)' : ''))));
}

// Test every data source from this browser.
function checksCard() {
  const list = h('ul', { class: 'land-checks' });
  const button = h('button', { type: 'button', class: 'btn primary small', onclick: async () => {
    button.disabled = true; button.textContent = 'Checking…';
    const rows = CHECKS.map((c) => h('li', {}, h('span', { class: 'land-check-mark' }, '…'), h('strong', {}, c.name), h('span', { class: 'muted small' }, ' checking')));
    list.replaceChildren(...rows);
    await runChecks((i, r) => {
      rows[i].replaceChildren(h('span', { class: `land-check-mark ${r.ok ? 'ok' : 'bad'}` }, r.ok ? '✓' : '✗'), h('strong', {}, CHECKS[i].name),
        h('span', { class: `small ${r.ok ? 'muted' : 'land-err'}` }, ` ${r.detail} · ${r.ms} ms`));
    });
    button.disabled = false; button.textContent = 'Check again';
  } }, 'Check connections');
  return h('section', { class: 'land-card' },
    h('h2', {}, 'Connection check'),
    h('p', { class: 'muted small' }, 'Something not loading? This tests each live data source from your browser. Send Claude a screenshot of the results.'),
    h('div', {}, button), list);
}
