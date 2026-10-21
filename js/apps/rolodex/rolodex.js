// Rolodex: your personal contacts as a rotary card file, plus who knows whom.
// Self-contained: this folder + supabase/migrations/*_rolodex.sql.
//
//   config.js     quick-tap vocabulary (relationships, where you met, cadences…)
//   data.js       synced tables (cards, connections) + follow-up and link helpers
//   drum.js       the turning card drum;  faces.js  what's typed on each card
//   cards.js      the A–Z card file;  contact.js  one pulled-out card
//   followups.js  who to reach out to;  web.js  the corkboard of connections
//   map.js + geo.js  everyone pinned where they live
//   editor.js     add/edit forms;  import.js + vcard.js  iPhone contacts import
//   export.js     export as .vcf, .csv or a .json backup
//   widgets.js    sheets, chips, the person picker
import { h, loadStyles } from '../../ui.js';
import { onIntent } from '../../intents.js';
import { STORES, contacts, dueCount, followUpList, displayName, logTouch } from './data.js';
import { createDrum } from './drum.js';
import { personFace, dividerFace, blankFace, backFace } from './faces.js';
import { cardsView } from './cards.js';
import { contactPage } from './contact.js';
import { followUpsPage } from './followups.js';
import { createWeb } from './web.js';
import { mapView } from './map.js';
import { editContact, editConnection } from './editor.js';
import { importContacts } from './import.js';
import { exportContacts } from './export.js';

loadStyles(new URL('./rolodex.css', import.meta.url));

let badgeTimer;
const announce = () => { clearTimeout(badgeTimer); badgeTimer = setTimeout(() => window.dispatchEvent(new Event('badges-changed')), 300); };
STORES.forEach((store) => store.subscribe(announce));

// ---- Home: the opening spin lands on this card ---------------------------------------
function homeFace(ctx) {
  const due = dueCount();
  const n = contacts.all().length;
  const option = (icon, title, sub, run, cls = '') => h('button', { type: 'button', class: `rc-option ${cls}`, onclick: run },
    h('span', { class: 'rc-option-icon', 'aria-hidden': 'true' }, icon),
    h('span', { class: 'rc-option-text' }, h('strong', {}, title), h('span', {}, sub)));
  return h('div', { class: 'rc rc-home' },
    h('span', { class: 'rc-tab' }, '★'),
    h('div', { class: 'rc-head' },
      h('span', { class: 'rc-name' }, 'Rolodex'),
      h('span', { class: 'rc-date' }, new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))),
    h('div', { class: 'rc-options' },
      option('☎', 'Follow up', due ? `${due} waiting on you` : 'All caught up', () => ctx.go('followups'), due ? 'hot' : ''),
      option('📇', 'My contacts', `${n} card${n === 1 ? '' : 's'} on file`, () => ctx.go('cards'))),
    h('div', { class: 'rc-more' },
      h('button', { type: 'button', onclick: () => ctx.go('web') }, 'Connection web'),
      h('span', { 'aria-hidden': 'true' }, '·'),
      h('button', { type: 'button', onclick: () => ctx.go('map') }, 'Map'),
      h('span', { 'aria-hidden': 'true' }, '·'),
      h('button', { type: 'button', onclick: () => ctx.edit(null) }, 'New card'),
      h('span', { 'aria-hidden': 'true' }, '·'),
      h('button', { type: 'button', onclick: () => ctx.importFile() }, 'Import'),
      h('span', { 'aria-hidden': 'true' }, '·'),
      h('button', { type: 'button', onclick: () => exportContacts(ctx.host, { toast: ctx.toast }) }, 'Export')));
}

// The cards that whirl past before landing: your own cards if you have them,
// filed behind their dividers, otherwise fresh blanks.
function introItems() {
  const people = [...contacts.all()].sort(() => Math.random() - 0.5).slice(0, 18);
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const items = [];
  for (let i = 0; i < 26; i++) {
    if (i % 3 === 0) items.push({ kind: 'divider', letter: letters[Math.floor((i / 26) * 26)] });
    else items.push(people.length ? { kind: 'person', contact: people[i % people.length] } : { kind: 'blank' });
  }
  items.push({ kind: 'home' });
  return items;
}

function homeView(ctx, { intro }) {
  let face;
  const drum = createDrum({
    label: 'Rolodex home',
    interactive: false,
    face: (item) => {
      if (item.kind === 'home') { face = homeFace(ctx); return face; }
      return item.kind === 'divider' ? dividerFace(item) : item.kind === 'person' ? personFace(item) : blankFace(item);
    },
    back: backFace,
  });
  const items = introItems();
  const el = h('div', { class: `rdx-home${intro ? ' intro' : ''}` }, drum.el);
  const last = items.length - 1;
  drum.setItems(items, intro ? 0 : last - 8);
  // Let the device settle onto the desk, then give the wheel a spin.
  const spin = () => drum.spin(last, { duration: intro ? 2800 : 1100 }).then(() => {
    el.classList.add('landed');
    el.querySelector('.rdx-card.open .rc-option')?.focus({ preventScroll: true });
  });
  const timer = setTimeout(spin, intro ? 450 : 0);
  // Tap the desk to skip the spin.
  el.addEventListener('pointerdown', () => { if (!el.classList.contains('landed')) drum.goTo(last, { duration: 250 }); });
  return {
    el,
    update() {
      if (!face?.isConnected) return;
      const next = homeFace(ctx);
      face.replaceWith(next);
      face = next;
    },
    destroy() { clearTimeout(timer); drum.destroy(); },
  };
}

function webView(ctx) {
  const web = createWeb({ onOpen: (id) => ctx.openContact(id), onConnect: (id) => ctx.connect(id) });
  return {
    el: h('div', { class: 'rdx-webpage' },
      h('p', { class: 'rdx-dim small rdx-web-hint' }, 'Drag the board to move around, scroll or pinch to zoom, drag a pin to move it. Tap someone to see who they know.'),
      web.el),
    destroy: web.destroy,
  };
}

const VIEWS = {
  home: { render: homeView },
  cards: { label: 'Cards', render: cardsView },
  followups: { label: 'Follow-ups', render: (ctx) => ({ el: followUpsPage(ctx) }), live: true },
  web: { label: 'Web', render: webView },
  map: { label: 'Map', render: mapView },
  contact: { render: (ctx) => ({ el: contactPage(ctx, ctx.state.contactId) }), live: true },
};

export default {
  id: 'rolodex',
  name: 'Rolodex',
  icon: '📇',
  color: '#7c2d12',
  size: { w: 920, h: 680 },

  badge: () => dueCount(),

  // On the dashboard's sticky note: everyone due a reach-out. Ticking one off is
  // the same as "I reached out" on the follow-up list.
  todos: () => followUpList().filter((x) => x.days <= 0).map(({ contact: c, days }) => ({
    id: c.id,
    text: `Reach out to ${displayName(c)}`,
    detail: days < 0 ? `${-days} day${days === -1 ? '' : 's'} overdue` : 'today',
    tone: days < 0 ? 'overdue' : 'today',
    open: { contact: c.id },
    done: () => logTouch(contacts.get(c.id) ?? c),
  })),

  reminder: () => {
    const n = dueCount();
    return n ? `${n} ${n === 1 ? 'person is' : 'people are'} due a follow-up in your Rolodex.` : null;
  },

  mount(root) {
    const app = h('div', { class: 'rdx' });
    const bar = h('header', { class: 'rdx-bar' });
    const main = h('main', { class: 'rdx-main' });
    const toasts = h('div', { class: 'rdx-toasts', 'aria-live': 'polite' });
    let current = null;
    let leave = [];

    const ctx = {
      host: app,
      state: { view: 'home', cardId: null, contactId: null, query: '', mapFocus: null },
      go(view, extra = {}) {
        Object.assign(ctx.state, extra);
        ctx.state.view = view;
        render();
      },
      openContact(id) { ctx.go('contact', { contactId: id, cardId: id }); },
      edit(id, opts = {}) {
        editContact(app, id, {
          ...opts,
          onSaved: (savedId) => {
            if (!savedId) { if (ctx.state.view === 'contact') ctx.go('cards'); return; }
            if (!id) ctx.openContact(savedId);
          },
        });
      },
      connect(id, { edgeId } = {}) { editConnection(app, { from: id, edgeId }); },
      importFile() {
        importContacts(app, {
          onDone: ({ added, merged }) => {
            ctx.toast(`Filed ${added} new card${added === 1 ? '' : 's'}${merged ? `, updated ${merged}` : ''}.`);
            ctx.go('cards', { cardId: null });
          },
        });
      },
      onLeave(fn) { leave.push(fn); },
      toast(text) {
        const slip = h('div', { class: 'rdx-toast' }, text);
        toasts.append(slip);
        setTimeout(() => slip.classList.add('gone'), 2600);
        setTimeout(() => slip.remove(), 3000);
      },
    };

    function renderBar() {
      const due = dueCount();
      const view = ctx.state.view;
      const tab = (key, label, count = 0) => h('button', {
        type: 'button', class: `rdx-tab${view === key || (key === 'cards' && view === 'contact') ? ' on' : ''}`,
        onclick: () => ctx.go(key),
      }, label, count ? h('span', { class: 'rdx-count' }, String(count)) : null);
      bar.hidden = view === 'home';
      bar.replaceChildren(...[
        h('button', { type: 'button', class: 'rdx-plate', title: 'Back to the start', onclick: () => ctx.go('home') }, 'Rolodex'),
        h('nav', { class: 'rdx-tabs' }, tab('cards', 'Cards'), tab('followups', 'Follow-ups', due), tab('web', 'Web'), tab('map', 'Map')),
        h('span', { class: 'spacer' }),
        view === 'contact' ? h('button', { type: 'button', class: 'rdx-btn small', onclick: () => ctx.go('cards') }, '← Back to file') : null,
        h('button', { type: 'button', class: 'rdx-btn small', onclick: () => ctx.importFile() }, '⇪ Import'),
        h('button', { type: 'button', class: 'rdx-btn small', onclick: () => exportContacts(app, { toast: ctx.toast }) }, '⇩ Export'),
        h('button', { type: 'button', class: 'rdx-btn small primary', onclick: () => ctx.edit(null) }, '＋ New card'),
      ].filter(Boolean));
    }

    let first = true;
    function render() {
      current?.destroy?.();
      leave.forEach((fn) => fn());
      leave = [];
      renderBar();
      const { view } = ctx.state;
      current = VIEWS[view].render(ctx, { intro: first });
      first = false;
      main.className = `rdx-main view-${view}`;
      main.replaceChildren(current.el);
      main.scrollTop = 0;
    }

    // Data changed (here, or synced from another device). A live page waits
    // for any form over it to close before redrawing.
    let frame = 0;
    let pendingRedraw = false;
    const changed = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        renderBar();
        if (VIEWS[ctx.state.view].live) {
          if (app.querySelector('.rdx-overlay')) { pendingRedraw = true; return; }
          const scroll = main.scrollTop;
          render();
          main.scrollTop = scroll;
        } else current?.update?.();
      });
    };
    new MutationObserver(() => {
      if (pendingRedraw && !app.querySelector('.rdx-overlay')) { pendingRedraw = false; changed(); }
    }).observe(app, { childList: true });
    const offs = STORES.map((store) => store.subscribe(changed));

    // Opened from the dashboard's sticky note: go straight to that card or page.
    const offIntent = onIntent('rolodex', (intent) => {
      if (intent?.contact && contacts.get(intent.contact)) ctx.openContact(intent.contact);
      else if (intent?.view in VIEWS) ctx.go(intent.view);
    });

    app.append(bar, main, toasts);
    root.append(app);
    render();

    return () => { offIntent(); current?.destroy?.(); leave.forEach((fn) => fn()); offs.forEach((off) => off()); cancelAnimationFrame(frame); };
  },
};

