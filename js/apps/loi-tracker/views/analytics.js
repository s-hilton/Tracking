// Analytics: conversion, velocity, activity and signing trends, and lead scores,
// all scoped by one filter row (date range, then use case when a product is chosen).
import { h } from '../../../ui.js';
import { PRODUCTS, STAGES, DATE_RANGES, STRONG_FIT_SCORE } from '../config.js';
import { lois, loiValueFor, leadScore, stageGroup, companyName } from '../data.js';
import {
  resolveRange, describeRange, stageFunnel, outreachFunnel, daysInStage, outreachToSignature, weeklyActivity, monthlySigned,
  scopedOpportunities, scopedActivities, inRange, isoInRange,
} from '../analytics.js';
import { editOpportunity } from '../editors.js';
import { barList, columnChart } from './charts.js';
import { money, section, selectBox, productChip } from './common.js';

// The filter row shared by Overview and Analytics. Changing it redraws the view.
export function dateFilter(ctx, { useCases = false } = {}) {
  const { state } = ctx;
  state.range ??= { preset: 'all', from: '', to: '' };
  state.useCase ??= '';
  const custom = state.range.preset === 'custom';
  const dateInput = (key) => h('input', {
    class: 'input', type: 'date', value: state.range[key], 'aria-label': key === 'from' ? 'From' : 'To',
    onchange: (e) => { state.range = { ...state.range, [key]: e.target.value }; ctx.refresh(); },
  });
  return h('div', { class: 'bd-toolbar bd-filters' },
    selectBox(state.range.preset, DATE_RANGES, (v) => { state.range = { ...state.range, preset: v }; ctx.refresh(); }, 'Date range'),
    custom ? dateInput('from') : null,
    custom ? h('span', { class: 'muted small' }, 'to') : null,
    custom ? dateInput('to') : null,
    useCases && ctx.product !== 'all'
      ? selectBox(state.useCase, { '': 'All use cases', ...PRODUCTS[ctx.product].useCases }, (v) => { state.useCase = v; ctx.refresh(); }, 'Use case')
      : null,
    h('span', { class: 'muted small' }, describeRange(resolveRange(state.range))));
}

const pct = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : '—');
const days = (d) => (d == null ? '—' : `${d < 10 ? d.toFixed(1) : Math.round(d)} days`);

export function analytics(ctx) {
  const { state } = ctx;
  const filters = dateFilter(ctx, { useCases: true });
  const range = resolveRange(state.range);
  const scope = { product: ctx.product, useCase: ctx.product === 'all' ? '' : state.useCase };

  // ---- Period headline ----
  const created = scopedOpportunities(scope).filter((o) => inRange(o.created, range));
  const acts = scopedActivities(scope).filter((a) => inRange(a.occurredAt, range));
  const scopeCompanies = new Set(scopedOpportunities(scope).map((o) => o.companyId));
  const signedInPeriod = lois.all().filter((l) => l.signedOn && isoInRange(l.signedOn, range) && !['withdrawn', 'superseded'].includes(l.status)
    && (scope.product === 'all' || scopeCompanies.has(l.companyId)));
  const velocity = outreachToSignature(scope, range);
  const tile = (label, value, sub) => h('div', { class: 'bd-stat' }, h('span', { class: 'muted small' }, label), h('strong', {}, value), sub ? h('span', { class: 'muted small' }, sub) : null);
  const headline = h('div', { class: 'bd-stats' },
    tile('Opportunities created', String(created.length)),
    tile('Outbound touches', String(acts.filter((a) => a.direction === 'outbound').length)),
    tile('Replies received', String(acts.filter((a) => a.direction === 'inbound').length)),
    tile('LOIs signed', String(signedInPeriod.length), money(signedInPeriod.reduce((s, l) => s + (loiValueFor(l, ctx.product) ?? 0), 0))),
    tile('First outreach → signature', days(velocity.days), velocity.n ? `median of ${velocity.n}` : 'no signed LOIs yet'));

  // ---- Conversion ----
  const funnel = stageFunnel(scope, range);
  const stageConversion = section('Stage conversion', null,
    h('p', { class: 'muted small' }, `Of the ${funnel[0].of} opportunities created in this period, how many reached each stage (from stage history).`),
    barList({
      headers: ['Stage', 'Reached', 'Of previous'],
      rows: funnel.map((step, i) => ({
        label: STAGES[step.stage].label,
        value: step.count,
        display: `${step.count} · ${pct(step.count, step.of)}`,
        detail: i ? `${pct(step.count, funnel[i - 1].count)} of previous stage` : 'starting point',
      })),
      empty: 'No opportunities were created in this period.',
    }));

  const outreach = outreachFunnel(scope, range);
  const outreachConversion = section('Outreach conversion (unique companies)', null,
    h('p', { class: 'muted small' }, 'Companies contacted in this period, and how many replied, met and signed an LOI.'),
    barList({
      headers: ['Step', 'Companies', 'Of previous'],
      rows: outreach.map((step, i) => ({
        label: step.label,
        value: step.count,
        display: `${step.count} · ${pct(step.count, step.of)}`,
        detail: i ? `${pct(step.count, outreach[i - 1].count)} of previous step` : 'starting point',
      })),
      empty: 'No outbound activity in this period.',
    }));

  // ---- Velocity ----
  const stageDays = daysInStage(scope, range);
  const velocitySection = section('Velocity: median days in each stage', null,
    h('p', { class: 'muted small' }, 'Measured from stage changes that happened in this period.'),
    barList({
      headers: ['Stage', 'Median days', 'Moves measured'],
      rows: stageDays.map((s) => ({ label: STAGES[s.stage].label, value: s.days, display: days(s.days), detail: `${s.n} move${s.n === 1 ? '' : 's'} measured` })),
      empty: 'No stage changes in this period yet. Move opportunities through the pipeline to see velocity.',
    }));

  // ---- Trends ----
  const weekly = weeklyActivity(scope, range);
  const activityTrend = section('Outreach and responses per week', null,
    columnChart({
      categories: weekly.map((w) => w.label),
      series: [
        { name: 'Outbound', slot: 1, values: weekly.map((w) => w.outbound) },
        { name: 'Inbound', slot: 2, values: weekly.map((w) => w.inbound) },
      ],
      empty: 'No activity logged in this period.',
    }));

  const monthly = monthlySigned(scope, range, (l) => loiValueFor(l, ctx.product));
  const signingTrend = section('LOIs signed per month', null,
    columnChart({
      categories: monthly.map((m) => m.label),
      series: [{ name: 'LOIs signed', slot: 1, values: monthly.map((m) => m.count) }],
      empty: 'No LOIs signed in this period.',
    }));

  // ---- Lead scores ----
  const open = scopedOpportunities(scope).filter((o) => stageGroup(o) === 'open').map((o) => ({ o, ...leadScore(o) }));
  const bands = [[80, 100], [60, 79], [40, 59], [20, 39], [0, 19]];
  const scoreSection = section('Lead scores of open opportunities', null,
    barList({
      headers: ['Score', 'Opportunities'],
      rows: [
        ...bands.map(([lo, hi]) => {
          const n = open.filter((x) => x.score != null && x.score >= lo && x.score <= hi).length;
          return { label: `${lo}–${hi}`, value: n, display: String(n) };
        }),
        { label: 'Not scored', value: open.filter((x) => x.score == null).length, display: String(open.filter((x) => x.score == null).length) },
      ],
      empty: 'No open opportunities.',
    }),
    open.some((x) => x.score != null) ? h('ul', { class: 'bd-rows' }, ...open.filter((x) => x.score != null).sort((a, b) => b.score - a.score).slice(0, 5)
      .map(({ o, score }) => h('li', { class: 'bd-row' },
        h('button', { class: 'bd-row-main', onclick: () => editOpportunity(ctx.host, o) },
          h('strong', {}, companyName(o.companyId)), h('span', { class: 'muted small' }, o.name || PRODUCTS[o.product]?.label)),
        h('div', { class: 'bd-row-meta' }, productChip(o.product), scorePill(score))))) : null);

  return h('div', { class: 'bd-view bd-analytics' }, filters, headline,
    h('div', { class: 'bd-chart-grid' }, stageConversion, outreachConversion, velocitySection, scoreSection),
    activityTrend, signingTrend);
}

export function scorePill(score) {
  if (score == null) return null;
  const tone = score >= STRONG_FIT_SCORE ? 'good' : score >= 40 ? 'info' : 'neutral';
  return h('span', { class: `bd-pill ${tone}`, title: 'Lead score (0–100)' }, `Score ${score}`);
}
