// LOI register: every LOI with status, value, allocation, dates and document links.
import { h } from '../../../ui.js';
import { PRODUCTS, LOI_STATUSES, LOI_TYPES, VALUE_BASIS, EXPIRY_ALERT_DAYS, CURRENCY } from '../config.js';
import {
  lois, companyName, loiTotals, loiProducts, loiValueFor, unallocated, isActiveSigned, daysUntil,
} from '../data.js';
import { editLoi } from '../editors.js';
import {
  money, pill, productChip, loiTypeTag, loiTypeTable, section, empty, button, searchBox, selectBox, matches, fmtDate, extLink, toCsv, downloadFile,
} from './common.js';

export function loiRegister(ctx) {
  const { state, product, host } = ctx;
  state.loiQuery ??= '';
  state.loiStatus ??= 'all';
  state.loiType ??= 'all';
  const totals = loiTotals(product, state.loiType);
  const typeName = state.loiType === 'all' ? '' : state.loiType === 'none' ? ' (type not set)' : ` (${LOI_TYPES[state.loiType].short.toLowerCase()})`;

  const inScope = () => lois.all()
    .filter((l) => product === 'all' || loiProducts(l).includes(product))
    .filter((l) => state.loiType === 'all' || (state.loiType === 'none' ? !LOI_TYPES[l.loiType] : l.loiType === state.loiType))
    .filter((l) => state.loiStatus === 'all' || (state.loiStatus === 'active' ? isActiveSigned(l) : l.status === state.loiStatus))
    .filter((l) => matches(state.loiQuery, l.title, companyName(l.companyId), l.signatories, l.notes))
    .sort((a, b) => b.updated - a.updated);

  const expiryPill = (l) => {
    if (!l.expiresOn || !['signed', 'awaiting_signatures', 'negotiating'].includes(l.status)) return null;
    const days = daysUntil(l.expiresOn);
    if (days < 0) return pill('Past expiry', 'bad');
    const [, mid, near] = EXPIRY_ALERT_DAYS;
    if (days <= EXPIRY_ALERT_DAYS[0]) return pill(`Expires in ${days}d`, days <= near ? 'bad' : days <= mid ? 'warn' : 'info');
    return null;
  };

  const list = h('ul', { class: 'bd-rows' });
  const render = () => {
    const rows = inScope();
    list.replaceChildren(...(rows.length ? rows.map((l) => {
      const value = loiValueFor(l, product);
      const left = unallocated(l);
      return h('li', { class: `bd-row${l.status === 'superseded' ? ' faded' : ''}` },
        h('button', { class: 'bd-row-main', onclick: () => editLoi(host, l) },
          h('strong', {}, l.title || `${companyName(l.companyId)} LOI`),
          h('span', { class: 'muted small' }, [
            companyName(l.companyId),
            l.signedOn ? `signed ${fmtDate(l.signedOn)}` : l.sentOn ? `sent ${fmtDate(l.sentOn)}` : null,
            l.expiresOn ? `expires ${fmtDate(l.expiresOn)}` : null,
            l.signatories ? `signatories: ${l.signatories}` : null,
          ].filter(Boolean).join(' · '))),
        h('div', { class: 'bd-row-meta' },
          loiTypeTag(l.loiType),
          ...loiProducts(l).map(productChip),
          pill(LOI_STATUSES[l.status]?.label ?? l.status, LOI_STATUSES[l.status]?.tone),
          expiryPill(l),
          h('span', { class: 'bd-num' }, l.amount == null ? 'Unpriced' : money(value)),
          product === 'all' && left > 0 && (l.allocations ?? []).length ? h('span', { class: 'muted small' }, `${money(left)} unallocated`) : null,
          l.valueBasis && l.valueBasis !== 'total' ? h('span', { class: 'muted small' }, VALUE_BASIS[l.valueBasis]) : null,
          extLink(l.docUrl, 'Signed ↗'),
          extLink(l.draftUrl, 'Draft ↗')));
    }) : [h('li', {}, empty(lois.all().length ? 'No LOIs match.' : 'No LOIs yet. Add one from a company page or with + LOI.'))]));
  };

  const exportCsv = () => {
    const header = ['Company', 'Title', 'Type', 'Status', `Stated value (${CURRENCY})`, 'Value basis',
      ...Object.values(PRODUCTS).map((p) => `${p.short} allocation`), 'Unallocated', 'Sent', 'Signed', 'Effective', 'Expires',
      'Signatories', 'Binding', 'Signed document', 'Draft', 'Notes'];
    const rows = inScope().map((l) => [
      companyName(l.companyId), l.title, LOI_TYPES[l.loiType]?.label ?? '', LOI_STATUSES[l.status]?.label ?? l.status, l.amount ?? 'Unpriced', VALUE_BASIS[l.valueBasis] ?? '',
      ...Object.keys(PRODUCTS).map((p) => (l.allocations ?? []).filter((a) => a.product === p).reduce((s, a) => s + (Number(a.amount) || 0), 0) || ''),
      unallocated(l) ?? '', l.sentOn, l.signedOn, l.effectiveOn, l.expiresOn, l.signatories, l.binding, l.docUrl, l.draftUrl, l.notes,
    ]);
    downloadFile(`loi-register-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([header, ...rows]), 'text/csv');
  };

  const tile = (label, value, sub, tone) => h('div', { class: `bd-stat${tone ? ` ${tone}` : ''}` },
    h('span', { class: 'muted small' }, label), h('strong', {}, value), sub ? h('span', { class: 'muted small' }, sub) : null);

  const types = { all: 'All types', ...Object.fromEntries(Object.entries(LOI_TYPES).map(([k, t]) => [k, t.label])), ...(lois.all().some((l) => !LOI_TYPES[l.loiType]) ? { none: 'Type not set' } : {}) };
  const statuses = { all: 'All statuses', active: 'Active signed', ...Object.fromEntries(Object.entries(LOI_STATUSES).map(([k, s]) => [k, s.label])) };

  const view = h('div', { class: 'bd-view' },
    h('div', { class: 'bd-stats' },
      tile(`Active signed LOIs${typeName}`, String(totals.signedCount), totals.signedUnpriced ? `${totals.signedUnpriced} unpriced` : 'distinct LOIs', 'good'),
      tile(`Active signed value${typeName}`, money(totals.signedValue), product === 'all' ? 'combined, counted once per LOI' : `${PRODUCTS[product].short} allocations only`),
      tile(`Proposed LOI value${typeName}`, money(totals.proposedValue), `${totals.proposedCount} not yet signed`),
      product === 'all' ? tile('Unallocated signed value', money(totals.unallocatedSigned), 'not yet split by product') : null),
    h('p', { class: 'muted small' }, 'Active signed excludes expired, withdrawn and superseded LOIs. Unpriced LOIs are counted separately, never as $0.'),
    section('Customer vs partnership', null, loiTypeTable(product)),
    h('div', { class: 'bd-toolbar' },
      searchBox(state.loiQuery, 'Search LOIs, companies, signatories…', (v) => { state.loiQuery = v; render(); }),
      selectBox(state.loiType, types, (v) => { state.loiType = v; ctx.refresh(); }, 'Type'),
      selectBox(state.loiStatus, statuses, (v) => { state.loiStatus = v; render(); }, 'Status'),
      button('Export CSV', exportCsv, 'btn ghost'),
      button('+ LOI', () => editLoi(host, null), 'btn primary')),
    list);
  render();
  return view;
}
