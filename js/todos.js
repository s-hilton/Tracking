// The sticky note on the dashboard: one to-do list gathered from every app.
//
// An app joins in by adding `todos()` to its definition (see README → "To-dos on
// the sticky note"). Each item: { id, text, detail?, tone?: 'overdue' | 'today',
// open?: intent passed to the app (see intents.js), done?: () => void }.
// Apps should fire `window.dispatchEvent(new Event('badges-changed'))` when their
// data changes so the note (and icon badges) refresh.
import { h, iconContent } from './ui.js';
import { load, save } from './storage.js';
import { needsSignIn } from './cloud.js';

const MAX_PER_APP = 5;

export function createStickyNote({ getApps, openApp }) {
  let collapsed = load('sticky:collapsed', false);
  const showAll = new Set();
  const el = h('aside', { class: 'sticky-note', 'aria-label': 'To do' });

  function gather() {
    return getApps()
      .filter((app) => typeof app.todos === 'function')
      .map((app) => {
        let items = [];
        try { items = app.todos() ?? []; } catch (err) { console.warn(`todos() failed for ${app.id}`, err); }
        return { app, items };
      })
      .filter((g) => g.items.length);
  }

  function item(app, t) {
    return h('li', { class: `sticky-item${t.tone ? ` ${t.tone}` : ''}` },
      t.done ? h('input', {
        type: 'checkbox',
        'aria-label': `Done: ${t.text}`,
        onchange: (e) => {
          e.target.closest('li').classList.add('ticked');
          setTimeout(() => { try { t.done(); } finally { render(); } }, 350);
        },
      }) : h('span', { class: 'sticky-bullet', 'aria-hidden': 'true' }, '•'),
      h('button', { type: 'button', class: 'sticky-text', title: `Open in ${app.name}`, onclick: () => openApp(app.id, t.open) },
        h('span', {}, t.text),
        t.detail ? h('span', { class: 'sticky-detail' }, t.detail) : null));
  }

  function render() {
    if (needsSignIn()) { el.hidden = true; return; }
    el.hidden = false;
    const groups = gather();
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    const head = h('header', { class: 'sticky-head' },
      h('button', {
        type: 'button', class: 'sticky-title', 'aria-expanded': String(!collapsed),
        onclick: () => { collapsed = !collapsed; save('sticky:collapsed', collapsed); render(); },
      }, 'To do', total ? h('span', { class: 'sticky-count' }, String(total)) : null, h('span', { class: 'sticky-caret', 'aria-hidden': 'true' }, collapsed ? '▸' : '▾')),
      h('span', { class: 'sticky-date' }, new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })));
    el.classList.toggle('collapsed', collapsed);
    if (collapsed) { el.replaceChildren(head); return; }
    el.replaceChildren(head, ...(groups.length ? groups.map(({ app, items }) => {
      const all = showAll.has(app.id);
      const shown = all ? items : items.slice(0, MAX_PER_APP);
      return h('section', { class: 'sticky-group' },
        h('h3', {}, h('span', { class: 'sticky-app-icon' }, iconContent(app)), app.name),
        h('ul', {}, ...shown.map((t) => item(app, t))),
        items.length > MAX_PER_APP ? h('button', {
          type: 'button', class: 'sticky-more',
          onclick: () => { if (all) showAll.delete(app.id); else showAll.add(app.id); render(); },
        }, all ? 'Show fewer' : `+ ${items.length - MAX_PER_APP} more`) : null);
    }) : [h('p', { class: 'sticky-empty' }, 'All caught up ✓')]));
  }

  let timer;
  const refresh = () => { clearTimeout(timer); timer = setTimeout(render, 150); };
  window.addEventListener('badges-changed', refresh);
  window.addEventListener('auth-changed', refresh);
  window.addEventListener('apps-changed', refresh);
  // Dates move on: redraw when coming back to the dashboard and every 10 minutes.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  setInterval(refresh, 600_000);

  render();
  return { el, refresh };
}
