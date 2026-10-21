// Small building blocks shared by the Rolodex screens: the pulled-out card
// (a sheet over the desk), quick-tap chips and the person picker.
import { h } from '../../ui.js';
import { contacts, displayName, sortedContacts, matches, newContact } from './data.js';
import { CADENCES, cadenceLabel } from './config.js';

// A big index card pulled out over the desk. Returns { close }.
export function openSheet(host, { title, tab, body, actions = [], onClose, wide = false }) {
  const prevFocus = document.activeElement;
  const close = () => {
    overlay.classList.add('leaving');
    setTimeout(() => { overlay.remove(); prevFocus?.focus?.({ preventScroll: true }); }, 180);
    document.removeEventListener('keydown', onKey, true);
    onClose?.();
  };
  const onKey = (event) => {
    if (event.key === 'Escape' && overlay.isConnected && overlay === host.querySelector('.rdx-overlay:last-of-type')) {
      event.stopPropagation();
      close();
    }
  };
  const card = h('div', { class: `rdx-sheet${wide ? ' wide' : ''}`, role: 'dialog', 'aria-label': title },
    tab ? h('span', { class: 'rdx-sheet-tab' }, tab) : null,
    h('header', { class: 'rdx-sheet-head' },
      h('h2', {}, title),
      h('button', { class: 'rdx-x', 'aria-label': 'Close', onclick: close }, '✕')),
    h('div', { class: 'rdx-sheet-body' }, body),
    actions.length ? h('footer', { class: 'rdx-sheet-foot' }, ...actions) : null);
  const overlay = h('div', { class: 'rdx-overlay', onclick: (e) => { if (e.target === overlay) close(); } }, card);
  host.append(overlay);
  document.addEventListener('keydown', onKey, true);
  requestAnimationFrame(() => card.querySelector('input, textarea, button:not(.rdx-x)')?.focus({ preventScroll: true }));
  return { close, card };
}

// Quick-tap chips. multi: an array of picked labels; otherwise one value.
export function chips(options, { value, multi = false, onChange, colors = {} }) {
  let picked = multi ? [...(value ?? [])] : value;
  const wrap = h('div', { class: 'rdx-chips', role: multi ? 'group' : 'radiogroup' });
  const list = Array.isArray(options) ? options.map((o) => (Array.isArray(o) ? o : [o, o])) : Object.entries(options);
  const draw = () => wrap.replaceChildren(...list.map(([key, label]) => {
    const on = multi ? picked.includes(key) : String(picked) === String(key);
    return h('button', {
      type: 'button',
      class: `rdx-chip${on ? ' on' : ''}`,
      style: colors[key] ? `--chip:${colors[key]}` : null,
      'aria-pressed': String(on),
      onclick: () => {
        if (multi) picked = on ? picked.filter((p) => p !== key) : [...picked, key];
        else picked = key;
        draw();
        onChange(multi ? [...picked] : picked);
      },
    }, label);
  }));
  draw();
  return wrap;
}

// Search-as-you-type person picker. value: a card id (or '').
// Typing a name that isn't on file offers to start a new card for them.
export function personPicker({ value = '', exclude = [], placeholder = 'Type a name…', onChange, extra = [] }) {
  let current = value;
  const wrap = h('div', { class: 'rdx-picker' });
  const input = h('input', { class: 'rdx-input', placeholder, autocomplete: 'off', 'aria-label': placeholder });
  const menu = h('div', { class: 'rdx-picker-menu', hidden: true, role: 'listbox' });

  const set = (id) => { current = id; onChange(id); draw(); };
  const option = (label, run, cls = '') => h('button', {
    type: 'button', class: `rdx-picker-opt ${cls}`, role: 'option',
    onmousedown: (e) => e.preventDefault(),
    onclick: run,
  }, label);

  function suggest() {
    const q = input.value;
    const found = sortedContacts().filter((c) => !exclude.includes(c.id) && matches(c, q)).slice(0, 8);
    menu.replaceChildren(
      ...extra.filter((x) => !q || x.label.toLowerCase().includes(q.toLowerCase())).map((x) => option(x.label, () => set(x.id), 'extra')),
      ...found.map((c) => option(h('span', {}, h('strong', {}, displayName(c)), c.company ? h('span', { class: 'rdx-dim' }, ` · ${c.company}`) : null), () => set(c.id))),
      q.trim() ? option(`＋ New card for “${q.trim()}”`, () => {
        const parts = q.trim().split(/\s+/);
        const card = newContact({ lastName: parts.length > 1 ? parts.pop() : '', firstName: parts.join(' ') });
        contacts.upsert(card);
        set(card.id);
      }, 'create') : null,
    );
    menu.hidden = !menu.children.length;
  }

  function draw() {
    const chosen = extra.find((x) => x.id === current) ?? (current ? contacts.get(current) : null);
    if (chosen) {
      wrap.replaceChildren(h('span', { class: 'rdx-person' },
        chosen.label ?? displayName(chosen),
        h('button', { type: 'button', class: 'rdx-person-x', 'aria-label': 'Clear', onclick: () => set('') }, '✕')));
    } else {
      input.value = '';
      wrap.replaceChildren(input, menu);
    }
  }

  input.addEventListener('input', suggest);
  input.addEventListener('focus', suggest);
  input.addEventListener('blur', () => setTimeout(() => { menu.hidden = true; }, 120));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); menu.querySelector('.rdx-picker-opt')?.click(); }
  });
  draw();
  return wrap;
}

// Labelled rows of { label, value } (emails, phones, links), with add/remove.
export function multiRows(rows, { placeholder, labelPlaceholder = 'Label', type = 'text', onChange }) {
  let list = rows.length ? rows.map((r) => ({ ...r })) : [{ label: '', value: '' }];
  const wrap = h('div', { class: 'rdx-multi' });
  const emit = () => onChange(list.filter((r) => r.value.trim()).map((r) => ({ label: r.label.trim(), value: r.value.trim() })));
  const draw = () => wrap.replaceChildren(
    ...list.map((row, i) => h('div', { class: 'rdx-multi-row' },
      h('input', { class: 'rdx-input label', value: row.label, placeholder: labelPlaceholder, 'aria-label': 'Label', oninput: (e) => { row.label = e.target.value; emit(); } }),
      h('input', { class: 'rdx-input', type, value: row.value, placeholder, 'aria-label': placeholder, oninput: (e) => { row.value = e.target.value; emit(); } }),
      h('button', { type: 'button', class: 'rdx-x small', 'aria-label': 'Remove', onclick: () => { list.splice(i, 1); if (!list.length) list.push({ label: '', value: '' }); draw(); emit(); } }, '✕'))),
    h('button', { type: 'button', class: 'rdx-link', onclick: () => { list.push({ label: '', value: '' }); draw(); wrap.querySelectorAll('.rdx-multi-row input:not(.label)')[list.length - 1]?.focus(); } }, '＋ Add another'));
  draw();
  return wrap;
}

export const field = (label, control, { wide = false, hint } = {}) => h('label', { class: `rdx-field${wide ? ' wide' : ''}` },
  h('span', { class: 'rdx-field-label' }, label), control, hint ? h('span', { class: 'rdx-dim small' }, hint) : null);

export const group = (label, control, { hint } = {}) => h('div', { class: 'rdx-field wide' },
  h('span', { class: 'rdx-field-label' }, label), control, hint ? h('span', { class: 'rdx-dim small' }, hint) : null);

export const section = (title, ...children) => h('fieldset', { class: 'rdx-section', 'data-section': title }, h('legend', {}, title), h('div', { class: 'rdx-grid' }, ...children));

export function textInput(value, onInput, props = {}) {
  return h('input', { class: 'rdx-input', value: value ?? '', oninput: (e) => onInput(e.target.value), ...props });
}

export function textArea(value, onInput, props = {}) {
  return h('textarea', { class: 'rdx-input', rows: 3, value: value ?? '', oninput: (e) => onInput(e.target.value), ...props });
}

export const safeUrl = (url) => {
  const v = String(url ?? '').trim();
  if (!v) return '';
  const full = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  return /^(https?|mailto|tel):/i.test(full) ? full : '';
};

// "Remind me every …" dropdown, for changing a card's reminder in place.
export function cadenceSelect(contact, onChange) {
  return h('select', {
    class: 'rdx-input small rdx-select',
    'aria-label': `How often to reach out to ${contact.firstName || 'them'}`,
    onchange: (e) => onChange(Number(e.target.value)),
  }, ...CADENCES.map(([days]) => h('option', { value: days, selected: days === (contact.cadenceDays ?? 0) }, cadenceLabel(days))),
  // A value saved before the current choices existed stays selectable.
  CADENCES.some(([d]) => d === (contact.cadenceDays ?? 0)) ? null : h('option', { value: contact.cadenceDays, selected: true }, cadenceLabel(contact.cadenceDays)));
}
