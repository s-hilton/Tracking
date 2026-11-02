// "Paste from spreadsheet": fill in websites, emails and contact links for many
// investors at once. Paste rows copied from Excel / Google Sheets:
//
//   Name <tab> Website <tab> Email(s) or contact link
//
// Each value goes where it belongs:
//   info@ / hello@ / pitch@…           → the firm's general email
//   jane@fund.com, j.doe@fund.com      → a person (name guessed from the address)
//   linkedin.com/in/…                  → a person's LinkedIn
//   linkedin.com/company/…             → the firm's LinkedIn
//   any other link (contact page, form) → the firm's contact page
// Rows are matched to investors by name. Only empty fields are filled unless
// "Replace" is ticked; people are added unless they're already there.
import { h } from '../../ui.js';
import { firms, saveRecord, addOutreach, sortedRounds, rounds } from './data.js';

const GENERIC = new Set(['info', 'hello', 'hi', 'hey', 'contact', 'contactus', 'pitch', 'pitches', 'founders', 'team', 'invest',
  'investments', 'investing', 'deals', 'dealflow', 'sayhello', 'admin', 'office', 'general', 'inquiries', 'enquiries', 'ir',
  'partners', 'apply', 'submissions', 'startups', 'ventures', 'mail', 'kv']);

const EMAIL = /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i;
const URLISH = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]\S*)?$/i;

// "matt.ocko" → "Matt Ocko", "HTaneja" → "H. Taneja", "chrissy" → "Chrissy"
function nameFromLocal(local) {
  const parts = local.split(/[._-]+/).flatMap((p) => p.split(/(?<=[a-z])(?=[A-Z])|(?<=^[A-Z])(?=[A-Z][a-z])/)).filter(Boolean);
  return parts.map((p) => (p.length === 1 ? `${p.toUpperCase()}.` : p[0].toUpperCase() + p.slice(1).toLowerCase())).join(' ');
}

// linkedin.com/in/ian-rountree-12ab → "Ian Rountree"; one-word slugs can't be split, so no name.
function nameFromSlug(slug) {
  const words = slug.split('-').filter((w) => /^[a-z]+$/i.test(w));
  return words.length > 1 ? words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ') : '';
}

const withScheme = (url) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);
export const cleanSite = (url) => url.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
const cleanWebsite = (url) => cleanSite(url).replace(/^www\./i, '');
const domainOf = (url) => cleanWebsite(url).split(/[/?#]/)[0].toLowerCase();
const norm = (s) => (s ?? '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
const SUFFIX = /(ventures?|venturecapital|capital|vc|fund|partners|associates|group|labs|global|management|investments)+$/;
const core = (s) => norm(s).replace(SUFFIX, '') || norm(s);

// ---- Reading the paste -------------------------------------------------------
function splitLine(line) {
  if (line.includes('\t')) return line.split('\t');
  // CSV fallback: quoted cells may contain commas.
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (quoted && line[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; } else if (c === ',' && !quoted) { cells.push(cell); cell = ''; } else cell += c;
  }
  cells.push(cell);
  // Unquoted "Name, site, a@x.com, b@x.com": everything after the website is contact info.
  return [cells[0], cells[1] ?? '', cells.slice(2).join(' ')];
}

export function parseRows(text) {
  return text.split(/\r?\n/).map((line) => splitLine(line)).map((cells) => ({
    name: (cells[0] ?? '').trim(),
    website: (cells[1] ?? '').trim(),
    contact: cells.slice(2).join(' ').trim(),
  })).filter((r, i) => r.name && !(i === 0 && /^(name|investor|firm|fund|company)s?$/i.test(r.name)));
}

// Sort one row's values into firm fields and people.
export function classify(row) {
  const out = { website: '', email: '', linkedin: '', contactUrl: '', people: [], unread: [] };
  const tokens = row.contact.split(/[\s,;]+/).map((t) => t.replace(/^mailto:/i, '').replace(/[<>()]/g, '')).filter(Boolean);
  if (row.website) {
    if (row.website.includes('@')) tokens.unshift(row.website); // an email typed in the website column
    else if (URLISH.test(row.website)) out.website = cleanWebsite(row.website);
    else out.unread.push(row.website);
  }
  for (const t of tokens) {
    if (EMAIL.test(t)) {
      const email = t.toLowerCase();
      const local = t.split('@')[0];
      if (GENERIC.has(local.toLowerCase()) || local.length === 1) {
        if (!out.email) out.email = email;
        else if (out.email !== email) out.people.push({ name: '', title: '', email, phone: '', linkedin: '' });
      } else if (!out.people.some((p) => p.email === email)) {
        out.people.push({ name: nameFromLocal(local), title: '', email, phone: '', linkedin: '' });
      }
    } else if (URLISH.test(t)) {
      const url = withScheme(t);
      const li = url.match(/linkedin\.com\/(in|company|school)\/([^/?#]+)/i);
      if (li && li[1].toLowerCase() === 'in') {
        out.people.push({ name: nameFromSlug(li[2]), title: '', email: '', phone: '', linkedin: `https://www.linkedin.com/in/${li[2]}` });
      } else if (li) {
        if (!out.linkedin) out.linkedin = `https://www.linkedin.com/${li[1].toLowerCase()}/${li[2]}`;
      } else if (!out.contactUrl) {
        out.contactUrl = url;
      } else out.unread.push(t);
    } else out.unread.push(t);
  }
  return out;
}

// ---- Matching rows to investors ----------------------------------------------
export function matchFirm(name, list = firms.all()) {
  const n = norm(name);
  const exact = list.filter((f) => norm(f.name) === n);
  if (exact.length) return { firm: exact[0], fuzzy: false };
  const c = core(name);
  const close = list.filter((f) => {
    const fc = core(f.name);
    return fc === c || (Math.min(fc.length, c.length) >= 4 && (fc.startsWith(c) || c.startsWith(fc)));
  });
  return close.length === 1 ? { firm: close[0], fuzzy: true } : { firm: null, fuzzy: false, ambiguous: close.length > 1 };
}

const same = (a, b, key) => (key === 'website' ? cleanWebsite(a).toLowerCase() === cleanWebsite(b).toLowerCase() : a.trim().toLowerCase() === b.trim().toLowerCase());
const FIELDS = ['website', 'email', 'linkedin', 'contactUrl'];

// What would change for each row (nothing is saved yet).
export function plan(text, { replace = false } = {}) {
  const rows = parseRows(text);
  // Whose website is whose, to catch an email pasted on the wrong row.
  const owner = new Map();
  for (const f of firms.all()) if (f.website) owner.set(domainOf(f.website), norm(f.name));
  for (const r of rows) { const c = classify(r); if (c.website) owner.set(domainOf(c.website), norm(r.name)); }
  const ownerName = new Map([...firms.all().map((f) => [norm(f.name), f.name]), ...rows.map((r) => [norm(r.name), r.name])]);

  return rows.map((row) => {
    const found = classify(row);
    const { firm, fuzzy, ambiguous } = matchFirm(row.name);
    const me = new Set([norm(row.name), firm && norm(firm.name)]);
    const warnings = [];
    const foreign = (email) => {
      const who = owner.get(email.split('@')[1].toLowerCase());
      if (!who || me.has(who)) return false;
      warnings.push(`${email} looks like ${ownerName.get(who)}’s email, left out`);
      return true;
    };
    if (found.email && foreign(found.email)) found.email = '';
    found.people = found.people.filter((x) => !x.email || !foreign(x.email));
    const current = firm ?? {};
    const changes = {};
    const kept = {};
    for (const key of FIELDS) {
      const value = found[key];
      if (!value) continue;
      const had = current[key] ?? '';
      if (!had) changes[key] = value;
      else if (same(had, value, key)) continue;
      else if (replace) changes[key] = value;
      else kept[key] = had;
    }
    const existing = current.contacts ?? [];
    const has = (p) => existing.some((e) => (p.email && e.email?.toLowerCase() === p.email) || (p.linkedin && e.linkedin && cleanSite(e.linkedin).toLowerCase() === cleanSite(p.linkedin).toLowerCase()));
    const people = found.people.filter((p) => !has(p));
    return { row, firm, fuzzy, ambiguous, changes, kept, people, unread: found.unread, warnings };
  });
}

export const hasWork = (p) => Object.keys(p.changes).length > 0 || p.people.length > 0;

export function apply(planned, { addMissing = false, roundId = '' } = {}) {
  let updated = 0;
  let added = 0;
  for (const p of planned) {
    if (p.firm) {
      if (!hasWork(p)) continue;
      const current = firms.get(p.firm.id) ?? p.firm;
      saveRecord(firms, { ...current, ...p.changes, contacts: [...(current.contacts ?? []), ...p.people] });
      updated++;
    } else if (addMissing && !p.ambiguous) {
      const clash = firms.all().find((f) => norm(f.name) === norm(p.row.name)); // same name twice in the paste
      if (clash) {
        saveRecord(firms, { ...clash, ...Object.fromEntries(Object.entries(p.changes).filter(([k]) => !clash[k])), contacts: [...(clash.contacts ?? []), ...p.people] });
        continue;
      }
      const firm = saveRecord(firms, {
        name: p.row.name, type: '', website: '', email: '', phone: '', linkedin: '', contactUrl: '', location: '', checkSize: '', focus: '',
        introducedBy: '', tags: '', notes: '', wantsUpdates: false, lastUpdateSent: '', ...p.changes, contacts: p.people,
      });
      if (roundId && rounds.get(roundId)) addOutreach(firm.id, roundId, { contactName: p.people.find((x) => x.name)?.name ?? '' });
      added++;
    }
  }
  return { updated, added };
}

// ---- The panel ---------------------------------------------------------------
const LABELS = { website: 'Website', email: 'Email', linkedin: 'LinkedIn', contactUrl: 'Contact page' };
const short = (s) => { const t = cleanSite(s); return t.length > 34 ? `${t.slice(0, 32)}…` : t; };

export function openPasteImport(host, { roundId = '' } = {}) {
  const textarea = h('textarea', {
    class: 'input inv-paste', rows: 7, spellcheck: false,
    placeholder: 'Copy the rows from your spreadsheet and paste here:\nName ⇥ Website ⇥ Email(s) or contact link\n1517 Fund\t1517fund.com\t1517fund.com/contact\nRoot Ventures\troot.vc\tchrissy@root.vc, kane@root.vc',
  });
  const replace = h('input', { type: 'checkbox' });
  const addMissing = h('input', { type: 'checkbox' });
  const roundChoices = sortedRounds();
  const round = h('select', { class: 'input inv-import-round', 'aria-label': 'Round for new investors' },
    h('option', { value: '' }, 'no round'),
    ...roundChoices.map((r) => h('option', { value: r.id, selected: r.id === (roundId || roundChoices.find((x) => x.status === 'active')?.id) }, r.name)));
  const summary = h('p', { class: 'small inv-import-summary' });
  const preview = h('div', { class: 'inv-import-preview' });
  const go = h('button', { class: 'btn primary', type: 'button', disabled: true }, 'Update');
  let planned = [];

  function cell(p, key) {
    if (p.changes[key]) return h('td', { class: 'new', title: p.changes[key] }, short(p.changes[key]));
    if (p.kept[key]) return h('td', { class: 'muted', title: `Already has ${p.kept[key]} (tick Replace to overwrite)` }, `kept: ${short(p.kept[key])}`);
    const had = p.firm?.[key];
    return h('td', { class: 'muted', title: had || '' }, had ? short(had) : '');
  }

  function refresh() {
    planned = plan(textarea.value, { replace: replace.checked });
    const matched = planned.filter((p) => p.firm);
    const work = matched.filter(hasWork);
    const missing = planned.filter((p) => !p.firm);
    const adding = addMissing.checked ? missing.filter((p) => !p.ambiguous) : [];
    round.disabled = !addMissing.checked;
    summary.textContent = planned.length
      ? `${planned.length} row${planned.length === 1 ? '' : 's'} · ${matched.length} matched (${work.length} with something to fill in) · ${missing.length} not in your investors${addMissing.checked ? '' : ' (skipped)'}`
      : '';
    go.disabled = !work.length && !adding.length;
    go.textContent = [work.length ? `Update ${work.length} investor${work.length === 1 ? '' : 's'}` : '', adding.length ? `add ${adding.length}` : ''].filter(Boolean).join(' and ') || 'Nothing to update';
    go.textContent = go.textContent[0].toUpperCase() + go.textContent.slice(1);

    preview.replaceChildren(planned.length ? h('table', { class: 'inv-import-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Investor'), ...Object.values(LABELS).map((l) => h('th', {}, l)), h('th', {}, 'People added'))),
      h('tbody', {}, ...planned.map((p) => h('tr', { class: !p.firm ? (addMissing.checked && !p.ambiguous ? 'adding' : 'missing') : hasWork(p) ? '' : 'nochange' },
        h('td', {},
          h('strong', {}, p.row.name),
          !p.firm ? h('div', { class: 'small inv-import-flag' }, p.ambiguous ? 'Several investors match — skipped' : addMissing.checked ? 'New — will be added' : 'Not in your investors')
            : p.fuzzy ? h('div', { class: 'small muted' }, `→ ${p.firm.name}`)
              : !hasWork(p) ? h('div', { class: 'small muted' }, 'Nothing new') : null,
          ...p.warnings.map((w) => h('div', { class: 'small inv-import-flag' }, `⚠ ${w}`)),
          p.unread.length ? h('div', { class: 'small inv-import-flag', title: p.unread.join(' ') }, `Couldn’t read: ${p.unread.join(' ')}`) : null),
        ...Object.keys(LABELS).map((key) => cell(p, key)),
        h('td', { class: p.people.length ? 'new' : '' }, p.people.map((x) => x.name || x.email || 'LinkedIn profile').join(', ')))))) : null);
  }

  let timer;
  textarea.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(refresh, 150); });
  replace.addEventListener('change', refresh);
  addMissing.addEventListener('change', refresh);

  function close() { overlay.remove(); document.removeEventListener('keydown', onKey); }
  const onKey = (e) => { if (e.key === 'Escape' && host.contains(overlay)) close(); };

  go.addEventListener('click', () => {
    const { updated, added } = apply(planned, { addMissing: addMissing.checked, roundId: round.value });
    close();
    alert([`Updated ${updated} investor${updated === 1 ? '' : 's'}.`, added ? `Added ${added} new investor${added === 1 ? '' : 's'}${round.value ? ` to ${rounds.get(round.value)?.name}` : ''}.` : ''].filter(Boolean).join('\n'));
  });

  const overlay = h('div', { class: 'inv-overlay' },
    h('div', { class: 'inv-panel inv-import' },
      h('div', { class: 'inv-panel-head' },
        h('h3', {}, 'Paste from spreadsheet'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕')),
      h('p', { class: 'muted small inv-intro' },
        'Select the columns Name, Website and Email / contact link in Excel or Google Sheets, copy, and paste below. Generic emails (info@, hello@…) become the firm’s email, personal ones become people, LinkedIn profiles become people, and other links become the contact page. Only empty fields are filled in.'),
      textarea,
      h('div', { class: 'inv-import-options' },
        h('label', { class: 'inv-check' }, replace, h('span', {}, 'Replace values that are already filled in')),
        h('label', { class: 'inv-check' }, addMissing, h('span', {}, 'Add investors that aren’t in the tracker yet, to'), round)),
      summary,
      preview,
      h('div', { class: 'inv-panel-actions' },
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn', onclick: close }, 'Cancel'),
        go)));

  host.append(overlay);
  document.addEventListener('keydown', onKey);
  refresh();
  textarea.focus();
}
