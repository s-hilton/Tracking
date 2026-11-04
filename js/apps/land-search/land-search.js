// Land Search (lives in the Astra Retrieval folder): find land owned by local
// governments, and friendly institutions, where a ground station could go.
// Self-contained: this folder.
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
//   coverage-view.js  the Coverage tab (what's connected, what's next)
//
// Built in stages: 1 map + filters + public land, 2 parcels for the Southwest
// and Northeast, 3 institutions + government contacts, 4 saved sites + pipeline.
import { h, loadStyles } from '../../ui.js';
import { load, save } from '../../storage.js';
import { mapView } from './map-view.js';
import { coverageView } from './coverage-view.js';
import { institutionsView } from './institutions-view.js';

loadStyles(new URL('./land-search.css', import.meta.url));

const soon = (title, stage, text) => () => ({
  el: h('div', { class: 'land-page' }, h('section', { class: 'land-card' },
    h('h2', {}, title), h('span', { class: 'land-tag planned' }, stage), h('p', { class: 'muted' }, text))),
});

const TABS = {
  map: { label: 'Map', view: mapView },
  institutions: { label: 'Institutions', view: institutionsView },
  pipeline: { label: 'Pipeline', view: soon('Pipeline', 'Stage 4', 'Saved sites and institutions moving through found → contacted → talking → agreement (or declined), with your contacts, notes and follow-up dates that show up on the dashboard’s to-do sticky note.') },
  coverage: { label: 'Coverage', view: (ctx) => ({ el: coverageView(ctx) }) },
};

export default {
  id: 'land-search',
  name: 'Land Search',
  icon: '🗺️',
  color: '#15803d',
  size: { w: 1100, h: 720 },

  // No todos: yet — nothing is saved until the Pipeline arrives in stage 4, which
  // adds follow-ups to the sticky note.

  mount(root) {
    const state = { tab: 'map', ...load('land:ui', {}) };
    if (!TABS[state.tab]) state.tab = 'map';
    const ctx = { state, persist: () => save('land:ui', state) };
    const app = h('div', { class: 'app land' });
    const nav = h('nav', { class: 'land-nav', role: 'tablist' });
    const content = h('div', { class: 'land-content' });
    let current = null;

    function show(tab) {
      state.tab = tab; ctx.persist();
      current?.destroy?.();
      current = TABS[tab].view(ctx);
      content.replaceChildren(current.el);
      nav.replaceChildren(...Object.entries(TABS).map(([key, t]) => h('button', {
        class: `land-tab${key === tab ? ' on' : ''}`, role: 'tab', 'aria-selected': String(key === tab), onclick: () => show(key),
      }, t.label)));
    }

    app.append(nav, content);
    root.append(app);
    show(state.tab);
    return () => current?.destroy?.();
  },
};
