// Investors: Astra Retrieval's fundraising tracker (lives in the Astra Retrieval
// folder). Self-contained: this folder + supabase/migrations/*_investors.sql.
//
//   config.js   stages, investor types, pass reasons, reminder timings
//   data.js     synced tables (rounds, firms, outreach, activities) + derived lists
//   form.js     the shared add/edit panel
//   editors.js  add/edit screens
//   views/      pipeline (one round by stage), investors (list + firm page), updates
//   excel.js, xlsx.js  "Export to Excel" and a small .xlsx writer
//
// Rounds: a firm can be in several rounds. When one passes with "keep in mind",
// the next round's pipeline offers to carry them over.
import { h, loadStyles } from '../../ui.js';
import { onIntent } from '../../intents.js';
import { load, save } from '../../storage.js';
import { STORES, dueFollowUps, staleOutreach, updatesDue, completeFollowUp, markUpdateSent, firmName, roundName, daysSince, todayIso } from './data.js';
import { UPDATE_EVERY_DAYS } from './config.js';
import { pipeline } from './views/pipeline.js';
import { investorList, firmPage } from './views/investors.js';
import { updates } from './views/updates.js';
import { downloadWorkbook } from './excel.js';

loadStyles(new URL('./investor-tracker.css', import.meta.url));

const TABS = {
  pipeline: { label: 'Pipeline', view: pipeline },
  investors: { label: 'Investors', view: investorList },
  updates: { label: 'Updates', view: updates },
};
const PAGES = { ...TABS, firm: { view: firmPage, tab: 'investors' } };

// Let the desktop (sticky note, badge) know when anything changes.
let badgeTimer;
const announce = () => { clearTimeout(badgeTimer); badgeTimer = setTimeout(() => window.dispatchEvent(new Event('badges-changed')), 300); };
STORES.forEach((store) => store.subscribe(announce));

export default {
  id: 'investor-tracker',
  name: 'Investors',
  icon: '💼',
  color: '#1e3a8a',
  size: { w: 980, h: 680 },

  // Red number on the icon: follow-ups due today or overdue.
  badge: () => dueFollowUps().length,

  // On the dashboard's sticky note: follow-ups that are due (tick = followed up,
  // next one in a week), active investors gone quiet, and investor updates owed.
  todos: () => {
    const items = dueFollowUps().map((o) => {
      const late = daysSince(o.nextFollowUp);
      return {
        id: `follow:${o.id}`,
        text: `Follow up with ${firmName(o.firmId)}`,
        detail: [roundName(o.roundId), o.contactName, late > 0 ? `${late} day${late === 1 ? '' : 's'} overdue` : 'today'].filter(Boolean).join(' · '),
        tone: late > 0 ? 'overdue' : 'today',
        open: { firm: o.firmId },
        done: () => completeFollowUp(o),
      };
    });
    items.push(...staleOutreach().map(({ o, last }) => ({
      id: `quiet:${o.id}`,
      text: `Chase ${firmName(o.firmId)}`,
      detail: `${roundName(o.roundId)} · ${last ? `quiet for ${daysSince(last)} days` : 'no contact logged'}`,
      open: { firm: o.firmId },
    })));
    const owed = updatesDue();
    if (owed.length) {
      items.push({
        id: `updates:${todayIso()}`,
        text: `Send an investor update (${owed.length} investor${owed.length === 1 ? '' : 's'})`,
        detail: `${owed.slice(0, 3).map((f) => f.name).join(', ')}${owed.length > 3 ? '…' : ''} · none in ${UPDATE_EVERY_DAYS}+ days`,
        open: { tab: 'updates' },
        done: () => owed.forEach((f) => markUpdateSent(f)),
      });
    }
    return items;
  },

  reminder: () => {
    const n = dueFollowUps().length;
    return n ? `${n} investor follow-up${n === 1 ? ' is' : 's are'} due.` : null;
  },

  mount(root) {
    const saved = load('inv:ui', {});
    const state = { tab: TABS[saved.tab] ? saved.tab : 'pipeline', roundId: saved.roundId ?? '', filter: saved.filter ?? 'all', firmId: null, from: null };
    const app = h('div', { class: 'app inv' });
    const nav = h('nav', { class: 'inv-nav' });
    const content = h('div', { class: 'inv-content' });

    const ctx = {
      host: app,
      state,
      go(tab, extra = {}) {
        if (tab === 'firm' && !('from' in extra)) extra.from = PAGES[state.tab]?.tab ?? state.tab;
        Object.assign(state, extra);
        state.tab = tab;
        render();
        content.scrollTop = 0;
      },
      // keepFocus: re-draw while typing in a search box without losing the cursor.
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
      const current = PAGES[state.tab]?.tab ?? state.tab;
      const counts = { pipeline: dueFollowUps().length, updates: updatesDue().length };
      nav.replaceChildren(h('div', { class: 'inv-tabs', role: 'tablist' }, ...Object.entries(TABS).map(([key, tab]) =>
        h('button', {
          class: `inv-tab${current === key ? ' on' : ''}`,
          role: 'tab',
          'aria-selected': String(current === key),
          onclick: () => ctx.go(key),
        }, tab.label, counts[key] ? h('span', { class: 'inv-count' }, String(counts[key])) : null))),
      h('button', {
        class: 'btn ghost inv-export',
        title: 'Download every round, investor, person and update as an Excel workbook',
        onclick: downloadWorkbook,
      }, 'Export to Excel'));
    }

    let pending = false;
    function render() {
      // Never redraw under an open form; catch up when it closes.
      if (app.querySelector('.inv-overlay')) { pending = true; return; }
      pending = false;
      save('inv:ui', { tab: state.tab === 'firm' ? 'investors' : state.tab, roundId: state.roundId, filter: state.filter });
      const scroll = content.scrollTop;
      renderNav();
      content.replaceChildren(PAGES[state.tab].view(ctx));
      content.scrollTop = scroll;
    }

    new MutationObserver(() => { if (pending && !app.querySelector('.inv-overlay')) render(); }).observe(app, { childList: true });

    let frame = 0;
    const scheduleRender = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); };
    const unsubscribes = STORES.map((store) => store.subscribe(scheduleRender));

    // Opened from the sticky note: go straight to that investor or tab.
    const offIntent = onIntent('investor-tracker', (intent) => {
      if (intent?.firm) ctx.go('firm', { firmId: intent.firm, from: 'pipeline' });
      else if (TABS[intent?.tab]) ctx.go(intent.tab);
    });

    app.append(nav, content);
    root.append(app);
    render();

    return () => { offIntent(); cancelAnimationFrame(frame); unsubscribes.forEach((off) => off()); };
  },
};
