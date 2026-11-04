// The Coverage tab: the note of what Claude has connected, how the app works,
// and a connection check.
import { h } from '../../ui.js';
import { COVERAGE } from './config.js';
import { CHECKS, runChecks } from './diagnostics.js';

export function coverageView() {
  return h('div', { class: 'land-page' },
    h('section', { class: 'land-card' },
      h('h2', {}, 'How Land Search works'),
      h('p', {}, COVERAGE.how)),
    checksCard(),
    h('section', { class: 'land-card' },
      h('h2', {}, 'What’s connected'),
      h('p', { class: 'muted' }, `Filled in by Claude · last updated ${COVERAGE.updated}. Everything below is live: fetched from the source each time you look, nothing is copied.`),
      h('ul', { class: 'land-sources' }, ...COVERAGE.nationwide.map((x) => h('li', {},
        h('strong', {}, x.name), h('span', { class: 'land-tag ok' }, 'Nationwide'),
        h('div', { class: 'small muted' }, x.source), h('div', { class: 'small' }, x.note))))),
    h('section', { class: 'land-card' },
      h('h2', {}, 'Your records'),
      h('p', { class: 'muted' }, COVERAGE.records)));
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
