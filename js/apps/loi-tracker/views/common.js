// Small building blocks shared by the LOIs app's views.
import { h } from '../../../ui.js';
import { PRODUCTS, CURRENCY, LOI_TYPES, goalTypes } from '../config.js';
import { parseIso, loiTotalsByType } from '../data.js';

const moneyFormat = new Intl.NumberFormat(undefined, { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 });
export const money = (n, unknown = '—') => (n == null ? unknown : moneyFormat.format(n));

export const fmtDate = (iso) => (iso ? parseIso(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const fmtDateTime = (ms) => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export function ago(ms) {
  if (!ms) return 'never';
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export const pill = (label, tone = 'neutral') => h('span', { class: `bd-pill ${tone}` }, label);

// The Customer / Partnership tag on an LOI (nothing for LOIs saved before types existed).
export const loiTypeTag = (type) => {
  const t = LOI_TYPES[type];
  return t ? h('span', { class: 'bd-type', style: `--chip:${t.color}`, title: t.label }, t.short) : null;
};

// A company's goal: the LOI tag(s) it's working towards, marked as a goal.
// Pass a goal value ('customer' | 'partnership' | 'both') or the result of companyGoal().
export const goalTags = (goal) => {
  const { types, fromLois } = typeof goal === 'object' && goal ? goal : { types: goalTypes(goal), fromLois: false };
  return types.map((type) => {
    const t = LOI_TYPES[type];
    return h('span', { class: 'bd-type goal', style: `--chip:${t.color}`, title: fromLois ? `${t.label} (from this company's LOIs; set a goal on the company to change it)` : `Goal: ${t.label}` }, '◎ ', t.short);
  });
};

// Customer vs partnership LOI totals as a small table (plus "Type not set" while any LOI lacks a type).
export function loiTypeTable(product) {
  const rows = loiTotalsByType(product);
  const name = (type) => (LOI_TYPES[type] ? h('span', { class: 'bd-type', style: `--chip:${LOI_TYPES[type].color}` }, LOI_TYPES[type].short) : h('span', { class: 'muted' }, 'Type not set'));
  const sum = (key) => rows.reduce((n, r) => n + r.totals[key], 0);
  const cell = (value, count) => [h('td', { class: 'num' }, money(value)), h('td', { class: 'muted small' }, `${count} LOI${count === 1 ? '' : 's'}`)];
  return h('div', { class: 'bd-table-wrap' }, h('table', { class: 'bd-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Type'), h('th', { class: 'num' }, 'Active signed'), h('th', {}), h('th', { class: 'num' }, 'Proposed'), h('th', {}))),
    h('tbody', {},
      ...rows.map(({ type, totals: t }) => h('tr', {}, h('td', {}, name(type)), ...cell(t.signedValue, t.signedCount), ...cell(t.proposedValue, t.proposedCount))),
      h('tr', { class: 'total' }, h('td', {}, 'All LOIs'), ...cell(sum('signedValue'), sum('signedCount')), ...cell(sum('proposedValue'), sum('proposedCount'))))));
}

export const productChip = (key) => {
  const p = PRODUCTS[key];
  return h('span', { class: 'bd-chip', style: `--chip:${p?.color ?? '#64748b'}` }, p?.short ?? key);
};

export function section(title, actions, ...content) {
  return h('section', { class: 'bd-section' },
    h('div', { class: 'bd-section-head' }, h('h3', {}, title), h('div', { class: 'bd-section-actions' }, ...[actions].flat().filter(Boolean))),
    ...content);
}

export const empty = (text) => h('p', { class: 'bd-empty muted' }, text);

export const button = (label, onclick, cls = 'btn') => h('button', { class: cls, onclick }, label);

export function searchBox(value, placeholder, onInput) {
  const input = h('input', {
    class: 'input', type: 'search', placeholder, value, 'aria-label': placeholder,
    oninput: () => onInput(input.value),
  });
  return input;
}

export function selectBox(value, options, onChange, label) {
  return h('select', { class: 'input', 'aria-label': label, onchange: (e) => onChange(e.target.value) },
    ...Object.entries(options).map(([k, text]) => h('option', { value: k, selected: k === value }, text)));
}

export const matches = (query, ...fields) => {
  const q = query.trim().toLowerCase();
  return !q || fields.some((f) => String(f ?? '').toLowerCase().includes(q));
};

export const isWebLink = (url) => /^https?:\/\//i.test(url ?? '');
export const extLink = (url, label) => (isWebLink(url) ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', class: 'bd-link' }, label) : null);

export function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  h('a', { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}
