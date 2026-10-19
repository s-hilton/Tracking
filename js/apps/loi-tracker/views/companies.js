// Companies list and the company page (contacts, opportunities, LOIs, follow-ups, timeline).
import { h } from '../../../ui.js';
import {
  PRODUCTS, STAGES, LOI_STATUSES, ACTIVITY_TYPES, DIRECTIONS, OUTCOMES, COMPANY_TYPES, LEAD_SOURCES, CONTACT_ROLES,
  CONTACT_STATUSES, VALUE_BASIS, STALE_DAYS, STRONG_FIT_SCORE, PRIORITIES, COMPANY_USE_CASE_PRODUCTS,
} from '../config.js';
import {
  companies, related, lastTouch, hasSignedLoi, contactName, opportunities, contacts, isActiveSigned, todayIso,
  contactMethods, contactAffiliations, currentAffiliation, leadScore, stageGroup, companyUseCases,
} from '../data.js';
import { scorePill } from './analytics.js';
import {
  editCompany, editContact, editOpportunity, logActivity, editTask, editLoi, completeTask, reopenTask,
} from '../editors.js';
import {
  money, ago, pill, productChip, section, empty, button, searchBox, selectBox, matches, fmtDate, fmtDateTime, extLink,
} from './common.js';

const VIEWS = {
  all: 'All companies',
  stale: `Needs follow-up (${STALE_DAYS}+ days)`,
  never: 'Never contacted',
  active: 'In conversation or later',
  strong: `Strong fit (score ${STRONG_FIT_SCORE}+), no outreach yet`,
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
      .filter(({ c, r }) => product === 'all' || r.opportunities.some((o) => o.product === product) || c.useCases?.[product]?.length)
      .filter(({ c, r }) => matches(state.companyQuery, c.name, c.aliases, c.tags, c.industry, c.country, ...companyUseCases(c).map(([, label]) => label),
        ...[...r.contacts, ...r.formerContacts].flatMap((x) => [contactName(x), ...contactMethods(x).map((m) => m.value)])))
      .filter(({ c, r, last }) => ({
        all: true,
        stale: !c.doNotContact && !hasSignedLoi(c.id) && last < staleCutoff,
        never: r.activities.length === 0,
        active: r.opportunities.some((o) => CONVERSATION_STAGES.includes(o.stage)),
        strong: !r.activities.some((a) => a.direction === 'outbound')
          && r.opportunities.some((o) => stageGroup(o) === 'open' && (leadScore(o).score ?? 0) >= STRONG_FIT_SCORE),
        signed: hasSignedLoi(c.id),
        dnc: c.doNotContact,
      })[state.companyView])
      .sort((a, b) => a.c.name.localeCompare(b.c.name));

    list.replaceChildren(...(rows.length ? rows.map(({ c, r, last }) => {
      const productsHere = [...new Set([...r.opportunities.map((o) => o.product), ...companyUseCases(c).map(([p]) => p)])];
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

  const contactRow = (c, former) => {
    const methods = contactMethods(c);
    const email = methods.find((m) => m.type === 'email')?.value;
    const linkedin = methods.find((m) => m.type === 'linkedin')?.value;
    const here = contactAffiliations(c).filter((a) => a.companyId === company.id);
    const role = (former ? here.find((a) => !a.current) : here.find((a) => a.current)) ?? here[0];
    const now = former ? currentAffiliation(c) : null;
    return h('li', { class: `bd-row${former ? ' faded' : ''}` },
      h('button', { class: 'bd-row-main', onclick: () => editContact(host, c) },
        h('strong', {}, contactName(c), role?.title ? h('span', { class: 'muted' }, ` · ${role.title}`) : null),
        h('span', { class: 'muted small' }, former
          ? [role?.end ? `Left ${fmtDate(role.end)}` : 'Former', now ? `now at ${companies.get(now.companyId)?.name ?? 'another company'}` : null].filter(Boolean).join(' · ')
          : [methods[0]?.value, methods.length > 1 ? `+${methods.length - 1} more` : null].filter(Boolean).join(' · ') || 'No contact details')),
      h('div', { class: 'bd-row-meta' },
        c.role ? pill(CONTACT_ROLES[c.role] ?? c.role, 'info') : null,
        c.status && c.status !== 'active' ? pill(CONTACT_STATUSES[c.status] ?? c.status, 'warn') : null,
        email && !former ? h('a', { class: 'bd-link', href: `mailto:${email}` }, 'Email') : null,
        linkedin && !former ? extLink(linkedin.startsWith('http') ? linkedin : `https://${linkedin}`, 'LinkedIn') : null));
  };
  const contactsSection = section('Contacts', add('+ Contact', () => editContact(host, null, { companyId: company.id })),
    r.contacts.length ? h('ul', { class: 'bd-rows' }, ...r.contacts.map((c) => contactRow(c, false))) : empty('No contacts yet.'),
    r.formerContacts.length ? h('details', { class: 'bd-former' },
      h('summary', { class: 'muted small' }, `Former contacts (${r.formerContacts.length})`),
      h('ul', { class: 'bd-rows' }, ...r.formerContacts.map((c) => contactRow(c, true)))) : null);

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
        scorePill(leadScore(o).score),
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
  const doneTasks = r.tasks.filter((t) => t.status === 'completed').sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)).slice(0, 5);
  const taskRow = (t) => {
    const done = t.status === 'completed';
    return h('li', { class: `bd-row${done ? ' faded' : ''}` },
      h('input', { type: 'checkbox', checked: done, 'aria-label': `${done ? 'Reopen' : 'Complete'} ${t.title}`, onchange: () => (done ? reopenTask(t) : completeTask(t)) }),
      h('button', { class: 'bd-row-main', onclick: () => editTask(host, t) },
        h('strong', {}, t.title),
        t.notes ? h('span', { class: 'muted small' }, t.notes) : null),
      h('div', { class: 'bd-row-meta' },
        !done && t.priority === 'high' ? pill(PRIORITIES.high, 'bad') : null,
        done ? h('span', { class: 'muted small' }, 'Done')
          : t.dueOn ? pill(fmtDate(t.dueOn), t.dueOn < todayIso() ? 'bad' : t.dueOn === todayIso() ? 'warn' : 'neutral') : null));
  };
  const taskSection = section('Follow-ups', add('+ Follow-up', () => editTask(host, null, { companyId: company.id })),
    openTasks.length ? h('ul', { class: 'bd-rows' }, ...openTasks.map(taskRow)) : empty('No open follow-ups.'),
    doneTasks.length ? h('ul', { class: 'bd-rows' }, ...doneTasks.map(taskRow)) : null);

  const timeline = section('Activity timeline', add('+ Log activity', () => logActivity(host, null, { companyId: company.id })),
    r.activities.length ? h('ol', { class: 'bd-timeline' }, ...r.activities.map((a) => activityItem(host, a, false))) : empty('Nothing logged yet. Log your first outreach.'));

  const tagged = companyUseCases(company);
  const useCaseSection = section('Use cases', add('Edit', () => editCompany(host, company)),
    tagged.length ? h('ul', { class: 'bd-rows' }, ...COMPANY_USE_CASE_PRODUCTS.flatMap((key) => {
      const labels = tagged.filter(([p]) => p === key).map(([, label]) => label);
      return labels.length ? [h('li', { class: 'bd-row bd-usecases' }, productChip(key), h('span', {}, labels.join(' · ')))] : [];
    })) : empty(`No ${COMPANY_USE_CASE_PRODUCTS.map((k) => PRODUCTS[k].short.toLowerCase()).join(' or ')} use cases tagged yet.`));

  const notes = company.notes ? section('Notes', null, h('p', { class: 'bd-notes' }, company.notes)) : null;

  return h('div', { class: 'bd-view bd-company' }, header,
    h('div', { class: 'bd-company-grid' },
      h('div', {}, oppSection, loiSection, timeline),
      h('div', {}, taskSection, useCaseSection, contactsSection, notes)));
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
