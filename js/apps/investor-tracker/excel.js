// "Export to Excel": everything in the Investors app as one workbook, one sheet
// per kind (Pipeline, Investors, People, Rounds, History), with labels instead
// of internal keys, real dates and numbers, and links that open.
import { h } from '../../ui.js';
import { STAGES, INVESTOR_TYPES, PASS_REASONS, ROUND_STATUSES, ACTIVITY_KINDS, CURRENCY } from './config.js';
import {
  rounds, firms, outreach, activities, sortedRounds, roundSummary, firmName, roundName, lastTouch, todayIso, byName,
} from './data.js';
import { buildXlsx } from './xlsx.js';

const label = (map, key) => (key ? (typeof map[key] === 'string' ? map[key] : map[key]?.label) ?? key : '');
const date = (iso) => (iso ? { date: iso } : '');
const dateTime = (ms) => (ms ? { dateTime: ms } : '');
const money = (n) => (n == null || n === '' ? '' : { money: n });
const link = (url) => (url ? { url: /^https?:\/\//i.test(url) ? url : `https://${url}`, text: url } : '');
const col = (header, width) => ({ header, width });
const people = (f) => (f.contacts ?? []).filter((p) => p.name || p.email);
const emojiless = (s) => String(s).replace(/^\P{L}+\s*/u, ''); // "✉️ Email" → "Email"

// Rounds in the app's order (newest first), so sheets sort the same way.
const roundOrder = () => new Map(sortedRounds().map((r, i) => [r.id, i]));

function pipelineSheet() {
  const order = roundOrder();
  const stageOrder = Object.keys(STAGES);
  return {
    name: 'Pipeline',
    columns: [col('Round', 14), col('Investor', 28), col('Type', 18), col('Stage', 16), col('Stage since', 18),
      col('Main contact', 22), col('Contact email', 28), col(`Amount (${CURRENCY})`, 14), col('Next follow-up', 14),
      col('Last touch', 12), col('Pass reason', 28), col('What they said', 40), col('Keep in mind', 12),
      col('Wants updates', 12), col('Carried over from', 16), col('Notes', 50)],
    rows: outreach.all().filter((o) => firms.get(o.firmId)).slice().sort((a, b) =>
      (order.get(a.roundId) ?? 99) - (order.get(b.roundId) ?? 99)
      || stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage)
      || firmName(a.firmId).localeCompare(firmName(b.firmId))).map((o) => {
      const f = firms.get(o.firmId);
      const person = (f.contacts ?? []).find((p) => p.name === o.contactName);
      const passed = o.stage === 'passed';
      const from = outreach.get(o.carriedFrom);
      return [
        roundName(o.roundId), f.name, label(INVESTOR_TYPES, f.type), label(STAGES, o.stage), dateTime(o.stageEntered),
        o.contactName, person?.email ?? '', money(o.amount), passed || o.stage === 'committed' ? '' : date(o.nextFollowUp),
        date(lastTouch(o)), passed ? label(PASS_REASONS, o.passReason) : '', passed ? o.passNotes : '',
        passed ? Boolean(o.keepInMind) : '', Boolean(f.wantsUpdates), from ? roundName(from.roundId) : '', o.notes,
      ];
    }),
  };
}

function investorsSheet() {
  const order = roundOrder();
  return {
    name: 'Investors',
    columns: [col('Investor', 28), col('Type', 18), col('Website', 26), col('General email', 26), col('Phone', 16),
      col('LinkedIn', 26), col('Location', 18), col('Typical check', 16), col('Focus', 30), col('Main person', 22),
      col('Their title', 18), col('Their email', 28), col('Their phone', 16), col('Other people', 30),
      col('Latest round', 14), col('Latest stage', 16), col('Rounds', 24), col('Wants updates', 12),
      col('Last update sent', 14), col('Introduced by', 18), col('Tags', 20), col('Info & notes', 50), col('Added', 18)],
    rows: firms.all().slice().sort(byName).map((f) => {
      const list = outreach.all().filter((o) => o.firmId === f.id)
        .sort((a, b) => (order.get(a.roundId) ?? 99) - (order.get(b.roundId) ?? 99));
      const [main, ...others] = people(f);
      return [
        f.name, label(INVESTOR_TYPES, f.type), link(f.website), f.email, f.phone, link(f.linkedin), f.location, f.checkSize,
        f.focus, main?.name ?? '', main?.title ?? '', main?.email ?? '', main?.phone ?? '',
        others.map((p) => [p.name, p.title && `(${p.title})`, p.email].filter(Boolean).join(' ')).join('; '),
        list[0] ? roundName(list[0].roundId) : '', list[0] ? label(STAGES, list[0].stage) : '',
        list.map((o) => `${roundName(o.roundId)}: ${label(STAGES, o.stage)}`).join(', '),
        Boolean(f.wantsUpdates), date(f.lastUpdateSent), f.introducedBy, f.tags, f.notes, dateTime(f.created),
      ];
    }),
  };
}

function peopleSheet() {
  return {
    name: 'People',
    columns: [col('Name', 24), col('Investor', 28), col('Title', 20), col('Email', 30), col('Phone', 16), col('LinkedIn', 30)],
    rows: firms.all().slice().sort(byName).flatMap((f) => people(f).map((p) => [
      p.name, f.name, p.title, p.email, p.phone, link(p.linkedin),
    ])),
  };
}

function roundsSheet() {
  return {
    name: 'Rounds',
    columns: [col('Round', 16), col('Status', 14), col(`Target (${CURRENCY})`, 14), col(`Committed (${CURRENCY})`, 14),
      col('% of target', 10), col(`In play (${CURRENCY})`, 14), col('Investors', 10),
      ...Object.values(STAGES).map((s) => col(s.label, 12)), col('Opened', 12), col('Closed', 12), col('Notes', 50)],
    rows: sortedRounds().map((r) => {
      const s = roundSummary(r.id);
      return [
        r.name, label(ROUND_STATUSES, r.status), money(r.target), money(s.committed),
        r.target ? Math.round((s.committed / r.target) * 100) : '', money(s.pipeline), s.total,
        ...Object.keys(STAGES).map((k) => s.counts[k] ?? 0), date(r.openedOn), date(r.closedOn), r.notes,
      ];
    }),
  };
}

function historySheet() {
  return {
    name: 'History',
    columns: [col('Date', 12), col('Investor', 28), col('Round', 14), col('What', 20), col('Details', 70)],
    rows: activities.all().filter((a) => firms.get(a.firmId)).slice()
      .sort((a, b) => (b.on || '').localeCompare(a.on || '') || (b.created ?? 0) - (a.created ?? 0))
      .map((a) => [date(a.on), firmName(a.firmId), a.roundId && rounds.get(a.roundId) ? roundName(a.roundId) : '',
        emojiless(label(ACTIVITY_KINDS, a.kind)), a.text]),
  };
}

export const excelFileName = () => `investors-${todayIso()}.xlsx`;

export const buildWorkbook = () => buildXlsx([pipelineSheet(), investorsSheet(), peopleSheet(), roundsSheet(), historySheet()]);

export function downloadWorkbook() {
  const url = URL.createObjectURL(new Blob([buildWorkbook()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  h('a', { href: url, download: excelFileName() }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
