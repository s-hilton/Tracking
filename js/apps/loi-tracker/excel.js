// "Export → Excel workbook": every record in the tracker, one sheet per kind
// (Companies, Contacts, Opportunities, LOIs, Activities, Follow-ups), with labels
// instead of internal keys, real dates and numbers, and links that open.
import {
  PRODUCTS, STAGES, LOI_STATUSES, LOI_TYPES, VALUE_BASIS, ACTIVITY_TYPES, DIRECTIONS, OUTCOMES, COMPANY_TYPES, LEAD_SOURCES,
  CONTACT_ROLES, CONTACT_STATUSES, CONTACT_METHOD_TYPES, PRIORITIES, TASK_STATUSES, USE_CASE_SOURCES, SCORE_DIMENSIONS,
  QUALIFICATION_FACTS, CURRENCY,
} from './config.js';
import {
  companies, contacts, opportunities, activities, tasks, lois, companyName, contactName, companyUseCases, contactMethods,
  currentAffiliation, contactAffiliations, leadScore, lastTouch, unallocated, todayIso,
} from './data.js';
import { buildXlsx } from './xlsx.js';
import { downloadFile } from './views/common.js';

const label = (map, key) => (key ? (typeof map[key] === 'string' ? map[key] : map[key]?.label) ?? key : '');
const date = (iso) => (iso ? { date: iso } : '');
const dateTime = (ms) => (ms ? { dateTime: ms } : '');
const money = (n) => (n == null || n === '' ? '' : { money: n });
const link = (url) => (url ? { url: /^https?:\/\//i.test(url) ? url : `https://${url}`, text: url } : '');
const product = (key) => PRODUCTS[key]?.label ?? key ?? '';
const contactsNamed = (ids) => (ids ?? []).map((id) => contacts.get(id)).filter(Boolean).map(contactName).join(', ');
const oppName = (o) => o.name || `${PRODUCTS[o.product]?.short ?? o.product} opportunity`;
const oppsNamed = (ids) => (ids ?? []).map((id) => opportunities.get(id)).filter(Boolean).map(oppName).join(', ');
const yesNo = (v) => ({ yes: 'Yes', no: 'No' }[v] ?? '');
const byCompany = (a, b) => companyName(a.companyId).localeCompare(companyName(b.companyId));
const col = (header, width) => ({ header, width });

function companiesSheet() {
  return {
    name: 'Companies',
    columns: [col('Name', 28), col('Use cases (products)', 40), col('Type', 20), col('Industry', 18), col('Headquarters', 18),
      col('Country', 14), col('Website', 26), col('General email', 26), col('Phone', 16), col('LinkedIn', 26),
      col('Lead source', 18), col('Introduced by', 18), col('Tags', 20), col('Do not contact', 12), col('Last update', 18),
      col('Notes', 50), col('Created', 18)],
    rows: companies.all().slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => [
      c.name, companyUseCases(c).map(product).join(', '), label(COMPANY_TYPES, c.type), c.industry, c.headquarters, c.country,
      link(c.website), c.email, c.phone, link(c.linkedin), label(LEAD_SOURCES, c.leadSource), c.introducedBy, c.tags,
      Boolean(c.doNotContact), dateTime(lastTouch(c.id)), c.notes, dateTime(c.created),
    ]),
  };
}

function contactsSheet() {
  const methods = (c, type) => contactMethods(c).filter((m) => m.type === type).map((m) => m.value).join(', ');
  return {
    name: 'Contacts',
    columns: [col('Name', 24), col('Company', 26), col('Title', 22), col('Department', 16), col('Email', 28), col('Phone', 16),
      col('LinkedIn', 26), col('Other contact methods', 28), col('Relationship', 18), col('Status', 14), col('Preferred channel', 16),
      col('Time zone', 12), col('Introduced by', 18), col('Previous companies', 30), col('Notes', 50)],
    rows: contacts.all().slice().sort((a, b) => contactName(a).localeCompare(contactName(b))).map((c) => {
      const now = currentAffiliation(c);
      return [
        contactName(c), now ? companyName(now.companyId) : '', now?.title ?? c.title, now?.department ?? c.department,
        methods(c, 'email'), methods(c, 'phone'), methods(c, 'linkedin'),
        contactMethods(c).filter((m) => !['email', 'phone', 'linkedin'].includes(m.type))
          .map((m) => `${label(CONTACT_METHOD_TYPES, m.type)}: ${m.value}`).join(', '),
        label(CONTACT_ROLES, c.role), label(CONTACT_STATUSES, c.status), c.preferredChannel, c.timezone, c.introducedBy,
        contactAffiliations(c).filter((a) => !a.current).map((a) => companyName(a.companyId)).join(', '), c.notes,
      ];
    }),
  };
}

function opportunitiesSheet() {
  return {
    name: 'Opportunities',
    columns: [col('Company', 26), col('Opportunity', 28), col('Product', 34), col('Stage', 20), col('Stage since', 18),
      col('Priority', 10), col('Primary use case', 30), col('All use cases', 40), col('Use-case source', 18), col('Lead score', 10),
      ...Object.values(SCORE_DIMENSIONS).map((d) => col(d.label, 12)), col('Estimated value', 14), col('Value basis', 16),
      col('Probability (%)', 12), col('Expected signing', 14), col('Contacts', 26), col('Next step', 30),
      ...Object.values(QUALIFICATION_FACTS).map((f) => col(f, 12)), col('Blocking capabilities', 30), col('Risks', 30),
      col('Loss reason', 20), col('Fit rationale', 40), col('Notes', 50)],
    rows: opportunities.all().slice().sort(byCompany).map((o) => [
      companyName(o.companyId), o.name, product(o.product), label(STAGES, o.stage), dateTime(o.stageEntered),
      label(PRIORITIES, o.priority), label(PRODUCTS[o.product]?.useCases ?? {}, o.primaryUseCase),
      (o.useCases ?? []).map((u) => label(PRODUCTS[o.product]?.useCases ?? {}, u)).join(', '), label(USE_CASE_SOURCES, o.useCaseSource),
      leadScore(o).score ?? '', ...Object.keys(SCORE_DIMENSIONS).map((k) => Number(o.scores?.[k]) || ''),
      money(o.estimatedValue), label(VALUE_BASIS, o.valueBasis), o.probability ?? '', date(o.expectedSigning),
      contactsNamed(o.contactIds), o.nextStep, ...Object.keys(QUALIFICATION_FACTS).map((k) => yesNo(o.qualification?.[k])),
      o.blockingCapabilities, o.risks, o.lossReason, o.fitRationale, o.notes,
    ]),
  };
}

function loisSheet() {
  const allocated = (l, p) => (l.allocations ?? []).filter((a) => a.product === p).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  return {
    name: 'LOIs',
    columns: [col('Company', 26), col('Title', 28), col('Type', 16), col('Status', 18), col(`Stated value (${CURRENCY})`, 16), col('Value basis', 16),
      ...Object.values(PRODUCTS).map((p) => col(`${p.short} allocation`, 14)), col('Unallocated', 14), col('Sent', 12),
      col('Signed', 12), col('Effective', 12), col('Expires', 12), col('Binding', 16), col('Signatories', 26),
      col('Linked opportunities', 30), col('Signed document', 30), col('Draft', 30), col('Legal notes', 40), col('Notes', 50)],
    rows: lois.all().slice().sort(byCompany).map((l) => [
      companyName(l.companyId), l.title, LOI_TYPES[l.loiType]?.label ?? '', label(LOI_STATUSES, l.status), l.amount == null ? 'Unpriced' : money(l.amount),
      label(VALUE_BASIS, l.valueBasis), ...Object.keys(PRODUCTS).map((p) => money(allocated(l, p) || null)), money(unallocated(l)),
      date(l.sentOn), date(l.signedOn), date(l.effectiveOn), date(l.expiresOn),
      { non_binding: 'Non-binding', partially_binding: 'Partially binding', binding: 'Binding' }[l.binding] ?? l.binding ?? '',
      l.signatories, oppsNamed(l.opportunityIds), link(l.docUrl), link(l.draftUrl), l.legalNotes, l.notes,
    ]),
  };
}

function activitiesSheet() {
  return {
    name: 'Activities',
    columns: [col('When', 18), col('Company', 26), col('Type', 22), col('Direction', 12), col('Outcome', 20), col('Subject', 30),
      col('Summary', 60), col('People', 26), col('Opportunities', 30), col('Link', 30)],
    rows: activities.all().slice().sort((a, b) => (b.occurredAt ?? 0) - (a.occurredAt ?? 0)).map((a) => [
      dateTime(a.occurredAt), companyName(a.companyId), label(ACTIVITY_TYPES, a.type), label(DIRECTIONS, a.direction),
      label(OUTCOMES, a.outcome), a.subject, a.summary, contactsNamed(a.contactIds), oppsNamed(a.opportunityIds), link(a.link),
    ]),
  };
}

function followUpsSheet() {
  return {
    name: 'Follow-ups',
    columns: [col('Due', 12), col('Company', 26), col('What to do', 36), col('Status', 14), col('Priority', 10), col('Overdue', 10),
      col('Opportunity', 28), col('Completed', 18), col('Notes', 50)],
    rows: tasks.all().slice().sort((a, b) => (a.dueOn || '9999').localeCompare(b.dueOn || '9999')).map((t) => {
      const open = t.status !== 'completed' && t.status !== 'cancelled';
      const opp = opportunities.get(t.opportunityId);
      return [
        date(t.dueOn), companyName(t.companyId), t.title, label(TASK_STATUSES, t.status), label(PRIORITIES, t.priority),
        open && t.dueOn && t.dueOn < todayIso(), opp ? oppName(opp) : '', dateTime(t.completedAt), t.notes,
      ];
    }),
  };
}

export const excelFileName = () => `astra-retrieval-${todayIso()}.xlsx`;

export function buildWorkbook() {
  return buildXlsx([companiesSheet(), contactsSheet(), opportunitiesSheet(), loisSheet(), activitiesSheet(), followUpsSheet()]);
}

export function downloadWorkbook() {
  downloadFile(excelFileName(), buildWorkbook(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
