// Add/edit screens for the Investors app.
import { h } from '../../ui.js';
import { openForm } from './form.js';
import {
  STAGES, INVESTOR_TYPES, PASS_REASONS, ROUND_STATUSES, ROUND_NAMES, ACTIVITY_KINDS,
} from './config.js';
import {
  rounds, firms, outreach, saveRecord, addOutreach, setStage, logActivity, deleteFirm, deleteRound, deleteOutreach,
  sortedRounds, outreachFor, roundName, firmName, todayIso, byName, markUpdateSent,
} from './data.js';

const stageOptions = Object.fromEntries(Object.entries(STAGES).map(([k, s]) => [k, s.label]));
const BLANK_PERSON = { name: '', title: '', email: '', phone: '', linkedin: '' };

// ---- Rounds ------------------------------------------------------------------
export function editRound(host, round, onSaved) {
  openForm(host, {
    title: round ? `Edit ${round.name}` : 'New round',
    values: round ?? { name: '', status: 'active', target: null, openedOn: todayIso(), closedOn: '', notes: '' },
    fields: [
      { key: 'name', label: 'Round', required: true, placeholder: 'e.g. Seed', suggestions: ROUND_NAMES },
      { key: 'status', label: 'Status', type: 'select', options: ROUND_STATUSES },
      { key: 'target', label: 'Target raise ($)', type: 'number' },
      { key: 'openedOn', label: 'Opened', type: 'date' },
      { key: 'closedOn', label: 'Closed', type: 'date' },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true, placeholder: 'Valuation, instrument (SAFE / priced), lead, deadlines…' },
    ],
    onSubmit: (v) => { const saved = saveRecord(rounds, { ...round, ...v, name: v.name.trim() }); onSaved?.(saved); },
    onDelete: round ? () => deleteRound(round.id) : null,
    deleteLabel: 'Delete this round and its pipeline',
  });
}

// ---- Firms -------------------------------------------------------------------
function peopleEditor(values, redraw) {
  const people = values.contacts ?? (values.contacts = []);
  const input = (person, key, placeholder, type = 'text') => h('input', {
    class: 'input', type, placeholder, value: person[key] ?? '', autocomplete: 'off',
    oninput: (e) => { person[key] = e.target.value; },
  });
  return h('div', { class: 'inv-people-edit' },
    ...people.map((p, i) => h('div', { class: 'inv-person-edit' },
      input(p, 'name', 'Name'), input(p, 'title', 'Title (e.g. Partner)'), input(p, 'email', 'Email', 'email'),
      input(p, 'phone', 'Phone', 'tel'), input(p, 'linkedin', 'LinkedIn URL'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => { people.splice(i, 1); redraw(); } }, 'Remove'))),
    h('button', { type: 'button', class: 'btn', onclick: () => { people.push({ ...BLANK_PERSON }); redraw(); } }, '+ Add person'));
}

// New firms can go straight into a round.
export function editFirm(host, firm, { roundId = '', onSaved } = {}) {
  const roundChoices = [['', 'Don’t add to a round yet'], ...sortedRounds().map((r) => [r.id, r.name])];
  openForm(host, {
    title: firm ? `Edit ${firm.name}` : 'New investor',
    values: firm ?? {
      name: '', type: '', website: '', email: '', phone: '', linkedin: '', location: '', checkSize: '', focus: '',
      contactUrl: '', contacts: [{ ...BLANK_PERSON }], introducedBy: '', tags: '', notes: '', wantsUpdates: false, lastUpdateSent: '',
      addTo: roundId, stage: 'to_contact',
    },
    fields: [
      { key: 'name', label: 'Firm / investor name', required: true, wide: true },
      { key: 'type', label: 'Type', type: 'select', options: INVESTOR_TYPES },
      { key: 'website', label: 'Website', type: 'url', placeholder: 'https://' },
      { key: 'location', label: 'Location' },
      { key: 'email', label: 'General email', type: 'email' },
      { key: 'phone', label: 'Phone', type: 'tel' },
      { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/company/…' },
      { key: 'contactUrl', label: 'Contact page / pitch form', placeholder: 'https://…/contact' },
      { key: 'checkSize', label: 'Typical check', placeholder: 'e.g. $250k–$1M' },
      { key: 'focus', label: 'Focus', placeholder: 'Stages, sectors, geographies' },
      { key: 'introducedBy', label: 'Introduced by / source' },
      { type: 'heading', label: 'People' },
      { type: 'custom', render: peopleEditor },
      { type: 'heading', label: 'More' },
      { key: 'tags', label: 'Tags', placeholder: 'comma separated', wide: true },
      { key: 'notes', label: 'Info & notes', type: 'textarea', wide: true, rows: 4, placeholder: 'Portfolio, thesis, what they care about…' },
      { key: 'wantsUpdates', label: 'Wants investor updates', type: 'checkbox', wide: true },
      ...(firm ? [] : [
        { type: 'heading', label: 'Round' },
        { key: 'addTo', label: 'Add to round', type: 'select', options: roundChoices, refresh: true },
        { key: 'stage', label: 'Starting stage', type: 'select', options: stageOptions, show: (v) => Boolean(v.addTo) },
      ]),
    ],
    onSubmit: (v) => {
      const name = v.name.trim();
      const clash = firms.all().find((f) => f.id !== firm?.id && f.name.trim().toLowerCase() === name.toLowerCase());
      if (clash) return `${clash.name} is already in your investors.`;
      const { addTo, stage, ...rest } = v;
      const saved = saveRecord(firms, { ...firm, ...rest, name, contacts: (rest.contacts ?? []).filter((p) => Object.values(p).some((x) => String(x).trim())) });
      if (!firm && addTo) addOutreach(saved.id, addTo, { stage, contactName: saved.contacts[0]?.name ?? '' });
      onSaved?.(saved);
      return undefined;
    },
    onDelete: firm ? () => deleteFirm(firm.id) : null,
    deleteLabel: 'Delete this investor and all their history',
  });
}

// ---- One firm in one round ---------------------------------------------------
export function editOutreach(host, o) {
  const firm = firms.get(o.firmId);
  const people = [['', '—'], ...(firm?.contacts ?? []).filter((p) => p.name).map((p) => [p.name, p.name])];
  if (o.contactName && !people.some(([v]) => v === o.contactName)) people.push([o.contactName, o.contactName]);
  openForm(host, {
    title: `${firmName(o.firmId)} · ${roundName(o.roundId)}`,
    values: { ...o, wantsUpdates: Boolean(firm?.wantsUpdates) },
    fields: [
      { key: 'stage', label: 'Stage', type: 'select', options: stageOptions, refresh: true },
      { key: 'contactName', label: 'Main contact', type: 'select', options: people },
      { key: 'nextFollowUp', label: 'Next follow-up', type: 'date', show: (v) => v.stage !== 'passed' && v.stage !== 'committed' },
      { key: 'amount', label: 'Amount ($)', type: 'number', help: 'What they might put in, or what they committed' },
      { type: 'heading', label: 'Why they passed', show: (v) => v.stage === 'passed' },
      { key: 'passReason', label: 'Reason', type: 'select', options: PASS_REASONS, show: (v) => v.stage === 'passed' },
      { key: 'passNotes', label: 'In their words', type: 'textarea', wide: true, show: (v) => v.stage === 'passed' },
      { key: 'keepInMind', label: 'Keep in mind for the next round', type: 'checkbox', show: (v) => v.stage === 'passed' },
      { key: 'wantsUpdates', label: 'They want investor updates', type: 'checkbox', show: (v) => v.stage === 'passed' },
      { type: 'heading', label: 'Notes', show: (v) => v.stage !== 'passed' },
      { key: 'notes', label: 'Notes for this round', type: 'textarea', wide: true },
    ],
    onSubmit: (v) => {
      const { wantsUpdates, ...rest } = v;
      setStage(o, v.stage, rest);
      if (firm && v.stage === 'passed' && wantsUpdates !== Boolean(firm.wantsUpdates)) saveRecord(firms, { ...firm, wantsUpdates });
    },
    onDelete: () => deleteOutreach(o.id),
    deleteLabel: `Remove ${firmName(o.firmId)} from ${roundName(o.roundId)}`,
  });
}

// "They said no": reason, keep in mind, wants updates.
export function passForm(host, o) {
  const firm = firms.get(o.firmId);
  openForm(host, {
    title: `${firmName(o.firmId)} passed`,
    intro: `On ${roundName(o.roundId)}. Tick “keep in mind” to see them again when you start the next round.`,
    values: { passReason: o.passReason || '', passNotes: o.passNotes || '', keepInMind: o.keepInMind ?? false, wantsUpdates: Boolean(firm?.wantsUpdates) },
    submitLabel: 'Mark as passed',
    fields: [
      { key: 'passReason', label: 'Reason', type: 'select', options: PASS_REASONS, wide: true },
      { key: 'passNotes', label: 'What they said', type: 'textarea', wide: true, placeholder: 'e.g. “Love the team, come back when you have 3 paying customers”' },
      { key: 'keepInMind', label: 'Keep in mind for the next round', type: 'checkbox', wide: true },
      { key: 'wantsUpdates', label: 'They want investor updates', type: 'checkbox', wide: true },
    ],
    onSubmit: ({ wantsUpdates, ...v }) => {
      setStage(o, 'passed', v);
      if (firm) saveRecord(firms, { ...firm, wantsUpdates });
    },
  });
}

// ---- Adding firms to a round -------------------------------------------------
export function addToRound(host, roundId, onNew) {
  const already = new Set(outreachFor({ roundId }).map((o) => o.firmId));
  const choices = firms.all().filter((f) => !already.has(f.id)).sort(byName);
  if (!choices.length) { onNew(); return; }
  openForm(host, {
    title: `Add an investor to ${roundName(roundId)}`,
    values: { firmId: choices[0].id, stage: 'to_contact' },
    submitLabel: 'Add',
    fields: [
      { key: 'firmId', label: 'Investor', type: 'select', options: choices.map((f) => [f.id, f.name]), wide: true },
      { key: 'stage', label: 'Stage', type: 'select', options: stageOptions },
      {
        type: 'custom',
        render: () => h('button', { type: 'button', class: 'link-btn', onclick: (e) => { e.target.closest('.inv-overlay').remove(); onNew(); } }, 'Or add a new investor…'),
      },
    ],
    onSubmit: (v) => {
      const firm = firms.get(v.firmId);
      addOutreach(v.firmId, roundId, { stage: v.stage, contactName: firm?.contacts?.[0]?.name ?? '' });
    },
  });
}

export function addFirmToRound(host, firm) {
  const taken = new Set(outreachFor({ firmId: firm.id }).map((o) => o.roundId));
  const choices = sortedRounds().filter((r) => !taken.has(r.id));
  if (!choices.length) { alert(rounds.all().length ? `${firm.name} is already in every round.` : 'Create a round first (Pipeline tab → New round).'); return; }
  openForm(host, {
    title: `Add ${firm.name} to a round`,
    values: { roundId: choices[0].id, stage: 'to_contact' },
    submitLabel: 'Add',
    fields: [
      { key: 'roundId', label: 'Round', type: 'select', options: choices.map((r) => [r.id, r.name]) },
      { key: 'stage', label: 'Stage', type: 'select', options: stageOptions },
    ],
    onSubmit: (v) => { addOutreach(firm.id, v.roundId, { stage: v.stage, contactName: firm.contacts?.[0]?.name ?? '' }); },
  });
}

// ---- Timeline ----------------------------------------------------------------
export function logForm(host, { firmId, roundId = '', outreachId = '' }) {
  const roundChoices = [['', 'Not tied to a round'], ...outreachFor({ firmId }).map((o) => [o.roundId, roundName(o.roundId)])];
  const kinds = Object.fromEntries(Object.entries(ACTIVITY_KINDS).filter(([k]) => k !== 'stage'));
  openForm(host, {
    title: `Log an update · ${firmName(firmId)}`,
    values: { kind: 'email', on: todayIso(), text: '', roundId, followUp: '' },
    submitLabel: 'Log it',
    fields: [
      { key: 'kind', label: 'What', type: 'select', options: kinds },
      { key: 'on', label: 'When', type: 'date' },
      { key: 'roundId', label: 'Round', type: 'select', options: roundChoices },
      { key: 'text', label: 'Details', type: 'textarea', wide: true, rows: 4, required: true },
      { key: 'followUp', label: 'Next follow-up (optional)', type: 'date', show: (v) => Boolean(v.roundId) },
    ],
    onSubmit: (v) => {
      if (v.kind === 'update') { markUpdateSent({ id: firmId }, v.on, v.text); } else {
        const o = outreachFor({ firmId, roundId: v.roundId })[0];
        logActivity({ firmId, roundId: v.roundId, outreachId: o?.id ?? outreachId, kind: v.kind, text: v.text, on: v.on });
      }
      if (v.followUp) {
        const o = outreachFor({ firmId, roundId: v.roundId })[0];
        if (o) saveRecord(outreach, { ...o, nextFollowUp: v.followUp });
      }
    },
  });
}

export const stageSelect = (o, onChange) => h('select', {
  class: 'input inv-stage-select',
  'aria-label': 'Stage',
  onclick: (e) => e.stopPropagation(),
  onchange: (e) => onChange(e.target.value),
}, ...Object.entries(STAGES).map(([k, s]) => h('option', { value: k, selected: k === o.stage }, s.label)));
