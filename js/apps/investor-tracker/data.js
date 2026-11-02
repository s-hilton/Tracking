// Data for the Investors app: four synced tables plus the derived lists
// (follow-ups due, investors gone quiet, updates owed, firms to carry over).
//
//   rounds      a fundraise: Pre-seed, Seed, Series A…
//   firms       an investor (fund, angel, family office…) with its contact info
//   outreach    one firm in one round: its stage, follow-up date, pass reason…
//   activities  the timeline: emails, calls, notes, stage changes, updates sent
import { createCollection } from '../../cloud.js';
import { uid } from '../../storage.js';
import { STAGES, STALE_DAYS, UPDATE_EVERY_DAYS, FOLLOW_UP_DAYS, PASS_REASONS } from './config.js';

// How each JS value is written to / read from its column.
const KINDS = {
  text: [(v) => v ?? '', (v) => v ?? ''],
  date: [(v) => v || null, (v) => v ?? ''],
  ts: [(v) => (v == null ? null : new Date(v).toISOString()), (v) => (v ? Date.parse(v) : null)],
  num: [(v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v)), (v) => (v == null ? null : Number(v))],
  list: [(v) => (Array.isArray(v) ? v : []), (v) => (Array.isArray(v) ? v : [])],
  bool: [(v) => Boolean(v), (v) => Boolean(v)],
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

export const rounds = define('investor_rounds', 'inv:rounds', {
  name: ['name', 'text'],
  status: ['status', 'text'],
  target: ['target_amount', 'num'],
  openedOn: ['opened_on', 'date'],
  closedOn: ['closed_on', 'date'],
  notes: ['notes', 'text'],
});

export const firms = define('investor_firms', 'inv:firms', {
  name: ['name', 'text'],
  type: ['type', 'text'],
  website: ['website', 'text'],
  email: ['email', 'text'],
  phone: ['phone', 'text'],
  linkedin: ['linkedin', 'text'],
  contactUrl: ['contact_url', 'text'], // contact page or pitch form
  location: ['location', 'text'],
  checkSize: ['check_size', 'text'],
  focus: ['focus', 'text'],
  contacts: ['contacts', 'list'], // [{ name, title, email, phone, linkedin }]
  introducedBy: ['introduced_by', 'text'],
  tags: ['tags', 'text'],
  notes: ['notes', 'text'],
  wantsUpdates: ['wants_updates', 'bool'],
  lastUpdateSent: ['last_update_sent', 'date'],
});

export const outreach = define('investor_outreach', 'inv:outreach', {
  firmId: ['firm_id', 'text'],
  roundId: ['round_id', 'text'],
  stage: ['stage', 'text'],
  stageEntered: ['stage_entered_at', 'ts'],
  stageHistory: ['stage_history', 'list'], // [{ stage, at }]
  contactName: ['contact_name', 'text'],
  nextFollowUp: ['next_follow_up', 'date'],
  amount: ['amount', 'num'],
  passReason: ['pass_reason', 'text'],
  passNotes: ['pass_notes', 'text'],
  keepInMind: ['keep_in_mind', 'bool'],
  carriedFrom: ['carried_from', 'text'], // the outreach (earlier round) this was carried over from
  notes: ['notes', 'text'],
});

export const activities = define('investor_activities', 'inv:activities', {
  firmId: ['firm_id', 'text'],
  roundId: ['round_id', 'text'],
  outreachId: ['outreach_id', 'text'],
  on: ['happened_on', 'date'],
  kind: ['kind', 'text'],
  text: ['text', 'text'],
});

export const STORES = [rounds, firms, outreach, activities];

// ---- Dates -------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseIso = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayIso = () => isoOf(new Date());
export const addDays = (iso, n) => { const d = parseIso(iso); d.setDate(d.getDate() + n); return isoOf(d); };
export const daysSince = (iso) => Math.round((parseIso(todayIso()) - parseIso(iso)) / 86400000);

// ---- Lookups -----------------------------------------------------------------
export const firmName = (id) => firms.get(id)?.name || 'Unknown investor';
export const roundName = (id) => rounds.get(id)?.name || 'Unknown round';
export const byName = (a, b) => (a.name || '').localeCompare(b.name || '');

// Rounds newest first (by opened date, then created).
export const sortedRounds = () => [...rounds.all()].sort((a, b) =>
  (b.openedOn || '').localeCompare(a.openedOn || '') || (b.created ?? 0) - (a.created ?? 0));

export const outreachFor = ({ firmId, roundId } = {}) => outreach.all().filter((o) =>
  (!firmId || o.firmId === firmId) && (!roundId || o.roundId === roundId));

export const activitiesFor = ({ firmId, roundId } = {}) => activities.all()
  .filter((a) => (!firmId || a.firmId === firmId) && (!roundId || a.roundId === roundId))
  .sort((a, b) => (b.on || '').localeCompare(a.on || '') || (b.created ?? 0) - (a.created ?? 0));

// Last time anything happened with this firm in this round (ISO date) or ''.
export function lastTouch(o) {
  const logged = activitiesFor({ firmId: o.firmId, roundId: o.roundId })[0]?.on ?? '';
  const entered = o.stageEntered ? isoOf(new Date(o.stageEntered)) : '';
  return logged > entered ? logged : entered;
}

export const isOpen = (o) => o.stage !== 'passed' && o.stage !== 'committed';

// ---- Sticky-note lists -------------------------------------------------------
export const dueFollowUps = () => outreach.all()
  .filter((o) => isOpen(o) && o.nextFollowUp && o.nextFollowUp <= todayIso() && firms.get(o.firmId))
  .sort((a, b) => a.nextFollowUp.localeCompare(b.nextFollowUp));

// Being worked, no follow-up date set, and nothing has happened for a while.
export const staleOutreach = () => outreach.all()
  .filter((o) => STAGES[o.stage]?.active && !o.nextFollowUp && firms.get(o.firmId))
  .map((o) => ({ o, last: lastTouch(o) }))
  .filter(({ last }) => !last || daysSince(last) >= STALE_DAYS);

export const updateList = () => firms.all().filter((f) => f.wantsUpdates).sort(byName);
export const updatesDue = () => updateList()
  .filter((f) => !f.lastUpdateSent || daysSince(f.lastUpdateSent) >= UPDATE_EVERY_DAYS);

// ---- Changes -----------------------------------------------------------------
const stamp = (o) => ({ ...o, updated: Date.now(), created: o.created ?? Date.now() });

export function saveRecord(store, record) {
  const next = stamp({ id: record.id ?? uid(), ...record });
  store.upsert(next);
  return next;
}

export function logActivity({ firmId, roundId = '', outreachId = '', kind = 'note', text = '', on = todayIso() }) {
  return saveRecord(activities, { firmId, roundId, outreachId, kind, text, on });
}

export function addOutreach(firmId, roundId, extra = {}) {
  const now = Date.now();
  const stage = extra.stage ?? 'to_contact';
  return saveRecord(outreach, {
    firmId, roundId, stage, stageEntered: now, stageHistory: [{ stage, at: now }],
    contactName: '', nextFollowUp: '', amount: null, passReason: '', passNotes: '', keepInMind: false, carriedFrom: '', notes: '',
    ...extra,
  });
}

// Move an investor to a new stage, remembering when, and log it on the timeline.
export function setStage(o, stage, changes = {}) {
  const current = outreach.get(o.id) ?? o;
  const moved = stage !== current.stage;
  const now = Date.now();
  const next = saveRecord(outreach, {
    ...current,
    ...changes,
    stage,
    stageEntered: moved ? now : current.stageEntered,
    stageHistory: moved ? [...(current.stageHistory ?? []), { stage, at: now }] : current.stageHistory,
    // A closed-out investor needs no more chasing.
    nextFollowUp: isOpen({ stage }) ? (changes.nextFollowUp ?? current.nextFollowUp) : '',
  });
  if (moved) {
    const reason = stage === 'passed' && next.passReason ? ` (${PASS_REASONS[next.passReason] ?? next.passReason})` : '';
    logActivity({ firmId: o.firmId, roundId: o.roundId, outreachId: o.id, kind: 'stage', text: `${STAGES[current.stage]?.label ?? current.stage} → ${STAGES[stage]?.label ?? stage}${reason}` });
  }
  return next;
}

// Ticked on the sticky note: log the follow-up and schedule the next one.
export function completeFollowUp(o) {
  const current = outreach.get(o.id) ?? o;
  logActivity({ firmId: current.firmId, roundId: current.roundId, outreachId: current.id, kind: 'email', text: 'Followed up' });
  const stage = current.stage === 'contacted' ? 'follow_up' : current.stage;
  setStage(current, stage, { nextFollowUp: addDays(todayIso(), FOLLOW_UP_DAYS) });
}

export function markUpdateSent(firm, on = todayIso(), text = 'Investor update sent') {
  saveRecord(firms, { ...(firms.get(firm.id) ?? firm), lastUpdateSent: on });
  logActivity({ firmId: firm.id, kind: 'update', text, on });
}

// Firms that passed in another round but said "keep us in mind", and aren't in
// this round yet. One entry per firm (their most recent pass).
export function carryOverCandidates(roundId) {
  const inRound = new Set(outreachFor({ roundId }).map((o) => o.firmId));
  const latest = new Map();
  for (const o of outreach.all()) {
    if (o.roundId === roundId || o.stage !== 'passed' || !o.keepInMind || inRound.has(o.firmId) || !firms.get(o.firmId)) continue;
    const prev = latest.get(o.firmId);
    if (!prev || (o.stageEntered ?? 0) > (prev.stageEntered ?? 0)) latest.set(o.firmId, o);
  }
  return [...latest.values()].sort((a, b) => firmName(a.firmId).localeCompare(firmName(b.firmId)));
}

// Bring a firm over from an earlier round, starting again at "To contact".
export function carryOver(from, roundId) {
  const reason = PASS_REASONS[from.passReason];
  const why = [reason, from.passNotes].filter(Boolean).join(': ');
  const added = addOutreach(from.firmId, roundId, {
    contactName: from.contactName,
    carriedFrom: from.id,
    notes: `Kept in mind from ${roundName(from.roundId)}${why ? ` (passed: ${why})` : ''}.`,
  });
  logActivity({ firmId: from.firmId, roundId, outreachId: added.id, kind: 'note', text: `Carried over from ${roundName(from.roundId)}` });
  return added;
}

export function deleteFirm(id) {
  outreachFor({ firmId: id }).forEach((o) => outreach.remove(o.id));
  activitiesFor({ firmId: id }).forEach((a) => activities.remove(a.id));
  firms.remove(id);
}

export function deleteOutreach(id) {
  activities.all().filter((a) => a.outreachId === id).forEach((a) => activities.remove(a.id));
  outreach.remove(id);
}

export function deleteRound(id) {
  outreachFor({ roundId: id }).forEach((o) => deleteOutreach(o.id));
  rounds.remove(id);
}

// Committed money and counts per stage for one round.
export function roundSummary(roundId) {
  const list = outreachFor({ roundId });
  const counts = Object.fromEntries(Object.keys(STAGES).map((s) => [s, 0]));
  list.forEach((o) => { counts[o.stage] = (counts[o.stage] ?? 0) + 1; });
  const committed = list.filter((o) => o.stage === 'committed').reduce((n, o) => n + (o.amount ?? 0), 0);
  const pipeline = list.filter((o) => STAGES[o.stage]?.active).reduce((n, o) => n + (o.amount ?? 0), 0);
  return { total: list.length, counts, committed, pipeline };
}
