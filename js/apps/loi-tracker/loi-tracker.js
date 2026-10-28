// LOIs: Astra Retrieval's business-development and LOI tracker (lives in the
// Astra Retrieval folder). Self-contained: this folder + supabase/migrations/*_lois.sql
// and *_business_development.sql.
//
//   config.js   products, use cases, stages, statuses and other vocabulary
//   data.js     synced Supabase tables + derived numbers (reminders, LOI totals)
//   form.js     the shared add/edit form
//   editors.js  add/edit screens for each record type
//   excel.js, xlsx.js  the Excel export and a small .xlsx writer
//   (Import: data.js importBackup reads the same .json the backup export writes)
//   analytics.js  conversion, velocity and trend calculations (date-filtered)
//   views/      one file per tab (charts.js: the small chart kit)
import { h, loadStyles } from '../../ui.js';
import { onIntent } from '../../intents.js';
import { load, save } from '../../storage.js';
import { STALE_DAYS, PRODUCTS } from './config.js';
import { STORES, staleCompanies, openTasks, todayIso, daysUntil, companyName, migrateLegacyLocalData } from './data.js';
import { completeTask } from './editors.js';
import { downloadFile } from './views/common.js';
import { overview } from './views/overview.js';
import { companyList, companyPage } from './views/companies.js';
import { pipeline } from './views/pipeline.js';
import { loiRegister } from './views/lois.js';
import { activityLog } from './views/activity.js';
import { followUps } from './views/followups.js';
import { analytics } from './views/analytics.js';
import * as data from './data.js';
import { buildReport, printReport, reportFileName } from './report.js';
import { downloadWorkbook } from './excel.js';

loadStyles(new URL('./loi-tracker.css', import.meta.url));
migrateLegacyLocalData();

const TABS = {
  overview: { label: 'Overview', view: overview },
  companies: { label: 'Companies', view: companyList },
  pipeline: { label: 'Pipeline', view: pipeline },
  lois: { label: 'LOIs', view: loiRegister },
  activity: { label: 'Activity', view: activityLog },
  followups: { label: 'Follow-ups', view: followUps },
  analytics: { label: 'Analytics', view: analytics },
};
const PAGES = { ...TABS, company: { label: 'Company', view: companyPage, tab: 'companies' } };

const dueCount = () => openTasks().filter((t) => t.dueOn && t.dueOn <= todayIso()).length;

// Let the desktop know when the reminder count may have changed.
let badgeTimer;
const announce = () => { clearTimeout(badgeTimer); badgeTimer = setTimeout(() => window.dispatchEvent(new Event('badges-changed')), 300); };
STORES.forEach((store) => store.subscribe(announce));

function backup() {
  const content = {
    exportedAt: new Date().toISOString(),
    companies: data.companies.all(),
    contacts: data.contacts.all(),
    opportunities: data.opportunities.all(),
    activities: data.activities.all(),
    tasks: data.tasks.all(),
    lois: data.lois.all(),
  };
  downloadFile(`astra-retrieval-backup-${todayIso()}.json`, JSON.stringify(content, null, 2), 'application/json');
}

// Export everything: a readable report (print/PDF or one HTML file), an Excel workbook or a data backup.
function exportMenu() {
  const menu = h('details', { class: 'bd-menu' });
  const item = (label, hint, run) => h('button', {
    class: 'bd-menu-item',
    onclick: () => { menu.open = false; run(); },
  }, h('strong', {}, label), h('span', { class: 'muted small' }, hint));
  menu.append(
    h('summary', { class: 'btn ghost' }, 'Export ▾'),
    h('div', { class: 'bd-menu-list' },
      item('Print / Save as PDF', 'The whole tracker as one document', printReport),
      item('Download report (.html)', 'Same document as a single file', () => downloadFile(reportFileName(), buildReport(), 'text/html')),
      item('Excel workbook (.xlsx)', 'Every record, one sheet per kind', downloadWorkbook),
      item('Data backup (.json)', 'Every record, for safekeeping', backup)));
  return menu;
}

// Import a data backup (.json): adds records that aren't in the tracker yet.
function importButton() {
  const input = h('input', {
    type: 'file',
    accept: '.json,application/json',
    hidden: true,
    onchange: async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      try {
        const result = data.importBackup(JSON.parse(await file.text()));
        const lines = Object.entries(result)
          .filter(([, r]) => r.added || r.skipped)
          .map(([kind, r]) => `${kind}: ${r.added} added${r.skipped ? `, ${r.skipped} already here (skipped)` : ''}`);
        alert(`Import finished.\n\n${lines.join('\n')}`);
      } catch (err) {
        alert(`Couldn't import that file: ${err.message}`);
      }
    },
  });
  return h('span', {}, input, h('button', { class: 'btn ghost', title: 'Add records from a data backup (.json)', onclick: () => input.click() }, 'Import'));
}

export default {
  id: 'loi-tracker',
  name: 'LOIs',
  icon: '🤝',
  color: '#0f172a',
  size: { w: 1080, h: 700 },

  // Red number on the icon: companies needing a follow-up.
  badge: () => staleCompanies().length,

  // On the dashboard's sticky note: follow-up tasks due today or overdue (tick to
  // complete), then companies that have gone quiet.
  todos: () => [
    ...openTasks().filter((t) => t.dueOn && t.dueOn <= todayIso())
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
      .map((t) => {
        const days = -daysUntil(t.dueOn);
        return {
          id: `task:${t.id}`,
          text: t.title || 'Follow-up task',
          detail: [t.companyId ? companyName(t.companyId) : '', days > 0 ? `${days} day${days === 1 ? '' : 's'} overdue` : 'today'].filter(Boolean).join(' · '),
          tone: days > 0 ? 'overdue' : 'today',
          open: { tab: 'followups' },
          done: () => completeTask(t),
        };
      }),
    ...staleCompanies().map(({ company, last }) => ({
      id: `stale:${company.id}`,
      text: `Follow up with ${company.name || 'a company'}`,
      detail: last ? `no update in ${Math.floor((Date.now() - last) / 86400000)} days` : 'no updates yet',
      open: { company: company.id },
    })),
  ],

  // Shown once a day when the dashboard opens.
  reminder: () => {
    const n = staleCompanies().length;
    return n ? `${n} ${n === 1 ? 'company has' : 'companies have'} had no update in ${STALE_DAYS}+ days.` : null;
  },

  mount(root) {
    const saved = load('ar:ui', {});
    const state = { tab: TABS[saved.tab] ? saved.tab : 'overview', product: saved.product in PRODUCTS ? saved.product : 'all', companyId: null };
    const app = h('div', { class: 'app bd' });
    const nav = h('nav', { class: 'bd-nav' });
    const content = h('div', { class: 'bd-content' });

    const ctx = {
      host: app,
      state,
      get product() { return state.product; },
      go(tab, extra = {}) {
        Object.assign(state, extra);
        state.tab = tab;
        render();
        content.scrollTop = 0;
      },
      refresh: () => render(),
    };

    function renderNav() {
      const stale = staleCompanies().length;
      const due = dueCount();
      const current = PAGES[state.tab]?.tab ?? state.tab;
      nav.replaceChildren(
        h('div', { class: 'bd-tabs', role: 'tablist' }, ...Object.entries(TABS).map(([key, tab]) => {
          const count = key === 'overview' ? stale : key === 'followups' ? due : 0;
          return h('button', {
            class: `bd-tab${current === key ? ' on' : ''}`,
            role: 'tab',
            'aria-selected': String(current === key),
            onclick: () => ctx.go(key),
          }, tab.label, count ? h('span', { class: 'bd-count' }, String(count)) : null);
        })),
        h('div', { class: 'bd-nav-right' },
          h('div', { class: 'seg bd-products', role: 'group', 'aria-label': 'Product' },
            ...[['all', 'All products'], ...Object.entries(PRODUCTS).map(([k, p]) => [k, p.short])].map(([k, label]) =>
              h('button', { class: state.product === k ? 'on' : '', title: PRODUCTS[k]?.label ?? 'Combined view', onclick: () => { state.product = k; render(); } }, label))),
          importButton(),
          exportMenu()));
    }

    let pending = false;
    function render() {
      // Never redraw under an open form; catch up when it closes.
      if (app.querySelector('.bd-overlay')) { pending = true; return; }
      pending = false;
      save('ar:ui', { tab: state.tab === 'company' ? 'companies' : state.tab, product: state.product });
      const scroll = content.scrollTop;
      renderNav();
      content.replaceChildren(PAGES[state.tab].view(ctx));
      content.scrollTop = scroll;
    }

    new MutationObserver(() => { if (pending && !app.querySelector('.bd-overlay')) render(); }).observe(app, { childList: true });

    let frame = 0;
    const scheduleRender = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); };
    const unsubscribes = STORES.map((store) => store.subscribe(scheduleRender));

    // Opened from the dashboard's sticky note: go straight to that company or tab.
    const offIntent = onIntent('loi-tracker', (intent) => {
      if (intent?.company) ctx.go('company', { companyId: intent.company });
      else if (TABS[intent?.tab]) ctx.go(intent.tab);
    });

    app.append(nav, content);
    root.append(app);
    render();

    return () => { offIntent(); unsubscribes.forEach((off) => off()); };
  },
};
