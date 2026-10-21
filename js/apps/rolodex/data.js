// Data for the Rolodex: the cards (contacts) and the connections between them,
// each a synced collection, plus the derived bits (names, follow-ups, neighbours).
import { createCollection } from '../../cloud.js';
import { uid } from '../../storage.js';

// How each JS value is written to / read from its column.
const KINDS = {
  text: [(v) => v ?? '', (v) => v ?? ''],
  date: [(v) => v || null, (v) => v ?? ''],
  ts: [(v) => (v == null ? null : new Date(v).toISOString()), (v) => (v ? Date.parse(v) : null)],
  num: [(v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v)), (v) => (v == null ? 0 : Number(v))],
  list: [(v) => v ?? [], (v) => v ?? []],
  coord: [(v) => (typeof v === 'number' && Number.isFinite(v) ? v : null), (v) => (v == null ? null : Number(v))],
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

export const contacts = define('rolodex_contacts', 'rolodex:contacts', {
  firstName: ['first_name', 'text'],
  lastName: ['last_name', 'text'],
  nickname: ['nickname', 'text'],
  company: ['company', 'text'],
  title: ['title', 'text'],
  emails: ['emails', 'list'], // [{ label, value }]
  phones: ['phones', 'list'], // [{ label, value }]
  linkedin: ['linkedin', 'text'],
  urls: ['urls', 'list'], // [{ label, value }]
  location: ['location', 'text'],
  birthday: ['birthday', 'text'],
  whereMetTags: ['where_met_tags', 'list'],
  whereMet: ['where_met', 'text'],
  metOn: ['met_on', 'date'],
  similarities: ['similarities', 'text'],
  hopingForTags: ['hoping_for_tags', 'list'],
  hopingFor: ['hoping_for', 'text'],
  extraInfo: ['extra_info', 'text'],
  tags: ['tags', 'text'],
  closeness: ['closeness', 'text'],
  introducedBy: ['introduced_by', 'text'], // id of the card who introduced you
  introNote: ['intro_note', 'text'],
  followUpOn: ['follow_up_on', 'date'],
  lastContacted: ['last_contacted', 'date'],
  cadenceDays: ['cadence_days', 'num'],
  // Where "Lives in" is on the map, and which text that was looked up from.
  lat: ['lat', 'coord'],
  lng: ['lng', 'coord'],
  geoFor: ['geo_for', 'text'],
});

// Who knows whom: one row per pair of cards (a, b order doesn't matter).
export const connections = define('rolodex_connections', 'rolodex:connections', {
  a: ['a_id', 'text'],
  b: ['b_id', 'text'],
  kind: ['kind', 'text'],
  note: ['note', 'text'],
  introducedBy: ['introduced_by', 'text'], // id of the card who introduced a and b, if known
});

export const STORES = [contacts, connections];

// ---- Dates -------------------------------------------------------------------
export const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(`${toIso}T12:00:00`) - Date.parse(`${fromIso}T12:00:00`)) / 86400000);
}

export function prettyDate(iso) {
  if (!iso) return '';
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---- Names -------------------------------------------------------------------
export function displayName(c) {
  if (!c) return 'Unknown';
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return name || c.company || c.emails?.[0]?.value || 'Unnamed';
}

// Cards are filed by last name, like a real rolodex ("Lovelace, Ada").
export function fileName(c) {
  if (c.lastName && c.firstName) return `${c.lastName}, ${c.firstName}`;
  return displayName(c);
}

const sortKey = (c) => (c.lastName || c.firstName || c.company || '').toLocaleLowerCase();

export function letterOf(c) {
  const ch = sortKey(c).normalize('NFD').charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

export function sortedContacts(list = contacts.all()) {
  return [...list].sort((a, b) => {
    const la = letterOf(a); const lb = letterOf(b);
    if (la !== lb) return la === '#' ? 1 : lb === '#' ? -1 : la.localeCompare(lb);
    return sortKey(a).localeCompare(sortKey(b)) || displayName(a).localeCompare(displayName(b));
  });
}

export const initials = (c) => (displayName(c).match(/\b\p{L}/gu) ?? ['?']).slice(0, 2).join('').toUpperCase();

export function matches(c, query) {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  return [displayName(c), c.nickname, c.company, c.title, c.tags, c.location, c.whereMet, c.similarities,
    ...(c.whereMetTags ?? []), ...(c.emails ?? []).map((e) => e.value), ...(c.phones ?? []).map((p) => p.value)]
    .some((v) => v && String(v).toLocaleLowerCase().includes(q));
}

// ---- Follow-ups --------------------------------------------------------------
// The next follow-up is the date you set; otherwise the cadence counted from
// the last time you were in touch (or from when the card was added).
export function nextFollowUp(c) {
  if (c.followUpOn) return c.followUpOn;
  if (!c.cadenceDays) return null;
  const from = c.lastContacted || (c.created ? new Date(c.created).toISOString().slice(0, 10) : todayIso());
  return addDays(from, c.cadenceDays);
}

export function followUpList() {
  const today = todayIso();
  return contacts.all()
    .map((c) => ({ contact: c, due: nextFollowUp(c) }))
    .filter((x) => x.due)
    .map((x) => ({ ...x, days: daysBetween(today, x.due) }))
    .sort((a, b) => a.days - b.days);
}

export const dueCount = () => followUpList().filter((x) => x.days <= 0).length;

// You were in touch today: the date you'd set is used up, the cadence starts over.
export function logTouch(c) {
  contacts.upsert({ ...c, lastContacted: todayIso(), followUpOn: '', updated: Date.now() });
}

export function setCadence(c, days) {
  contacts.upsert({ ...c, cadenceDays: days, updated: Date.now() });
}

export function snooze(c, days) {
  contacts.upsert({ ...c, followUpOn: addDays(todayIso(), days), updated: Date.now() });
}

// ---- Connections ---------------------------------------------------------------
export const findEdge = (a, b) => connections.all().find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));

// Everything linking one card to others: mutual connections and introductions.
export function linksOf(id) {
  const edges = connections.all()
    .filter((e) => e.a === id || e.b === id)
    .map((e) => ({ edge: e, other: e.a === id ? e.b : e.a }))
    .filter((x) => contacts.get(x.other));
  const self = contacts.get(id);
  return {
    edges,
    introducedBy: self?.introducedBy ? contacts.get(self.introducedBy) : null,
    introduced: contacts.all().filter((c) => c.introducedBy === id),
  };
}

export function saveConnection({ id, a, b, kind, note, introducedBy }) {
  const existing = id ? connections.get(id) : findEdge(a, b);
  connections.upsert({
    ...(existing ?? { id: uid(), created: Date.now() }),
    a, b, kind: kind || 'unknown', note: note ?? '', introducedBy: introducedBy ?? '', updated: Date.now(),
  });
}

export function newContact(fields = {}) {
  const now = Date.now();
  return {
    id: uid(), firstName: '', lastName: '', nickname: '', company: '', title: '',
    emails: [], phones: [], linkedin: '', urls: [], location: '', birthday: '',
    whereMetTags: [], whereMet: '', metOn: '', similarities: '', hopingForTags: [], hopingFor: '',
    extraInfo: '', tags: '', closeness: '', introducedBy: '', introNote: '',
    followUpOn: '', lastContacted: '', cadenceDays: 0, lat: null, lng: null, geoFor: '', created: now, updated: now, ...fields,
  };
}

// Removing a card also removes its connections and forgets it as an introducer.
export function removeContact(id) {
  connections.all().filter((e) => e.a === id || e.b === id).forEach((e) => connections.remove(e.id));
  connections.all().filter((e) => e.introducedBy === id).forEach((e) => connections.upsert({ ...e, introducedBy: '', updated: Date.now() }));
  contacts.all().filter((c) => c.introducedBy === id).forEach((c) => contacts.upsert({ ...c, introducedBy: '', updated: Date.now() }));
  contacts.remove(id);
}
