// Overview: follow-up reminders, due tasks, headline numbers, pipeline and LOI value.
import { h } from '../../../ui.js';
import { PRODUCTS, STAGES, STALE_DAYS, EXPIRY_ALERT_DAYS, ACTIVITY_TYPES } from '../config.js';
import {
  companies, opportunities, lois, activities, staleCompanies, overdueTasks, openTasks, todayIso, loiTotals, loiValueFor,
  isActiveSigned, companyName, daysUntil, stageGroup,
} from '../data.js';
import { logActivity, completeTask } from '../editors.js';
import { money, ago, section, empty, button, fmtDate, pill, productChip } from './common.js';

export function overview(ctx) {
  const { product } = ctx;
  const inProduct = (o) => product === 'all' || o.product === product;
  const opps = opportunities.all().filter(inProduct);
  const totals = loiTotals(product);

  // ---- Needs follow-up (the 5-day reminder) ----
  const stale = staleCompanies().filter(({ company }) => product === 'all' || opps.some((o) => o.companyId === company.id));
  const reminder = section(`Needs follow-up · no update in ${STALE_DAYS}+ days`, null,
    stale.length
      ? h('ul', { class: 'bd-rows' }, ...stale.map(({ company, last }) => {
        const lastActivity = activities.all().filter((a) => a.companyId === company.id).sort((a, b) => b.occurredAt - a.occurredAt)[0];
        return h('li', { class: 'bd-row stale' },
          h('button', { class: 'bd-row-main', onclick: () => ctx.go('company', { companyId: company.id }) },
            h('strong', {}, company.name),
            h('span', { class: 'muted small' }, `Last update ${ago(last)}${lastActivity ? ` · last activity: ${ACTIVITY_TYPES[lastActivity.type] ?? lastActivity.type}` : ' · no activity logged'}`)),
          button('Log activity', () => logActivity(ctx.host, null, { companyId: company.id }), 'btn ghost'));
      }))
      : empty(companies.all().length ? `Every company has been updated in the last ${STALE_DAYS} days (or has a signed LOI).` : 'Add companies to start tracking follow-ups.'));
  reminder.classList.toggle('bd-alert', stale.length > 0);

  // ---- Follow-ups due ----
  const due = openTasks().filter((t) => t.dueOn && t.dueOn <= todayIso()).sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const dueSection = section(`Follow-ups due (${due.length})`, button('All follow-ups', () => ctx.go('followups'), 'btn ghost'),
    due.length
      ? h('ul', { class: 'bd-rows' }, ...due.slice(0, 8).map((t) => h('li', { class: 'bd-row' },
        h('input', { type: 'checkbox', 'aria-label': `Complete ${t.title}`, onchange: () => completeTask(t) }),
        h('button', { class: 'bd-row-main', onclick: () => ctx.go('company', { companyId: t.companyId }) },
          h('strong', {}, t.title), h('span', { class: 'muted small' }, companyName(t.companyId))),
        t.dueOn < todayIso() ? pill(`Overdue · ${fmtDate(t.dueOn)}`, 'bad') : pill('Today', 'warn'))))
      : empty('Nothing due today.'));

  // ---- Headline numbers ----
  const companyIds = new Set(opps.map((o) => o.companyId));
  const expiring = lois.all().filter((l) => isActiveSigned(l) && l.expiresOn && daysUntil(l.expiresOn) <= EXPIRY_ALERT_DAYS[0]);
  const tile = (label, value, sub, tone) => h('div', { class: `bd-stat${tone ? ` ${tone}` : ''}` },
    h('span', { class: 'muted small' }, label), h('strong', {}, value), sub ? h('span', { class: 'muted small' }, sub) : null);
  const stats = h('div', { class: 'bd-stats' },
    tile(product === 'all' ? 'Companies' : 'Companies in pipeline', String(product === 'all' ? companies.all().length : companyIds.size),
      product === 'all' ? `${companyIds.size} with opportunities` : null),
    tile('Open opportunities', String(opps.filter((o) => stageGroup(o) === 'open').length), `${opps.length} total`),
    tile('Active signed LOIs', String(totals.signedCount), `${money(totals.signedValue)}${totals.signedUnpriced ? ` · ${totals.signedUnpriced} unpriced` : ''}`, 'good'),
    tile('Proposed LOI value', money(totals.proposedValue), `${totals.proposedCount} under negotiation`),
    tile('Overdue follow-ups', String(overdueTasks().length), null, overdueTasks().length ? 'bad' : ''),
    tile(`Expiring in ${EXPIRY_ALERT_DAYS[0]} days`, String(expiring.length), null, expiring.length ? 'warn' : ''));

  // ---- Pipeline by stage (opportunities vs unique companies) ----
  const countBy = ctx.state.countBy ?? 'opportunities';
  const rows = Object.entries(STAGES).map(([key, stage]) => {
    const inStage = opps.filter((o) => o.stage === key);
    const n = countBy === 'companies' ? new Set(inStage.map((o) => o.companyId)).size : inStage.length;
    return { key, label: stage.label, n };
  });
  const max = Math.max(1, ...rows.map((r) => r.n));
  const pipeline = section('Pipeline by stage',
    h('div', { class: 'seg' },
      ...[['opportunities', 'Opportunities'], ['companies', 'Unique companies']].map(([k, label]) =>
        h('button', { class: countBy === k ? 'on' : '', onclick: () => { ctx.state.countBy = k; ctx.refresh(); } }, label))),
    opps.length
      ? h('div', { class: 'bd-bars' }, ...rows.map((r) => h('button', {
        class: 'bd-bar-row',
        onclick: () => { ctx.state.pipelineStage = r.key; ctx.go('pipeline'); },
      },
      h('span', { class: 'bd-bar-label' }, r.label),
      h('span', { class: 'bd-bar-track' }, h('span', { class: 'bd-bar', style: `width:${(r.n / max) * 100}%` })),
      h('span', { class: 'bd-bar-n' }, String(r.n)))))
      : empty('No opportunities yet.'));

  // ---- Signed LOI value by product (combined view only) ----
  const byProduct = product === 'all' && totals.signedCount
    ? section('Active signed LOI value by product', null,
      h('table', { class: 'bd-table' },
        h('tbody', {},
          ...Object.keys(PRODUCTS).map((p) => {
            const t = loiTotals(p);
            return h('tr', {}, h('td', {}, productChip(p)), h('td', { class: 'num' }, money(t.signedValue)), h('td', { class: 'muted small' }, `${t.signedCount} LOIs`));
          }),
          h('tr', {}, h('td', { class: 'muted' }, 'Unallocated'), h('td', { class: 'num' }, money(totals.unallocatedSigned)), h('td', {})),
          h('tr', { class: 'total' }, h('td', {}, 'Combined (distinct LOIs)'), h('td', { class: 'num' }, money(totals.signedValue)), h('td', { class: 'muted small' }, `${totals.signedCount} LOIs`)))),
      h('p', { class: 'muted small' }, 'Product rows use each LOI\'s allocations; value not yet split by product is shown as unallocated and only counted once in the combined total.'))
    : null;

  // ---- Expiring signed LOIs ----
  const expiringSection = expiring.length
    ? section('Signed LOIs expiring soon', null, h('ul', { class: 'bd-rows' }, ...expiring.sort((a, b) => a.expiresOn.localeCompare(b.expiresOn)).map((l) => {
      const days = daysUntil(l.expiresOn);
      return h('li', { class: 'bd-row' },
        h('button', { class: 'bd-row-main', onclick: () => ctx.go('company', { companyId: l.companyId }) },
          h('strong', {}, l.title || companyName(l.companyId)), h('span', { class: 'muted small' }, `${companyName(l.companyId)} · ${money(loiValueFor(l, 'all'), 'Unpriced')}`)),
        pill(days < 0 ? 'Expired' : `Expires in ${days}d`, days <= EXPIRY_ALERT_DAYS[2] ? 'bad' : days <= EXPIRY_ALERT_DAYS[1] ? 'warn' : 'info'));
    })))
    : null;

  return h('div', { class: 'bd-view bd-overview' }, reminder, dueSection, stats, pipeline, byProduct, expiringSection);
}
