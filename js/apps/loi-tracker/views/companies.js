// Companies list and the company page (contacts, opportunities, LOIs, follow-ups, timeline).
import { h } from '../../../ui.js';
import {
  PRODUCTS, STAGES, LOI_STATUSES, ACTIVITY_TYPES, DIRECTIONS, OUTCOMES, COMPANY_TYPES, LEAD_SOURCES, CONTACT_ROLES,
  CONTACT_STATUSES, VALUE_BASIS, STALE_DAYS,
} from '../config.js';
import {
  companies, related, lastTouch, hasSignedLoi, contactName, opportunities, contacts, isActiveSigned, todayIso,
} from '../data.js';
import {
  editCompany, editContact, editOpportunity, logActivity, editTask, editLoi, completeTask,
} from '../editors.js';
import {
  money, ago, pill, productChip, section, empty, button, searchBox, selectBox, matches, fmtDate, fmtDateTime, extLink,
} from './common.js';

const VIEWS = {
  all: 'All companies',
  stale: `Needs follow-up (${STALE_DAYS}+ days)`,
  never: 'Never contacted',
  active: 'In conversation or later',
  signed: 'Signed LOIs',
  dnc: 'Do not contact',
};

const CONVERSATION_STAGES = ['in_conversation', 'qualified', 'loi_discussion', 'loi_negotiating', 'loi_signed', 'contracted'];

export function companyList(ctx) {
  const { state, product } = ctx;
  state.companyQuery ??= '';
  state.companyView ??= 'all';
  const list = h('ul', { class: 'bd-rows' });

  const renderList = () => {
    const staleCutoff = Date.now() - STALE_DAYS * 86400000;
    const rows = companies.all()
      .map((c) => ({ c, r: related(c.id), last: lastTouch(c.id) }))
      .filter(({ r }) => product === 'all' || r.opportunities.some((o) => o.product === product))
      .filter(({ c, r }) => matches(state.companyQuery, c.name, c.aliases, c.tags, c.industry, c.country, ...r.contacts.flatMap((x) => [contactName(x), x.email])))
      .filter(({ c, r, last }) => ({
        all: true,
        stale: !c.doNotContact && !hasSignedLoi(c.id) && last < staleCutoff,
        never: r.activities.length === 0,
        active: r.opportunities.some((o) => CONVERSATION_STAGES.includes(o.stage)),
        signed: hasSignedLoi(c.id),
        dnc: c.doNotContact,
      })[state.companyView])
      .sort((a, b) => a.c.name.localeCompare(b.c.name));

    list.replaceChildren(...(rows.length ? rows.map(({ c, r, last }) => {
      const productsHere = [...new Set(r.opportunities.map((o) => o.product))];
      const nextTask = r.tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled' && t.dueOn).sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0];
      const signed = r.lois.filter(isActiveSigned).length;
      const stale = !c.doNotContact && !hasSignedLoi(c.id) && last < staleCutoff;
      return h('li', { class: 'bd-row' },
        h('button', { class: 'bd-row-main', onclick: () => ctx.go('company', { companyId: c.id }) },
          h('strong', {}, c.name, c.doNotContact ? h('span', { class: 'muted small' }, ' · do not contact') : null),
          h('span', { class: 'muted small' }, [
            `${r.contacts.length} contact${r.contacts.length === 1 ? '' : 's'}`,
            `${r.opportunities.length} opportunit${r.opportunities.length === 1 ? 'y' : 'ies'}`,
            nextTask ? `next: ${nextTask.title} (${fmtDate(nextTask.dueOn)})` : null,
          ].filter(Boolean).join(' · '))),
        h('div', { class: 'bd-row-meta' },
          ...productsHere.map(productChip),
          signed ? pill(`${signed} signed LOI${signed === 1 ? '' : 's'}`, 'good') : null,
          pill(`Updated ${ago(last)}`, stale ? 'bad' : 'neutral')));
    }) : [h('li', {}, empty(companies.all().length ? 'No companies match.' : 'No companies yet. Add your first prospect.'))]));
  };

  const view = h('div', { class: 'bd-view' },
    h('div', { class: 'bd-toolbar' },
      searchBox(state.companyQuery, 'Search companies, contacts, tags…', (v) => { state.companyQuery = v; renderList(); }),
      selectBox(state.companyView, VIEWS, (v) => { state.companyView = v; renderList(); }, 'Saved view'),
      button('+ Company', () => editCompany(ctx.host, null, { onSaved: (c) => ctx.go('company', { companyId: c.id }) }), 'btn primary')),
    list);
  renderList();
  return view;
}

// ---- Company page -------------------------------------------------------------------
export function companyPage(ctx) {
  const company = companies.get(ctx.state.companyId);
  if (!company) { ctx.go('companies'); return h('div'); }
  const r = related(company.id);
  const last = lastTouch(company.id);
  const stale = !company.doNotContact && !hasSignedLoi(company.id) && last < Date.now() - STALE_DAYS * 86400000;
  const host = ctx.host;
  const add = (label, fn) => button(label, fn, 'btn ghost');

  const facts = [
    COMPANY_TYPES[company.type] && company.type ? COMPANY_TYPES[company.type] : null,
    company.industry,
    [company.headquarters, company.country].filter(Boolean).join(', '),
    company.leadSource ? `Source: ${LEAD_SOURCES[company.leadSource] ?? company.leadSource}` : null,
    company.introducedBy ? `Introduced by ${company.introducedBy}` : null,
  ].filter(Boolean);
  const website = company.website ? (company.website.startsWith('http') ? company.website : `https://${company.website}`) : '';

  const header = h('div', { class: 'bd-company-head' },
    h('div', {},
      h('button', { class: 'btn ghost bd-back', onclick: () => ctx.go('companies') }, '‹ Companies'),
      h('h2', {}, company.name),
      h('p', { class: 'muted small' }, facts.join(' · ') || 'No profile details yet'),
      h('div', { class: 'bd-row-meta' },
        website ? extLink(website, company.website) : null,
        company.email ? h('a', { class: 'bd-link', href: `mailto:${company.email}` }, company.email) : null,
        company.doNotContact ? pill('Do not contact', 'bad') : null,
        hasSignedLoi(company.id) ? pill('LOI signed', 'good') : stale ? pill(`No update in ${Math.floor((Date.now() - last) / 86400000)} days`, 'bad') : pill(`Updated ${ago(last)}`))),
    h('div', { class: 'bd-company-actions' },
      button('Log activity', () => logActivity(host, null, { companyId: company.id }), 'btn primary'),
      button('Edit', () => editCompany(host, company, { onDeleted: () => ctx.go('companies') })))) ;

  const contactsSection = section('Contacts', add('+ Contact', () => editContact(host, null, { companyId: company.id })),
    r.contacts.length ? h('ul', { class: 'bd-rows' }, ...r.contacts.map((c) => h('li', { class: 'bd-row' },
      h('button', { class: 'bd-row-main', onclick: () => editContact(host, c) },
        h('strong', {}, contactName(c), c.title ? h('span', { class: 'muted' }, ` · ${c.title}`) : null),
        h('span', { class: 'muted small' }, [c.email, c.phone].filter(Boolean).join(' · ') || 'No contact details')),
      h('div', { class: 'bd-row-meta' },
        c.role ? pill(CONTACT_ROLES[c.role] ?? c.role, 'info') : null,
        c.status && c.status !== 'active' ? pill(CONTACT_STATUSES[c.status] ?? c.status, 'warn') : null,
        c.email ? h('a', { class: 'bd-link', href: `mailto:${c.email}` }, 'Email') : null,
        extLink(c.linkedin, 'LinkedIn')))))
      : empty('No contacts yet.'));

  const oppSection = section('Opportunities', add('+ Opportunity', () => editOpportunity(host, null, { companyId: company.id, product: ctx.product })),
    r.opportunities.length ? h('ul', { class: 'bd-rows' }, ...r.opportunities.map((o) => h('li', { class: 'bd-row' },
      h('button', { class: 'bd-row-main', onclick: () => editOpportunity(host, o) },
        h('strong', {}, o.name || PRODUCTS[o.product]?.label),
        h('span', { class: 'muted small' }, [
          PRODUCTS[o.product]?.useCases[o.primaryUseCase],
          o.nextStep ? `Next: ${o.nextStep}` : null,
        ].filter(Boolean).join(' · ') || 'No use case yet')),
      h('div', { class: 'bd-row-meta' },
        productChip(o.product),
        pill(STAGES[o.stage]?.label ?? o.stage, o.stage === 'lost' ? 'bad' : ['loi_signed', 'contracted'].includes(o.stage) ? 'good' : 'info'),
        h('span', { class: 'bd-num' }, money(o.estimatedValue)))))) : empty('No opportunities yet. One company can have opportunities in several products.'));

  const loiSection = section('LOIs', add('+ LOI', () => editLoi(host, null, { companyId: company.id })),
    r.lois.length ? h('ul', { class: 'bd-rows' }, ...r.lois.map((l) => h('li', { class: 'bd-row' },
      h('button', { class: 'bd-row-main', onclick: () => editLoi(host, l) },
        h('strong', {}, l.title || 'LOI'),
        h('span', { class: 'muted small' }, [
          l.signedOn ? `Signed ${fmtDate(l.signedOn)}` : l.sentOn ? `Sent ${fmtDate(l.sentOn)}` : null,
          l.expiresOn ? `Expires ${fmtDate(l.expiresOn)}` : null,
        ].filter(Boolean).join(' · ') || ' ')),
      h('div', { class: 'bd-row-meta' },
        pill(LOI_STATUSES[l.status]?.label ?? l.status, LOI_STATUSES[l.status]?.tone),
        h('span', { class: 'bd-num' }, money(l.amount, 'Unpriced')),
        l.valueBasis && l.valueBasis !== 'total' ? h('span', { class: 'muted small' }, VALUE_BASIS[l.valueBasis]) : null,
        extLink(l.docUrl, 'Signed ↗'), extLink(l.draftUrl, 'Draft ↗'))))) : empty('No LOIs yet.'));

  const openTasks = r.tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').sort((a, b) => (a.dueOn || '9').localeCompare(b.dueOn || '9'));
  const taskSection = section('Follow-ups', add('+ Follow-up', () => editTask(host, null, { companyId: company.id })),
    openTasks.length ? h('ul', { class: 'bd-rows' }, ...openTasks.map((t) => h('li', { class: 'bd-row' },
      h('input', { type: 'checkbox', 'aria-label': `Complete ${t.title}`, onchange: () => completeTask(t) }),
      h('button', { class: 'bd-row-main', onclick: () => editTask(host, t) }, h('strong', {}, t.title)),
      t.dueOn ? pill(fmtDate(t.dueOn), t.dueOn < todayIso() ? 'bad' : t.dueOn === todayIso() ? 'warn' : 'neutral') : null))) : empty('No open follow-ups.'));

  const timeline = section('Activity timeline', add('+ Log activity', () => logActivity(host, null, { companyId: company.id })),
    r.activities.length ? h('ol', { class: 'bd-timeline' }, ...r.activities.map((a) => activityItem(host, a, false))) : empty('Nothing logged yet. Log your first outreach.'));

  const notes = company.notes ? section('Notes', null, h('p', { class: 'bd-notes' }, company.notes)) : null;

  return h('div', { class: 'bd-view bd-company' }, header,
    h('div', { class: 'bd-company-grid' },
      h('div', {}, oppSection, loiSection, timeline),
      h('div', {}, taskSection, contactsSection, notes)));
}

// One entry in an activity timeline (also used by the global Activity view).
export function activityItem(host, a, showCompany, companyLabel) {
  const people = (a.contactIds ?? []).map((id) => contacts.get(id)).filter(Boolean).map(contactName);
  const opps = (a.opportunityIds ?? []).map((id) => opportunities.get(id)).filter(Boolean);
  return h('li', { class: `bd-activity ${a.direction}` },
    h('button', { class: 'bd-activity-body', onclick: () => logActivity(host, a) },
      h('div', { class: 'bd-activity-head' },
        h('strong', {}, ACTIVITY_TYPES[a.type] ?? a.type),
        showCompany ? h('span', {}, ` · ${companyLabel}`) : null,
        h('span', { class: 'muted small' }, ` · ${DIRECTIONS[a.direction] ?? ''} · ${fmtDateTime(a.occurredAt)}`)),
      a.subject ? h('div', {}, a.subject) : null,
      a.summary ? h('div', { class: 'muted small bd-clamp' }, a.summary) : null,
      h('div', { class: 'bd-row-meta' },
        a.outcome ? pill(OUTCOMES[a.outcome] ?? a.outcome, 'info') : null,
        ...opps.map((o) => productChip(o.product)),
        people.length ? h('span', { class: 'muted small' }, people.join(', ')) : null)),
    extLink(a.link, 'Open link ↗'));
}
