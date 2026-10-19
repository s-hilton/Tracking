// Activity: every logged touch across all companies, newest first.
import { h } from '../../../ui.js';
import { ACTIVITY_TYPES } from '../config.js';
import { activities, opportunities, companyName } from '../data.js';
import { logActivity } from '../editors.js';
import { activityItem } from './companies.js';
import { empty, button, searchBox, selectBox, matches } from './common.js';

export function activityLog(ctx) {
  const { state, product, host } = ctx;
  state.activityQuery ??= '';
  state.activityType ??= '';
  const list = h('ol', { class: 'bd-timeline' });

  const render = () => {
    const rows = activities.all()
      .filter((a) => product === 'all' || (a.opportunityIds ?? []).some((id) => opportunities.get(id)?.product === product))
      .filter((a) => !state.activityType || a.type === state.activityType)
      .filter((a) => matches(state.activityQuery, a.subject, a.summary, companyName(a.companyId)))
      .sort((a, b) => b.occurredAt - a.occurredAt);
    list.replaceChildren(...(rows.length
      ? rows.slice(0, 300).map((a) => activityItem(host, a, true, companyName(a.companyId)))
      : [h('li', {}, empty(product === 'all' ? 'Nothing logged yet.' : 'No activity linked to this product\'s opportunities yet.'))]));
  };

  const view = h('div', { class: 'bd-view' },
    h('div', { class: 'bd-toolbar' },
      searchBox(state.activityQuery, 'Search activity…', (v) => { state.activityQuery = v; render(); }),
      selectBox(state.activityType, { '': 'All types', ...ACTIVITY_TYPES }, (v) => { state.activityType = v; render(); }, 'Activity type'),
      button('+ Log activity', () => logActivity(host, null), 'btn primary')),
    list);
  render();
  return view;
}
