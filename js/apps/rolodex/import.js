// Import an iPhone contacts export (.vcf, or .csv) as new cards, with a preview
// that flags people already in the rolodex so nothing is filed twice.
import { h } from '../../ui.js';
import { contacts, displayName, newContact } from './data.js';
import { parseContactsFile } from './vcard.js';
import { openSheet } from './widgets.js';

const digits = (p) => p.replace(/\D/g, '').slice(-10);
const fullName = (c) => [c.firstName, c.lastName].join(' ').trim().toLowerCase();

function findExisting(card) {
  const emails = new Set(card.emails.map((e) => e.value.toLowerCase()));
  const phones = new Set(card.phones.map((p) => digits(p.value)).filter((p) => p.length >= 7));
  const name = fullName(card);
  return contacts.all().find((c) => c.emails?.some((e) => emails.has(e.value.toLowerCase()))
    || c.phones?.some((p) => phones.has(digits(p.value)))
    || (name && fullName(c) === name));
}

// Fill in what the existing card is missing; never overwrite what you wrote.
function merge(existing, card) {
  const out = { ...existing, updated: Date.now() };
  for (const key of ['firstName', 'lastName', 'nickname', 'company', 'title', 'linkedin', 'location', 'birthday']) if (!out[key] && card[key]) out[key] = card[key];
  const addAll = (key, norm) => {
    const have = new Set((out[key] ?? []).map((x) => norm(x.value)));
    out[key] = [...(out[key] ?? []), ...card[key].filter((x) => !have.has(norm(x.value)))];
  };
  addAll('emails', (v) => v.toLowerCase());
  addAll('phones', digits);
  addAll('urls', (v) => v.toLowerCase());
  if (card.extraInfo && !(out.extraInfo ?? '').includes(card.extraInfo)) out.extraInfo = [out.extraInfo, card.extraInfo].filter(Boolean).join('\n\n');
  return out;
}

export function importContacts(host, { onDone } = {}) {
  const input = h('input', { type: 'file', accept: '.vcf,.vcard,.csv,text/vcard,text/x-vcard,text/csv', hidden: true, multiple: true });
  const body = h('div', { class: 'rdx-import' });
  let rows = []; // { card, existing, pick }
  let mergeDupes = true;

  const intro = () => body.replaceChildren(
    h('div', { class: 'rdx-howto' },
      h('p', {}, h('strong', {}, 'From your iPhone')),
      h('ol', {},
        h('li', {}, 'Open the ', h('strong', {}, 'Contacts'), ' app and tap ', h('strong', {}, 'Lists'), ' (top left).'),
        h('li', {}, 'Press and hold ', h('strong', {}, 'All Contacts'), ', then tap ', h('strong', {}, 'Export'), '.'),
        h('li', {}, 'Save the .vcf file to Files (or AirDrop it to this computer).'),
        h('li', {}, 'Tap ', h('strong', {}, 'Choose file'), ' below and pick it.')),
      h('p', { class: 'rdx-dim small' }, 'On a computer you can also export from iCloud.com → Contacts → select all → Export vCard. CSV files from Google or Outlook work too.')),
    h('button', { type: 'button', class: 'rdx-btn primary big', onclick: () => input.click() }, '📇 Choose file…'),
    input);

  function preview() {
    const fresh = rows.filter((r) => !r.existing).length;
    const dupes = rows.length - fresh;
    const list = h('div', { class: 'rdx-import-list' }, ...rows.map((r) => h('label', { class: `rdx-import-row${r.existing ? ' dupe' : ''}` },
      h('input', { type: 'checkbox', checked: r.pick, onchange: (e) => { r.pick = e.target.checked; count(); } }),
      h('span', { class: 'rdx-import-name' }, displayName(r.card)),
      h('span', { class: 'rdx-dim' }, [r.card.company, r.card.emails[0]?.value ?? r.card.phones[0]?.value].filter(Boolean).join(' · ')),
      r.existing ? h('span', { class: 'rdx-tag' }, `on file as ${displayName(r.existing)}: adds what’s missing`) : null)));
    const summary = h('p', {}, `${rows.length} found: ${fresh} new`, dupes ? `, ${dupes} already in your rolodex` : '', '.');
    const all = (on) => { rows.forEach((r) => { r.pick = on; }); preview(); };
    body.replaceChildren(summary,
      h('div', { class: 'rdx-row' },
        h('button', { type: 'button', class: 'rdx-link', onclick: () => all(true) }, 'Select all'),
        h('button', { type: 'button', class: 'rdx-link', onclick: () => all(false) }, 'Select none'),
        dupes ? h('label', { class: 'rdx-check' },
          h('input', { type: 'checkbox', checked: mergeDupes, onchange: (e) => { mergeDupes = e.target.checked; } }),
          'Add new phone numbers / emails to cards already on file') : null),
      list);
    count();
  }

  const go = h('button', { type: 'button', class: 'rdx-btn primary', hidden: true, onclick: run }, 'Import');
  function count() {
    const n = rows.filter((r) => r.pick).length;
    go.hidden = !rows.length;
    go.disabled = !n;
    go.textContent = n ? `File ${n} card${n === 1 ? '' : 's'}` : 'Nothing selected';
  }

  function run() {
    let added = 0; let merged = 0;
    for (const r of rows.filter((x) => x.pick)) {
      if (r.existing) {
        if (mergeDupes) { contacts.upsert(merge(contacts.get(r.existing.id) ?? r.existing, r.card)); merged++; }
      } else {
        contacts.upsert(newContact(r.card));
        added++;
      }
    }
    sheet.close();
    onDone?.({ added, merged });
  }

  input.addEventListener('change', async () => {
    const files = [...input.files];
    if (!files.length) return;
    const cards = (await Promise.all(files.map(async (f) => parseContactsFile(f.name, await f.text())))).flat();
    if (!cards.length) {
      body.prepend(h('p', { class: 'rdx-error' }, 'No contacts found in that file. Is it a .vcf or .csv export?'));
      return;
    }
    rows = cards.map((card) => {
      const existing = findExisting(card);
      return { card, existing, pick: true };
    });
    preview();
  });

  intro();
  const sheet = openSheet(host, {
    title: 'Import contacts',
    tab: 'Import',
    body,
    actions: [h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'rdx-btn', onclick: () => sheet.close() }, 'Cancel'), go],
  });
}
