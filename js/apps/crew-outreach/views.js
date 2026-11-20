// Screens for the Customer Outreach app: the Customers list, the Pipeline board,
// one customer's page, the add/edit form, the "log contact" panel and CSV export.
import { h } from '../../ui.js';
import { STAGES, INDUSTRIES, SOURCES, ACTIVITY_KINDS, FOLLOW_UP_DAYS } from './config.js';
import {
  customers, activitiesFor, industries, saveCustomer, recordContact, deleteCustomer, activities,
  displayName, isOpen, todayIso, addDays, daysSince, shortDate,
} from './data.js';

const stageOptions = (selected, { any = false } = {}) => [
  any ? h('option', { value: '', selected: !selected }, 'All stages') : null,
  ...Object.entries(STAGES).map(([key, s]) => h('option', { value: key, selected: key === selected }, s.label)),
];

const pill = (stage) => h('span', { class: `crew-pill ${STAGES[stage]?.tone ?? 'neutral'}` }, STAGES[stage]?.label ?? stage);

// A due/overdue follow-up shows in red/amber; a future one plainly.
function followUpLabel(c) {
  if (!c.nextFollowUp || !isOpen(c)) return null;
  const late = daysSince(c.nextFollowUp);
  const tone = late > 0 ? 'overdue' : late === 0 ? 'today' : '';
  const text = late > 0 ? `Follow up ${late}d overdue` : late === 0 ? 'Follow up today' : `Follow up ${shortDate(c.nextFollowUp)}`;
  return h('span', { class: `crew-due ${tone}` }, text);
}

const linkTo = (href, text) => h('a', { class: 'crew-link', href, target: '_blank', rel: 'noopener' }, text);
const withScheme = (url) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

// ---- Customers list ------------------------------------------------------------
const SORTS = {
  updated: ['Recently updated', (a, b) => (b.updated ?? 0) - (a.updated ?? 0)],
  name: ['Name', (a, b) => displayName(a).localeCompare(displayName(b))],
  company: ['Company', (a, b) => (a.company || '~').localeCompare(b.company || '~') || displayName(a).localeCompare(displayName(b))],
  industry: ['Industry', (a, b) => (a.industry || '~').localeCompare(b.industry || '~') || displayName(a).localeCompare(displayName(b))],
  follow_up: ['Next follow-up', (a, b) => (a.nextFollowUp || '9999').localeCompare(b.nextFollowUp || '9999')],
  last_contact: ['Last contacted', (a, b) => (b.lastContacted || '').localeCompare(a.lastContacted || '')],
};

const searchText = (c) => [c.name, c.company, c.position, c.industry, c.email, c.location, c.tags, c.notes].join(' ').toLowerCase();

export function customerList(ctx) {
  const { state } = ctx;
  const all = customers.all();
  if (!all.length) return welcome(ctx);

  const q = state.query.trim().toLowerCase();
  const list = all
    .filter((c) => (!state.stage || c.stage === state.stage)
      && (!state.industry || c.industry === state.industry)
      && (!q || searchText(c).includes(q)))
    .sort(SORTS[state.sort]?.[1] ?? SORTS.updated[1]);

  const inds = industries();
  return h('div', { class: 'crew-view' },
    h('div', { class: 'crew-toolbar' },
      h('input', {
        class: 'input', type: 'search', placeholder: 'Search name, company, position, notes…', value: state.query,
        oninput: (e) => { state.query = e.target.value; ctx.refresh({ keepFocus: true }); },
      }),
      h('select', { class: 'input crew-select', 'aria-label': 'Stage', onchange: (e) => { state.stage = e.target.value; ctx.refresh(); } },
        ...stageOptions(state.stage, { any: true })),
      h('select', { class: 'input crew-select', 'aria-label': 'Industry', onchange: (e) => { state.industry = e.target.value; ctx.refresh(); } },
        h('option', { value: '' }, 'All industries'),
        ...inds.map((i) => h('option', { value: i, selected: i === state.industry }, i))),
      h('select', { class: 'input crew-select', 'aria-label': 'Sort by', onchange: (e) => { state.sort = e.target.value; ctx.refresh(); } },
        ...Object.entries(SORTS).map(([key, [label]]) => h('option', { value: key, selected: key === state.sort }, `Sort: ${label}`))),
      h('button', { class: 'btn primary', onclick: () => openEditor(ctx) }, '+ Add customer')),
    h('p', { class: 'muted small crew-hint' }, `${list.length} of ${all.length} ${all.length === 1 ? 'person' : 'people'}`),
    list.length
      ? h('div', { class: 'crew-table-wrap' }, h('table', { class: 'crew-table' },
        h('thead', {}, h('tr', {}, ...['Name', 'Position', 'Company', 'Industry', 'Stage', 'Last contacted', 'Next follow-up'].map((t) => h('th', {}, t)))),
        h('tbody', {}, ...list.map((c) => h('tr', {
          tabIndex: 0,
          onclick: () => ctx.go('customer', { customerId: c.id }),
          onkeydown: (e) => { if (e.key === 'Enter') ctx.go('customer', { customerId: c.id }); },
        },
        h('td', { class: 'crew-strong' }, c.name || '—'),
        h('td', {}, c.position || ''),
        h('td', {}, c.company || ''),
        h('td', {}, c.industry || ''),
        h('td', {}, pill(c.stage)),
        h('td', { class: 'crew-nowrap' }, c.lastContacted ? shortDate(c.lastContacted) : h('span', { class: 'muted' }, 'never')),
        h('td', { class: 'crew-nowrap' }, followUpLabel(c) ?? ''))))))
      : h('p', { class: 'muted crew-empty' }, 'Nobody matches these filters.'));
}

function welcome(ctx) {
  return h('div', { class: 'crew-view' }, h('div', { class: 'crew-welcome' },
    h('h2', {}, 'Customer outreach'),
    h('p', { class: 'muted' }, 'Keep track of everyone you reach out to about Crew Orchard: who they are, where they work, and where each conversation stands. Follow-ups that come due show up on your sticky note.'),
    h('button', { class: 'btn primary', onclick: () => openEditor(ctx) }, '+ Add your first customer')));
}

// ---- Pipeline board ------------------------------------------------------------
export function pipeline(ctx) {
  const all = customers.all();
  if (!all.length) return welcome(ctx);
  return h('div', { class: 'crew-view' },
    h('div', { class: 'crew-toolbar' },
      h('p', { class: 'muted small crew-hint' }, 'Every person by stage. Change a stage from the drop-down on a card.'),
      h('button', { class: 'btn primary', onclick: () => openEditor(ctx) }, '+ Add customer')),
    h('div', { class: 'crew-board' }, ...Object.entries(STAGES).map(([key, s]) => {
      const list = all.filter((c) => c.stage === key)
        .sort((a, b) => (a.nextFollowUp || '9999').localeCompare(b.nextFollowUp || '9999') || displayName(a).localeCompare(displayName(b)));
      return h('section', { class: `crew-col ${s.tone}` },
        h('header', {}, h('strong', {}, s.label), h('span', { class: 'muted small' }, String(list.length))),
        ...list.map((c) => h('article', { class: 'crew-card', tabIndex: 0, onclick: () => ctx.go('customer', { customerId: c.id }), onkeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) ctx.go('customer', { customerId: c.id }); } },
          h('strong', {}, displayName(c)),
          c.name && (c.position || c.company) ? h('span', { class: 'muted small' }, [c.position, c.company].filter(Boolean).join(' · ')) : null,
          c.industry ? h('span', { class: 'crew-tag' }, c.industry) : null,
          followUpLabel(c),
          h('select', {
            class: 'input crew-card-stage', 'aria-label': 'Stage',
            onclick: (e) => e.stopPropagation(),
            onchange: (e) => saveCustomer({ ...customers.get(c.id), stage: e.target.value }),
          }, ...stageOptions(c.stage)))));
    })));
}

// ---- One customer -------------------------------------------------------------
export function customerPage(ctx) {
  const c = customers.get(ctx.state.customerId);
  const back = h('button', { class: 'link-btn', onclick: () => ctx.go(ctx.state.from || 'customers') }, `← ${ctx.state.from === 'pipeline' ? 'Pipeline' : 'Customers'}`);
  if (!c) return h('div', { class: 'crew-view' }, back, h('p', { class: 'muted' }, 'This person was deleted.'));

  const detail = (label, value) => (value ? h('div', { class: 'crew-detail' }, h('span', { class: 'muted small' }, label), h('span', {}, value)) : null);
  const timeline = activitiesFor(c.id);

  return h('div', { class: 'crew-view' },
    back,
    h('div', { class: 'crew-head' },
      h('div', {},
        h('h2', {}, displayName(c)),
        h('p', { class: 'muted' }, [c.position, c.company].filter(Boolean).join(' at ') || ' ')),
      h('div', { class: 'crew-actions' },
        h('button', { class: 'btn primary', onclick: () => openContact(ctx, c) }, 'Log contact'),
        h('button', { class: 'btn', onclick: () => openEditor(ctx, c) }, 'Edit'))),
    h('div', { class: 'crew-status' },
      h('label', { class: 'crew-field' }, h('span', {}, 'Stage'),
        h('select', { class: 'input', onchange: (e) => saveCustomer({ ...customers.get(c.id), stage: e.target.value }) }, ...stageOptions(c.stage))),
      h('label', { class: 'crew-field' }, h('span', {}, 'Next follow-up'),
        h('input', { class: 'input', type: 'date', value: c.nextFollowUp, disabled: !isOpen(c), onchange: (e) => saveCustomer({ ...customers.get(c.id), nextFollowUp: e.target.value }) })),
      h('div', { class: 'crew-field' }, h('span', {}, 'Last contacted'),
        h('strong', {}, c.lastContacted ? `${shortDate(c.lastContacted)} (${daysSince(c.lastContacted) === 0 ? 'today' : `${daysSince(c.lastContacted)}d ago`})` : 'Never'))),
    h('div', { class: 'crew-details' },
      detail('Industry', c.industry),
      detail('Company size', c.companySize),
      detail('Location', c.location),
      detail('Email', c.email ? linkTo(`mailto:${c.email}`, c.email) : ''),
      detail('Phone', c.phone ? linkTo(`tel:${c.phone.replace(/[^\d+]/g, '')}`, c.phone) : ''),
      detail('LinkedIn', c.linkedin ? linkTo(withScheme(c.linkedin), c.linkedin.replace(/^https?:\/\/(www\.)?/i, '')) : ''),
      detail('Website', c.website ? linkTo(withScheme(c.website), c.website.replace(/^https?:\/\/(www\.)?/i, '')) : ''),
      detail('How you found them', c.source ? SOURCES[c.source] ?? c.source : ''),
      detail('Tags', c.tags)),
    c.notes ? h('section', { class: 'crew-section' }, h('h3', {}, 'Notes'), h('p', { class: 'crew-notes' }, c.notes)) : null,
    h('section', { class: 'crew-section' },
      h('h3', {}, 'Timeline'),
      timeline.length
        ? h('ul', { class: 'crew-timeline' }, ...timeline.map((a) => h('li', {},
          h('div', { class: 'crew-timeline-head' },
            h('span', {}, ACTIVITY_KINDS[a.kind] ?? a.kind),
            h('span', { class: 'muted small' }, shortDate(a.on)),
            h('button', { class: 'link-btn crew-remove', title: 'Remove from timeline', onclick: () => { if (confirm('Remove this entry from the timeline?')) activities.remove(a.id); } }, '✕')),
          a.text ? h('p', { class: 'crew-notes' }, a.text) : null)))
        : h('p', { class: 'muted crew-empty' }, 'Nothing logged yet. Use "Log contact" after you email, message, call or meet them.')));
}

// ---- Panels --------------------------------------------------------------------
function panel(ctx, title, body, actions) {
  const overlay = h('div', { class: 'crew-overlay', onclick: (e) => { if (e.target === overlay) close(); } });
  const close = () => overlay.remove();
  const onKey = (e) => { if (e.key === 'Escape') { close(); } };
  overlay.addEventListener('keydown', onKey);
  overlay.append(h('form', { class: 'crew-panel', onsubmit: (e) => { e.preventDefault(); actions.submit(close); } },
    h('div', { class: 'crew-panel-head' }, h('h3', {}, title), h('button', { type: 'button', class: 'link-btn', onclick: close }, 'Close')),
    body,
    h('div', { class: 'crew-panel-actions' },
      h('button', { type: 'submit', class: 'btn primary' }, actions.label ?? 'Save'),
      h('button', { type: 'button', class: 'btn', onclick: close }, 'Cancel'),
      actions.remove ? h('button', { type: 'button', class: 'btn ghost danger crew-delete', onclick: () => actions.remove(close) }, 'Delete') : null)));
  ctx.host.append(overlay);
  overlay.querySelector('input, select, textarea')?.focus();
  return overlay;
}

const field = (label, input, wide = false) => h('label', { class: `crew-field${wide ? ' wide' : ''}` }, h('span', {}, label), input);

export function openEditor(ctx, existing = null) {
  const v = { stage: 'to_contact', source: '', ...existing };
  const text = (key, props = {}) => h('input', { class: 'input', value: v[key] ?? '', oninput: (e) => { v[key] = e.target.value; }, ...props });
  const listId = `crew-industries-${Math.random().toString(36).slice(2)}`;
  const suggestions = [...new Set([...industries(), ...INDUSTRIES])];
  const error = h('p', { class: 'error small', hidden: true });

  const body = h('div', { class: 'crew-form-grid' },
    field('Name', text('name', { placeholder: 'Full name', autocomplete: 'off' })),
    field('Position', text('position', { placeholder: 'e.g. CTO, Head of Platform' })),
    field('Company', text('company')),
    field('Industry', (() => {
      const box = text('industry', { placeholder: 'Pick or type' });
      box.setAttribute('list', listId); // `list` is read-only as a property, so set the attribute
      return box;
    })()),
    h('datalist', { id: listId }, ...suggestions.map((i) => h('option', { value: i }))),
    field('Company size', text('companySize', { placeholder: 'e.g. 11–50' })),
    field('Location', text('location', { placeholder: 'City, country' })),
    field('Email', text('email', { type: 'email' })),
    field('Phone', text('phone', { type: 'tel' })),
    field('LinkedIn', text('linkedin', { placeholder: 'linkedin.com/in/…' })),
    field('Website', text('website', { placeholder: 'company.com' })),
    field('How you found them', h('select', { class: 'input', onchange: (e) => { v.source = e.target.value; } },
      ...Object.entries(SOURCES).map(([key, label]) => h('option', { value: key, selected: key === (v.source ?? '') }, label)))),
    field('Stage', h('select', { class: 'input', onchange: (e) => { v.stage = e.target.value; } }, ...stageOptions(v.stage))),
    field('Next follow-up', text('nextFollowUp', { type: 'date' })),
    field('Tags', text('tags', { placeholder: 'comma, separated' }), true),
    field('Notes', h('textarea', { class: 'input', rows: 4, value: v.notes ?? '', oninput: (e) => { v.notes = e.target.value; } }), true),
    error);

  panel(ctx, existing ? `Edit ${displayName(existing)}` : 'Add customer', body, {
    submit(close) {
      if (!v.name?.trim() && !v.company?.trim()) { error.textContent = 'Add a name or a company.'; error.hidden = false; return; }
      const trimmed = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' ? x.trim() : x]));
      const saved = saveCustomer(existing ? { ...customers.get(existing.id), ...trimmed } : trimmed);
      close();
      if (!existing) ctx.go('customer', { customerId: saved.id });
      else ctx.refresh();
    },
    remove: existing ? (close) => {
      if (!confirm(`Delete ${displayName(existing)} and their timeline?`)) return;
      deleteCustomer(existing.id);
      close();
      ctx.go(ctx.state.from || 'customers');
    } : null,
  });
}

function openContact(ctx, c) {
  const v = { kind: 'email', text: '', on: todayIso(), nextFollowUp: isOpen(c) ? addDays(todayIso(), FOLLOW_UP_DAYS) : '' };
  const body = h('div', { class: 'crew-form-grid' },
    field('What happened', h('select', { class: 'input', onchange: (e) => { v.kind = e.target.value; } },
      ...Object.entries(ACTIVITY_KINDS).filter(([key]) => key !== 'stage').map(([key, label]) => h('option', { value: key, selected: key === v.kind }, label)))),
    field('When', h('input', { class: 'input', type: 'date', value: v.on, max: todayIso(), onchange: (e) => { v.on = e.target.value || todayIso(); } })),
    field('Follow up on', h('input', { class: 'input', type: 'date', value: v.nextFollowUp, disabled: !isOpen(c), onchange: (e) => { v.nextFollowUp = e.target.value; } })),
    field('Notes', h('textarea', { class: 'input', rows: 4, placeholder: 'What you sent or talked about, what they said…', oninput: (e) => { v.text = e.target.value; } }), true));
  panel(ctx, `Log contact with ${displayName(c)}`, body, {
    label: 'Log it',
    submit(close) {
      recordContact(c, { kind: v.kind, text: v.text.trim(), on: v.on, nextFollowUp: isOpen(c) ? v.nextFollowUp : undefined });
      close();
      ctx.refresh();
    },
  });
}

// ---- Export --------------------------------------------------------------------
export function downloadCsv() {
  const cols = [
    ['Name', 'name'], ['Position', 'position'], ['Company', 'company'], ['Industry', 'industry'],
    ['Company size', 'companySize'], ['Location', 'location'], ['Email', 'email'], ['Phone', 'phone'],
    ['LinkedIn', 'linkedin'], ['Website', 'website'], ['Source', (c) => SOURCES[c.source] ?? c.source],
    ['Stage', (c) => STAGES[c.stage]?.label ?? c.stage], ['Last contacted', 'lastContacted'],
    ['Next follow-up', 'nextFollowUp'], ['Tags', 'tags'], ['Notes', 'notes'],
  ];
  const cell = (x) => {
    const s = String(x ?? '');
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // don't let a spreadsheet treat it as a formula
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const rows = [cols.map(([label]) => label), ...[...customers.all()]
    .sort((a, b) => displayName(a).localeCompare(displayName(b)))
    .map((c) => cols.map(([, get]) => (typeof get === 'function' ? get(c) : c[get])))];
  const csv = `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = h('a', { href: url, download: `crew-orchard-outreach-${todayIso()}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
