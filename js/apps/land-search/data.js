// Saved sites and institutions (stage 4): one synced table, land_sites
// (supabase/migrations/*_land_sites.sql). Contacts and the activity log live on
// the site itself.
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

// Open sites whose follow-up is today or overdue, most overdue first.
export function dueFollowUps() {
  const today = todayIso();
  return sites.all()
    .filter((s) => OPEN_STAGES.includes(s.stage) && s.nextFollowUp && s.nextFollowUp <= today)
    .sort((a, b) => a.nextFollowUp.localeCompare(b.nextFollowUp));
}

// ---- Changes ---------------------------------------------------------------------

function put(site, patch) {
  const next = { ...site, ...patch, updated: Date.now() };
  sites.upsert(next);
  return next;
}

// Save a map / institution record. `extra` can add contacts, website, phone.
export function saveSite(record, extra = {}) {
  const existing = savedFor(record.id);
  if (existing) return existing;
  const now = Date.now();
  const site = {
    id: uid(),
    sourceKey: record.id,
    category: record.category ?? record.type ?? '',
    name: record.name ?? '',
    kind: record.kind ?? '',
    source: record.source ?? '',
    sourceUrl: record.sourceUrl ?? record.osm ?? '',
    owner: record.owner ?? record.operator ?? '',
    ownerType: record.ownerType ?? '',
    address: record.address ?? '',
    parcelId: record.parcelId != null ? String(record.parcelId) : '',
    acres: record.acres != null ? Math.round(record.acres * 100) / 100 : null,
    lat: record.center?.lat ?? null,
    lng: record.center?.lng ?? null,
    website: extra.website ?? record.website ?? '',
    phone: extra.phone ?? record.phone ?? '',
    stage: 'found',
    stageHistory: [{ stage: 'found', at: now }],
    contacts: extra.contacts ?? [],
    activity: [{ at: now, type: 'note', text: 'Saved from Land Search' }],
    nextFollowUp: '',
    declineReason: '',
    notes: '',
    created: now,
    updated: now,
  };
  sites.upsert(site);
  return site;
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
  if (type !== 'note' && site.stage === 'found') next = setStage(site, 'contacted');
  return put(next, {
    activity: [...next.activity, { at: now, type, text: text.trim() }],
    nextFollowUp: type !== 'note' && OPEN_STAGES.includes(next.stage) ? addDays(FOLLOW_UP_DAYS) : next.nextFollowUp,
  });
}

// Ticked on the sticky note / Followed up button.
export const completeFollowUp = (site) => logActivity(site, 'followup', 'Followed up');

export const updateSite = (site, patch) => put(site, patch);
export const removeSite = (site) => sites.remove(site.id);
