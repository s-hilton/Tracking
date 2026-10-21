// The card file itself: every contact on the drum, filed A–Z behind divider tabs,
// or the same cards laid out as a list (the tabs on the side switch between them).
import { h } from '../../ui.js';
import { load as loadPref, save as savePref } from '../../storage.js';
import { contacts, sortedContacts, letterOf, matches, fileName, nextFollowUp, todayIso } from './data.js';
import { dueText } from './contact.js';
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

// One line per card, grouped under letter headings like an address book.
function listRow(ctx, c) {
  const due = nextFollowUp(c);
  const overdue = due && due <= todayIso();
  return h('li', {},
    h('button', { type: 'button', class: 'rdx-ledger-row', onclick: () => ctx.openContact(c.id) },
      h('span', { class: 'rdx-ledger-name' }, fileName(c), overdue ? h('span', { class: 'rc-stamp' }, 'Follow up') : null),
      h('span', { class: 'rdx-ledger-work' }, [c.title, c.company].filter(Boolean).join(', ')),
      h('span', { class: 'rdx-ledger-phone' }, c.phones?.[0]?.value ?? ''),
      h('span', { class: 'rdx-ledger-email' }, c.emails?.[0]?.value ?? ''),
      h('span', { class: `rdx-ledger-due${overdue ? ' over' : ''}` }, due ? dueText(due) : '')));
}

export function cardsView(ctx) {
  let query = ctx.state.query ?? '';
  let layout = loadPref('rolodex:layout', 'wheel') === 'list' ? 'list' : 'wheel';
  const ledger = h('div', { class: 'rdx-ledger', hidden: true, tabIndex: -1 });
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
      onclick: () => {
        if (layout === 'list') ledger.querySelector(`[data-letter="${l}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        else drum.goTo(drum.items.findIndex((x) => x.kind === 'divider' && x.letter === l));
      },
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
    drawList(items, none);
    return { items, at: Math.max(at, 0) };
  }

  function drawList(items, none) {
    const groups = [];
    for (const item of items) {
      if (item.kind === 'divider') groups.push({ letter: item.letter, people: [] });
      else if (item.kind === 'person') (groups.at(-1) ?? groups[groups.push({ letter: null, people: [] }) - 1]).people.push(item.contact);
    }
    const n = items.filter((x) => x.kind === 'person').length;
    ledger.replaceChildren(...[
      h('header', { class: 'rdx-ledger-head' },
        h('h2', { class: 'rdx-typed' }, query.trim() ? `Cards matching “${query.trim()}”` : 'All cards'),
        h('span', { class: 'rdx-dim small rdx-typed' }, `${n} card${n === 1 ? '' : 's'}`)),
      none ? h('div', { class: 'rdx-ledger-empty' },
        h('p', { class: 'rdx-blank' }, 'No cards yet.'),
        h('div', { class: 'rdx-row' },
          h('button', { type: 'button', class: 'rdx-btn primary', onclick: () => ctx.edit(null) }, '＋ New card'),
          h('button', { type: 'button', class: 'rdx-btn', onclick: () => ctx.importFile() }, '⇪ Import'))) : null,
      ...groups.map((g) => h('section', { class: 'rdx-ledger-group' },
        g.letter ? h('h3', { class: 'rdx-ledger-letter', 'data-letter': g.letter }, g.letter) : null,
        h('ul', { class: 'rdx-ledger-list' }, ...g.people.map((c) => listRow(ctx, c))))),
    ].filter(Boolean));
  }

  // The side tabs: the turning wheel, or every card in a list.
  const side = h('nav', { class: 'rdx-side', 'aria-label': 'How to show cards' });
  function setLayout(next, { remember = true } = {}) {
    layout = next;
    if (remember) savePref('rolodex:layout', layout);
    const list = layout === 'list';
    el.classList.toggle('as-list', list);
    ledger.hidden = !list;
    drumWrap.hidden = list;
    counter.hidden = list;
    side.replaceChildren(...[['wheel', '◎', 'Wheel'], ['list', '☰', 'List']].map(([key, icon, label]) => h('button', {
      type: 'button', class: `rdx-side-tab${layout === key ? ' on' : ''}`, 'aria-pressed': String(layout === key), title: `Show cards as a ${label.toLowerCase()}`,
      onclick: () => { setLayout(key); (key === 'list' ? ledger : drum).focus?.({ preventScroll: true }); },
    }, h('span', { 'aria-hidden': 'true' }, icon), label)));
  }

  const search = h('input', {
    class: 'rdx-search', type: 'search', placeholder: 'Find a card…', value: query, 'aria-label': 'Search cards', autocomplete: 'off',
    oninput: (e) => { query = e.target.value; ctx.state.query = query; load({ keep: false }); },
  });

  const drumWrap = h('div', { class: 'rdx-drum-wrap' }, drum.el, empty);
  const el = h('div', { class: 'rdx-cards' },
    side,
    h('div', { class: 'rdx-cards-top' }, search),
    h('div', { class: 'rdx-cards-mid' }, drumWrap, ledger, index),
    counter);

  // Arrive with a short turn of the drum, landing on the card you were last on.
  const { at } = load();
  setLayout(layout, { remember: false });
  if (layout === 'wheel' && drum.items.length) {
    drum.setItems(drum.items, Math.max(0, at - 6));
    drum.goTo(at, { duration: 700 });
  }
  requestAnimationFrame(() => (layout === 'list' ? ledger : drum).focus({ preventScroll: true }));

  return {
    el,
    update: () => { const top = ledger.scrollTop; load(); ledger.scrollTop = top; },
    destroy: () => drum.destroy(),
  };
}
