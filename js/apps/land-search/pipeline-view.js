// The Pipeline tab: saved sites and institutions moving through
// found → contacted → talking → agreement (or declined), and each one's page.
import { h } from '../../ui.js';
import {
  sites, STAGES, OPEN_STAGES, ACTIVITY_TYPES, FOLLOW_UP_DAYS, dueFollowUps, setStage, logActivity, completeFollowUp,
  updateSite, removeSite, daysLate, formatDate, todayIso,
} from './data.js';
import { formatAcres } from './geo.js';

const CATEGORY = { parcel: 'Parcel', land: 'Public land', building: 'Public building', college: 'College', tribe: 'Tribal nation', museum: 'Museum' };

export function pipelineView(ctx) {
  const ui = (ctx.state.pipe ??= { filter: 'open', q: '' });
  const el = h('div', { class: 'land-page land-pipe' });
  let pending = false;

  const editing = () => el.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && document.activeElement.type !== 'search';
  function render() {
    if (editing()) { pending = true; return; }
    pending = false;
    const site = ctx.state.siteId ? sites.get(ctx.state.siteId) : null;
    if (ctx.state.siteId && !site) ctx.state.siteId = null;
    el.replaceChildren(site ? sitePage(site) : listPage());
  }
  el.addEventListener('focusout', () => setTimeout(() => { if (pending) render(); }, 0));
  const off = sites.subscribe(render);

  const followUpText = (s) => {
    if (!s.nextFollowUp || !OPEN_STAGES.includes(s.stage)) return null;
    const late = daysLate(s.nextFollowUp);
    return h('span', { class: `land-due${late > 0 ? ' late' : late === 0 ? ' today' : ''}` },
      late > 0 ? `${late} day${late === 1 ? '' : 's'} overdue` : late === 0 ? 'Follow up today' : `Follow up ${formatDate(s.nextFollowUp)}`);
  };

  function row(s) {
    const due = s.nextFollowUp && OPEN_STAGES.includes(s.stage) && s.nextFollowUp <= todayIso();
    return h('li', { class: 'land-site-row' },
      h('button', { type: 'button', class: 'land-site-main', onclick: () => open(s.id) },
        h('strong', {}, s.name || 'Untitled site'),
        h('span', { class: 'muted small' }, [CATEGORY[s.category] ?? s.kind, s.owner, s.acres ? formatAcres(s.acres) : null].filter(Boolean).join(' · '))),
      h('div', { class: 'land-site-meta' },
        followUpText(s),
        due ? h('button', { type: 'button', class: 'btn small', title: `Log it and follow up again in ${FOLLOW_UP_DAYS} days`, onclick: () => completeFollowUp(s) }, 'Followed up') : null,
        stageSelect(s)));
  }

  function stageSelect(s) {
    return h('select', { class: 'input land-stage', style: `--c:${STAGES[s.stage]?.color}`, 'aria-label': 'Stage', onchange: (e) => setStage(s, e.target.value) },
      ...Object.entries(STAGES).map(([k, st]) => h('option', { value: k, selected: k === s.stage }, st.label)));
  }

  function listPage() {
    const all = sites.all();
    if (!all.length) {
      return h('section', { class: 'land-card' }, h('h2', {}, 'No saved sites yet'),
        h('p', { class: 'muted' }, 'Open a parcel or piece of public land on the Map tab, or an institution on the Institutions tab, and press “Save as site”. It lands here as “Found”; logging a call or email moves it to “Contacted” and sets a follow-up a week out, which shows on the dashboard’s to-do sticky note.'));
    }
    const counts = Object.fromEntries(Object.keys(STAGES).map((k) => [k, all.filter((s) => s.stage === k).length]));
    const filters = { open: ['Open', all.filter((s) => OPEN_STAGES.includes(s.stage)).length], ...Object.fromEntries(Object.entries(STAGES).map(([k, st]) => [k, [st.label, counts[k]]])), all: ['All', all.length] };
    const q = ui.q.trim().toLowerCase();
    const list = all
      .filter((s) => ui.filter === 'all' || (ui.filter === 'open' ? OPEN_STAGES.includes(s.stage) : s.stage === ui.filter))
      .filter((s) => !q || `${s.name} ${s.owner} ${s.address} ${s.contacts.map((c) => c.name).join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => (a.nextFollowUp || '9999').localeCompare(b.nextFollowUp || '9999') || b.updated - a.updated);
    const due = dueFollowUps();
    return h('div', { class: 'land-pipe-list' },
      h('div', { class: 'land-funnel' }, ...Object.entries(STAGES).map(([k, st]) => h('button', {
        type: 'button', class: 'land-funnel-step', style: `--c:${st.color}`, onclick: () => { ui.filter = k; ctx.persist(); render(); },
      }, h('strong', {}, String(counts[k])), h('span', {}, st.label)))),
      due.length ? h('section', { class: 'land-card land-due-card' }, h('h2', {}, `Follow-ups due (${due.length})`), h('ul', { class: 'land-site-list' }, ...due.map(row))) : null,
      h('div', { class: 'land-toolbar' },
        h('div', { class: 'land-chips' }, ...Object.entries(filters).map(([k, [label, n]]) => h('button', {
          type: 'button', class: `land-filter-chip${ui.filter === k ? ' on' : ''}`, onclick: () => { ui.filter = k; ctx.persist(); render(); },
        }, `${label} ${n}`))),
        h('input', { class: 'input', type: 'search', placeholder: 'Search sites, owners, contacts…', value: ui.q, oninput: (e) => { ui.q = e.target.value; ctx.persist(); const caret = e.target.selectionStart; render(); const box = el.querySelector('input[type=search]'); box.focus(); box.setSelectionRange(caret, caret); } })),
      list.length ? h('ul', { class: 'land-site-list' }, ...list.map(row)) : h('p', { class: 'muted' }, 'Nothing here.'));
  }

  function open(id) { ctx.state.siteId = id; ctx.persist(); render(); el.scrollTop = 0; }

  // ---- One site ------------------------------------------------------------

  function sitePage(s) {
    const field = (label, key, { type = 'text', wide = false, placeholder = '' } = {}) => h('label', { class: `land-form-field${wide ? ' wide' : ''}` },
      h('span', { class: 'muted small' }, label),
      type === 'textarea'
        ? h('textarea', { class: 'input', rows: 4, value: s[key] ?? '', placeholder, onchange: (e) => updateSite(sites.get(s.id), { [key]: e.target.value }) })
        : h('input', { class: 'input', type, value: s[key] ?? '', placeholder, onchange: (e) => updateSite(sites.get(s.id), { [key]: e.target.value }) }));
    const link = (href, label) => h('a', { class: 'land-link', href, target: '_blank', rel: 'noopener' }, label);

    const contacts = h('div', { class: 'land-contacts' },
      ...s.contacts.map((c, i) => h('div', { class: 'land-contact' },
        ...['name', 'title', 'email', 'phone'].map((k) => h('input', {
          class: 'input', type: k === 'email' ? 'email' : k === 'phone' ? 'tel' : 'text', placeholder: k[0].toUpperCase() + k.slice(1), value: c[k] ?? '', 'aria-label': `Contact ${k}`,
          onchange: (e) => { const list = [...sites.get(s.id).contacts]; list[i] = { ...list[i], [k]: e.target.value }; updateSite(sites.get(s.id), { contacts: list }); },
        })),
        h('div', { class: 'land-contact-actions' },
          c.email ? link(`mailto:${c.email}`, 'Email') : null,
          c.phone ? link(`tel:${c.phone.replace(/[^\d+]/g, '')}`, 'Call') : null,
          h('button', { type: 'button', class: 'link-btn danger-link', onclick: () => updateSite(sites.get(s.id), { contacts: sites.get(s.id).contacts.filter((_, j) => j !== i) }) }, 'Remove')))),
      h('button', { type: 'button', class: 'btn small', onclick: () => updateSite(sites.get(s.id), { contacts: [...sites.get(s.id).contacts, { name: '', title: '', email: '', phone: '' }] }) }, '+ Add contact'));

    const typeSel = h('select', { class: 'input', 'aria-label': 'Activity type' }, ...Object.entries(ACTIVITY_TYPES).map(([k, label]) => h('option', { value: k }, label)));
    const text = h('input', { class: 'input', type: 'text', placeholder: 'What happened? (e.g. Emailed the parks director)' });
    const log = (e) => { e.preventDefault(); if (!text.value.trim() && typeSel.value === 'note') return; logActivity(sites.get(s.id), typeSel.value, text.value || ACTIVITY_TYPES[typeSel.value]); text.value = ''; };

    return h('div', { class: 'land-site-page' },
      h('button', { type: 'button', class: 'link-btn', onclick: () => { ctx.state.siteId = null; ctx.persist(); render(); } }, '← All sites'),
      h('div', { class: 'land-site-head' },
        h('input', { class: 'input land-title-input', value: s.name, 'aria-label': 'Site name', onchange: (e) => updateSite(sites.get(s.id), { name: e.target.value }) }),
        stageSelect(s)),
      h('p', { class: 'muted small' }, [CATEGORY[s.category] ?? '', s.kind, s.source ? `from ${s.source}` : ''].filter(Boolean).join(' · ')),
      h('div', { class: 'land-links' },
        s.lat != null ? h('button', { type: 'button', class: 'btn small', onclick: () => ctx.showOnMap(s) }, 'Show on map') : null,
        s.lat != null ? link(`https://www.google.com/maps/@?api=1&map_action=map&center=${s.lat},${s.lng}&zoom=18&basemap=satellite`, 'Google Maps satellite') : null,
        s.website ? link(s.website, 'Website') : null,
        s.sourceUrl ? link(s.sourceUrl, 'Data source') : null),

      h('section', { class: 'land-card' },
        h('h2', {}, 'Follow-up'),
        h('div', { class: 'land-form' },
          h('label', { class: 'land-form-field' }, h('span', { class: 'muted small' }, 'Next follow-up'),
            h('input', { class: 'input', type: 'date', value: s.nextFollowUp, onchange: (e) => updateSite(sites.get(s.id), { nextFollowUp: e.target.value }) })),
          h('div', { class: 'land-form-field' }, h('span', { class: 'muted small' }, ' '), followUpText(s) ?? h('span', { class: 'muted small' }, OPEN_STAGES.includes(s.stage) ? 'No follow-up set' : 'Closed'))),
        s.stage === 'declined' ? field('Why they declined', 'declineReason', { wide: true }) : null),

      h('section', { class: 'land-card' }, h('h2', {}, 'Contacts'), contacts),

      h('section', { class: 'land-card' },
        h('h2', {}, 'Activity'),
        h('form', { class: 'land-log', onsubmit: log }, typeSel, text, h('button', { class: 'btn primary', type: 'submit' }, 'Log')),
        h('p', { class: 'muted small' }, `Logging an email, call, meeting or visit sets the next follow-up ${FOLLOW_UP_DAYS} days out.`),
        h('ol', { class: 'land-activity' }, ...[...s.activity].reverse().map((a) => h('li', {},
          h('span', { class: 'muted small' }, new Date(a.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })),
          h('strong', { class: 'small' }, ACTIVITY_TYPES[a.type] ?? (a.type === 'stage' ? 'Stage' : a.type)),
          h('span', {}, a.text))))),

      h('section', { class: 'land-card' },
        h('h2', {}, 'Details'),
        h('div', { class: 'land-form' },
          field('Owner', 'owner'), field('Owner type', 'ownerType'), field('Address', 'address', { wide: true }),
          field('Parcel ID', 'parcelId'), field('Acres', 'acres', { type: 'number' }),
          field('Website', 'website', { type: 'url' }), field('Phone', 'phone', { type: 'tel' }),
          field('Notes', 'notes', { type: 'textarea', wide: true, placeholder: 'Terrain, sight lines, what they said, next steps…' }))),

      h('button', { type: 'button', class: 'btn ghost danger', onclick: () => {
        if (confirm(`Remove “${s.name}” from your pipeline? Its contacts and activity go too.`)) { removeSite(s); ctx.state.siteId = null; ctx.persist(); render(); }
      } }, 'Remove from pipeline'));
  }

  render();
  return { el, open, destroy: off };
}
