// Add / edit screens: a contact card, and a connection between two cards.
import { h } from '../../ui.js';
import { WHERE_MET, HOPING_FOR, CLOSENESS, CADENCES, RELATIONS, ME } from './config.js';
import { contacts, connections, displayName, newContact, removeContact, saveConnection, findEdge } from './data.js';
import { openSheet, chips, personPicker, multiRows, field, group, section, textInput, textArea } from './widgets.js';

// `focus` names a form section ('How we met', …) to scroll to and start typing in.
export function editContact(host, id, { onSaved, prefill, focus } = {}) {
  const existing = id ? contacts.get(id) : null;
  const v = JSON.parse(JSON.stringify(existing ?? newContact(prefill)));
  const set = (key) => (value) => { v[key] = value; };
  const error = h('p', { class: 'rdx-error', hidden: true });

  const body = h('form', { class: 'rdx-form', onsubmit: (e) => { e.preventDefault(); save(); } },
    section('Name & work',
      field('First name', textInput(v.firstName, set('firstName'), { autocomplete: 'off' })),
      field('Last name', textInput(v.lastName, set('lastName'), { autocomplete: 'off' })),
      field('Goes by', textInput(v.nickname, set('nickname'), { placeholder: 'Nickname' })),
      field('Company', textInput(v.company, set('company'))),
      field('Title', textInput(v.title, set('title'))),
      field('Lives in', textInput(v.location, set('location'), { placeholder: 'City' }))),
    section('Reaching them',
      group('Email', multiRows(v.emails, { placeholder: 'name@example.com', type: 'email', onChange: set('emails') })),
      group('Phone', multiRows(v.phones, { placeholder: '(555) 123-4567', type: 'tel', onChange: set('phones') })),
      field('LinkedIn URL', textInput(v.linkedin, set('linkedin'), { type: 'url', placeholder: 'linkedin.com/in/…' }), { wide: true }),
      group('Other links', multiRows(v.urls, { placeholder: 'https://…', labelPlaceholder: 'Website, X, GitHub…', type: 'url', onChange: set('urls') })),
      field('Birthday', textInput(v.birthday, set('birthday'), { placeholder: 'e.g. 1990-04-12 or 04-12' }))),
    section('How we met',
      group('Where', chips(WHERE_MET, { value: v.whereMetTags, multi: true, onChange: set('whereMetTags') })),
      field('The story', textArea(v.whereMet, set('whereMet'), { placeholder: 'Sat next to each other at the Tuesday founders’ dinner…' }), { wide: true }),
      field('When', textInput(v.metOn, set('metOn'), { type: 'date' })),
      group('Introduced by', personPicker({
        value: v.introducedBy, exclude: [v.id], placeholder: 'Who introduced you? (optional)', onChange: set('introducedBy'),
      }), { hint: 'Leave empty if you met on your own.' }),
      field('About the introduction', textArea(v.introNote, set('introNote'), { rows: 2, placeholder: 'Why they thought we should meet…' }), { wide: true })),
    section('Common ground',
      field('Similarities', textArea(v.similarities, set('similarities'), { placeholder: 'Both from Ohio, both run marathons, love the same sci-fi…' }), { wide: true })),
    section('What I’m hoping for',
      group('Quick picks', chips(HOPING_FOR, { value: v.hopingForTags, multi: true, onChange: set('hopingForTags') })),
      field('In my words', textArea(v.hopingFor, set('hopingFor'), { placeholder: 'What I’d love this relationship to become, and what I can offer them…' }), { wide: true })),
    section('Relationship',
      group('How close', chips(CLOSENESS, { value: v.closeness, onChange: set('closeness') })),
      field('Tags', textInput(v.tags, set('tags'), { placeholder: 'golf, AI, Boston' }), { wide: true })),
    section('Follow-up',
      group('How often to reach out', chips(CADENCES, { value: v.cadenceDays ?? 0, onChange: (d) => { v.cadenceDays = Number(d); } }), {
        hint: 'When you mark them as reached out, they come back on your follow-up list after this long.',
      }),
      field('Next follow-up', textInput(v.followUpOn, set('followUpOn'), { type: 'date' }), { hint: 'Optional: a one-off date that comes first.' }),
      field('Last reached out', textInput(v.lastContacted, set('lastContacted'), { type: 'date' }))),
    section('Extra info',
      field('Anything else', textArea(v.extraInfo, set('extraInfo'), { rows: 4, placeholder: 'Kids’ names, favourite coffee order, what they’re working on…' }), { wide: true })),
    error);

  function save() {
    if (![v.firstName, v.lastName, v.company].some((x) => x?.trim())) {
      error.textContent = 'Give the card a name (or at least a company).';
      error.hidden = false;
      body.querySelector('input')?.focus();
      return;
    }
    contacts.upsert({ ...v, updated: Date.now() });
    sheet.close();
    onSaved?.(v.id);
  }

  const actions = [
    existing ? h('button', {
      type: 'button', class: 'rdx-btn danger',
      onclick: () => {
        if (!confirm(`Remove ${displayName(existing)} from your rolodex? Their connections go too.`)) return;
        removeContact(existing.id);
        sheet.close();
        onSaved?.(null);
      },
    }, 'Remove card') : null,
    h('span', { class: 'spacer' }),
    h('button', { type: 'button', class: 'rdx-btn', onclick: () => sheet.close() }, 'Cancel'),
    h('button', { type: 'button', class: 'rdx-btn primary', onclick: save }, existing ? 'Save card' : 'File this card'),
  ].filter(Boolean);

  const sheet = openSheet(host, { title: existing ? displayName(existing) : 'New card', tab: existing ? 'Edit' : 'New', body, actions, wide: true });
  const target = focus && [...body.querySelectorAll('.rdx-section')].find((el) => el.dataset.section === focus);
  if (target) {
    setTimeout(() => {
      target.scrollIntoView({ block: 'start' });
      target.querySelector('textarea, input:not([type=checkbox])')?.focus({ preventScroll: true });
    }, 60);
  }
}

// How two people know each other. `from` is the card you started on; `to` may be
// empty (pick someone) and `edgeId` edits an existing connection.
export function editConnection(host, { from, to = '', edgeId, onSaved }) {
  const edge = edgeId ? connections.get(edgeId) : (to ? findEdge(from, to) : null);
  const v = {
    a: edge?.a ?? from,
    b: edge?.b ?? to,
    kind: edge?.kind ?? 'unknown',
    note: edge?.note ?? '',
    introducedBy: edge?.introducedBy ?? '',
  };
  const other = () => (v.a === from ? 'b' : 'a');
  const error = h('p', { class: 'rdx-error', hidden: true });
  const fromName = displayName(contacts.get(from));

  const kindColors = Object.fromEntries(Object.entries(RELATIONS).map(([k, r]) => [k, r.color]));
  const body = h('div', { class: 'rdx-form' },
    section(`Who does ${fromName} know?`,
      group('Person', personPicker({ value: v[other()], exclude: [from], placeholder: 'Type a name…', onChange: (id) => { v[other()] = id; } }))),
    section('How do they know each other?',
      group('Quick pick', chips(Object.fromEntries(Object.entries(RELATIONS).map(([k, r]) => [k, r.label])), {
        value: v.kind, colors: kindColors, onChange: (k) => { v.kind = k; },
      })),
      field('The details', textArea(v.note, (x) => { v.note = x; }, { placeholder: 'Roommates at Michigan; still play pickup basketball on Sundays…' }), { wide: true })),
    section('Who introduced them?',
      group('If you know', personPicker({
        value: v.introducedBy, exclude: [from], placeholder: 'Optional',
        extra: [{ id: ME, label: 'I introduced them' }],
        onChange: (id) => { v.introducedBy = id; },
      }))),
    error);

  function save() {
    if (!v.a || !v.b) { error.textContent = 'Pick who they know.'; error.hidden = false; return; }
    if (v.a === v.b) { error.textContent = 'Pick someone else.'; error.hidden = false; return; }
    saveConnection({ id: edge?.id, ...v });
    sheet.close();
    onSaved?.();
  }

  const sheet = openSheet(host, {
    title: edge ? 'Connection' : 'New connection',
    tab: 'Link',
    body,
    actions: [
      edge ? h('button', { type: 'button', class: 'rdx-btn danger', onclick: () => { connections.remove(edge.id); sheet.close(); onSaved?.(); } }, 'Remove link') : null,
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'rdx-btn', onclick: () => sheet.close() }, 'Cancel'),
      h('button', { type: 'button', class: 'rdx-btn primary', onclick: save }, 'Save'),
    ].filter(Boolean),
  });
}
