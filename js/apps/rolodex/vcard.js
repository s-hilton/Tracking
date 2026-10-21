// Reading contacts exported from an iPhone. The Contacts app (and iCloud.com)
// exports .vcf files (vCard 3.0, sometimes 2.1); spreadsheet exports come as .csv.
// Both turn into plain card fields; nothing here touches the stores.

// ---- vCard -------------------------------------------------------------------
function unfold(text) {
  // Continuation lines start with a space or tab; vCard 2.1 quoted-printable uses a trailing "=".
  return text.replace(/\r\n?/g, '\n').replace(/=\n/g, '').replace(/\n[ \t]/g, '');
}

function decodeQuotedPrintable(value, charset = 'utf-8') {
  const bytes = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '=' && /^[0-9A-F]{2}$/i.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...new TextEncoder().encode(value[i]));
    }
  }
  try { return new TextDecoder(charset).decode(new Uint8Array(bytes)); } catch { return new TextDecoder().decode(new Uint8Array(bytes)); }
}

const unescape = (v) => v.replace(/\\n/gi, '\n').replace(/\\([,;:\\])/g, '$1');

// Split on a separator that isn't backslash-escaped.
const splitUnescaped = (v, sep) => v.split(new RegExp(`(?<!\\\\)${sep}`));

function parseLine(line) {
  const colon = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  if (colon < 0) return null;
  const [nameWithGroup, ...paramParts] = line.slice(0, colon).split(';');
  const [group, name] = nameWithGroup.includes('.') ? nameWithGroup.split('.') : ['', nameWithGroup];
  const params = { type: [] };
  for (const part of paramParts) {
    const [k, v] = part.includes('=') ? part.split('=') : ['TYPE', part];
    const key = k.toUpperCase();
    if (key === 'TYPE') params.type.push(...v.replace(/"/g, '').split(',').map((t) => t.toLowerCase()));
    else params[key] = v.replace(/"/g, '');
  }
  let value = line.slice(colon + 1);
  if (params.ENCODING?.toUpperCase() === 'QUOTED-PRINTABLE') value = decodeQuotedPrintable(value, params.CHARSET);
  return { group: group.toLowerCase(), name: name.toUpperCase(), params, value };
}

// Turns Apple's "_$!<Mobile>!$_" labels into "Mobile".
const cleanLabel = (label) => label.replace(/^_\$!<(.*)>!\$_$/, '$1');

const TYPE_LABELS = { cell: 'Mobile', mobile: 'Mobile', iphone: 'iPhone', home: 'Home', work: 'Work', main: 'Main', fax: 'Fax', other: 'Other', pager: 'Pager' };

function typeLabel(params) {
  const known = params.type.filter((t) => TYPE_LABELS[t]);
  const pick = known.find((t) => t !== 'voice' && t !== 'internet' && t !== 'pref') ?? known[0];
  return pick ? TYPE_LABELS[pick] : '';
}

function cardFromLines(lines) {
  const props = lines.map(parseLine).filter(Boolean);
  const labels = Object.fromEntries(props.filter((p) => p.name === 'X-ABLABEL' && p.group).map((p) => [p.group, cleanLabel(unescape(p.value))]));
  const labelOf = (p) => (p.group && labels[p.group]) || typeLabel(p.params);
  const card = { firstName: '', lastName: '', nickname: '', company: '', title: '', emails: [], phones: [], urls: [], linkedin: '', location: '', birthday: '', extraInfo: '' };
  let fullName = '';
  const notes = [];

  for (const p of props) {
    const v = p.value;
    switch (p.name) {
      case 'N': {
        const [last = '', first = '', middle = '', prefix = '', suffix = ''] = splitUnescaped(v, ';').map(unescape);
        card.lastName = [last, suffix].filter(Boolean).join(' ').trim();
        card.firstName = [prefix, first, middle].filter(Boolean).join(' ').trim();
        break;
      }
      case 'FN': fullName = unescape(v).trim(); break;
      case 'NICKNAME': card.nickname = unescape(v); break;
      case 'ORG': card.company = splitUnescaped(v, ';').map(unescape).filter(Boolean).join(', '); break;
      case 'TITLE': card.title = unescape(v); break;
      case 'EMAIL': if (v.trim()) card.emails.push({ label: labelOf(p), value: unescape(v).trim() }); break;
      case 'TEL': if (v.trim()) card.phones.push({ label: labelOf(p), value: unescape(v).trim() }); break;
      case 'URL': {
        const url = unescape(v).trim();
        if (!url) break;
        if (/linkedin\.com/i.test(url) && !card.linkedin) card.linkedin = url;
        else card.urls.push({ label: labelOf(p) || 'Website', value: url });
        break;
      }
      case 'X-SOCIALPROFILE': {
        const url = unescape(v).trim().replace(/^x-apple:/, '');
        const network = (p.params.type[0] || '').toLowerCase();
        if (network === 'linkedin' || /linkedin\.com/i.test(url)) card.linkedin ||= url.startsWith('http') ? url : `https://www.linkedin.com/in/${url}`;
        else if (url) card.urls.push({ label: network ? network[0].toUpperCase() + network.slice(1) : 'Profile', value: url });
        break;
      }
      case 'ADR': {
        if (card.location) break;
        const [, , , city = '', region = '', , country = ''] = splitUnescaped(v, ';').map(unescape);
        card.location = [city, region, country].filter(Boolean).join(', ');
        break;
      }
      case 'BDAY': card.birthday = v.replace(/^--/, '').slice(0, 10); break;
      case 'NOTE': if (v.trim()) notes.push(unescape(v).trim()); break;
      case 'X-ABRELATEDNAMES': if (v.trim()) notes.push(`${labelOf(p) || 'Related'}: ${unescape(v).trim()}`); break;
      default: break;
    }
  }
  if (!card.firstName && !card.lastName && fullName) {
    const parts = fullName.split(/\s+/);
    card.lastName = parts.length > 1 ? parts.pop() : '';
    card.firstName = parts.join(' ');
  }
  card.extraInfo = notes.join('\n\n');
  return card;
}

export function parseVcf(text) {
  const cards = [];
  let current = null;
  for (const line of unfold(text).split('\n')) {
    if (/^BEGIN:VCARD/i.test(line)) current = [];
    else if (/^END:VCARD/i.test(line)) { if (current) cards.push(cardFromLines(current)); current = null; }
    else if (current && line.trim()) current.push(line);
  }
  return cards.filter((c) => c.firstName || c.lastName || c.company || c.emails.length || c.phones.length);
}

// ---- CSV -----------------------------------------------------------------------
function parseCsvRows(text) {
  const rows = [];
  let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim()));
}

// Matches the column names used by common exports (Google, Outlook, iPhone export apps).
export function parseCsv(text) {
  const [header, ...rows] = parseCsvRows(text.replace(/^﻿/, ''));
  if (!header) return [];
  const cols = header.map((x) => x.trim().toLowerCase());
  const find = (...names) => cols.findIndex((c) => names.some((n) => c === n));
  const all = (re) => cols.map((c, i) => (re.test(c) ? i : -1)).filter((i) => i >= 0);
  const idx = {
    first: find('first name', 'given name', 'firstname', 'first'),
    last: find('last name', 'family name', 'lastname', 'surname', 'last'),
    name: find('name', 'full name', 'display name'),
    company: find('company', 'organization', 'organization 1 - name', 'organisation'),
    title: find('title', 'job title', 'organization 1 - title'),
    notes: find('notes', 'note'),
    linkedin: find('linkedin', 'linkedin url'),
    birthday: find('birthday'),
  };
  const emailCols = all(/e-?mail(?!.*type)/);
  const phoneCols = all(/phone|mobile|tel(?!.*type)/).filter((i) => !/type|label/.test(cols[i]));
  const urlCols = all(/web|url|site/).filter((i) => i !== idx.linkedin && !/type|label/.test(cols[i]));
  const at = (r, i) => (i >= 0 ? (r[i] ?? '').trim() : '');

  return rows.map((r) => {
    let firstName = at(r, idx.first); let lastName = at(r, idx.last);
    if (!firstName && !lastName && at(r, idx.name)) {
      const parts = at(r, idx.name).split(/\s+/);
      lastName = parts.length > 1 ? parts.pop() : '';
      firstName = parts.join(' ');
    }
    const urls = urlCols.flatMap((i) => at(r, i).split(/\s*:::\s*/)).filter(Boolean);
    const linkedin = at(r, idx.linkedin) || urls.find((u) => /linkedin\.com/i.test(u)) || '';
    return {
      firstName, lastName, nickname: '',
      company: at(r, idx.company), title: at(r, idx.title),
      emails: emailCols.flatMap((i) => at(r, i).split(/\s*:::\s*/)).filter(Boolean).map((value) => ({ label: '', value })),
      phones: phoneCols.flatMap((i) => at(r, i).split(/\s*:::\s*/)).filter(Boolean).map((value) => ({ label: '', value })),
      urls: urls.filter((u) => u !== linkedin).map((value) => ({ label: 'Website', value })),
      linkedin, location: '', birthday: at(r, idx.birthday), extraInfo: at(r, idx.notes),
    };
  }).filter((c) => c.firstName || c.lastName || c.company || c.emails.length || c.phones.length);
}

export function parseContactsFile(name, text) {
  if (/\.csv$/i.test(name) || (!/BEGIN:VCARD/i.test(text) && text.includes(','))) return parseCsv(text);
  return parseVcf(text);
}
