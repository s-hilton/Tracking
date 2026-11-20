// Data for the Customer Outreach app: two synced tables plus the derived lists
// for the sticky note.
//
//   customers   a person you're reaching out to: name, position, company, industry, contact info, stage
//   activities  the timeline: emails, messages, calls, meetings, notes, stage changes
import { createCollection } from '../../cloud.js';
import { uid } from '../../storage.js';
import { STAGES, STALE_DAYS, FOLLOW_UP_DAYS } from './config.js';

// How each JS value is written to / read from its column.
const KINDS = {
  text: [(v) => v ?? '', (v) => v ?? ''],
  date: [(v) => v || null, (v) => v ?? ''],
  ts: [(v) => (v == null ? null : new Date(v).toISOString()), (v) => (v ? Date.parse(v) : null)],
  list: [(v) => (Array.isArray(v) ? v : []), (v) => (Array.isArray(v) ? v : [])],
};

const TIMESTAMPS = { created: ['created_at', 'ts'], updated: ['updated_at', 'ts'] };

function define(table, key, fields) {
  const entries = Object.entries({ ...fields, ...TIMESTAMPS });
  return createCollection({
    table,
    key,
    toRow: (o) => Object.fromEntries([['id', o.id], ...entries.map(([k, [col, kind]]) => [col, KINDS[kind][0](o[k])])]),
    fromRow: (r) => Object.fromEntries([['id', r.id], ...entries.map(([k, [col, kind]]) => [k, KINDS[kind][1](r[col])])]),
    order: { column: 'updated_at', ascending: false },
  });
}

export const customers = define('crew_customers', 'crew:customers', {
  name: ['name', 'text'],
  position: ['position', 'text'],
  company: ['company', 'text'],
  industry: ['industry', 'text'],
  email: ['email', 'text'],
  phone: ['phone', 'text'],
  linkedin: ['linkedin', 'text'],
  website: ['website', 'text'],
  location: ['location', 'text'],
  companySize: ['company_size', 'text'],
  source: ['source', 'text'],
  tags: ['tags', 'text'],
  notes: ['notes', 'text'],
  stage: ['stage', 'text'],
  stageEntered: ['stage_entered_at', 'ts'],
  stageHistory: ['stage_history', 'list'], // [{ stage, at }]
  lastContacted: ['last_contacted', 'date'],
  nextFollowUp: ['next_follow_up', 'date'],
});

export const activities = define('crew_customer_activities', 'crew:activities', {
  customerId: ['customer_id', 'text'],
  on: ['happened_on', 'date'],
  kind: ['kind', 'text'],
  text: ['text', 'text'],
});

export const STORES = [customers, activities];

// ---- Dates -------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIso = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayIso = () => isoOf(new Date());
export const addDays = (iso, n) => { const d = parseIso(iso); d.setDate(d.getDate() + n); return isoOf(d); };
export const daysSince = (iso) => Math.round((parseIso(todayIso()) - parseIso(iso)) / 86400000);
export const shortDate = (iso) => (iso ? parseIso(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: iso.slice(0, 4) === todayIso().slice(0, 4) ? undefined : 'numeric' }) : '');

// ---- Lookups -----------------------------------------------------------------
export const displayName = (c) => c?.name || c?.company || 'Unnamed';
export const isOpen = (c) => c.stage !== 'customer' && c.stage !== 'not_interested';

export const activitiesFor = (customerId) => activities.all()
  .filter((a) => a.customerId === customerId)
  .sort((a, b) => (b.on || '').localeCompare(a.on || '') || (b.created ?? 0) - (a.created ?? 0));

export const industries = () => [...new Set(customers.all().map((c) => c.industry.trim()).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b));

// ---- Sticky-note lists -------------------------------------------------------
export const dueFollowUps = () => customers.all()
  .filter((c) => isOpen(c) && c.nextFollowUp && c.nextFollowUp <= todayIso())
  .sort((a, b) => a.nextFollowUp.localeCompare(b.nextFollowUp));

// Being worked, no follow-up date set, and nothing has happened for a while.
export const staleLeads = () => customers.all()
  .filter((c) => STAGES[c.stage]?.active && !c.nextFollowUp)
  .filter((c) => {
    const last = c.lastContacted || (c.stageEntered ? isoOf(new Date(c.stageEntered)) : '');
    return !last || daysSince(last) >= STALE_DAYS;
  });

// ---- Changes -----------------------------------------------------------------
const stamp = (o) => ({ ...o, updated: Date.now(), created: o.created ?? Date.now() });

export function saveCustomer(record) {
  const now = Date.now();
  const existing = record.id ? customers.get(record.id) : null;
  const stage = record.stage || 'to_contact';
  const next = stamp({
    stageEntered: now,
    stageHistory: [{ stage, at: now }],
    lastContacted: '',
    nextFollowUp: '',
    ...existing,
    ...record,
    id: record.id ?? uid(),
    stage,
  });
  if (existing && existing.stage !== stage) {
    next.stageEntered = now;
    next.stageHistory = [...(existing.stageHistory ?? []), { stage, at: now }];
    logActivity({ customerId: next.id, kind: 'stage', text: `${STAGES[existing.stage]?.label ?? existing.stage} → ${STAGES[stage]?.label ?? stage}` });
  }
  if (!isOpen(next)) next.nextFollowUp = '';
  customers.upsert(next);
  return next;
}

export function logActivity({ customerId, kind = 'note', text = '', on = todayIso() }) {
  const a = stamp({ id: uid(), customerId, kind, text, on });
  activities.upsert(a);
  return a;
}

// A real touch (email, message, call, meeting): remember when, and move a
// "To contact" lead on to "Contacted".
export function recordContact(c, { kind, text, on = todayIso(), nextFollowUp }) {
  const current = customers.get(c.id) ?? c;
  logActivity({ customerId: current.id, kind, text, on });
  if (kind === 'note') return saveCustomer({ ...current, ...(nextFollowUp !== undefined ? { nextFollowUp } : {}) });
  return saveCustomer({
    ...current,
    lastContacted: on > (current.lastContacted || '') ? on : current.lastContacted,
    stage: current.stage === 'to_contact' ? 'contacted' : current.stage,
    nextFollowUp: nextFollowUp !== undefined ? nextFollowUp : current.nextFollowUp,
  });
}

// Ticked on the sticky note: log the follow-up and schedule the next one.
export function completeFollowUp(c) {
  const current = customers.get(c.id) ?? c;
  recordContact(current, { kind: 'email', text: 'Followed up', nextFollowUp: addDays(todayIso(), FOLLOW_UP_DAYS) });
  const after = customers.get(current.id);
  if (after.stage === 'contacted') saveCustomer({ ...after, stage: 'follow_up' });
}

export function deleteCustomer(id) {
  activitiesFor(id).forEach((a) => activities.remove(a.id));
  customers.remove(id);
}
