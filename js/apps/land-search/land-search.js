// Land Search (lives in the Astra Retrieval folder): find land owned by local
// governments, and friendly institutions, where a ground station could go.
// Self-contained: this folder + supabase/migrations/*_land_sites.sql.
//
//   config.js         states, focus regions, parcel services and the coverage note
//   sources.js        live data: Census boundaries, PAD-US, OpenStreetMap, power grid
//   geo.js            geometry helpers (point in polygon, acres, distances)
//   map-view.js       the Map tab
//   parcels.js        stage 2: finds each county's parcel service, picks out government owners
//   institutions.js   stage 3: colleges (IPEDS), tribal lands (Census), museums (OpenStreetMap)
//   contacts.js       government / institution websites, phones and leadership (Wikidata)
//   institutions-view.js  the Institutions tab
//   leaflet.js        loads the map library
//   data.js           stage 4: saved sites (synced table land_sites), stages, follow-ups
//   pipeline-view.js  the Pipeline tab and each saved site's page
//   coverage-view.js  the Coverage tab (what's connected, what's next)
//
// Built in stages: 1 map + filters + public land, 2 parcels for the Southwest
// and Northeast, 3 institutions + government contacts, 4 saved sites + pipeline.
import { h, loadStyles } from '../../ui.js';
import { load, save } from '../../storage.js';
import { onIntent } from '../../intents.js';
import { sites, dueFollowUps, completeFollowUp, daysLate } from './data.js';
import { pipelineView } from './pipeline-view.js';
import { mapView } from './map-view.js';
import { coverageView } from './coverage-view.js';
import { institutionsView } from './institutions-view.js';

loadStyles(new URL('./land-search.css', import.meta.url));

// Let the desktop (sticky note, badge) know when saved sites change.
let badgeTimer;
sites.subscribe(() => { clearTimeout(badgeTimer); badgeTimer = setTimeout(() => window.dispatchEvent(new Event('badges-changed')), 300); });

const TABS = {
  map: { label: 'Map', view: mapView },
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
    return n ? `${n} land site follow-up${n === 1 ? ' is' : 's are'} due.` : null;
  },

  // On the dashboard's sticky note: saved sites whose follow-up is due
  // (tick = followed up, next one in a week; tap = open the site).
  todos: () => dueFollowUps().map((s) => {
    const late = daysLate(s.nextFollowUp);
    const who = s.contacts.find((c) => c.name)?.name;
    return {
      id: `land:${s.id}`,
      text: `Follow up on ${s.name || 'a land site'}`,
      detail: [who || s.owner, late > 0 ? `${late} day${late === 1 ? '' : 's'} overdue` : 'today'].filter(Boolean).join(' · '),
      tone: late > 0 ? 'overdue' : 'today',
      open: { site: s.id },
      done: () => completeFollowUp(s),
    };
  }),

  mount(root) {
    const state = { tab: 'map', ...load('land:ui', {}) };
    if (!TABS[state.tab]) state.tab = 'map';
    const ctx = {
      state,
      persist: () => save('land:ui', state),
      go(tab, extra = {}) { Object.assign(state, extra); show(tab); },
      // Jump to a saved site's spot on the Map tab.
      showOnMap(site) { state.view = { lat: Number(site.lat), lng: Number(site.lng), zoom: 16 }; show('map'); },
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
