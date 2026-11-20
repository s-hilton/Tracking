// Customer Outreach: tracks reaching out to potential Crew Orchard customers
// (lives in the Crew Orchard folder). Self-contained: this folder +
// supabase/migrations/*_crew_customers.sql.
//
//   config.js  stages, industries, sources, activity kinds, timings
//   data.js    synced tables (customers, activities) + sticky-note lists
//   views.js   Customers list, Pipeline board, one customer's page, add/edit form, CSV export
import { h, loadStyles } from '../../ui.js';
import { onIntent } from '../../intents.js';
import { load, save } from '../../storage.js';
import { STORES, dueFollowUps, staleLeads, completeFollowUp, displayName, daysSince } from './data.js';
import { customerList, pipeline, customerPage, downloadCsv } from './views.js';

loadStyles(new URL('./crew-outreach.css', import.meta.url));

const TABS = {
  customers: { label: 'Customers', view: customerList },
  pipeline: { label: 'Pipeline', view: pipeline },
};
const PAGES = { ...TABS, customer: { view: customerPage } };

// Let the desktop (sticky note, badge) know when anything changes.
let badgeTimer;
const announce = () => { clearTimeout(badgeTimer); badgeTimer = setTimeout(() => window.dispatchEvent(new Event('badges-changed')), 300); };
STORES.forEach((store) => store.subscribe(announce));

export default {
  id: 'crew-outreach',
  name: 'Outreach',
  icon: '🤝',
  color: '#141a2e',
  size: { w: 980, h: 660 },

  // Red number on the icon: follow-ups due today or overdue.
  badge: () => dueFollowUps().length,

  // On the dashboard's sticky note: follow-ups that are due (tick = followed up,
  // next one in a week) and active leads that have gone quiet.
  todos: () => [
    ...dueFollowUps().map((c) => {
      const late = daysSince(c.nextFollowUp);
      return {
        id: `crew-follow:${c.id}`,
        text: `Follow up with ${displayName(c)}`,
        detail: [c.company && c.name ? c.company : '', late > 0 ? `${late} day${late === 1 ? '' : 's'} overdue` : 'today'].filter(Boolean).join(' · '),
        tone: late > 0 ? 'overdue' : 'today',
        open: { customer: c.id },
        done: () => completeFollowUp(c),
      };
    }),
    ...staleLeads().map((c) => ({
      id: `crew-quiet:${c.id}`,
      text: `Chase ${displayName(c)}`,
      detail: [c.company && c.name ? c.company : '', c.lastContacted ? `quiet for ${daysSince(c.lastContacted)} days` : 'no contact logged'].filter(Boolean).join(' · '),
      open: { customer: c.id },
    })),
  ],

  reminder: () => {
    const n = dueFollowUps().length;
    return n ? `${n} customer follow-up${n === 1 ? ' is' : 's are'} due.` : null;
  },

  mount(root) {
    const saved = load('crew:ui', {});
    const state = {
      tab: TABS[saved.tab] ? saved.tab : 'customers',
      stage: saved.stage ?? '',
      industry: saved.industry ?? '',
      sort: saved.sort ?? 'updated',
      query: '',
      customerId: null,
      from: 'customers',
    };
    const app = h('div', { class: 'app crew' });
    const nav = h('nav', { class: 'crew-nav' });
    const content = h('div', { class: 'crew-content' });

    const ctx = {
      host: app,
      state,
      go(tab, extra = {}) {
        if (tab === 'customer' && !('from' in extra)) extra.from = TABS[state.tab] ? state.tab : state.from;
        Object.assign(state, extra);
        state.tab = tab;
        render();
        content.scrollTop = 0;
      },
      // keepFocus: re-draw while typing in the search box without losing the cursor.
      refresh({ keepFocus = false } = {}) {
        const active = keepFocus ? document.activeElement : null;
        const caret = active?.selectionStart;
        render();
        if (active?.type === 'search') {
          const box = content.querySelector('input[type=search]');
          box?.focus();
          box?.setSelectionRange(caret, caret);
        }
      },
    };

    function renderNav() {
      const current = TABS[state.tab] ? state.tab : state.from;
      const due = dueFollowUps().length;
      nav.replaceChildren(
        h('div', { class: 'crew-tabs', role: 'tablist' }, ...Object.entries(TABS).map(([key, tab]) =>
          h('button', {
            class: `crew-tab${current === key ? ' on' : ''}`,
            role: 'tab',
            'aria-selected': String(current === key),
            onclick: () => ctx.go(key),
          }, tab.label, key === 'pipeline' && due ? h('span', { class: 'crew-count', title: 'Follow-ups due' }, String(due)) : null))),
        h('button', { class: 'btn ghost', title: 'Download every customer as a spreadsheet (.csv)', onclick: downloadCsv }, 'Export CSV'),
      );
    }

    let pending = false;
    function render() {
      // Never redraw under an open form; catch up when it closes.
      if (app.querySelector('.crew-overlay')) { pending = true; return; }
      pending = false;
      save('crew:ui', { tab: TABS[state.tab] ? state.tab : state.from, stage: state.stage, industry: state.industry, sort: state.sort });
      const scroll = content.scrollTop;
      renderNav();
      content.replaceChildren(PAGES[state.tab].view(ctx));
      content.scrollTop = scroll;
    }

    new MutationObserver(() => { if (pending && !app.querySelector('.crew-overlay')) render(); }).observe(app, { childList: true });

    let frame = 0;
    const scheduleRender = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); };
    const unsubscribes = STORES.map((store) => store.subscribe(scheduleRender));

    // Opened from the sticky note: go straight to that customer.
    const offIntent = onIntent('crew-outreach', (intent) => {
      if (intent?.customer) ctx.go('customer', { customerId: intent.customer, from: 'pipeline' });
    });

    app.append(nav, content);
    root.append(app);
    render();

    return () => { offIntent(); cancelAnimationFrame(frame); unsubscribes.forEach((off) => off()); };
  },
};
