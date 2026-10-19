// Minimal charts for the Analytics tab (HTML/CSS, no library).
// Follows the dashboard's data-viz rules: thin marks with a rounded data end,
// recessive gridlines, a legend only for 2+ series, hover/focus tooltips that
// list every series, and a table view so no value is hover-only.
import { h } from '../../../ui.js';

// ---- Shared tooltip -------------------------------------------------------------------
let tip;
function showTip(target, title, rows) {
  tip ??= document.body.appendChild(h('div', { class: 'chart-tip', role: 'tooltip' }));
  tip.replaceChildren(
    h('div', { class: 'chart-tip-title' }, title),
    ...rows.map(({ value, name, slot }) => h('div', { class: 'chart-tip-row' },
      slot ? h('span', { class: 'chart-key', style: `--key:var(--series-${slot})` }) : null,
      h('strong', {}, value),
      name ? h('span', {}, name) : null)));
  tip.hidden = false;
  const r = target.getBoundingClientRect();
  const w = tip.offsetWidth;
  tip.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2))}px`;
  tip.style.top = `${Math.max(8, r.top - tip.offsetHeight - 8)}px`;
}
const hideTip = () => { if (tip) tip.hidden = true; };

function hoverable(el, title, rows) {
  el.tabIndex = 0;
  el.setAttribute('aria-label', `${title}: ${rows.map((r) => `${r.name ? `${r.name} ` : ''}${r.value}`).join(', ')}`);
  el.addEventListener('pointerenter', () => showTip(el, title, rows));
  el.addEventListener('focus', () => showTip(el, title, rows));
  el.addEventListener('pointerleave', hideTip);
  el.addEventListener('blur', hideTip);
  return el;
}

function tableView(headers, rows) {
  return h('details', { class: 'chart-table' },
    h('summary', {}, 'Show as table'),
    h('table', { class: 'bd-table' },
      h('thead', {}, h('tr', {}, ...headers.map((t, i) => h('th', { class: i ? 'num' : '' }, t)))),
      h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c, i) => h('td', { class: i ? 'num' : '' }, String(c))))))));
}

// Rounds an axis maximum up to a clean number (1, 2, 5 × 10^n).
function niceMax(value) {
  if (value <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 5, 10].map((m) => m * p).find((n) => n >= value);
}

// ---- Horizontal bars (one series) ---------------------------------------------------------
// rows: [{ label, value (number|null), display, detail }]
export function barList({ rows, headers = ['', 'Value'], empty = 'No data for this period.' }) {
  const max = Math.max(0, ...rows.map((r) => r.value ?? 0));
  if (!max) return h('p', { class: 'bd-empty muted' }, empty);
  return h('div', { class: 'chart' },
    h('div', { class: 'chart-bars' }, ...rows.map((r) => hoverable(h('div', { class: 'chart-bar-row' },
      h('span', { class: 'chart-bar-label' }, r.label),
      h('span', { class: 'chart-bar-track' },
        h('span', { class: 'chart-bar-area' },
          r.value ? h('span', { class: 'chart-bar', style: `width:${(r.value / max) * 100}%` }) : null),
        h('span', { class: 'chart-bar-value' }, r.display ?? String(r.value ?? '—')))),
    r.label, [{ value: r.display ?? String(r.value ?? '—'), name: r.detail ?? '' }]))),
    tableView(headers, rows.map((r) => [r.label, r.display ?? (r.value ?? '—'), ...(r.detail ? [r.detail] : [])].slice(0, headers.length))));
}

// ---- Columns over time (one or more series, grouped) -----------------------------------------
// categories: [label]; series: [{ name, slot (1|2), values: [number] }]
export function columnChart({ categories, series, format = String, empty = 'No data for this period.' }) {
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  if (!max) return h('p', { class: 'bd-empty muted' }, empty);
  const top = niceMax(max);
  // Counts get whole-number ticks only (no "0.5 LOIs").
  const ticks = Number.isInteger(top / 2) ? [top, top / 2, 0] : [top, 0];
  const every = Math.ceil(categories.length / 12); // thin out x labels on long ranges

  const plot = h('div', { class: 'chart-plot' },
    h('div', { class: 'chart-grid' }, ...ticks.map((t) => h('div', { class: 'chart-gridline' }, h('span', {}, format(t))))),
    h('div', { class: 'chart-cols' }, ...categories.map((label, i) => hoverable(h('div', { class: 'chart-col' },
      h('div', { class: 'chart-col-bars' }, ...series.map((s) => h('span', {
        class: 'chart-colbar',
        style: `height:${(s.values[i] / top) * 100}%;--bar:var(--series-${s.slot})`,
      }))),
      h('span', { class: 'chart-col-label' }, i % every === 0 ? label : '')),
    label, series.map((s) => ({ value: format(s.values[i]), name: series.length > 1 ? s.name : '', slot: series.length > 1 ? s.slot : null }))))));

  return h('div', { class: 'chart' },
    series.length > 1 ? h('div', { class: 'chart-legend' }, ...series.map((s) => h('span', {},
      h('span', { class: 'chart-swatch', style: `--key:var(--series-${s.slot})` }), s.name))) : null,
    plot,
    tableView(['', ...series.map((s) => s.name)], categories.map((label, i) => [label, ...series.map((s) => format(s.values[i]))])));
}
