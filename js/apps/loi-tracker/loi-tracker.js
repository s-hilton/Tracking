// Letters of Intent tracker (lives in the Astra Retrieval folder).
// Self-contained: this folder + supabase/migrations/*_lois.sql.
import { uid } from '../../storage.js';
import { h, loadStyles } from '../../ui.js';
import { createCollection } from '../../cloud.js';

loadStyles(new URL('./loi-tracker.css', import.meta.url));

// The pipeline, in order. Rename or add stages here; existing LOIs keep their key.
const STATUSES = {
  prospect: { label: 'Prospect', tone: 'neutral' },
  requested: { label: 'Requested', tone: 'info' },
  negotiating: { label: 'Negotiating', tone: 'warn' },
  signed: { label: 'Signed', tone: 'good' },
  declined: { label: 'Declined', tone: 'bad' },
};
const IN_PROGRESS = ['requested', 'negotiating'];
const CURRENCY = 'USD';
const EXPIRY_WARNING_DAYS = 30;

const SORTS = {
  updated: { label: 'Recently updated', compare: (a, b) => b.updated - a.updated },
  value: { label: 'Highest value', compare: (a, b) => (b.amount ?? -1) - (a.amount ?? -1) },
  expiry: { label: 'Expiring soonest', compare: (a, b) => (a.expires || '9999').localeCompare(b.expires || '9999') },
  company: { label: 'Company A–Z', compare: (a, b) => a.company.localeCompare(b.company) },
};

const store = createCollection({
  table: 'lois',
  key: 'lois',
  toRow: (l) => ({
    id: l.id,
    company: l.company,
    contact_name: l.contact,
    contact_email: l.email,
    status: l.status,
    amount: l.amount,
    received_on: l.received || null,
    expires_on: l.expires || null,
    document_url: l.docUrl,
    notes: l.notes,
    created_at: new Date(l.created).toISOString(),
    updated_at: new Date(l.updated).toISOString(),
  }),
  fromRow: (r) => ({
    id: r.id,
    company: r.company,
    contact: r.contact_name,
    email: r.contact_email,
    status: r.status,
    amount: r.amount == null ? null : Number(r.amount),
    received: r.received_on ?? '',
    expires: r.expires_on ?? '',
    docUrl: r.document_url,
    notes: r.notes,
    created: Date.parse(r.created_at),
    updated: Date.parse(r.updated_at),
  }),
  order: { column: 'updated_at', ascending: false },
});

const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 });
const formatMoney = (n) => (n == null ? '—' : money.format(n));
// Dates are stored as YYYY-MM-DD; read them as local dates, not UTC.
const formatDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
const isWebLink = (url) => /^https?:\/\//i.test(url);

function statusPill(key) {
  const status = STATUSES[key] ?? { label: key, tone: 'neutral' };
  return h('span', { class: `loi-pill ${status.tone}` }, status.label);
}

function expiryNote(loi) {
  if (!loi.expires || loi.status === 'declined') return null;
  const [y, m, d] = loi.expires.split('-').map(Number);
  const days = Math.ceil((new Date(y, m - 1, d + 1) - Date.now()) / 86400000) - 1;
  if (days < 0) return h('span', { class: 'loi-pill bad' }, 'Expired');
  if (days <= EXPIRY_WARNING_DAYS) return h('span', { class: 'loi-pill warn' }, days === 0 ? 'Expires today' : `Expires in ${days}d`);
  return h('span', { class: 'muted small' }, `Expires ${formatDate(loi.expires)}`);
}

function exportCsv(lois) {
  const cols = [
    ['Company', (l) => l.company], ['Contact', (l) => l.contact], ['Email', (l) => l.email],
    ['Status', (l) => STATUSES[l.status]?.label ?? l.status], [`Value (${CURRENCY})`, (l) => l.amount ?? ''],
    ['Received', (l) => l.received], ['Expires', (l) => l.expires], ['Document', (l) => l.docUrl], ['Notes', (l) => l.notes],
  ];
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.map(([name]) => cell(name)), ...lois.map((l) => cols.map(([, get]) => cell(get(l))))]
    .map((row) => row.join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  h('a', { href: url, download: `letters-of-intent-${new Date().toISOString().slice(0, 10)}.csv` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default {
  id: 'loi-tracker',
  name: 'LOI Tracker',
  icon: '🤝',
  color: '#0f172a',
  size: { w: 820, h: 560 },

  mount(root) {
    let editingId = null; // null = list view, 'new' = new LOI, otherwise an LOI id
    let query = '';
    let filter = 'all';
    let sort = 'updated';

    const app = h('div', { class: 'app loi' });

    // ---- List view ------------------------------------------------------------
    function summary(lois) {
      const sum = (list) => list.reduce((total, l) => total + (l.amount ?? 0), 0);
      const signed = lois.filter((l) => l.status === 'signed');
      const open = lois.filter((l) => IN_PROGRESS.includes(l.status));
      const tile = (label, value, sub) => h('div', { class: 'loi-stat' },
        h('span', { class: 'muted small' }, label), h('strong', {}, value), sub ? h('span', { class: 'muted small' }, sub) : null);
      return h('div', { class: 'loi-stats' },
        tile('Total LOIs', String(lois.length)),
        tile('Signed', String(signed.length), formatMoney(sum(signed))),
        tile('In progress', String(open.length), formatMoney(sum(open))));
    }

    function row(loi) {
      return h('li', {},
        h('button', { class: 'loi-row', onclick: () => edit(loi.id) },
          h('div', { class: 'loi-main' },
            h('strong', { class: 'loi-company' }, loi.company),
            h('span', { class: 'muted small' }, [loi.contact, loi.email].filter(Boolean).join(' · ') || 'No contact')),
          h('div', { class: 'loi-meta' },
            statusPill(loi.status),
            h('span', { class: 'loi-amount' }, formatMoney(loi.amount)),
            loi.received ? h('span', { class: 'muted small' }, `Received ${formatDate(loi.received)}`) : null,
            expiryNote(loi))),
        isWebLink(loi.docUrl)
          ? h('a', { class: 'btn ghost loi-doc', href: loi.docUrl, target: '_blank', rel: 'noopener noreferrer', title: 'Open the LOI document' }, 'Doc ↗')
          : null);
    }

    // The LOIs matching the current search, status filter and sort.
    function matching() {
      const q = query.trim().toLowerCase();
      return store.all()
        .filter((l) => filter === 'all' || l.status === filter)
        .filter((l) => !q || [l.company, l.contact, l.email, l.notes].some((v) => v?.toLowerCase().includes(q)))
        .sort(SORTS[sort].compare);
    }

    function listView() {
      const all = store.all();
      const listEl = h('ul', { class: 'loi-list' });
      const count = h('span', { class: 'muted small' });
      const renderList = () => {
        const items = matching();
        listEl.replaceChildren(...(items.length
          ? items.map(row)
          : [h('li', { class: 'loi-empty muted' }, all.length ? 'No LOIs match.' : 'No letters of intent yet. Add your first one.')]));
        count.textContent = `${items.length} of ${all.length}`;
      };

      const search = h('input', {
        class: 'input', type: 'search', placeholder: 'Search company, contact, notes…', value: query, 'aria-label': 'Search LOIs',
        oninput: () => { query = search.value; renderList(); },
      });
      const select = (value, options, onchange, label) => h('select', { class: 'input', 'aria-label': label, onchange: (e) => onchange(e.target.value) },
        ...Object.entries(options).map(([key, text]) => h('option', { value: key, selected: key === value }, text)));

      app.replaceChildren(
        h('div', { class: 'loi-toolbar' },
          search,
          select(filter, { all: 'All statuses', ...Object.fromEntries(Object.entries(STATUSES).map(([k, s]) => [k, s.label])) },
            (v) => { filter = v; renderList(); }, 'Filter by status'),
          select(sort, Object.fromEntries(Object.entries(SORTS).map(([k, s]) => [k, s.label])), (v) => { sort = v; renderList(); }, 'Sort'),
          h('button', { class: 'btn primary', onclick: () => edit('new') }, '+ New LOI')),
        summary(all),
        listEl,
        h('div', { class: 'loi-footer' },
          count,
          h('button', { class: 'btn ghost', disabled: !all.length, onclick: () => exportCsv(matching()) }, 'Export CSV')));
      renderList();
    }

    // ---- Edit view --------------------------------------------------------------
    function editView() {
      const existing = editingId === 'new' ? null : store.get(editingId);
      const loi = existing ?? { status: 'prospect', company: '', contact: '', email: '', amount: null, received: '', expires: '', docUrl: '', notes: '' };

      const input = (props) => h('input', { class: 'input', ...props });
      const company = input({ value: loi.company, required: true, maxLength: 120, placeholder: 'Customer company' });
      const status = h('select', { class: 'input' },
        ...Object.entries(STATUSES).map(([key, s]) => h('option', { value: key, selected: key === loi.status }, s.label)));
      const contact = input({ value: loi.contact, placeholder: 'Contact name', autocomplete: 'off' });
      const email = input({ value: loi.email, type: 'email', placeholder: 'name@company.com', autocomplete: 'off' });
      const amount = input({ value: loi.amount ?? '', type: 'number', min: '0', step: 'any', inputMode: 'decimal', placeholder: '0' });
      const received = input({ value: loi.received, type: 'date' });
      const expires = input({ value: loi.expires, type: 'date' });
      const docUrl = input({ value: loi.docUrl, type: 'url', placeholder: 'https://… (link to the signed PDF)', autocapitalize: 'off' });
      const notes = h('textarea', { class: 'input', rows: 4, placeholder: 'Scope, terms, next steps…', value: loi.notes });
      const error = h('p', { class: 'error small', hidden: true });

      const field = (label, el, wide) => h('label', { class: `loi-field${wide ? ' wide' : ''}` }, h('span', {}, label), el);

      function save(event) {
        event.preventDefault();
        const link = docUrl.value.trim();
        if (link && !isWebLink(link)) {
          error.textContent = 'The document link must start with http:// or https://';
          error.hidden = false;
          return;
        }
        const now = Date.now();
        store.upsert({
          id: existing?.id ?? uid(),
          company: company.value.trim(),
          contact: contact.value.trim(),
          email: email.value.trim(),
          status: status.value,
          amount: amount.value === '' ? null : Math.max(0, Number(amount.value)),
          received: received.value,
          expires: expires.value,
          docUrl: link,
          notes: notes.value.trim(),
          created: existing?.created ?? now,
          updated: now,
        });
        edit(null);
      }

      function remove() {
        if (!confirm(`Delete the LOI from ${existing.company}?`)) return;
        store.remove(existing.id);
        edit(null);
      }

      app.replaceChildren(h('form', { class: 'loi-form', onsubmit: save },
        h('div', { class: 'loi-form-head' },
          h('button', { type: 'button', class: 'btn ghost', onclick: () => edit(null) }, '‹ All LOIs'),
          h('h3', {}, existing ? existing.company : 'New letter of intent')),
        h('div', { class: 'loi-grid' },
          field('Company *', company, true),
          field('Status', status),
          field(`Value (${CURRENCY})`, amount),
          field('Contact name', contact),
          field('Contact email', email),
          field('Date received', received),
          field('Expiry date', expires),
          field('Document link', docUrl, true),
          field('Notes', notes, true)),
        error,
        h('div', { class: 'loi-actions' },
          existing ? h('button', { type: 'button', class: 'btn ghost danger', onclick: remove }, 'Delete') : null,
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn', onclick: () => edit(null) }, 'Cancel'),
          h('button', { class: 'btn primary' }, existing ? 'Save changes' : 'Add LOI'))));
      company.focus();
    }

    function edit(id) {
      editingId = id;
      render();
    }

    function render() {
      if (editingId && editingId !== 'new' && !store.get(editingId)) editingId = null; // deleted elsewhere
      if (editingId) editView();
      else listView();
    }

    root.append(app);
    render();
    // New data from another device: refresh the list, but never interrupt an edit.
    return store.subscribe(() => { if (!editingId) render(); });
  },
};
