// The editor for one government or institution: interest, pipeline stage and
// follow-up, its map-data link, website, phone, leadership, contacts, parcels of
// interest, notes and activity. Used on the Governments, Institutions and
// Pipeline tabs. Nothing is stored until you change something.
//
//   recordEditor(base, { suggest })
//     base     { key, category, name, kind, stateAbbr, website?, phone?, lat?, lng?, … }
//     suggest  { website, phone, office, leaders: [{ name, since }], loading, error } from Wikidata
import { h } from '../../ui.js';
import {
  sites, savedFor, editRecord, setInterest, setStage, logActivity, INTEREST, STAGES, OPEN_STAGES, ACTIVITY_TYPES,
  FOLLOW_UP_DAYS, daysLate, formatDate,
} from './data.js';

const link = (href, label) => h('a', { class: 'land-link', href, target: '_blank', rel: 'noopener' }, label);
const withScheme = (url) => (url && !/^[a-z]+:/i.test(url) ? `https://${url}` : url);

export function followUpText(s) {
  if (!s?.nextFollowUp || !OPEN_STAGES.includes(s.stage) || s.interest !== 'yes') return null;
  const late = daysLate(s.nextFollowUp);
  return h('span', { class: `land-due${late > 0 ? ' late' : late === 0 ? ' today' : ''}` },
    late > 0 ? `${late} day${late === 1 ? '' : 's'} overdue` : late === 0 ? 'Follow up today' : `Follow up ${formatDate(s.nextFollowUp)}`);
}

export function interestBadge(s) {
  const i = INTEREST[s?.interest ?? ''];
  if (!s?.interest) return null;
  return h('span', { class: 'land-interest-badge', style: `--c:${i.color}` }, s.interest === 'yes' ? `${i.label} · ${STAGES[s.stage]?.label ?? s.stage}` : i.label);
}

export function stageSelect(s, base) {
  return h('select', { class: 'input land-stage', style: `--c:${STAGES[s.stage]?.color}`, 'aria-label': 'Pipeline stage', onchange: (e) => setStage(sites.get(savedFor(base.key).id), e.target.value) },
    ...Object.entries(STAGES).map(([k, st]) => h('option', { value: k, selected: k === s.stage }, st.label)));
}

export function recordEditor(base, { suggest = null } = {}) {
  const r = savedFor(base.key);
  const val = (k) => r?.[k] ?? base[k] ?? '';
  const edit = (patch) => editRecord(base, patch);

  const input = (label, key, { type = 'text', placeholder = '', open = false } = {}) => {
    const v = val(key);
    return h('label', { class: 'land-form-field' },
      h('span', { class: 'muted small' }, label),
      h('div', { class: 'land-input-row' },
        h('input', { class: 'input', type, value: v, placeholder, onchange: (e) => edit({ [key]: e.target.value.trim() }) }),
        open && v ? link(type === 'tel' ? `tel:${v.replace(/[^\d+]/g, '')}` : withScheme(v), type === 'tel' ? 'Call' : 'Open') : null),
      suggest && suggest[key] && !v ? h('button', { type: 'button', class: 'link-btn small', onclick: () => edit({ [key]: suggest[key] }) }, `Use ${suggest[key].replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')} (Wikidata)`) : null);
  };

  // Interest + pipeline
  const interest = h('div', { class: 'land-interest' },
    h('span', { class: 'land-label' }, 'Interest'),
    h('div', { class: 'land-seg' }, ...Object.entries(INTEREST).map(([k, i]) => h('button', {
      type: 'button', class: `land-seg-btn${(r?.interest ?? '') === k ? ' on' : ''}`, style: `--c:${i.color}`,
      onclick: () => setInterest(base, k),
    }, i.label))));
  const pipeline = r?.interest === 'yes' ? h('div', { class: 'land-pipeline-row' },
    h('label', { class: 'land-form-field' }, h('span', { class: 'muted small' }, 'Pipeline stage'), stageSelect(r, base)),
    h('label', { class: 'land-form-field' }, h('span', { class: 'muted small' }, 'Next follow-up'),
      h('input', { class: 'input', type: 'date', value: r.nextFollowUp, onchange: (e) => edit({ nextFollowUp: e.target.value }) })),
    h('div', { class: 'land-form-field' }, h('span', { class: 'muted small' }, ' '), followUpText(r) ?? h('span', { class: 'muted small' }, OPEN_STAGES.includes(r.stage) ? 'No follow-up set' : 'Closed')),
    r.stage === 'declined' ? h('label', { class: 'land-form-field wide' }, h('span', { class: 'muted small' }, 'Why they declined'),
      h('input', { class: 'input', value: r.declineReason, onchange: (e) => edit({ declineReason: e.target.value }) })) : null) : null;

  // Leadership from Wikidata
  const contacts = r?.contacts ?? base.contacts ?? [];
  const leaders = suggest?.leaders ?? [];
  const leadership = suggest ? h('div', { class: 'land-form-field wide' },
    h('span', { class: 'muted small' }, 'Current leadership (Wikidata)'),
    suggest.loading ? h('span', { class: 'muted small' }, 'Looking up…')
      : suggest.error ? h('span', { class: 'land-err small' }, `Couldn’t reach Wikidata: ${suggest.error}`)
        : leaders.length ? h('ul', { class: 'land-leaders' }, ...leaders.map((l) => h('li', {},
          `${l.name}${suggest.office ? `, ${suggest.office}` : ''}${l.since ? ` (since ${l.since})` : ''} `,
          contacts.some((c) => c.name === l.name) ? h('span', { class: 'muted small' }, '✓ in contacts')
            : h('button', { type: 'button', class: 'link-btn small', onclick: () => edit({ contacts: [...contacts, { name: l.name, title: suggest.office ?? 'Leader', email: '', phone: '' }] }) }, '+ Add as contact'))))
          : h('span', { class: 'muted small' }, 'Not recorded on Wikidata — check the website.')) : null;

  // Contacts
  const setContacts = (list) => edit({ contacts: list });
  const contactList = h('div', { class: 'land-contacts' },
    ...contacts.map((c, i) => h('div', { class: 'land-contact' },
      ...['name', 'title', 'email', 'phone'].map((k) => h('input', {
        class: 'input', type: k === 'email' ? 'email' : k === 'phone' ? 'tel' : 'text', placeholder: k[0].toUpperCase() + k.slice(1), value: c[k] ?? '', 'aria-label': `Contact ${k}`,
        onchange: (e) => { const list = [...contacts]; list[i] = { ...list[i], [k]: e.target.value }; setContacts(list); },
      })),
      h('div', { class: 'land-contact-actions' },
        c.email ? link(`mailto:${c.email}`, 'Email') : null,
        c.phone ? link(`tel:${c.phone.replace(/[^\d+]/g, '')}`, 'Call') : null,
        h('button', { type: 'button', class: 'link-btn danger-link', onclick: () => setContacts(contacts.filter((_, j) => j !== i)) }, 'Remove')))),
    h('button', { type: 'button', class: 'btn small', onclick: () => setContacts([...contacts, { name: '', title: '', email: '', phone: '' }]) }, '+ Add contact'));

  // Parcels of interest
  const parcels = r?.parcels ?? [];
  const setParcels = (list) => edit({ parcels: list });
  const PARCEL_FIELDS = [['description', 'Address / description'], ['parcelId', 'Parcel ID'], ['acres', 'Acres'], ['link', 'Link (map, listing…)'], ['notes', 'Notes']];
  const parcelList = h('div', { class: 'land-contacts' },
    ...parcels.map((p, i) => h('div', { class: 'land-contact land-parcel' },
      ...PARCEL_FIELDS.map(([k, label]) => h('input', {
        class: `input${k === 'notes' || k === 'description' ? ' wide' : ''}`, type: k === 'acres' ? 'number' : k === 'link' ? 'url' : 'text', step: 'any', placeholder: label, value: p[k] ?? '', 'aria-label': `Parcel ${label}`,
        onchange: (e) => { const list = [...parcels]; list[i] = { ...list[i], [k]: e.target.value }; setParcels(list); },
      })),
      h('div', { class: 'land-contact-actions' },
        p.link ? link(withScheme(p.link), 'Open link') : null,
        h('button', { type: 'button', class: 'link-btn danger-link', onclick: () => setParcels(parcels.filter((_, j) => j !== i)) }, 'Remove')))),
    h('button', { type: 'button', class: 'btn small', onclick: () => setParcels([...parcels, { description: '', parcelId: '', acres: '', link: '', notes: '' }]) }, '+ Add parcel of interest'));

  // Activity
  let activity = null;
  if (r) {
    const typeSel = h('select', { class: 'input', 'aria-label': 'Activity type' }, ...Object.entries(ACTIVITY_TYPES).map(([k, label]) => h('option', { value: k }, label)));
    const text = h('input', { class: 'input', type: 'text', placeholder: 'What happened? (e.g. Emailed the borough manager)' });
    const log = (e) => { e.preventDefault(); if (!text.value.trim() && typeSel.value === 'note') return; logActivity(sites.get(r.id), typeSel.value, text.value || ACTIVITY_TYPES[typeSel.value]); text.value = ''; };
    activity = h('div', { class: 'land-form-field wide' },
      h('span', { class: 'muted small' }, `Activity — logging an email, call, meeting or visit marks it Interested and sets a follow-up ${FOLLOW_UP_DAYS} days out`),
      h('form', { class: 'land-log', onsubmit: log }, typeSel, text, h('button', { class: 'btn primary', type: 'submit' }, 'Log')),
      r.activity.length ? h('ol', { class: 'land-activity' }, ...[...r.activity].reverse().map((a) => h('li', {},
        h('span', { class: 'muted small' }, new Date(a.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })),
        h('strong', { class: 'small' }, ACTIVITY_TYPES[a.type] ?? (a.type === 'stage' ? 'Status' : a.type)),
        h('span', {}, a.text)))) : null);
  }

  return h('div', { class: 'land-record' },
    interest, pipeline,
    h('div', { class: 'land-form' },
      input('Map / GIS data link', 'mapUrl', { type: 'url', placeholder: 'Link to their parcel map or GIS viewer', open: true }),
      input('Website', 'website', { type: 'url', open: true }),
      input('Phone', 'phone', { type: 'tel', open: true }),
      leadership),
    h('details', { class: 'land-sub', open: contacts.length > 0 }, h('summary', {}, `Contacts (${contacts.length})`), contactList),
    h('details', { class: 'land-sub', open: parcels.length > 0 }, h('summary', {}, `Parcels of interest (${parcels.length})`), parcelList),
    h('label', { class: 'land-form-field wide' }, h('span', { class: 'muted small' }, 'Notes'),
      h('textarea', { class: 'input', rows: 3, value: r?.notes ?? '', placeholder: 'What they own, who to talk to, what they said…', onchange: (e) => edit({ notes: e.target.value }) })),
    activity);
}
