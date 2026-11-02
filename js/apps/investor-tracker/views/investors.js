// Investors: every firm across all rounds, and one firm's page (info, people,
// how each round went, and the timeline of updates).
import { h } from '../../../ui.js';
import { INVESTOR_TYPES, PASS_REASONS, ACTIVITY_KINDS, STAGES } from '../config.js';
import {
  firms, activities, outreachFor, activitiesFor, roundName, rounds, sortedRounds, byName, setStage, lastTouch,
  carryOverCandidates, carryOver,
} from '../data.js';
import { editFirm, editOutreach, passForm, addFirmToRound, logForm, stageSelect } from '../editors.js';
import { money, fmtDate, ago, pill, stagePill, section, empty, webLink, mailLink, telLink } from './common.js';

const FILTERS = {
  all: 'All',
  active: 'In play',
  keep: 'Keep in mind',
  updates: 'Wants updates',
  passed: 'Passed',
};

// The firm's most recent round entry (newest round first).
function latestOutreach(firmId) {
  const order = sortedRounds().map((r) => r.id);
  return outreachFor({ firmId }).sort((a, b) => order.indexOf(a.roundId) - order.indexOf(b.roundId))[0];
}

function matches(firm, filter) {
  const list = outreachFor({ firmId: firm.id });
  switch (filter) {
    case 'active': return list.some((o) => STAGES[o.stage]?.active);
    case 'keep': return list.some((o) => o.stage === 'passed' && o.keepInMind);
    case 'updates': return firm.wantsUpdates;
    case 'passed': return list.length > 0 && list.every((o) => o.stage === 'passed');
    default: return true;
  }
}

export function investorList(ctx) {
  const view = h('div', { class: 'inv-view' });
  const filter = FILTERS[ctx.state.filter] ? ctx.state.filter : 'all';
  const query = (ctx.state.firmSearch ?? '').trim().toLowerCase();
  const list = firms.all()
    .filter((f) => matches(f, filter))
    .filter((f) => !query || [f.name, f.tags, f.focus, f.location, f.notes, ...(f.contacts ?? []).map((p) => `${p.name} ${p.email}`)].join(' ').toLowerCase().includes(query))
    .sort(byName);

  view.append(
    h('div', { class: 'inv-toolbar' },
      h('input', {
        class: 'input', type: 'search', placeholder: 'Search investors, people, tags…', value: ctx.state.firmSearch ?? '',
        oninput: (e) => { ctx.state.firmSearch = e.target.value; ctx.refresh({ keepFocus: true }); },
      }),
      h('button', { class: 'btn primary', onclick: () => editFirm(ctx.host, null, { roundId: ctx.state.roundId, onSaved: (f) => ctx.go('firm', { firmId: f.id }) }) }, '+ New investor')),
    h('div', { class: 'inv-chips', role: 'group', 'aria-label': 'Filter' }, ...Object.entries(FILTERS).map(([key, label]) =>
      h('button', { class: `inv-chip${key === filter ? ' on' : ''}`, onclick: () => { ctx.state.filter = key; ctx.refresh(); } }, label))));

  if (!list.length) {
    view.append(empty(firms.all().length ? 'No investors match.' : 'No investors yet. Add the firms and angels you plan to talk to.'));
    return view;
  }

  view.append(h('ul', { class: 'inv-rows' }, ...list.map((f) => {
    const o = latestOutreach(f.id);
    return h('li', { class: 'inv-row' },
      h('button', { class: 'inv-row-main', onclick: () => ctx.go('firm', { firmId: f.id }) },
        h('strong', {}, f.name),
        h('span', { class: 'muted small' }, [f.type && INVESTOR_TYPES[f.type], f.location, f.checkSize, (f.contacts ?? [])[0]?.name].filter(Boolean).join(' · ') || ' ')),
      h('div', { class: 'inv-row-meta' },
        f.wantsUpdates ? pill('Wants updates', 'info') : null,
        o ? h('span', { class: 'muted small' }, roundName(o.roundId)) : h('span', { class: 'muted small' }, 'Not in a round'),
        o ? stagePill(o.stage) : null));
  })));
  return view;
}

function infoItem(label, value) {
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) return null;
  return h('div', { class: 'inv-info-item' }, h('span', { class: 'muted small' }, label), h('div', {}, value));
}

function roundCard(ctx, o) {
  const firm = firms.get(o.firmId);
  const openRounds = o.stage === 'passed' && o.keepInMind
    ? sortedRounds().filter((r) => r.id !== o.roundId && r.status !== 'closed' && carryOverCandidates(r.id).some((c) => c.id === o.id))
    : [];
  const last = lastTouch(o);
  return h('li', { class: 'inv-round-card' },
    h('div', { class: 'inv-round-card-head' },
      h('button', { class: 'link-btn', onclick: () => ctx.go('pipeline', { roundId: o.roundId }) }, h('strong', {}, roundName(o.roundId))),
      stageSelect(o, (stage) => {
        if (stage !== 'passed') { setStage(o, stage); return; }
        ctx.refresh();
        passForm(ctx.host, o);
      }),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn ghost small', onclick: () => editOutreach(ctx.host, o) }, 'Edit')),
    h('div', { class: 'inv-round-card-body small' },
      h('span', { class: 'muted' }, [o.contactName && `Contact: ${o.contactName}`, o.amount != null && money(o.amount), last && `last touch ${ago(last)}`,
        o.nextFollowUp && o.stage !== 'passed' && o.stage !== 'committed' && `follow up ${fmtDate(o.nextFollowUp)}`].filter(Boolean).join(' · ')),
      o.stage === 'passed' ? h('div', { class: 'inv-pass' },
        h('span', {}, h('strong', {}, 'Why: '), PASS_REASONS[o.passReason] || 'No reason noted'),
        o.passNotes ? h('q', {}, o.passNotes) : null,
        h('div', { class: 'inv-pass-flags' },
          o.keepInMind ? pill('Keep in mind', 'info') : pill('Not for next round', 'neutral'),
          firm?.wantsUpdates ? pill('Wants updates', 'info') : null,
          ...openRounds.map((r) => h('button', { class: 'btn small', onclick: () => carryOver(o, r.id) }, `Carry over to ${r.name}`)))) : null,
      o.notes ? h('p', { class: 'inv-notes' }, o.notes) : null));
}

export function firmPage(ctx) {
  const firm = firms.get(ctx.state.firmId);
  const view = h('div', { class: 'inv-view' });
  const back = h('button', { class: 'link-btn', onclick: () => ctx.go(ctx.state.from ?? 'investors') }, '← Back');
  if (!firm) { view.append(back, empty('This investor was deleted.')); return view; }

  const rounds_ = outreachFor({ firmId: firm.id });
  const order = sortedRounds().map((r) => r.id);
  rounds_.sort((a, b) => order.indexOf(a.roundId) - order.indexOf(b.roundId));
  const timeline = activitiesFor({ firmId: firm.id });

  view.append(...[
    back,
    h('header', { class: 'inv-firm-head' },
      h('div', {},
        h('h2', {}, firm.name),
        h('div', { class: 'inv-firm-sub' },
          firm.type && INVESTOR_TYPES[firm.type] ? pill(INVESTOR_TYPES[firm.type]) : null,
          firm.wantsUpdates ? pill(`Wants updates · last sent ${firm.lastUpdateSent ? ago(firm.lastUpdateSent) : 'never'}`, 'info') : null,
          webLink(firm.website))),
      h('div', { class: 'inv-section-actions' },
        h('button', { class: 'btn', onclick: () => logForm(ctx.host, { firmId: firm.id, roundId: rounds_[0]?.roundId ?? '' }) }, 'Log update'),
        h('button', { class: 'btn', onclick: () => addFirmToRound(ctx.host, firm) }, 'Add to round'),
        h('button', { class: 'btn ghost', onclick: () => editFirm(ctx.host, firm) }, 'Edit'))),

    h('div', { class: 'inv-info' },
      infoItem('Email', mailLink(firm.email)),
      infoItem('Phone', telLink(firm.phone)),
      infoItem('LinkedIn', webLink(firm.linkedin)),
      infoItem('Location', firm.location),
      infoItem('Typical check', firm.checkSize),
      infoItem('Focus', firm.focus),
      infoItem('Introduced by', firm.introducedBy),
      infoItem('Tags', firm.tags),
      infoItem('Added', firm.created ? fmtDate(new Date(firm.created).toISOString().slice(0, 10)) : '')),
    firm.notes ? section('Info & notes', null, h('p', { class: 'inv-notes' }, firm.notes)) : null,

    section('People', null, (firm.contacts ?? []).length
      ? h('ul', { class: 'inv-people' }, ...firm.contacts.map((p) => h('li', { class: 'inv-person' },
        h('strong', {}, p.name || 'Unnamed'), p.title ? h('span', { class: 'muted small' }, p.title) : null,
        h('div', { class: 'inv-person-links small' }, mailLink(p.email), telLink(p.phone), webLink(p.linkedin)))))
      : empty('No people yet. Use Edit to add the partner or angel you talk to.')),

    section('Rounds', null, rounds_.length
      ? h('ul', { class: 'inv-round-cards' }, ...rounds_.map((o) => roundCard(ctx, o)))
      : empty(rounds.all().length ? 'Not in any round yet. Use “Add to round”.' : 'Not in any round yet.')),

    section(`Updates & history (${timeline.length})`, h('button', { class: 'btn ghost small', onclick: () => logForm(ctx.host, { firmId: firm.id, roundId: rounds_[0]?.roundId ?? '' }) }, '+ Log'),
      timeline.length
        ? h('ol', { class: 'inv-timeline' }, ...timeline.map((a) => h('li', {},
          h('div', { class: 'inv-timeline-head small' },
            h('span', {}, ACTIVITY_KINDS[a.kind] ?? a.kind),
            h('span', { class: 'muted' }, [fmtDate(a.on), a.roundId ? roundName(a.roundId) : ''].filter(Boolean).join(' · ')),
            h('span', { class: 'spacer' }),
            h('button', { class: 'icon-btn small', 'aria-label': 'Delete entry', title: 'Delete entry', onclick: () => { if (confirm('Delete this entry?')) activities.remove(a.id); } }, '✕')),
          a.text ? h('p', { class: 'inv-notes' }, a.text) : null)))
        : empty('Nothing logged yet.')),
  ].filter(Boolean)); // native append would print null as text
  return view;
}
