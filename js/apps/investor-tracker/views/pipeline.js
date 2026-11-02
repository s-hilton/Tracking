// Pipeline: one round at a time, investors grouped by stage, plus the firms
// from earlier rounds who said "keep us in mind".
import { h } from '../../../ui.js';
import { STAGES, PASS_REASONS, ROUND_STATUSES } from '../config.js';
import {
  rounds, firms, outreachFor, sortedRounds, roundSummary, lastTouch, setStage, carryOverCandidates, carryOver,
  firmName, roundName, todayIso,
} from '../data.js';
import { editRound, editFirm, editOutreach, passForm, addToRound, logForm, stageSelect } from '../editors.js';
import { money, fmtDate, ago, pill, section, empty } from './common.js';

function currentRound(ctx) {
  const list = sortedRounds();
  if (!rounds.get(ctx.state.roundId)) ctx.state.roundId = (list.find((r) => r.status === 'active') ?? list[0])?.id ?? '';
  return rounds.get(ctx.state.roundId);
}

function row(ctx, o) {
  const firm = firms.get(o.firmId);
  const last = lastTouch(o);
  const due = o.nextFollowUp && o.stage !== 'passed' && o.stage !== 'committed'
    ? (o.nextFollowUp < todayIso() ? pill(`Follow up ${ago(o.nextFollowUp)}`, 'bad') : o.nextFollowUp === todayIso() ? pill('Follow up today', 'warn') : pill(`Follow up ${fmtDate(o.nextFollowUp)}`, 'neutral'))
    : null;
  const detail = [
    o.contactName,
    o.stage === 'passed' ? PASS_REASONS[o.passReason] || 'No reason noted' : '',
    last ? `last touch ${ago(last)}` : 'no contact yet',
  ].filter(Boolean).join(' · ');
  return h('li', { class: `inv-row${o.stage === 'passed' ? ' faded' : ''}` },
    h('button', { class: 'inv-row-main', onclick: () => ctx.go('firm', { firmId: o.firmId }) },
      h('strong', {}, firm?.name ?? 'Unknown investor'),
      h('span', { class: 'muted small' }, detail)),
    h('div', { class: 'inv-row-meta' },
      o.stage === 'passed' && o.keepInMind ? pill('Keep in mind', 'info') : null,
      o.stage === 'passed' && firm?.wantsUpdates ? pill('Wants updates', 'info') : null,
      due,
      o.amount != null ? h('span', { class: 'inv-num' }, money(o.amount)) : null,
      stageSelect(o, (stage) => {
        if (stage !== 'passed') { setStage(o, stage); return; }
        ctx.refresh(); // put the menu back until the pass form is saved
        passForm(ctx.host, o);
      }),
      h('button', { class: 'btn ghost small', title: 'Log an email, call, meeting or note', onclick: () => logForm(ctx.host, { firmId: o.firmId, roundId: o.roundId, outreachId: o.id }) }, 'Log'),
      h('button', { class: 'btn ghost small', onclick: () => editOutreach(ctx.host, o) }, 'Edit')));
}

export function pipeline(ctx) {
  const view = h('div', { class: 'inv-view' });
  const round = currentRound(ctx);
  const newRound = () => editRound(ctx.host, null, (r) => { ctx.state.roundId = r.id; ctx.refresh(); });

  if (!round) {
    view.append(h('div', { class: 'inv-welcome' },
      h('h2', {}, 'Track your fundraise'),
      h('p', { class: 'muted' }, 'Start with a round (e.g. Seed). Add investors to it and move them through Contacted → Following up → Due diligence → Committed or Passed. Anyone who passes but says “keep us in mind” can be carried into your next round.'),
      h('button', { class: 'btn primary', onclick: newRound }, 'Start a round')));
    return view;
  }

  const query = (ctx.state.search ?? '').trim().toLowerCase();
  const list = outreachFor({ roundId: round.id })
    .filter((o) => !query || `${firmName(o.firmId)} ${o.contactName} ${o.notes}`.toLowerCase().includes(query));
  const summary = roundSummary(round.id);
  const pct = round.target ? Math.min(100, Math.round((summary.committed / round.target) * 100)) : null;

  const newInvestor = () => editFirm(ctx.host, null, { roundId: round.id });

  view.append(
    h('div', { class: 'inv-toolbar' },
      h('select', {
        class: 'input inv-round-select',
        'aria-label': 'Round',
        onchange: (e) => { if (e.target.value === '+') newRound(); else ctx.go('pipeline', { roundId: e.target.value }); },
      },
      ...sortedRounds().map((r) => h('option', { value: r.id, selected: r.id === round.id }, `${r.name}${r.status === 'closed' ? ' (closed)' : ''}`)),
      h('option', { value: '+' }, '+ New round…')),
      pill(ROUND_STATUSES[round.status] ?? round.status, round.status === 'active' ? 'good' : 'neutral'),
      h('button', { class: 'btn ghost', onclick: () => editRound(ctx.host, round) }, 'Edit round'),
      h('span', { class: 'spacer' }),
      h('input', {
        class: 'input', type: 'search', placeholder: 'Search this round…', value: ctx.state.search ?? '',
        oninput: (e) => { ctx.state.search = e.target.value; ctx.refresh({ keepFocus: true }); },
      }),
      h('button', { class: 'btn primary', onclick: () => addToRound(ctx.host, round.id, newInvestor) }, '+ Add investor')),

    h('div', { class: 'inv-stats' },
      h('div', { class: 'inv-stat' }, h('span', { class: 'muted small' }, 'Committed'), h('strong', {}, money(summary.committed, '$0')),
        round.target ? h('span', { class: 'muted small' }, `of ${money(round.target)} target (${pct}%)`) : null,
        round.target ? h('div', { class: 'inv-bar' }, h('span', { style: `width:${pct}%` })) : null),
      h('div', { class: 'inv-stat' }, h('span', { class: 'muted small' }, 'In play'), h('strong', {}, money(summary.pipeline, '$0')), h('span', { class: 'muted small' }, 'amounts on active investors')),
      h('div', { class: 'inv-stat' }, h('span', { class: 'muted small' }, 'Investors'), h('strong', {}, String(summary.total)),
        h('span', { class: 'muted small' }, `${Object.keys(STAGES).filter((s) => STAGES[s].active).reduce((n, s) => n + summary.counts[s], 0)} active · ${summary.counts.passed} passed`))),
    h('div', { class: 'inv-funnel' }, ...Object.entries(STAGES).map(([key, s]) => h('a', {
      class: `inv-funnel-step ${s.tone}`, href: `#inv-stage-${key}`,
      onclick: (e) => { e.preventDefault(); view.querySelector(`#inv-stage-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    }, h('strong', {}, String(summary.counts[key] ?? 0)), h('span', {}, s.label)))),
  );

  // Kept in mind from earlier rounds.
  const candidates = round.status === 'closed' ? [] : carryOverCandidates(round.id);
  if (candidates.length) {
    view.append(h('div', { class: 'inv-carry' }, section(`Kept in mind from earlier rounds (${candidates.length})`,
      h('button', { class: 'btn', onclick: () => { candidates.forEach((o) => carryOver(o, round.id)); } }, 'Carry all over'),
      h('p', { class: 'muted small inv-hint' }, `These investors passed before but asked you to keep them in mind. Carrying one over adds them to ${round.name} at “To contact” with their pass notes.`),
      h('ul', { class: 'inv-rows' }, ...candidates.map((o) => h('li', { class: 'inv-row' },
        h('button', { class: 'inv-row-main', onclick: () => ctx.go('firm', { firmId: o.firmId }) },
          h('strong', {}, firmName(o.firmId)),
          h('span', { class: 'muted small' }, [roundName(o.roundId), PASS_REASONS[o.passReason], o.passNotes, o.stageEntered ? `passed ${ago(new Date(o.stageEntered).toISOString().slice(0, 10))}` : ''].filter(Boolean).join(' · '))),
        h('div', { class: 'inv-row-meta' },
          h('button', { class: 'btn small', onclick: () => carryOver(o, round.id) }, `Carry over to ${round.name}`))))))));
  }

  if (!list.length) {
    view.append(empty(query ? 'No investors match that search.' : `No investors in ${round.name} yet. Use “+ Add investor”.`));
    return view;
  }

  const order = Object.keys(STAGES);
  for (const stage of order) {
    const items = list.filter((o) => o.stage === stage)
      .sort((a, b) => (a.nextFollowUp || '9999').localeCompare(b.nextFollowUp || '9999') || firmName(a.firmId).localeCompare(firmName(b.firmId)));
    if (!items.length) continue;
    const s = section(`${STAGES[stage].label} (${items.length})`, null, h('ul', { class: 'inv-rows' }, ...items.map((o) => row(ctx, o))));
    s.id = `inv-stage-${stage}`;
    view.append(s);
  }
  const unknown = list.filter((o) => !STAGES[o.stage]);
  if (unknown.length) view.append(section('Other', null, h('ul', { class: 'inv-rows' }, ...unknown.map((o) => row(ctx, o)))));
  return view;
}
