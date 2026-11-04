// Records: every government or institution you've looked at, plus older saved
// sites. One synced table, land_sites (supabase/migrations/*_land_sites*.sql).
// Contacts, parcels of interest and the activity log live on the record itself.
// Only records marked Interested are in the pipeline.
import { createCollection } from '../../cloud.js';
import { uid } from '../../storage.js';

// Days until the next follow-up after you reach out.
export const FOLLOW_UP_DAYS = 7;

export const STAGES = {
  found: { label: 'Found', color: '#64748b' },
  contacted: { label: 'Contacted', color: '#0ea5e9' },
  talking: { label: 'Talking', color: '#f59e0b' },
  agreement: { label: 'Agreement', color: '#16a34a' },
  declined: { label: 'Declined', color: '#ef4444' },
};
export const OPEN_STAGES = ['found', 'contacted', 'talking'];

export const INTEREST = {
  '': { label: 'Not reviewed', color: '#94a3b8' },
  yes: { label: 'Interested', color: '#16a34a' },
  maybe: { label: 'Maybe', color: '#f59e0b' },
  no: { label: 'Not interested', color: '#ef4444' },
};

export const CATEGORY = {
  state: 'State', county: 'County', municipality: 'City / town', tribe: 'Tribal nation',
  college: 'College', museum: 'Museum', planetarium: 'Planetarium',
  parcel: 'Parcel', land: 'Public land', building: 'Public building',
};
export const GOVERNMENT = new Set(['state', 'county', 'municipality', 'tribe']);

export const ACTIVITY_TYPES = { email: 'Email', call: 'Call', meeting: 'Meeting', visit: 'Site visit', followup: 'Follow-up', note: 'Note' };

const KINDS = {
  text: [(v) => v ?? '', (v) => v ?? ''],
  date: [(v) => v || null, (v) => v ?? ''],
  ts: [(v) => (v == null ? null : new Date(v).toISOString()), (v) => (v ? Date.parse(v) : null)],
  num: [(v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v)), (v) => (v == null ? null : Number(v))],
  list: [(v) => (Array.isArray(v) ? v : []), (v) => (Array.isArray(v) ? v : [])],
};
const FIELDS = {
  sourceKey: ['source_key', 'text'], category: ['category', 'text'], name: ['name', 'text'], kind: ['kind', 'text'],
  source: ['source', 'text'], sourceUrl: ['source_url', 'text'], owner: ['owner', 'text'], ownerType: ['owner_type', 'text'],
  address: ['address', 'text'], parcelId: ['parcel_id', 'text'], acres: ['acres', 'num'], lat: ['lat', 'num'], lng: ['lng', 'num'],
  website: ['website', 'text'], phone: ['phone', 'text'], stage: ['stage', 'text'], stageHistory: ['stage_history', 'list'],
  contacts: ['contacts', 'list'], activity: ['activity', 'list'], nextFollowUp: ['next_follow_up', 'date'],
  declineReason: ['decline_reason', 'text'], notes: ['notes', 'text'], created: ['created_at', 'ts'], updated: ['updated_at', 'ts'],
  interest: ['interest', 'text'], mapUrl: ['map_url', 'text'], parcels: ['parcels', 'list'], stateAbbr: ['state_abbr', 'text'],
};
const entries = Object.entries(FIELDS);

export const sites = createCollection({
  table: 'land_sites',
  key: 'land:sites',
  toRow: (o) => Object.fromEntries([['id', o.id], ...entries.map(([k, [col, kind]]) => [col, KINDS[kind][0](o[k])])]),
  fromRow: (r) => Object.fromEntries([['id', r.id], ...entries.map(([k, [col, kind]]) => [k, KINDS[kind][1](r[col])])]),
  order: { column: 'updated_at', ascending: false },
});

// ---- Dates ---------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => iso(new Date());
export const addDays = (days, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() + days); return iso(d); };
export const daysLate = (date) => Math.round((Date.parse(todayIso()) - Date.parse(date)) / 864e5);
export const formatDate = (date) => (date ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(`${date}T12:00:00`).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) : '');

// ---- Queries ---------------------------------------------------------------------

export const savedFor = (sourceKey) => sites.all().find((s) => s.sourceKey === sourceKey) ?? null;
export const inPipeline = (s) => s.interest === 'yes';

// Pipeline records whose follow-up is today or overdue, most overdue first.
export function dueFollowUps() {
  const today = todayIso();
  return sites.all()
    .filter((s) => inPipeline(s) && OPEN_STAGES.includes(s.stage) && s.nextFollowUp && s.nextFollowUp <= today)
    .sort((a, b) => a.nextFollowUp.localeCompare(b.nextFollowUp));
}

// ---- Changes ---------------------------------------------------------------------

function put(site, patch) {
  const next = { ...site, ...patch, updated: Date.now() };
  sites.upsert(next);
  return next;
}

// The record for a government / institution, created the first time you
// change anything about it. `base`: { key, category, name, kind, stateAbbr, … }.
export function ensureRecord(base) {
  const existing = savedFor(base.key);
  if (existing) return existing;
  const now = Date.now();
  const record = {
    id: uid(), sourceKey: base.key, category: base.category ?? '', name: base.name ?? '', kind: base.kind ?? '',
    source: base.source ?? '', sourceUrl: base.sourceUrl ?? '', owner: '', ownerType: '', address: base.address ?? '', parcelId: '',
    acres: base.acres != null ? Math.round(base.acres * 100) / 100 : null, lat: base.lat ?? null, lng: base.lng ?? null,
    website: base.website ?? '', phone: base.phone ?? '', stage: 'found', stageHistory: [], contacts: base.contacts ?? [],
    activity: [], nextFollowUp: '', declineReason: '', notes: '', interest: '', mapUrl: '', parcels: [],
    stateAbbr: base.stateAbbr ?? '', created: now, updated: now,
  };
  sites.upsert(record);
  return record;
}

// Change a record, creating it first if needed.
export const editRecord = (base, patch) => put(sites.get(ensureRecord(base).id), patch);

export function setInterest(base, interest) {
  const record = sites.get(ensureRecord(base).id);
  if (record.interest === interest) return record;
  const now = Date.now();
  const patch = { interest, activity: [...record.activity, { at: now, type: 'stage', text: `Marked ${INTEREST[interest]?.label ?? 'not reviewed'}` }] };
  // Becoming interested puts it in the pipeline at "Found".
  if (interest === 'yes' && !record.stageHistory.length) patch.stageHistory = [{ stage: 'found', at: now }];
  return put(record, patch);
}

export function setStage(site, stage) {
  if (site.stage === stage) return site;
  const now = Date.now();
  const patch = {
    stage,
    stageHistory: [...site.stageHistory, { stage, at: now }],
    activity: [...site.activity, { at: now, type: 'stage', text: `Moved to ${STAGES[stage]?.label ?? stage}` }],
  };
  // Reaching out starts the follow-up clock; closing a site stops it.
  if (OPEN_STAGES.includes(stage) && stage !== 'found' && !site.nextFollowUp) patch.nextFollowUp = addDays(FOLLOW_UP_DAYS);
  if (!OPEN_STAGES.includes(stage)) patch.nextFollowUp = '';
  return put(site, patch);
}

// Log an email / call / meeting… Logging contact on a "found" site moves it to
// "contacted", and every contact pushes the next follow-up out a week.
export function logActivity(site, type, text) {
  const now = Date.now();
  let next = site;
  // Reaching out to something means you're interested in it.
  if (type !== 'note' && next.interest !== 'yes') next = put(next, { interest: 'yes', stageHistory: next.stageHistory.length ? next.stageHistory : [{ stage: 'found', at: now }] });
  if (type !== 'note' && next.stage === 'found') next = setStage(next, 'contacted');
  return put(next, {
    activity: [...next.activity, { at: now, type, text: text.trim() }],
    nextFollowUp: type !== 'note' && OPEN_STAGES.includes(next.stage) ? addDays(FOLLOW_UP_DAYS) : next.nextFollowUp,
  });
}

// Ticked on the sticky note / Followed up button.
export const completeFollowUp = (site) => logActivity(site, 'followup', 'Followed up');

export const updateSite = (site, patch) => put(site, patch);
export const removeSite = (site) => sites.remove(site.id);
