// "Export everything as one document": a self-contained, printable report of the
// whole tracker (summary, follow-ups, LOI register, pipelines, company directory).
// It can be printed / saved as PDF, or downloaded as a single .html file.
import { h } from '../../ui.js';
import { currentUser } from '../../cloud.js';
import {
  PRODUCTS, STAGES, LOI_STATUSES, LOI_TYPES, LOI_GOALS, VALUE_BASIS, ACTIVITY_TYPES, DIRECTIONS, OUTCOMES, COMPANY_TYPES, LEAD_SOURCES,
  CONTACT_ROLES, CONTACT_STATUSES, CONTACT_METHOD_TYPES, TASK_STATUSES, SCORE_DIMENSIONS, QUALIFICATION_FACTS, STALE_DAYS,
  CURRENCY,
} from './config.js';
import {
  companies, contacts, opportunities, lois, related, contactName, companyUseCases, contactMethods, contactAffiliations, companyName,
  staleCompanies, overdueTasks, openTasks, loiTotals, loiTotalsByType, companyGoal, loiProducts, unallocated, leadScore, stageGroup, isActiveSigned,
  todayIso, parseIso,
} from './data.js';

const moneyFmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 });
const money = (n, unknown = '—') => (n == null ? unknown : moneyFmt.format(n));
const date = (iso) => (iso ? parseIso(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const dateTime = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const daysAgo = (ms) => Math.floor((Date.now() - ms) / 86400000);
const link = (url, label) => (/^https?:\/\//i.test(url ?? '') ? h('a', { href: url }, label ?? url) : null);
const byName = (a, b) => a.name.localeCompare(b.name);

function table(headers, rows, emptyText = 'None') {
  if (!rows.length) return h('p', { class: 'empty' }, emptyText);
  return h('table', {},
    h('thead', {}, h('tr', {}, ...headers.map((t) => h('th', {}, t)))),
    h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, c ?? ''))))));
}

const facts = (pairs) => h('dl', { class: 'facts' }, ...pairs.filter(([, v]) => v !== '' && v != null && v !== false)
  .flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));

// ---- Sections --------------------------------------------------------------------------
function summary() {
  const all = loiTotals('all');
  const opps = opportunities.all();
  const stat = (label, value, sub) => h('div', { class: 'stat' }, h('span', {}, label), h('strong', {}, value), sub ? h('small', {}, sub) : null);
  return h('section', {},
    h('h2', {}, 'Summary'),
    h('div', { class: 'stats' },
      stat('Companies', String(companies.all().length)),
      stat('Open opportunities', String(opps.filter((o) => stageGroup(o) === 'open').length), `${opps.length} total`),
      stat('Active signed LOIs', String(all.signedCount), `${money(all.signedValue)}${all.signedUnpriced ? ` · ${all.signedUnpriced} unpriced` : ''}`),
      stat('Proposed LOI value', money(all.proposedValue), `${all.proposedCount} not yet signed`),
      stat('Needs follow-up', String(staleCompanies().length), `no update in ${STALE_DAYS}+ days`),
      stat('Overdue follow-ups', String(overdueTasks().length))),
    h('h3', {}, 'By product'),
    table(['Product', 'Opportunities (open / total)', 'Active signed LOIs', 'Signed value (allocated)', 'Proposed value'],
      [...Object.entries(PRODUCTS).map(([key, p]) => {
        const t = loiTotals(key);
        const po = opps.filter((o) => o.product === key);
        return [p.label, `${po.filter((o) => stageGroup(o) === 'open').length} / ${po.length}`, String(t.signedCount), money(t.signedValue), money(t.proposedValue)];
      }),
      ['Unallocated (not yet split by product)', '', '', money(all.unallocatedSigned), ''],
      ['Combined (distinct LOIs, counted once)', `${opps.filter((o) => stageGroup(o) === 'open').length} / ${opps.length}`, String(all.signedCount), money(all.signedValue), money(all.proposedValue)]]),
    h('h3', {}, 'By LOI type'),
    table(['Type', 'Active signed LOIs', 'Signed value', 'Proposed LOIs', 'Proposed value'],
      [...loiTotalsByType('all').map(({ type, totals: t }) => [LOI_TYPES[type]?.label ?? 'Type not set', String(t.signedCount), money(t.signedValue), String(t.proposedCount), money(t.proposedValue)]),
        ['All LOIs', String(all.signedCount), money(all.signedValue), String(all.proposedCount), money(all.proposedValue)]]),
    h('p', { class: 'note' }, 'Active signed excludes expired, withdrawn and superseded LOIs. Unpriced LOIs are counted separately, never as $0. LOIs are non-binding unless noted.'));
}

function followUps() {
  const stale = staleCompanies();
  const due = openTasks().filter((t) => t.dueOn && t.dueOn <= todayIso()).sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  return h('section', {},
    h('h2', {}, 'Follow-ups'),
    h('h3', {}, `Companies with no update in ${STALE_DAYS}+ days`),
    table(['Company', 'Last update'], stale.map(({ company, last }) => [company.name, last ? `${daysAgo(last)} days ago` : 'never']), 'Every company is up to date.'),
    h('h3', {}, 'Due or overdue'),
    table(['Due', 'Follow-up', 'Company', 'Status'], due.map((t) => [date(t.dueOn), t.title, companyName(t.companyId), TASK_STATUSES[t.status] ?? t.status]), 'Nothing due.'));
}

function loiRegister() {
  const rows = lois.all().slice().sort((a, b) => companyName(a.companyId).localeCompare(companyName(b.companyId)));
  return h('section', {},
    h('h2', {}, 'LOI register'),
    table(['Company', 'LOI', 'Type', 'Status', 'Value', 'Basis', 'Allocation', 'Sent', 'Signed', 'Expires', 'Signatories', 'Documents'],
      rows.map((l) => [
        companyName(l.companyId),
        l.title,
        LOI_TYPES[l.loiType]?.short ?? '',
        `${LOI_STATUSES[l.status]?.label ?? l.status}${l.status === 'signed' && !isActiveSigned(l) ? ' (past expiry)' : ''}`,
        money(l.amount, 'Unpriced'),
        VALUE_BASIS[l.valueBasis] ?? '',
        [...(l.allocations ?? []).map((a) => `${PRODUCTS[a.product]?.short ?? a.product} ${money(Number(a.amount))}`),
          (unallocated(l) ?? 0) > 0 && (l.allocations ?? []).length ? `unallocated ${money(unallocated(l))}` : null]
          .filter(Boolean).join(', ') || loiProducts(l).map((p) => PRODUCTS[p]?.short).join(', '),
        date(l.sentOn), date(l.signedOn), date(l.expiresOn), l.signatories,
        h('span', {}, link(l.docUrl, 'Signed'), l.docUrl && l.draftUrl ? ' · ' : '', link(l.draftUrl, 'Draft')),
      ]), 'No LOIs yet.'));
}

function pipelines() {
  return h('section', {},
    h('h2', {}, 'Pipelines'),
    ...Object.entries(PRODUCTS).map(([key, p]) => {
      const opps = opportunities.all().filter((o) => o.product === key)
        .sort((a, b) => Object.keys(STAGES).indexOf(a.stage) - Object.keys(STAGES).indexOf(b.stage));
      return h('div', {},
        h('h3', {}, p.label),
        table(['Company', 'Opportunity', 'Stage', 'Primary use case', 'Score', 'Est. value', 'Expected signing', 'Next step'],
          opps.map((o) => [companyName(o.companyId), o.name, STAGES[o.stage]?.label ?? o.stage, p.useCases[o.primaryUseCase] ?? '',
            leadScore(o).score ?? '', money(o.estimatedValue), date(o.expectedSigning), o.nextStep]),
          'No opportunities.'));
    }));
}

function contactBlock(c, companyId, former) {
  const here = contactAffiliations(c).filter((a) => a.companyId === companyId);
  const role = (former ? here.find((a) => !a.current) : here.find((a) => a.current)) ?? here[0];
  const history = contactAffiliations(c).map((a) => `${companyName(a.companyId)}${a.title ? ` (${a.title})` : ''}${a.start || a.end ? ` ${date(a.start) || '?'} – ${a.current ? 'now' : date(a.end) || '?'}` : a.current ? ' – now' : ''}`);
  return h('li', {},
    h('strong', {}, contactName(c)), role?.title ? ` · ${role.title}` : '', former ? ' (former)' : '',
    c.role ? ` · ${CONTACT_ROLES[c.role] ?? c.role}` : '',
    c.status && c.status !== 'active' ? ` · ${CONTACT_STATUSES[c.status] ?? c.status}` : '',
    h('div', { class: 'sub' }, contactMethods(c).map((m) => `${CONTACT_METHOD_TYPES[m.type] ?? m.type}${m.label ? ` (${m.label})` : ''}: ${m.value}`).join(' · ') || 'No contact details'),
    history.length > 1 ? h('div', { class: 'sub' }, `History: ${history.join('; ')}`) : null);
}

function opportunityBlock(o) {
  const p = PRODUCTS[o.product];
  const { score, known, of } = leadScore(o);
  const details = p ? p.fields.map((f) => [f.label, o.details?.[f.key]]).filter(([, v]) => v !== '' && v != null) : [];
  const qual = Object.entries(QUALIFICATION_FACTS).map(([k, label]) => [label, o.qualification?.[k]]).filter(([, v]) => v);
  return h('div', { class: 'card' },
    h('h5', {}, `${o.name || p?.label} · ${p?.short ?? o.product} · ${STAGES[o.stage]?.label ?? o.stage}`),
    facts([
      ['Primary use case', p?.useCases[o.primaryUseCase] ?? ''],
      ['All use cases', (o.useCases ?? []).map((u) => p?.useCases[u] ?? u).join(', ')],
      ['Estimated value', o.estimatedValue != null ? `${money(o.estimatedValue)} (${VALUE_BASIS[o.valueBasis] ?? ''})` : ''],
      ['Probability', o.probability != null ? `${o.probability}%` : ''],
      ['Expected signing', date(o.expectedSigning)],
      ['Lead score', score != null ? `${score} / 100 (${known} of ${of} known: ${Object.entries(SCORE_DIMENSIONS).map(([k, d]) => `${d.label} ${o.scores?.[k] || '?'}`).join(', ')})` : ''],
      ['Qualification', qual.map(([label, v]) => `${label}: ${v}`).join('; ')],
      ['Blocking capabilities', o.blockingCapabilities],
      ['Fit rationale', o.fitRationale],
      ['Next step', o.nextStep],
      ['Risks', o.risks],
      ['Loss reason', o.lossReason],
      ...details,
      ['Notes', o.notes],
      ['Stage history', (o.stageHistory ?? []).map((e) => `${STAGES[e.to]?.label ?? e.to} ${dateTime(e.at)}`).join(' → ')],
    ]));
}

function companyDirectory() {
  return h('section', {},
    h('h2', {}, 'Company directory'),
    ...companies.all().slice().sort(byName).map((c) => {
      const r = related(c.id);
      const website = c.website ? (c.website.startsWith('http') ? c.website : `https://${c.website}`) : '';
      return h('article', { class: 'company' },
        h('h3', {}, c.name, c.doNotContact ? h('span', { class: 'tag' }, 'Do not contact') : null),
        facts([
          ['Goal', LOI_GOALS[c.loiGoal] ?? companyGoal(c).types.map((t) => `${LOI_TYPES[t].label} (from its LOIs)`).join(', ')], ['Type', c.type ? COMPANY_TYPES[c.type] : ''], ['Industry', c.industry],
          ['Location', [c.headquarters, c.country].filter(Boolean).join(', ')],
          ['Website', website ? link(website, c.website) : ''], ['Email', c.email], ['Phone', c.phone],
          ['Lead source', c.leadSource ? LEAD_SOURCES[c.leadSource] : ''], ['Introduced by', c.introducedBy],
          ['Use cases', companyUseCases(c).map(([product, label]) => `${PRODUCTS[product]?.short ?? product}: ${label}`).join('; ')],
          ['Aliases', c.aliases], ['Tags', c.tags], ['Notes', c.notes],
        ]),
        h('h4', {}, 'Contacts'),
        r.contacts.length || r.formerContacts.length
          ? h('ul', {}, ...r.contacts.map((x) => contactBlock(x, c.id, false)), ...r.formerContacts.map((x) => contactBlock(x, c.id, true)))
          : h('p', { class: 'empty' }, 'None'),
        h('h4', {}, 'Opportunities'),
        r.opportunities.length ? h('div', {}, ...r.opportunities.map(opportunityBlock)) : h('p', { class: 'empty' }, 'None'),
        h('h4', {}, 'LOIs'),
        table(['LOI', 'Type', 'Status', 'Value', 'Signed', 'Expires', 'Binding', 'Legal notes', 'Notes'],
          r.lois.map((l) => [l.title, LOI_TYPES[l.loiType]?.short ?? '', LOI_STATUSES[l.status]?.label ?? l.status, money(l.amount, 'Unpriced'), date(l.signedOn), date(l.expiresOn),
            l.binding ? l.binding.replace('_', '-') : '', l.legalNotes, l.notes])),
        h('h4', {}, 'Follow-ups'),
        table(['Due', 'Follow-up', 'Status', 'Notes'], r.tasks.slice().sort((a, b) => (a.dueOn || '9').localeCompare(b.dueOn || '9'))
          .map((t) => [date(t.dueOn), t.title, TASK_STATUSES[t.status] ?? t.status, t.notes])),
        h('h4', {}, 'Activity timeline'),
        table(['When', 'Type', 'Direction', 'Subject', 'Outcome', 'People', 'Summary'],
          r.activities.map((a) => [dateTime(a.occurredAt), ACTIVITY_TYPES[a.type] ?? a.type, DIRECTIONS[a.direction] ?? '', a.subject,
            OUTCOMES[a.outcome] && a.outcome ? OUTCOMES[a.outcome] : '',
            (a.contactIds ?? []).map((id) => contacts.get(id)).filter(Boolean).map(contactName).join(', '),
            a.summary])));
    }));
}

const STYLES = `
  :root { color-scheme: light; }
  body { font: 13px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111827; margin: 0 auto; max-width: 1100px; padding: 32px 28px; background: #fff; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 19px; margin: 32px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #111827; break-after: avoid; }
  h3 { font-size: 15px; margin: 20px 0 8px; break-after: avoid; }
  h4 { font-size: 12px; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .05em; color: #4b5563; break-after: avoid; }
  h5 { font-size: 13px; margin: 0 0 6px; }
  .meta, .note, .empty, .sub { color: #4b5563; }
  .note { font-size: 12px; }
  .sub { font-size: 12px; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .stat { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; display: grid; }
  .stat span, .stat small { color: #4b5563; font-size: 12px; }
  .stat strong { font-size: 18px; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 8px; font-size: 12px; }
  th { text-align: left; background: #f3f4f6; font-weight: 600; }
  th, td { border: 1px solid #e5e7eb; padding: 5px 7px; vertical-align: top; }
  tr { break-inside: avoid; }
  ul { margin: 4px 0; padding-left: 18px; }
  li { margin-bottom: 4px; }
  .company { break-before: page; }
  .company:first-of-type { break-before: auto; }
  .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; break-inside: avoid; }
  .facts { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 0; }
  .facts dt { color: #4b5563; }
  .facts dd { margin: 0; white-space: pre-wrap; }
  .tag { font-size: 11px; margin-left: 8px; padding: 1px 8px; border-radius: 999px; background: #fee2e2; color: #b91c1c; vertical-align: middle; }
  a { color: #1d4ed8; }
  @page { margin: 14mm; }
  @media print { body { padding: 0; } a { color: inherit; } }
`;

export function buildReport() {
  const generated = new Date();
  const body = h('body', {},
    h('header', {},
      h('h1', {}, 'Astra Retrieval · Business development report'),
      h('p', { class: 'meta' }, `Generated ${generated.toLocaleString()}${currentUser()?.email ? ` by ${currentUser().email}` : ''} · all products · confidential`)),
    summary(),
    followUps(),
    loiRegister(),
    pipelines(),
    companyDirectory());
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Astra Retrieval report ${todayIso()}</title><style>${STYLES}</style></head>
${body.outerHTML}</html>`;
}

// Opens the system print dialog, where "Save as PDF" is available.
export function printReport() {
  const frame = h('iframe', { title: 'Report', style: 'position:fixed;width:0;height:0;border:0;right:0;bottom:0' });
  frame.srcdoc = buildReport();
  frame.addEventListener('load', () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 60000);
  });
  document.body.append(frame);
}

export const reportFileName = () => `astra-retrieval-report-${todayIso()}.html`;
