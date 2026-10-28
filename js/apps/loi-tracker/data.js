// Data for the LOIs app: one synced collection per Supabase table, plus the
// derived numbers (last touch, follow-up reminders, LOI totals).
import { createCollection } from '../../cloud.js';
import { load, remove, uid } from '../../storage.js';
import { STALE_DAYS, PROPOSED_LOI_STATUSES, STAGES, SCORE_DIMENSIONS, PRODUCTS } from './config.js';

// How each JS value is written to / read from its column.
const KINDS = {
  text: [(v) => v ?? '', (v) => v ?? ''],
  date: [(v) => v || null, (v) => v ?? ''],
  ts: [(v) => (v == null ? null : new Date(v).toISOString()), (v) => (v ? Date.parse(v) : null)],
  num: [(v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v)), (v) => (v == null ? null : Number(v))],
  json: [(v) => v ?? null, (v) => v ?? null],
  bool: [(v) => Boolean(v), (v) => Boolean(v)],
};

const TIMESTAMPS = { created: ['created_at', 'ts'], updated: ['updated_at', 'ts'] };

function define(table, key, fields, order = { column: 'updated_at', ascending: false }) {
  const entries = Object.entries({ ...fields, ...TIMESTAMPS });
  return createCollection({
    table,
    key,
    toRow: (o) => Object.fromEntries([['id', o.id], ...entries.map(([k, [col, kind]]) => [col, KINDS[kind][0](o[k])])]),
    fromRow: (r) => Object.fromEntries([['id', r.id], ...entries.map(([k, [col, kind]]) => [k, KINDS[kind][1](r[col])])]),
    order,
  });
}

export const companies = define('bd_companies', 'ar:companies', {
  name: ['name', 'text'],
  aliases: ['aliases', 'text'],
  website: ['website', 'text'],
  type: ['type', 'text'],
  industry: ['industry', 'text'],
  headquarters: ['headquarters', 'text'],
  country: ['country', 'text'],
  email: ['general_email', 'text'],
  phone: ['phone', 'text'],
  linkedin: ['linkedin', 'text'],
  leadSource: ['lead_source', 'text'],
  introducedBy: ['introduced_by', 'text'],
  tags: ['tags', 'text'],
  useCases: ['use_cases', 'json'],
  notes: ['notes', 'text'],
  doNotContact: ['do_not_contact', 'bool'],
});

export const contacts = define('bd_contacts', 'ar:contacts', {
  companyId: ['company_id', 'text'],
  firstName: ['first_name', 'text'],
  lastName: ['last_name', 'text'],
  title: ['title', 'text'],
  department: ['department', 'text'],
  email: ['email', 'text'],
  phone: ['phone', 'text'],
  linkedin: ['linkedin', 'text'],
  role: ['role', 'text'],
  status: ['status', 'text'],
  preferredChannel: ['preferred_channel', 'text'],
  timezone: ['timezone', 'text'],
  introducedBy: ['introduced_by', 'text'],
  methods: ['methods', 'json'],
  affiliations: ['affiliations', 'json'],
  notes: ['notes', 'text'],
});

export const opportunities = define('bd_opportunities', 'ar:opportunities', {
  companyId: ['company_id', 'text'],
  product: ['product', 'text'],
  name: ['name', 'text'],
  stage: ['stage', 'text'],
  stageEntered: ['stage_entered_at', 'ts'],
  stageHistory: ['stage_history', 'json'],
  priority: ['priority', 'text'],
  primaryUseCase: ['primary_use_case', 'text'],
  useCases: ['use_cases', 'json'],
  useCaseSource: ['use_case_source', 'text'],
  fitRationale: ['fit_rationale', 'text'],
  contactIds: ['contact_ids', 'json'],
  estimatedValue: ['estimated_value', 'num'],
  valueBasis: ['value_basis', 'text'],
  probability: ['probability', 'num'],
  expectedSigning: ['expected_signing_on', 'date'],
  nextStep: ['next_step', 'text'],
  risks: ['risks', 'text'],
  lossReason: ['loss_reason', 'text'],
  details: ['details', 'json'],
  scores: ['scores', 'json'],
  qualification: ['qualification', 'json'],
  blockingCapabilities: ['blocking_capabilities', 'text'],
  notes: ['notes', 'text'],
});

export const activities = define('bd_activities', 'ar:activities', {
  companyId: ['company_id', 'text'],
  occurredAt: ['occurred_at', 'ts'],
  type: ['type', 'text'],
  direction: ['direction', 'text'],
  subject: ['subject', 'text'],
  summary: ['summary', 'text'],
  outcome: ['outcome', 'text'],
  contactIds: ['contact_ids', 'json'],
  opportunityIds: ['opportunity_ids', 'json'],
  link: ['link', 'text'],
}, { column: 'occurred_at', ascending: false });

export const tasks = define('bd_tasks', 'ar:tasks', {
  companyId: ['company_id', 'text'],
  opportunityId: ['opportunity_id', 'text'],
  title: ['title', 'text'],
  dueOn: ['due_on', 'date'],
  priority: ['priority', 'text'],
  status: ['status', 'text'],
  notes: ['notes', 'text'],
  completedAt: ['completed_at', 'ts'],
});

export const lois = define('lois', 'ar:lois', {
  companyId: ['company_id', 'text'],
  title: ['title', 'text'],
  loiType: ['loi_type', 'text'], // customer | partnership (see LOI_TYPES)
  status: ['status', 'text'],
  amount: ['amount', 'num'],
  currency: ['currency', 'text'],
  valueBasis: ['value_basis', 'text'],
  allocations: ['allocations', 'json'],
  opportunityIds: ['opportunity_ids', 'json'],
  sentOn: ['sent_on', 'date'],
  signedOn: ['signed_on', 'date'],
  effectiveOn: ['effective_on', 'date'],
  expiresOn: ['expires_on', 'date'],
  draftUrl: ['draft_url', 'text'],
  docUrl: ['document_url', 'text'],
  signatories: ['signatories', 'text'],
  binding: ['binding', 'text'],
  legalNotes: ['legal_notes', 'text'],
  supersedesId: ['supersedes_id', 'text'],
  statusHistory: ['status_history', 'json'],
  notes: ['notes', 'text'],
});

export const STORES = [companies, contacts, opportunities, activities, tasks, lois];

// ---- Dates ------------------------------------------------------------------------
export const todayIso = () => localIso(new Date());
export const localIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseIso = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const daysUntil = (iso) => Math.round((parseIso(iso) - parseIso(todayIso())) / 86400000);
export function addDays(days, businessOnly = false) {
  const d = new Date();
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (!businessOnly || (d.getDay() !== 0 && d.getDay() !== 6)) left -= 1;
  }
  return localIso(d);
}

// ---- Relationships ---------------------------------------------------------------
export const companyById = (id) => companies.get(id);
export const companyName = (id) => companies.get(id)?.name || 'Unknown company';
// The products a company is tagged with as its use cases (Company → Edit → Use cases).
// Early records stored { product: [use-case keys] }; any product with keys counts.
export function companyUseCases(c) {
  const tags = c?.useCases;
  const keys = Array.isArray(tags) ? tags : Object.keys(tags ?? {}).filter((k) => tags[k]?.length);
  return keys.filter((k) => k in PRODUCTS);
}
export const contactName = (c) => [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Unnamed contact';

// ---- Contacts: several methods and a dated employment history ----------------------
// Contacts saved before these existed only have single email/phone/company fields;
// these helpers read either shape.
export function contactMethods(c) {
  if (Array.isArray(c.methods) && c.methods.length) return c.methods;
  return [['email', c.email], ['phone', c.phone], ['linkedin', c.linkedin]]
    .filter(([, value]) => value).map(([type, value]) => ({ type, value, label: '' }));
}

export function contactAffiliations(c) {
  if (Array.isArray(c.affiliations) && c.affiliations.length) return c.affiliations;
  return c.companyId ? [{ companyId: c.companyId, title: c.title ?? '', department: c.department ?? '', start: '', end: '', current: true }] : [];
}

export const primaryMethod = (c, type) => contactMethods(c).find((m) => m.type === type)?.value ?? '';
export const isCurrentAt = (c, companyId) => contactAffiliations(c).some((a) => a.companyId === companyId && a.current);
export const wasAt = (c, companyId) => contactAffiliations(c).some((a) => a.companyId === companyId && !a.current);
export const currentAffiliation = (c) => contactAffiliations(c).find((a) => a.current);

export function related(companyId) {
  const of = (store) => store.all().filter((x) => x.companyId === companyId);
  return {
    contacts: contacts.all().filter((c) => isCurrentAt(c, companyId)),
    formerContacts: contacts.all().filter((c) => wasAt(c, companyId) && !isCurrentAt(c, companyId)),
    opportunities: of(opportunities),
    activities: of(activities).sort((a, b) => b.occurredAt - a.occurredAt),
    tasks: of(tasks),
    lois: of(lois),
  };
}

// Deleting a company removes everything attached to it.
export function deleteCompany(companyId) {
  // People who also worked elsewhere keep their record, minus this company.
  for (const c of contacts.all()) {
    const affiliations = contactAffiliations(c);
    if (!affiliations.some((a) => a.companyId === companyId)) continue;
    const others = affiliations.filter((a) => a.companyId !== companyId);
    if (others.length) saveRecord(contacts, { ...c, affiliations: others, companyId: (others.find((a) => a.current) ?? others[0]).companyId });
    else contacts.remove(c.id);
  }
  for (const store of [opportunities, activities, tasks, lois]) {
    store.all().filter((x) => x.companyId === companyId).forEach((x) => store.remove(x.id));
  }
  companies.remove(companyId);
}

// Saves a record, stamping created/updated times.
export function saveRecord(store, record) {
  const now = Date.now();
  const saved = { ...record, id: record.id ?? uid(), created: record.created ?? now, updated: now };
  store.upsert(saved);
  return saved;
}

// ---- Follow-up reminders ---------------------------------------------------------
// The last time anything about a company changed: the company itself, its
// contacts, opportunities, LOIs, tasks or logged activities.
export function lastTouch(companyId) {
  const company = companies.get(companyId);
  const r = related(companyId);
  return Math.max(
    company?.updated ?? 0,
    ...[...r.contacts, ...r.opportunities, ...r.lois, ...r.tasks].map((x) => x.updated ?? 0),
    ...r.activities.map((a) => Math.max(a.updated ?? 0, a.occurredAt ?? 0)),
  );
}

export const hasSignedLoi = (companyId) => lois.all().some((l) => l.companyId === companyId && l.status === 'signed');

// Companies to chase: no update in STALE_DAYS days, no signed LOI, not do-not-contact.
export function staleCompanies() {
  const cutoff = Date.now() - STALE_DAYS * 86400000;
  return companies.all()
    .filter((c) => !c.doNotContact && !hasSignedLoi(c.id))
    .map((c) => ({ company: c, last: lastTouch(c.id) }))
    .filter((x) => x.last < cutoff)
    .sort((a, b) => a.last - b.last);
}

export const openTasks = () => tasks.all().filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
export const overdueTasks = () => openTasks().filter((t) => t.dueOn && t.dueOn < todayIso());

// ---- LOI financials (PRD §8) -------------------------------------------------------
// Signed and not past its expiry date. Withdrawn/superseded/expired statuses never count.
export const isActiveSigned = (l) => l.status === 'signed' && !(l.expiresOn && l.expiresOn < todayIso());
export const isProposed = (l) => PROPOSED_LOI_STATUSES.includes(l.status);

// The part of an LOI's value attributed to a product ('all' = the whole LOI).
// Unallocated value only counts toward the combined total, never a product,
// so an LOI with no split contributes 0 to each product (PRD: don't guess a split).
export function loiValueFor(l, product) {
  if (l.amount == null) return null; // unpriced is unknown, not zero
  if (product === 'all') return l.amount;
  return (l.allocations ?? []).filter((a) => a.product === product).reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
}

export function unallocated(l) {
  if (l.amount == null) return null;
  return l.amount - (l.allocations ?? []).reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
}

// Does this LOI relate to a product (by allocation or a linked opportunity)?
export function loiProducts(l) {
  const set = new Set((l.allocations ?? []).map((a) => a.product));
  for (const id of l.opportunityIds ?? []) {
    const opp = opportunities.get(id);
    if (opp) set.add(opp.product);
  }
  return [...set];
}

export function loiTotals(product = 'all') {
  const inScope = lois.all().filter((l) => product === 'all' || loiProducts(l).includes(product));
  const sum = (list) => list.reduce((total, l) => total + (loiValueFor(l, product) ?? 0), 0);
  const signed = inScope.filter(isActiveSigned);
  const proposed = inScope.filter(isProposed);
  return {
    signedCount: signed.length,
    signedValue: sum(signed),
    signedUnpriced: signed.filter((l) => loiValueFor(l, product) == null).length,
    proposedCount: proposed.length,
    proposedValue: sum(proposed),
    historicalSignedCount: inScope.filter((l) => l.signedOn || l.status === 'signed').length,
    unallocatedSigned: product === 'all' ? signed.reduce((t, l) => t + Math.max(0, unallocated(l) ?? 0), 0) : 0,
  };
}

export const stageGroup = (opp) => STAGES[opp.stage]?.group ?? 'open';

// ---- Lead score (PRD §10) -------------------------------------------------------------
// Weighted average of the known 1–5 scores, scaled to 0–100. Unknown dimensions are
// left out (not counted as low); null when nothing has been scored.
export function leadScore(opp) {
  let weight = 0;
  let total = 0;
  let known = 0;
  for (const [key, dim] of Object.entries(SCORE_DIMENSIONS)) {
    const value = Number(opp.scores?.[key]);
    if (!value) continue;
    weight += dim.weight;
    total += dim.weight * ((value - 1) / 4);
    known += 1;
  }
  return { score: weight ? Math.round((total / weight) * 100) : null, known, of: Object.keys(SCORE_DIMENSIONS).length };
}

// ---- One-time carry-over from the first version of the app ------------------------
// LOIs typed into the old single-list tracker that never reached the server are
// turned into company + contact + LOI records. (Ones that did reach the server
// are converted by the database migration.)
const OLD_STATUS = { prospect: 'not_started', requested: 'shared', negotiating: 'negotiating', signed: 'signed', declined: 'withdrawn' };

export function migrateLegacyLocalData() {
  const old = load('lois', null);
  const outbox = load('lois:outbox', {});
  if (!Array.isArray(old)) return;
  for (const item of old) {
    if (outbox[item.id]?.op !== 'upsert' || lois.get(item.id)) continue;
    const name = (item.company || 'Unknown company').trim();
    const company = companies.all().find((c) => c.name.toLowerCase() === name.toLowerCase())
      ?? saveRecord(companies, { name });
    if (item.contact || item.email) {
      const [firstName, ...rest] = (item.contact || '').split(' ');
      saveRecord(contacts, { companyId: company.id, firstName, lastName: rest.join(' '), email: item.email, status: 'active' });
    }
    saveRecord(lois, {
      id: item.id,
      companyId: company.id,
      title: `${name} LOI`,
      status: OLD_STATUS[item.status] ?? 'not_started',
      amount: item.amount,
      currency: 'USD',
      valueBasis: 'total',
      allocations: [],
      opportunityIds: [],
      signedOn: item.received,
      expiresOn: item.expires,
      docUrl: item.docUrl,
      notes: item.notes,
    });
  }
  remove('lois');
  remove('lois:outbox');
}
