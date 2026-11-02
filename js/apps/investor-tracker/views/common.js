// Small building blocks shared by the Investors app's views.
import { h } from '../../../ui.js';
import { CURRENCY, STAGES } from '../config.js';
import { parseIso, daysSince } from '../data.js';

const moneyFormat = new Intl.NumberFormat(undefined, { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 });
export const money = (n, unknown = '—') => (n == null ? unknown : moneyFormat.format(n));

export const fmtDate = (iso) => (iso ? parseIso(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function ago(iso) {
  if (!iso) return 'never';
  const days = daysSince(iso);
  if (days <= 0) return days < 0 ? `in ${-days} day${days === -1 ? '' : 's'}` : 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export const pill = (label, tone = 'neutral', title) => h('span', { class: `inv-pill ${tone}`, title }, label);
export const stagePill = (stage) => pill(STAGES[stage]?.label ?? stage, STAGES[stage]?.tone);

export function section(title, actions, ...content) {
  return h('section', { class: 'inv-section' },
    h('div', { class: 'inv-section-head' }, h('h3', {}, title), h('div', { class: 'inv-section-actions' }, ...[actions].flat().filter(Boolean))),
    ...content);
}

export const empty = (text) => h('p', { class: 'muted inv-empty' }, text);

// Website without the scheme, linked; adds https:// when it's missing.
export function webLink(url) {
  if (!url) return null;
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const text = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
  return h('a', { class: 'inv-link', href, title: url, target: '_blank', rel: 'noopener noreferrer', onclick: (e) => e.stopPropagation() },
    text.length > 42 ? `${text.slice(0, 40)}…` : text);
}

export const mailLink = (email) => (email ? h('a', { class: 'inv-link', href: `mailto:${email}` }, email) : null);
export const telLink = (tel) => (tel ? h('a', { class: 'inv-link', href: `tel:${tel.replace(/[^\d+]/g, '')}` }, tel) : null);

// Every email address we have for a firm (general + each person).
export const firmEmails = (firm) => [...new Set([firm.email, ...(firm.contacts ?? []).map((p) => p.email)]
  .map((e) => (e ?? '').trim()).filter(Boolean))];
