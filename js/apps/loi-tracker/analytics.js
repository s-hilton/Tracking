// Numbers behind the Analytics tab and the Overview's date-filtered figures.
// Each metric filters on the date that matches what it measures (PRD §9):
// opportunities by creation date, activities by when they happened, LOIs by
// signing date, stage time by when the stage was left.
import { FUNNEL_STAGES, MEETING_TYPES } from './config.js';
import { opportunities, activities, lois, parseIso, localIso } from './data.js';

const DAY = 86400000;

// ---- Date ranges ------------------------------------------------------------------
// Returns { from, to } in ms (inclusive), or nulls for "all time".
export function resolveRange({ preset = 'all', from = '', to = '' } = {}) {
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const end = startOfDay(now) + DAY - 1;
  switch (preset) {
    case 'd30': return { from: startOfDay(now) - 29 * DAY, to: end };
    case 'd90': return { from: startOfDay(now) - 89 * DAY, to: end };
    case 'quarter': return { from: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).getTime(), to: end };
    case 'year': return { from: new Date(now.getFullYear(), 0, 1).getTime(), to: end };
    case 'm12': return { from: new Date(now.getFullYear(), now.getMonth() - 11, 1).getTime(), to: end };
    case 'custom': return {
      from: from ? parseIso(from).getTime() : null,
      to: to ? parseIso(to).getTime() + DAY - 1 : null,
    };
    default: return { from: null, to: null };
  }
}

export const inRange = (ms, range) => ms != null && (range.from == null || ms >= range.from) && (range.to == null || ms <= range.to);
export const isoInRange = (iso, range) => Boolean(iso) && inRange(parseIso(iso).getTime(), range);

export function describeRange(range) {
  const fmt = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  if (range.from == null && range.to == null) return 'all time';
  if (range.from == null) return `up to ${fmt(range.to)}`;
  if (range.to == null) return `since ${fmt(range.from)}`;
  return `${fmt(range.from)} – ${fmt(range.to)}`;
}

// ---- Scope: product + use case ------------------------------------------------------
export function scopedOpportunities({ product, useCase }) {
  return opportunities.all()
    .filter((o) => product === 'all' || o.product === product)
    .filter((o) => !useCase || o.primaryUseCase === useCase || (o.useCases ?? []).includes(useCase));
}

// Activities in scope: everything for "all products"; otherwise those linked to an in-scope opportunity.
export function scopedActivities(scope) {
  if (scope.product === 'all' && !scope.useCase) return activities.all();
  const ids = new Set(scopedOpportunities(scope).map((o) => o.id));
  return activities.all().filter((a) => (a.opportunityIds ?? []).some((id) => ids.has(id)));
}

// ---- Conversion: stage funnel -------------------------------------------------------
// The furthest point an opportunity reached on the funnel path, from its stage history.
function furthestStage(opp) {
  const reached = [opp.stage, ...(opp.stageHistory ?? []).map((e) => e.to)]
    .map((stage) => FUNNEL_STAGES.indexOf(stage === 'contracted' ? 'loi_signed' : stage === 'following_up' ? 'reached_out' : stage));
  return Math.max(-1, ...reached);
}

// Of the opportunities created in the range, how many reached each stage.
export function stageFunnel(scope, range) {
  const cohort = scopedOpportunities(scope).filter((o) => inRange(o.created, range));
  const furthest = cohort.map(furthestStage);
  return FUNNEL_STAGES.map((stage, i) => ({ stage, count: furthest.filter((f) => f >= i).length, of: cohort.length }));
}

// ---- Conversion: outreach to signature (unique companies) ---------------------------
export function outreachFunnel(scope, range) {
  const acts = scopedActivities(scope).filter((a) => inRange(a.occurredAt, range));
  const companiesWhere = (test) => new Set(acts.filter(test).map((a) => a.companyId));
  const outreached = companiesWhere((a) => a.direction === 'outbound');
  const replied = new Set([...companiesWhere((a) => a.direction === 'inbound')].filter((id) => outreached.has(id)));
  const met = new Set([...companiesWhere((a) => MEETING_TYPES.includes(a.type) || a.outcome === 'meeting_completed')].filter((id) => outreached.has(id)));
  const oppCompanies = new Set(scopedOpportunities(scope).map((o) => o.companyId));
  const signed = new Set(lois.all()
    .filter((l) => (l.status === 'signed' || l.signedOn) && outreached.has(l.companyId) && (scope.product === 'all' || oppCompanies.has(l.companyId)))
    .map((l) => l.companyId));
  return [
    { label: 'Contacted (outbound)', count: outreached.size },
    { label: 'Replied', count: replied.size },
    { label: 'Met', count: met.size },
    { label: 'Signed an LOI', count: signed.size },
  ].map((step) => ({ ...step, of: outreached.size }));
}

// ---- Velocity -------------------------------------------------------------------------
export const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Median days spent in each stage, from completed stage transitions that ended in the range.
export function daysInStage(scope, range) {
  const spans = {};
  for (const opp of scopedOpportunities(scope)) {
    const history = opp.stageHistory ?? [];
    for (let i = 0; i < history.length - 1; i += 1) {
      const left = history[i + 1].at;
      if (!inRange(left, range)) continue;
      (spans[history[i].to] ??= []).push((left - history[i].at) / DAY);
    }
  }
  return FUNNEL_STAGES.slice(0, -1).map((stage) => ({ stage, days: median(spans[stage] ?? []), n: (spans[stage] ?? []).length }));
}

// Median days from a company's first outbound touch to its first LOI signing (signed in the range).
export function outreachToSignature(scope, range) {
  const scopeCompanies = new Set(scopedOpportunities(scope).map((o) => o.companyId));
  const firstSigned = {};
  for (const l of lois.all()) {
    if (!l.signedOn || !isoInRange(l.signedOn, range)) continue;
    if (scope.product !== 'all' && !scopeCompanies.has(l.companyId)) continue;
    const t = parseIso(l.signedOn).getTime();
    if (!firstSigned[l.companyId] || t < firstSigned[l.companyId]) firstSigned[l.companyId] = t;
  }
  const days = Object.entries(firstSigned).map(([companyId, signedAt]) => {
    const first = activities.all().filter((a) => a.companyId === companyId && a.direction === 'outbound')
      .reduce((min, a) => Math.min(min, a.occurredAt), Infinity);
    return Number.isFinite(first) && first <= signedAt ? (signedAt - first) / DAY : null;
  }).filter((d) => d != null);
  return { days: median(days), n: days.length };
}

// ---- Trends -------------------------------------------------------------------------------
// Weekly outbound vs inbound activity. Open-ended ranges show the last 12 weeks.
export function weeklyActivity(scope, range) {
  const to = range.to ?? Date.now();
  const startOfWeek = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
  const from = startOfWeek(range.from ?? to - 11 * 7 * DAY);
  const weeks = [];
  for (let w = from; w <= to && weeks.length < 60; w += 7 * DAY) weeks.push(w);
  const acts = scopedActivities(scope).filter((a) => a.occurredAt >= from && a.occurredAt <= to);
  return weeks.map((start) => {
    const inWeek = acts.filter((a) => startOfWeek(a.occurredAt) === start);
    return {
      label: new Date(start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      outbound: inWeek.filter((a) => a.direction === 'outbound').length,
      inbound: inWeek.filter((a) => a.direction === 'inbound').length,
    };
  });
}

// LOIs signed per month (by signing date). Open-ended ranges show the last 12 months.
export function monthlySigned(scope, range, valueOf) {
  const to = new Date(range.to ?? Date.now());
  const fromDate = range.from != null ? new Date(range.from) : new Date(to.getFullYear(), to.getMonth() - 11, 1);
  const months = [];
  for (let d = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1); d <= to && months.length < 36; d.setMonth(d.getMonth() + 1)) months.push(new Date(d));
  const scopeCompanies = new Set(scopedOpportunities(scope).map((o) => o.companyId));
  const signed = lois.all().filter((l) => l.signedOn && !['withdrawn', 'superseded'].includes(l.status)
    && (scope.product === 'all' || scopeCompanies.has(l.companyId)));
  return months.map((m) => {
    const key = localIso(m).slice(0, 7);
    const inMonth = signed.filter((l) => l.signedOn.slice(0, 7) === key && isoInRange(l.signedOn, { from: range.from, to: range.to }));
    return {
      label: m.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
      count: inMonth.length,
      value: inMonth.reduce((sum, l) => sum + (valueOf(l) ?? 0), 0),
    };
  });
}
