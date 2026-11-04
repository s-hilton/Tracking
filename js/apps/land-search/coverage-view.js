// The Coverage tab: the note of what Claude has wired up, and what's still to come.
import { h } from '../../ui.js';
import { COVERAGE, FOCUS_REGIONS, STATES, PARCEL_SERVICES, parcelStatus } from './config.js';

export function coverageView() {
  const byAbbr = Object.fromEntries(STATES.map((s) => [s.abbr, s]));
  const stateChip = (abbr) => {
    const s = parcelStatus(abbr);
    const counties = Object.keys(PARCEL_SERVICES[abbr]?.counties ?? {}).length;
    return h('li', { class: `land-chip ${s}` }, byAbbr[abbr].name,
      h('span', { class: 'small' }, s === 'connected' ? ' ✓ statewide' : counties ? ` · ${counties} counties` : ' · stage 2'));
  };
  return h('div', { class: 'land-page' },
    h('section', { class: 'land-card' },
      h('h2', {}, 'What’s connected'),
      h('p', { class: 'muted' }, `Filled in by Claude · last updated ${COVERAGE.updated}. Everything below is live: it is fetched from the source each time you look, nothing is copied.`),
      h('ul', { class: 'land-sources' }, ...COVERAGE.nationwide.map((x) => h('li', {},
        h('strong', {}, x.name), h('span', { class: 'land-tag ok' }, 'Nationwide'),
        h('div', { class: 'small muted' }, x.source), h('div', { class: 'small' }, x.note))))),
    h('section', { class: 'land-card' },
      h('h2', {}, 'Parcel data (every lot with owner names)'),
      h('p', { class: 'muted' }, 'Free parcel data comes from each state or county separately, so it’s plugged in one area at a time. You picked these regions to go first:'),
      ...Object.entries(FOCUS_REGIONS).map(([region, states]) => h('div', { class: 'land-region' },
        h('h3', {}, region), h('ul', { class: 'land-chips' }, ...states.map(stateChip)))),
      h('p', { class: 'land-note todo' }, h('strong', {}, 'Everywhere else: not connected — ask Claude to add it. '),
        'The map labels those areas too, and still shows local-government parks/open space and public buildings there.')),
    h('section', { class: 'land-card' },
      h('h2', {}, 'Coming next'),
      h('ul', { class: 'land-sources' }, ...COVERAGE.pending.map((x) => h('li', {},
        h('strong', {}, x.name), h('span', { class: 'land-tag planned' }, x.when), h('div', { class: 'small muted' }, x.where))))));
}
