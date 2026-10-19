// Pipeline: opportunities as a list or a drag-and-drop Kanban board.
import { h } from '../../../ui.js';
import { PRODUCTS, STAGES } from '../config.js';
import { opportunities, companyName, lastTouch, stageGroup, leadScore } from '../data.js';
import { scorePill } from './analytics.js';
import { editOpportunity, moveStage } from '../editors.js';
import {
  money, ago, pill, productChip, empty, button, searchBox, selectBox, matches, fmtDate, toCsv, downloadFile,
} from './common.js';

const GROUPS = { open: 'Open', won: 'LOI signed / contracted', paused: 'On hold', closed: 'Lost', all: 'All stages' };

const SORTS = {
  updated: { label: 'Recently updated', compare: (a, b) => b.updated - a.updated },
  score: { label: 'Highest score', compare: (a, b) => (leadScore(b).score ?? -1) - (leadScore(a).score ?? -1) },
  value: { label: 'Highest value', compare: (a, b) => (b.estimatedValue ?? -1) - (a.estimatedValue ?? -1) },
  signing: { label: 'Expected signing', compare: (a, b) => (a.expectedSigning || '9999').localeCompare(b.expectedSigning || '9999') },
};

export function pipeline(ctx) {
  const { state, product, host } = ctx;
  state.pipelineMode ??= 'board';
  state.pipelineQuery ??= '';
  state.pipelineGroup ??= 'all';
  state.pipelineUseCase ??= '';
  state.pipelineSort ??= 'updated';
  const focusStage = state.pipelineStage; // set when arriving from the Overview bars
  state.pipelineStage = null;

  const useCases = product === 'all' ? {} : PRODUCTS[product].useCases;
  const visible = () => opportunities.all()
    .filter((o) => product === 'all' || o.product === product)
    .filter((o) => state.pipelineGroup === 'all' || stageGroup(o) === state.pipelineGroup)
    .filter((o) => !state.pipelineUseCase || o.primaryUseCase === state.pipelineUseCase || (o.useCases ?? []).includes(state.pipelineUseCase))
    .filter((o) => matches(state.pipelineQuery, o.name, companyName(o.companyId), o.nextStep, o.notes))
    .filter((o) => !focusStage || o.stage === focusStage);

  const body = h('div', { class: 'bd-pipeline-body' });
  const daysIn = (o) => (o.stageEntered ? Math.floor((Date.now() - o.stageEntered) / 86400000) : null);

  const card = (o) => h('button', {
    class: 'bd-card',
    draggable: 'true',
    ondragstart: (e) => { e.dataTransfer.setData('text/plain', o.id); e.dataTransfer.effectAllowed = 'move'; },
    onclick: () => editOpportunity(host, o),
  },
  h('strong', {}, companyName(o.companyId)),
  o.name ? h('span', { class: 'small' }, o.name) : null,
  h('span', { class: 'bd-row-meta' },
    productChip(o.product),
    scorePill(leadScore(o).score),
    o.estimatedValue != null ? h('span', { class: 'bd-num small' }, money(o.estimatedValue)) : null,
    daysIn(o) != null ? h('span', { class: 'muted small' }, `${daysIn(o)}d in stage`) : null));

  function renderBoard(opps) {
    const stages = Object.entries(STAGES).filter(([key]) => state.pipelineGroup === 'all' || STAGES[key].group === state.pipelineGroup);
    body.replaceChildren(h('div', { class: 'bd-board' }, ...stages.map(([key, stage]) => {
      const inStage = opps.filter((o) => o.stage === key).sort(SORTS[state.pipelineSort].compare);
      const column = h('div', {
        class: 'bd-column',
        ondragover: (e) => { e.preventDefault(); column.classList.add('over'); },
        ondragleave: () => column.classList.remove('over'),
        ondrop: (e) => {
          e.preventDefault();
          column.classList.remove('over');
          const opp = opportunities.get(e.dataTransfer.getData('text/plain'));
          if (opp) moveStage(opp, key);
        },
      },
      h('div', { class: 'bd-column-head' }, h('span', {}, stage.label), h('span', { class: 'muted small' }, String(inStage.length))),
      ...inStage.map(card));
      return column;
    })));
  }

  function renderList(opps) {
    body.replaceChildren(opps.length ? h('div', { class: 'bd-table-wrap' }, h('table', { class: 'bd-table' },
      h('thead', {}, h('tr', {}, ...['Company', 'Opportunity', 'Product', 'Stage', 'Score', 'Est. value', 'Prob.', 'Expected signing', 'Last update'].map((t) => h('th', {}, t)))),
      h('tbody', {}, ...opps.sort(SORTS[state.pipelineSort].compare).map((o) => h('tr', { class: 'clickable', onclick: () => editOpportunity(host, o) },
        h('td', {}, h('strong', {}, companyName(o.companyId))),
        h('td', {}, o.name || PRODUCTS[o.product]?.useCases[o.primaryUseCase] || ''),
        h('td', {}, productChip(o.product)),
        h('td', {}, pill(STAGES[o.stage]?.label ?? o.stage, stageGroup(o) === 'closed' ? 'bad' : stageGroup(o) === 'won' ? 'good' : 'info')),
        h('td', { class: 'num' }, leadScore(o).score ?? '—'),
        h('td', { class: 'num' }, money(o.estimatedValue)),
        h('td', { class: 'num' }, o.probability != null ? `${o.probability}%` : ''),
        h('td', {}, fmtDate(o.expectedSigning)),
        h('td', { class: 'muted' }, ago(lastTouch(o.companyId)))))))) : empty('No opportunities match.'));
  }

  const render = () => {
    const opps = visible();
    if (state.pipelineMode === 'board') renderBoard(opps); else renderList(opps);
  };

  const exportCsv = () => {
    const rows = visible().map((o) => [companyName(o.companyId), o.name, PRODUCTS[o.product]?.label, STAGES[o.stage]?.label,
      PRODUCTS[o.product]?.useCases[o.primaryUseCase] ?? '', leadScore(o).score ?? '', o.estimatedValue ?? '', o.probability ?? '', o.expectedSigning, o.nextStep]);
    downloadFile(`opportunities-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv([['Company', 'Opportunity', 'Product', 'Stage', 'Primary use case', 'Lead score', 'Estimated value', 'Probability', 'Expected signing', 'Next step'], ...rows]), 'text/csv');
  };

  const view = h('div', { class: 'bd-view bd-pipeline' },
    h('div', { class: 'bd-toolbar' },
      searchBox(state.pipelineQuery, 'Search opportunities…', (v) => { state.pipelineQuery = v; render(); }),
      selectBox(state.pipelineGroup, GROUPS, (v) => { state.pipelineGroup = v; render(); }, 'Stage group'),
      selectBox(state.pipelineSort, Object.fromEntries(Object.entries(SORTS).map(([k, x]) => [k, x.label])), (v) => { state.pipelineSort = v; render(); }, 'Sort'),
      product !== 'all' ? selectBox(state.pipelineUseCase, { '': 'All use cases', ...useCases }, (v) => { state.pipelineUseCase = v; render(); }, 'Use case') : null,
      h('div', { class: 'seg' }, ...[['board', 'Board'], ['list', 'List']].map(([k, label]) =>
        h('button', { class: state.pipelineMode === k ? 'on' : '', onclick: () => { state.pipelineMode = k; ctx.refresh(); } }, label))),
      button('Export CSV', exportCsv, 'btn ghost'),
      button('+ Opportunity', () => editOpportunity(host, null, { product }), 'btn primary')),
    focusStage ? h('p', { class: 'muted small' }, `Showing ${STAGES[focusStage]?.label}. `, h('button', { class: 'link-btn', onclick: () => ctx.refresh() }, 'Show all stages')) : null,
    body);
  render();
  return view;
}
