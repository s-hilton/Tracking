// Export every card: a .vcf for your phone's Contacts app, a .csv for a
// spreadsheet, or a .json backup that also keeps the connections.
import { h } from '../../ui.js';
import { CADENCES, RELATIONS, CLOSENESS, ME, cadenceLabel } from './config.js';
import { contacts, connections, displayName, sortedContacts, linksOf, nextFollowUp, todayIso } from './data.js';
import { openSheet } from './widgets.js';

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Everything the phone has no field for, written into the contact's notes.
function notesFor(c) {
  const name = (id) => (id === ME ? 'me' : displayName(contacts.get(id)));
  const { edges, introducedBy } = linksOf(c.id);
  return [
    c.whereMetTags?.length || c.whereMet ? `Where we met: ${[c.whereMetTags?.join(', '), c.whereMet].filter(Boolean).join(' — ')}` : '',
    c.metOn ? `Met on: ${c.metOn}` : '',
    introducedBy ? `Introduced by: ${displayName(introducedBy)}${c.introNote ? ` (${c.introNote})` : ''}` : '',
    c.similarities ? `Similarities: ${c.similarities}` : '',
    c.hopingForTags?.length || c.hopingFor ? `Hoping for: ${[c.hopingForTags?.join(', '), c.hopingFor].filter(Boolean).join(' — ')}` : '',
    edges.length ? `Knows: ${edges.map(({ edge, other }) => `${name(other)} (${RELATIONS[edge.kind]?.label ?? 'Unknown'}${edge.note ? `: ${edge.note}` : ''})`).join('; ')}` : '',
    c.extraInfo,
  ].filter(Boolean).join('\n');
}

// ---- vCard 3.0 ---------------------------------------------------------------------
const esc = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

// Lines longer than 75 bytes are folded, as the format asks.
function fold(line) {
  const out = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 74;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

const TEL_TYPES = { mobile: 'CELL', iphone: 'IPHONE', home: 'HOME', work: 'WORK', main: 'MAIN', fax: 'FAX' };
const typeFor = (label, map, fallback) => map[label?.toLowerCase()] ?? fallback;

export function toVcf(list = sortedContacts()) {
  return list.map((c) => {
    let item = 0;
    const lines = [
      'BEGIN:VCARD', 'VERSION:3.0',
      `N:${esc(c.lastName)};${esc(c.firstName)};;;`,
      `FN:${esc(displayName(c))}`,
      c.nickname ? `NICKNAME:${esc(c.nickname)}` : '',
      c.company ? `ORG:${esc(c.company)};` : '',
      c.title ? `TITLE:${esc(c.title)}` : '',
      ...(c.emails ?? []).map((e) => `EMAIL;type=INTERNET;type=${typeFor(e.label, { home: 'HOME', work: 'WORK' }, 'OTHER')}:${esc(e.value)}`),
      ...(c.phones ?? []).map((p) => `TEL;type=${typeFor(p.label, TEL_TYPES, 'CELL')};type=VOICE:${esc(p.value)}`),
      c.linkedin ? `item${++item}.URL:${esc(c.linkedin)}\r\nitem${item}.X-ABLabel:LinkedIn` : '',
      ...(c.urls ?? []).map((u) => `item${++item}.URL:${esc(u.value)}${u.label ? `\r\nitem${item}.X-ABLabel:${esc(u.label)}` : ''}`),
      c.location ? `ADR;type=HOME:;;;${esc(c.location)};;;` : '',
      /^\d{4}-\d{2}-\d{2}$/.test(c.birthday) ? `BDAY:${c.birthday}` : '',
      notesFor(c) ? `NOTE:${esc(notesFor(c))}` : '',
      'END:VCARD',
    ];
    return lines.filter(Boolean).flatMap((l) => l.split('\r\n')).map(fold).join('\r\n');
  }).join('\r\n');
}

// ---- CSV -----------------------------------------------------------------------------
// Text starting with = or @ would run as a formula in a spreadsheet, so it gets a leading '.
const cell = (v) => {
  let s = String(v ?? '');
  if (/^[=@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(list = sortedContacts()) {
  const name = (id) => (id === ME ? 'Me' : displayName(contacts.get(id)));
  const join = (rows) => (rows ?? []).map((r) => (r.label ? `${r.label}: ${r.value}` : r.value)).join('; ');
  const columns = [
    ['First name', (c) => c.firstName], ['Last name', (c) => c.lastName], ['Goes by', (c) => c.nickname],
    ['Company', (c) => c.company], ['Title', (c) => c.title],
    ['Emails', (c) => join(c.emails)], ['Phones', (c) => join(c.phones)],
    ['LinkedIn', (c) => c.linkedin], ['Other links', (c) => join(c.urls)],
    ['Lives in', (c) => c.location], ['Birthday', (c) => c.birthday],
    ['Where we met', (c) => c.whereMetTags?.join(', ')], ['How we met', (c) => c.whereMet], ['Met on', (c) => c.metOn],
    ['Introduced by', (c) => (c.introducedBy ? name(c.introducedBy) : '')], ['About the introduction', (c) => c.introNote],
    ['Similarities', (c) => c.similarities],
    ['Hoping for', (c) => c.hopingForTags?.join(', ')], ['Hoping for (notes)', (c) => c.hopingFor],
    ['How close', (c) => (c.closeness ? CLOSENESS[c.closeness] ?? c.closeness : '')], ['Tags', (c) => c.tags],
    ['Remind me', (c) => cadenceLabel(c.cadenceDays ?? 0)], ['Last reached out', (c) => c.lastContacted], ['Next follow-up', (c) => nextFollowUp(c) ?? ''],
    ['Connections', (c) => linksOf(c.id).edges.map(({ edge, other }) => `${name(other)} (${RELATIONS[edge.kind]?.label ?? 'Unknown'}${edge.note ? `: ${edge.note}` : ''})`).join('; ')],
    ['Extra info', (c) => c.extraInfo],
  ];
  const rows = [columns.map(([label]) => label), ...list.map((c) => columns.map(([, get]) => get(c)))];
  return `\uFEFF${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`; // BOM so Excel reads accents right
}

export function exportContacts(host, { toast } = {}) {
  const n = contacts.all().length;
  const stamp = todayIso();
  const done = (what) => { sheet.close(); toast?.(`Exported ${n} card${n === 1 ? '' : 's'} as ${what}.`); };
  const option = (icon, title, hint, run) => h('button', { type: 'button', class: 'rdx-export-opt', disabled: !n, onclick: run },
    h('span', { class: 'rdx-export-icon', 'aria-hidden': 'true' }, icon),
    h('span', {}, h('strong', {}, title), h('span', { class: 'rdx-dim small' }, hint)));

  const body = h('div', { class: 'rdx-export' },
    n ? null : h('p', { class: 'rdx-blank' }, 'There are no cards to export yet.'),
    option('📱', 'Contacts file (.vcf)', 'Opens in iPhone, Mac, Google and Outlook contacts. Where you met, hopes and connections go in each contact’s notes.',
      () => { download(`rolodex-${stamp}.vcf`, toVcf(), 'text/vcard'); done('a contacts file'); }),
    option('📊', 'Spreadsheet (.csv)', 'Every field in its own column, for Excel, Numbers or Google Sheets.',
      () => { download(`rolodex-${stamp}.csv`, toCsv(), 'text/csv'); done('a spreadsheet'); }),
    option('💾', 'Full backup (.json)', 'Every card and connection exactly as stored, for safekeeping.',
      () => {
        const backup = { exportedAt: new Date().toISOString(), cadences: CADENCES, contacts: contacts.all(), connections: connections.all() };
        download(`rolodex-backup-${stamp}.json`, JSON.stringify(backup, null, 2), 'application/json');
        done('a backup');
      }));

  const sheet = openSheet(host, { title: `Export ${n} card${n === 1 ? '' : 's'}`, tab: 'Export', body });
}
