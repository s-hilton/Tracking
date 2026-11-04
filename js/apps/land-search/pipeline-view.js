// The Pipeline tab: every government and institution marked Interested, moving
// through found → contacted → talking → agreement (or declined), and each
// record's page.
import { h } from '../../ui.js';
import {
  sites, STAGES, OPEN_STAGES, FOLLOW_UP_DAYS, CATEGORY, GOVERNMENT, dueFollowUps, completeFollowUp, removeSite, updateSite, inPipeline, todayIso,
} from './data.js';
import { recordEditor, followUpText, stageSelect, interestBadge } from './record-editor.js';
import { formatAcres } from './geo.js';

const baseOf = (s) => ({ key: s.sourceKey, category: s.category, name: s.name, kind: s.kind, stateAbbr: s.stateAbbr });

export function pipelineView(ctx) {
  const ui = (ctx.state.pipe ??= { filter: 'open', q: '' });
  ui.type ??= 'all';
  const el = h('div', { class: 'land-page land-pipe' });
  let pending = false;

  const editing = () => el.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) && document.activeElement.type !== 'search';
  function render() {
    if (editing()) { pending = true; return; }
    pending = false;
    const site = ctx.state.siteId ? sites.get(ctx.state.siteId) : null;
    if (ctx.state.siteId && !site) ctx.state.siteId = null;
    el.replaceChildren(site ? sitePage(site) : listPage());
  }
  el.addEventListener('focusout', () => setTimeout(() => { if (pending) render(); }, 0));
  const off = sites.subscribe(render);

  function row(s) {
    const due = s.nextFollowUp && OPEN_STAGES.includes(s.stage) && s.nextFollowUp <= todayIso();
    const who = s.contacts?.find((c) => c.name);
    return h('li', { class: 'land-site-row' },
      h('button', { type: 'button', class: 'land-site-main', onclick: () => open(s.id) },
        h('strong', {}, s.name || 'Untitled'),
        h('span', { class: 'muted small' }, [CATEGORY[s.category] ?? s.kind, s.stateAbbr, who ? `${who.name}${who.title ? `, ${who.title}` : ''}` : null,
          s.parcels?.length ? `${s.parcels.length} parcel${s.parcels.length === 1 ? '' : 's'}` : null, s.acres ? formatAcres(s.acres) : null].filter(Boolean).join(' · '))),
      h('div', { class: 'land-site-meta' },
        followUpText(s),
        due ? h('button', { type: 'button', class: 'btn small', title: `Log it and follow up again in ${FOLLOW_UP_DAYS} days`, onclick: () => completeFollowUp(s) }, 'Followed up') : null,
        stageSelect(s, baseOf(s))));
  }

  function listPage() {
    const all = sites.all().filter(inPipeline);
    if (!all.length) {
      return h('section', { class: 'land-card' }, h('h2', {}, 'Nothing in the pipeline yet'),
        h('p', { class: 'muted' }, 'On the Governments or Institutions tab, mark something Interested and it lands here as “Found”. Logging a call or email moves it to “Contacted” and sets a follow-up a week out, which shows on the dashboard’s to-do sticky note.'));
    }
    const ofType = all.filter((s) => ui.type === 'all' || (ui.type === 'gov' ? GOVERNMENT.has(s.category) : !GOVERNMENT.has(s.category)));
    const counts = Object.fromEntries(Object.keys(STAGES).map((k) => [k, ofType.filter((s) => s.stage === k).length]));
    const filters = { open: ['Open', ofType.filter((s) => OPEN_STAGES.includes(s.stage)).length], ...Object.fromEntries(Object.entries(STAGES).map(([k, st]) => [k, [st.label, counts[k]]])), all: ['All', ofType.length] };
    const q = ui.q.trim().toLowerCase();
    const list = ofType
      .filter((s) => ui.filter === 'all' || (ui.filter === 'open' ? OPEN_STAGES.includes(s.stage) : s.stage === ui.filter))
      .filter((s) => !q || `${s.name} ${s.owner} ${s.address} ${s.notes} ${(s.contacts ?? []).map((c) => c.name).join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => (a.nextFollowUp || '9999').localeCompare(b.nextFollowUp || '9999') || b.updated - a.updated);
    const due = dueFollowUps();
    const chip = (group, k, label) => h('button', { type: 'button', class: `land-filter-chip${ui[group] === k ? ' on' : ''}`, onclick: () => { ui[group] = k; ctx.persist(); render(); } }, label);
    return h('div', { class: 'land-pipe-list' },
      h('div', { class: 'land-funnel' }, ...Object.entries(STAGES).map(([k, st]) => h('button', {
        type: 'button', class: 'land-funnel-step', style: `--c:${st.color}`, onclick: () => { ui.filter = k; ctx.persist(); render(); },
      }, h('strong', {}, String(counts[k])), h('span', {}, st.label)))),
      due.length ? h('section', { class: 'land-card land-due-card' }, h('h2', {}, `Follow-ups due (${due.length})`), h('ul', { class: 'land-site-list' }, ...due.map(row))) : null,
      h('div', { class: 'land-toolbar' },
        h('div', { class: 'land-chips' }, chip('type', 'all', 'Everything'), chip('type', 'gov', 'Governments'), chip('type', 'inst', 'Institutions')),
        h('div', { class: 'land-chips' }, ...Object.entries(filters).map(([k, [label, n]]) => chip('filter', k, `${label} ${n}`))),
        h('input', { class: 'input', type: 'search', placeholder: 'Search names, contacts, notes…', value: ui.q, oninput: (e) => { ui.q = e.target.value; ctx.persist(); const caret = e.target.selectionStart; render(); const box = el.querySelector('input[type=search]'); box.focus(); box.setSelectionRange(caret, caret); } })),
      list.length ? h('ul', { class: 'land-site-list' }, ...list.map(row)) : h('p', { class: 'muted' }, 'Nothing here.'));
  }

  function open(id) { ctx.state.siteId = id; ctx.persist(); render(); el.scrollTop = 0; }

  function sitePage(s) {
    const link = (href, label) => h('a', { class: 'land-link', href, target: '_blank', rel: 'noopener' }, label);
    return h('div', { class: 'land-site-page' },
      h('button', { type: 'button', class: 'link-btn', onclick: () => { ctx.state.siteId = null; ctx.persist(); render(); } }, '← Pipeline'),
      h('div', { class: 'land-site-head' },
        h('input', { class: 'input land-title-input', value: s.name, 'aria-label': 'Name', onchange: (e) => updateSite(sites.get(s.id), { name: e.target.value }) }),
        interestBadge(s)),
      h('p', { class: 'muted small' }, [CATEGORY[s.category] ?? '', s.kind, s.stateAbbr, s.address, s.source ? `from ${s.source}` : ''].filter(Boolean).join(' · ')),
      h('div', { class: 'land-links' },
        s.lat != null && !GOVERNMENT.has(s.category) ? h('button', { type: 'button', class: 'btn small', onclick: () => ctx.showOnMap(s) }, 'Show on map') : null,
        s.lat != null ? link(`https://www.google.com/maps/@?api=1&map_action=map&center=${s.lat},${s.lng}&zoom=16&basemap=satellite`, 'Google Maps satellite') : null,
        s.sourceUrl ? link(s.sourceUrl, 'Data source') : null),
      h('section', { class: 'land-card' }, recordEditor(baseOf(s))),
      h('button', { type: 'button', class: 'btn ghost danger', onclick: () => {
        if (confirm(`Delete everything recorded for “${s.name}”? Its contacts, parcels, notes and activity go too.`)) { removeSite(s); ctx.state.siteId = null; ctx.persist(); render(); }
      } }, 'Delete this record'));
  }

  render();
  return { el, open, destroy: off };
}
