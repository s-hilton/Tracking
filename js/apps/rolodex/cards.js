// The card file itself: every contact on the drum, filed A–Z behind divider tabs.
import { h } from '../../ui.js';
import { contacts, sortedContacts, letterOf, matches } from './data.js';
import { createDrum } from './drum.js';
import { personFace, dividerFace, blankFace, backFace, LETTERS } from './faces.js';

function fileItems(query) {
  const people = sortedContacts().filter((c) => matches(c, query));
  if (query.trim()) return people.map((contact) => ({ kind: 'person', contact }));
  const items = [];
  let letter = null;
  for (const contact of people) {
    const l = letterOf(contact);
    if (l !== letter) { letter = l; items.push({ kind: 'divider', letter }); }
    items.push({ kind: 'person', contact });
  }
  return items;
}

// An empty file still shows the rolodex, with a first blank card to fill in.
const emptyFace = (ctx) => h('div', { class: 'rc rc-home' },
  h('div', { class: 'rc-head' }, h('span', { class: 'rc-name' }, 'No cards yet')),
  h('div', { class: 'rc-options' },
    h('button', { type: 'button', class: 'rc-option', onclick: () => ctx.edit(null) },
      h('span', { class: 'rc-option-icon', 'aria-hidden': 'true' }, '✎'),
      h('span', { class: 'rc-option-text' }, h('strong', {}, 'New card'), h('span', {}, 'Type one in'))),
    h('button', { type: 'button', class: 'rc-option', onclick: () => ctx.importFile() },
      h('span', { class: 'rc-option-icon', 'aria-hidden': 'true' }, '📱'),
      h('span', { class: 'rc-option-text' }, h('strong', {}, 'Import'), h('span', {}, 'iPhone export')))));

export function cardsView(ctx) {
  let query = ctx.state.query ?? '';
  const counter = h('p', { class: 'rdx-counter rdx-typed' });
  const index = h('nav', { class: 'rdx-index', 'aria-label': 'Jump to letter' });
  const empty = h('div', { class: 'rdx-empty', hidden: true });

  const drum = createDrum({
    label: 'Contacts',
    face: (item) => (item.kind === 'divider' ? dividerFace(item) : item.kind === 'person' ? personFace(item) : item.kind === 'home' ? emptyFace(ctx) : blankFace(item)),
    back: backFace,
    onOpen: (item) => {
      if (item.kind === 'person') ctx.openContact(item.contact.id);
      else drum.goTo(drum.index + 1);
    },
    onTurn: (i, item) => {
      if (item?.kind === 'person') ctx.state.cardId = item.contact.id;
      const people = drum.items.filter((x) => x.kind === 'person');
      const n = item?.kind === 'person' ? people.indexOf(item) + 1 : 0;
      counter.textContent = people.length ? `${n ? `Card ${n} of ${people.length}` : `${item.letter}: ${countFrom(i)} card${countFrom(i) === 1 ? '' : 's'}`}` : '';
      markLetter(item?.kind === 'divider' ? item.letter : item?.contact ? letterOf(item.contact) : null);
    },
  });

  const countFrom = (i) => {
    let n = 0;
    for (let j = i + 1; j < drum.items.length && drum.items[j].kind === 'person'; j++) n++;
    return n;
  };

  function markLetter(letter) {
    index.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.letter === letter));
  }

  function drawIndex() {
    const present = new Set(drum.items.filter((x) => x.kind === 'divider').map((x) => x.letter));
    index.hidden = Boolean(query.trim()) || !present.size;
    index.replaceChildren(...[...LETTERS].map((l) => h('button', {
      type: 'button', 'data-letter': l, disabled: !present.has(l), 'aria-label': `Jump to ${l}`,
      onclick: () => drum.goTo(drum.items.findIndex((x) => x.kind === 'divider' && x.letter === l)),
    }, l)));
  }

  function load({ keep = true } = {}) {
    const none = !contacts.all().length;
    const items = none ? [{ kind: 'home' }, { kind: 'blank' }, { kind: 'blank' }, { kind: 'blank' }] : fileItems(query);
    const id = keep ? ctx.state.cardId : null;
    const at = id ? items.findIndex((x) => x.contact?.id === id) : -1;
    empty.hidden = Boolean(items.length);
    drum.el.hidden = !items.length;
    empty.replaceChildren(h('p', { class: 'rdx-typed' }, `No cards match “${query}”.`));
    drum.setItems(items, at >= 0 ? at : 0);
    drawIndex();
    return { items, at: Math.max(at, 0) };
  }

  const search = h('input', {
    class: 'rdx-search', type: 'search', placeholder: 'Find a card…', value: query, 'aria-label': 'Search cards', autocomplete: 'off',
    oninput: (e) => { query = e.target.value; ctx.state.query = query; load({ keep: false }); },
  });

  const el = h('div', { class: 'rdx-cards' },
    h('div', { class: 'rdx-cards-top' }, search),
    h('div', { class: 'rdx-cards-mid' }, drum.el, empty, index),
    counter);

  // Arrive with a short turn of the drum, landing on the card you were last on.
  const { at } = load();
  if (drum.items.length) {
    drum.setItems(drum.items, Math.max(0, at - 6));
    drum.goTo(at, { duration: 700 });
  }
  requestAnimationFrame(() => drum.focus());

  return {
    el,
    update: () => load(),
    destroy: () => drum.destroy(),
  };
}
