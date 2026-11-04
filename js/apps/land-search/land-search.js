// Land Search (lives in the Astra Retrieval folder): go through every government
// in the country, and nearby institutions, to find places that might host a
// ground station; record what you learn and track outreach.
// Self-contained: this folder + supabase/migrations/*_land_sites*.sql.
//
//   governments-view.js   Governments tab: state → county → city/town/township, tribal nations
//   institutions-view.js  Institutions tab: universities & colleges, museums, planetariums on a map
//   pipeline-view.js      Pipeline tab: everything marked Interested, and each record's page
//   coverage-view.js      Coverage tab: what's connected + Check connections (diagnostics.js)
//   record-editor.js      the shared editor: interest, stage, map-data link, website, contacts, parcels…
//   data.js               records (synced table land_sites), interest, stages, follow-ups
//   sources.js            Census boundaries (TIGERweb) + OpenStreetMap queries
//   institutions.js       colleges (IPEDS), museums/planetariums (OpenStreetMap + Wikidata), tribal lands
//   contacts.js           websites, phones and leadership (Wikidata)
//   config.js, geo.js, leaflet.js
import { h, loadStyles } from '../../ui.js';
import { load, save } from '../../storage.js';
import { onIntent } from '../../intents.js';
import { sites, dueFollowUps, completeFollowUp, daysLate } from './data.js';
import { pipelineView } from './pipeline-view.js';
import { governmentsView } from './governments-view.js';
import { coverageView } from './coverage-view.js';
import { institutionsView } from './institutions-view.js';

loadStyles(new URL('./land-search.css', import.meta.url));

// Let the desktop (sticky note, badge) know when saved sites change.
let badgeTimer;
sites.subscribe(() => { clearTimeout(badgeTimer); badgeTimer = setTimeout(() => window.dispatchEvent(new Event('badges-changed')), 300); });

const TABS = {
  governments: { label: 'Governments', view: governmentsView },
  institutions: { label: 'Institutions', view: institutionsView },
  pipeline: { label: 'Pipeline', view: pipelineView },
  coverage: { label: 'Coverage', view: (ctx) => ({ el: coverageView(ctx) }) },
};

export default {
  id: 'land-search',
  name: 'Land Search',
  icon: '🗺️',
  color: '#15803d',
  size: { w: 1100, h: 720 },

  // Red number on the icon: follow-ups due today or overdue.
  badge: () => dueFollowUps().length,

  reminder: () => {
    const n = dueFollowUps().length;
    return n ? `${n} Land Search follow-up${n === 1 ? ' is' : 's are'} due.` : null;
  },

  // On the dashboard's sticky note: saved sites whose follow-up is due
  // (tick = followed up, next one in a week; tap = open the site).
  todos: () => dueFollowUps().map((s) => {
    const late = daysLate(s.nextFollowUp);
    const who = s.contacts.find((c) => c.name)?.name;
    return {
      id: `land:${s.id}`,
      text: `Follow up with ${s.name || 'a Land Search contact'}`,
      detail: [who || s.owner, late > 0 ? `${late} day${late === 1 ? '' : 's'} overdue` : 'today'].filter(Boolean).join(' · '),
      tone: late > 0 ? 'overdue' : 'today',
      open: { site: s.id },
      done: () => completeFollowUp(s),
    };
  }),

  mount(root) {
    const state = { tab: 'governments', ...load('land:ui', {}) };
    if (!TABS[state.tab]) state.tab = 'governments';
    const ctx = {
      state,
      persist: () => save('land:ui', state),
      go(tab, extra = {}) { Object.assign(state, extra); show(tab); },
      // Jump to an institution's spot on the Institutions map.
      showOnMap(site) { state.instFocus = { lat: Number(site.lat), lng: Number(site.lng) }; show('institutions'); },
    };
    const app = h('div', { class: 'app land' });
    const nav = h('nav', { class: 'land-nav', role: 'tablist' });
    const content = h('div', { class: 'land-content' });
    let current = null;

    function show(tab) {
      state.tab = tab; ctx.persist();
      current?.destroy?.();
      current = TABS[tab].view(ctx);
      content.replaceChildren(current.el);
      renderNav();
    }

    function renderNav() {
      const tab = state.tab;
      nav.replaceChildren(...Object.entries(TABS).map(([key, t]) => h('button', {
        class: `land-tab${key === tab ? ' on' : ''}`, role: 'tab', 'aria-selected': String(key === tab), onclick: () => (key === 'pipeline' ? ctx.go(key, { siteId: null }) : show(key)),
      }, t.label, key === 'pipeline' && dueFollowUps().length ? h('span', { class: 'land-count' }, String(dueFollowUps().length)) : null)));
    }

    app.append(nav, content);
    root.append(app);
    show(state.tab);
    const offStore = sites.subscribe(renderNav);
    // Opened from the sticky note: go straight to that site.
    const offIntent = onIntent('land-search', (intent) => { if (intent?.site) ctx.go('pipeline', { siteId: intent.site }); });
    return () => { offIntent(); offStore(); current?.destroy?.(); };
  },
};
