// Add/edit screens for every record type in the LOIs app.
// Each function opens a form over `host` (the app's root element).
import { h } from '../../ui.js';
import { currentUser } from '../../cloud.js';
import { openForm } from './form.js';
import {
  PRODUCTS, STAGES, LOI_STATUSES, VALUE_BASIS, ACTIVITY_TYPES, DIRECTIONS, OUTCOMES, FOLLOW_UP_DEFAULTS,
  COMPANY_TYPES, LEAD_SOURCES, CONTACT_ROLES, CONTACT_STATUSES, PRIORITIES, TASK_STATUSES, USE_CASE_SOURCES, CURRENCY,
  COMPANY_USE_CASE_PRODUCTS,
} from './config.js';
import {
  companies, contacts, opportunities, activities, tasks, lois, saveRecord, deleteCompany, contactName, companyName, addDays,
  unallocated,
} from './data.js';

const labels = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? v : v.label]));
const productOptions = Object.fromEntries(Object.entries(PRODUCTS).map(([k, p]) => [k, p.label]));
const isWebLink = (v) => !v || /^https?:\/\//i.test(v.trim());
const by = () => currentUser()?.email ?? 'me';

const companyOptions = () => [['', 'Choose a company…'],
  ...companies.all().slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => [c.id, c.name])];
const contactOptions = (values) => contacts.all().filter((c) => c.companyId === values.companyId).map((c) => [c.id, contactName(c)]);
const opportunityOptions = (values) => opportunities.all().filter((o) => o.companyId === values.companyId)
  .map((o) => [o.id, `${o.name || PRODUCTS[o.product]?.short} · ${PRODUCTS[o.product]?.short ?? o.product}`]);

// A company picker, only shown when the form wasn't opened from a company page.
const companyField = (fixed) => (fixed ? [] : [{ key: 'companyId', label: 'Company', type: 'select', options: companyOptions, required: true, refresh: true, wide: true }]);

// ---- Company --------------------------------------------------------------------
export function editCompany(host, company, { onSaved, onDeleted } = {}) {
  openForm(host, {
    title: company ? `Edit ${company.name}` : 'New company',
    values: company ?? { type: '', leadSource: '', useCases: {} },
    submitLabel: company ? 'Save' : 'Add company',
    fields: [
      { key: 'name', label: 'Name', required: true, wide: true },
      { key: 'aliases', label: 'Aliases / legal name' },
      { key: 'website', label: 'Website', placeholder: 'example.com' },
      { key: 'type', label: 'Type', type: 'select', options: COMPANY_TYPES },
      { key: 'industry', label: 'Industry' },
      { key: 'headquarters', label: 'Headquarters' },
      { key: 'country', label: 'Country' },
      { key: 'email', label: 'General email', type: 'email' },
      { key: 'phone', label: 'Phone', type: 'tel' },
      { key: 'linkedin', label: 'LinkedIn' },
      { key: 'leadSource', label: 'Lead source', type: 'select', options: LEAD_SOURCES },
      { key: 'introducedBy', label: 'Introduced by' },
      { key: 'tags', label: 'Tags', placeholder: 'comma, separated', wide: true },
      { type: 'heading', label: 'Use cases' },
      ...COMPANY_USE_CASE_PRODUCTS.map((key) => ({ key: `useCases.${key}`, label: PRODUCTS[key].label, type: 'multi', options: PRODUCTS[key].useCases, wide: true })),
      { type: 'heading', label: 'Notes' },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
      { key: 'doNotContact', label: 'Do not contact (excluded from follow-up reminders)', type: 'checkbox', wide: true },
    ],
    onSubmit: (v) => {
      const duplicate = companies.all().find((c) => c.id !== company?.id && c.name.trim().toLowerCase() === v.name.trim().toLowerCase());
      if (duplicate) return `"${duplicate.name}" already exists. Open it instead of creating a duplicate.`;
      const saved = saveRecord(companies, { ...v, name: v.name.trim() });
      onSaved?.(saved);
    },
    onDelete: company ? () => { deleteCompany(company.id); onDeleted?.(); } : null,
    deleteLabel: 'Delete company and everything linked to it',
  });
}

// ---- Contact --------------------------------------------------------------------
export function editContact(host, contact, { companyId } = {}) {
  openForm(host, {
    title: contact ? `Edit ${contactName(contact)}` : 'New contact',
    values: contact ?? { companyId, status: 'active', role: '' },
    submitLabel: contact ? 'Save' : 'Add contact',
    fields: [
      ...companyField(companyId || contact),
      { key: 'firstName', label: 'First name', required: true },
      { key: 'lastName', label: 'Last name' },
      { key: 'title', label: 'Title' },
      { key: 'department', label: 'Department' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'phone', label: 'Phone', type: 'tel' },
      { key: 'linkedin', label: 'LinkedIn' },
      { key: 'role', label: 'Relationship', type: 'select', options: CONTACT_ROLES },
      { key: 'status', label: 'Status', type: 'select', options: CONTACT_STATUSES },
      { key: 'preferredChannel', label: 'Preferred channel' },
      { key: 'timezone', label: 'Time zone' },
      { key: 'introducedBy', label: 'How discovered / introduced by' },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
    onSubmit: (v) => { saveRecord(contacts, v); },
    onDelete: contact ? () => contacts.remove(contact.id) : null,
    deleteLabel: 'Delete contact',
  });
}

// ---- Opportunity ----------------------------------------------------------------
export function editOpportunity(host, opp, { companyId, product } = {}) {
  const previousStage = opp?.stage;
  const productFields = Object.entries(PRODUCTS).flatMap(([key, p]) => [
    { type: 'heading', label: `${p.short} details`, show: (v) => v.product === key },
    ...p.fields.map((f) => ({ ...f, key: `details.${f.key}`, show: (v) => v.product === key })),
  ]);
  const useCaseOptions = (v) => PRODUCTS[v.product]?.useCases ?? {};
  // A new opportunity starts with the use cases already tagged on its company for that product.
  const companyTags = (v) => [...(companies.get(v.companyId)?.useCases?.[v.product] ?? [])];
  const initialProduct = product && product !== 'all' ? product : 'comms';

  openForm(host, {
    title: opp ? `Edit opportunity` : 'New opportunity',
    values: opp ?? { companyId, product: initialProduct, stage: 'identified', priority: 'normal', useCases: companyTags({ companyId, product: initialProduct }), contactIds: [], details: {}, valueBasis: 'total', useCaseSource: '' },
    submitLabel: opp ? 'Save' : 'Add opportunity',
    fields: [
      ...companyField(companyId || opp),
      { key: 'product', label: 'Product', type: 'select', options: productOptions, refresh: true, wide: true, onChange: (v) => { if (!opp) v.useCases = companyTags(v); } },
      { key: 'name', label: 'Opportunity name', placeholder: 'e.g. Lunar relay 2028 mission', wide: true },
      { key: 'stage', label: 'Stage', type: 'select', options: labels(STAGES), refresh: true },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES },
      { key: 'lossReason', label: 'Loss reason', show: (v) => v.stage === 'lost' },
      { key: 'primaryUseCase', label: 'Primary use case', type: 'select', options: (v) => ({ '': '—', ...useCaseOptions(v) }), wide: true },
      { key: 'useCases', label: 'All relevant use cases', type: 'multi', options: useCaseOptions, wide: true },
      { key: 'useCaseSource', label: 'Use-case source', type: 'select', options: USE_CASE_SOURCES },
      { key: 'probability', label: 'Probability (%)', type: 'number', min: 0 },
      { key: 'fitRationale', label: 'Fit rationale', type: 'textarea', wide: true, rows: 2 },
      { key: 'contactIds', label: 'Contacts', type: 'multi', options: contactOptions, wide: true, empty: 'Add contacts to the company first' },
      { key: 'estimatedValue', label: `Estimated LOI value (${CURRENCY})`, type: 'number', min: 0, help: 'Leave blank if unknown (not $0)' },
      { key: 'valueBasis', label: 'Value basis', type: 'select', options: VALUE_BASIS },
      { key: 'expectedSigning', label: 'Expected signing date', type: 'date' },
      { key: 'nextStep', label: 'Next step' },
      { key: 'risks', label: 'Risks / blockers', type: 'textarea', wide: true, rows: 2 },
      ...productFields,
      { type: 'heading', label: 'Notes' },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
      ...(opp?.stageHistory?.length ? [{
        type: 'custom',
        label: 'Stage history',
        render: () => h('ol', { class: 'bd-history' }, ...opp.stageHistory.slice().reverse().map((e) => h('li', {},
          `${STAGES[e.from]?.label ?? 'New'} → ${STAGES[e.to]?.label ?? e.to}`,
          h('span', { class: 'muted small' }, ` · ${new Date(e.at).toLocaleString()} · ${e.by}`)))),
      }] : []),
    ],
    onSubmit: (v) => {
      const allowed = useCaseOptions(v);
      const record = {
        ...v,
        useCases: (v.useCases ?? []).filter((u) => u in allowed),
        primaryUseCase: v.primaryUseCase in allowed ? v.primaryUseCase : '',
        lossReason: v.stage === 'lost' ? v.lossReason : '',
      };
      if (record.stage !== previousStage) {
        record.stageEntered = Date.now();
        record.stageHistory = [...(opp?.stageHistory ?? []), { from: previousStage ?? null, to: record.stage, at: Date.now(), by: by() }];
      }
      saveRecord(opportunities, record);
    },
    onDelete: opp ? () => opportunities.remove(opp.id) : null,
    deleteLabel: 'Delete opportunity',
  });
}

// Moves an opportunity to a new stage (Kanban drag), recording the change.
export function moveStage(opp, stage) {
  if (opp.stage === stage) return;
  saveRecord(opportunities, {
    ...opp,
    stage,
    stageEntered: Date.now(),
    stageHistory: [...(opp.stageHistory ?? []), { from: opp.stage, to: stage, at: Date.now(), by: by() }],
  });
}

// ---- Activity -------------------------------------------------------------------
const suggestedFollowUp = (type) => {
  const [days, business] = FOLLOW_UP_DEFAULTS[type] ?? FOLLOW_UP_DEFAULTS.default;
  return addDays(days, business);
};

export function logActivity(host, activity, { companyId, opportunityId } = {}) {
  openForm(host, {
    title: activity ? 'Edit activity' : 'Log activity',
    values: activity ?? {
      companyId,
      occurredAt: Date.now(),
      type: 'follow_up_email',
      direction: 'outbound',
      outcome: '',
      contactIds: [],
      opportunityIds: opportunityId ? [opportunityId] : [],
      followUp: true,
      followUpOn: suggestedFollowUp('follow_up_email'),
    },
    submitLabel: activity ? 'Save' : 'Log activity',
    fields: [
      ...companyField(companyId || activity),
      { key: 'occurredAt', label: 'When', type: 'datetime', required: true },
      {
        key: 'type', label: 'Type', type: 'select', options: ACTIVITY_TYPES,
        onChange: (v) => { v.followUpOn = suggestedFollowUp(v.type); v.direction = v.type === 'received_email' || v.type === 'loi_received' ? 'inbound' : v.type === 'internal_meeting' || v.type === 'note' ? 'internal' : 'outbound'; },
        refresh: true,
      },
      { key: 'direction', label: 'Direction', type: 'select', options: DIRECTIONS },
      { key: 'outcome', label: 'Outcome', type: 'select', options: OUTCOMES },
      { key: 'subject', label: 'Subject', wide: true },
      { key: 'summary', label: 'Summary / notes', type: 'textarea', wide: true, rows: 4 },
      { key: 'contactIds', label: 'People involved', type: 'multi', options: contactOptions, wide: true, empty: 'No contacts on this company yet' },
      { key: 'opportunityIds', label: 'Related opportunities', type: 'multi', options: opportunityOptions, wide: true, empty: 'No opportunities on this company yet' },
      { key: 'link', label: 'Link to email thread / recording / document', type: 'url', wide: true, placeholder: 'https://…' },
      ...(activity ? [] : [
        { key: 'followUp', label: 'Create a follow-up task', type: 'checkbox', refresh: true },
        { key: 'followUpOn', label: 'Follow up on', type: 'date', show: (v) => v.followUp },
        { key: 'followUpTitle', label: 'Follow-up', placeholder: 'e.g. Chase reply', show: (v) => v.followUp },
      ]),
    ],
    onSubmit: (v) => {
      if (!isWebLink(v.link)) return 'The link must start with http:// or https://';
      const { followUp, followUpOn, followUpTitle, ...record } = v;
      saveRecord(activities, record);
      if (followUp && followUpOn) {
        saveRecord(tasks, {
          companyId: v.companyId,
          opportunityId: v.opportunityIds?.[0] ?? '',
          title: followUpTitle?.trim() || `Follow up: ${v.subject || ACTIVITY_TYPES[v.type]}`,
          dueOn: followUpOn,
          priority: 'normal',
          status: 'not_started',
        });
      }
    },
    onDelete: activity ? () => activities.remove(activity.id) : null,
    deleteLabel: 'Delete activity',
  });
}

// ---- Task -----------------------------------------------------------------------
export function editTask(host, task, { companyId } = {}) {
  openForm(host, {
    title: task ? 'Edit follow-up' : 'New follow-up',
    values: task ?? { companyId, status: 'not_started', priority: 'normal', dueOn: addDays(1) },
    submitLabel: task ? 'Save' : 'Add follow-up',
    fields: [
      ...companyField(companyId || task),
      { key: 'title', label: 'What to do', required: true, wide: true },
      { key: 'dueOn', label: 'Due', type: 'date' },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES },
      { key: 'status', label: 'Status', type: 'select', options: TASK_STATUSES },
      { key: 'opportunityId', label: 'Opportunity', type: 'select', options: (v) => [['', '—'], ...opportunityOptions(v)] },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
    onSubmit: (v) => {
      const done = v.status === 'completed';
      saveRecord(tasks, { ...v, completedAt: done ? (task?.completedAt ?? Date.now()) : null });
    },
    onDelete: task ? () => tasks.remove(task.id) : null,
    deleteLabel: 'Delete follow-up',
  });
}

export function completeTask(task) {
  saveRecord(tasks, { ...task, status: 'completed', completedAt: Date.now() });
}

export function reopenTask(task) {
  saveRecord(tasks, { ...task, status: 'not_started', completedAt: null });
}

export function snoozeTask(task, days) {
  saveRecord(tasks, { ...task, dueOn: addDays(days) });
}

// ---- LOI ------------------------------------------------------------------------
function allocationEditor(values) {
  const rows = h('div', { class: 'bd-allocations' });
  const remainder = h('p', { class: 'small' });
  const showRemainder = () => {
    const left = unallocated({ amount: values.amount ?? null, allocations: values.allocations });
    remainder.className = `small ${left != null && left < 0 ? 'error' : 'muted'}`;
    remainder.textContent = values.amount == null
      ? 'Unpriced LOI: allocations are optional.'
      : left < 0 ? `Allocations exceed the LOI value by ${Math.abs(left).toLocaleString()}.`
        : `Unallocated: ${left.toLocaleString()} ${CURRENCY} (counted in the combined total only).`;
  };
  const draw = () => {
    values.allocations = values.allocations ?? [];
    rows.replaceChildren(...values.allocations.map((a, i) => h('div', { class: 'bd-allocation' },
      h('select', { class: 'input', onchange: (e) => { a.product = e.target.value; } },
        ...Object.entries(PRODUCTS).map(([k, p]) => h('option', { value: k, selected: k === a.product }, p.short))),
      h('input', {
        class: 'input', type: 'number', min: '0', step: 'any', value: a.amount ?? '', placeholder: 'Amount',
        oninput: (e) => { a.amount = e.target.value === '' ? null : Number(e.target.value); showRemainder(); },
      }),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove allocation', onclick: () => { values.allocations.splice(i, 1); draw(); } }, '✕'))),
    h('button', { type: 'button', class: 'btn ghost', onclick: () => { values.allocations.push({ product: 'comms', amount: null }); draw(); } }, '+ Allocate to a product'));
    showRemainder();
  };
  draw();
  // Keep the "unallocated" line current while the LOI value is being typed.
  queueMicrotask(() => rows.closest('form')?.addEventListener('input', showRemainder));
  return h('div', {}, rows, remainder);
}

export function editLoi(host, loi, { companyId } = {}) {
  const previousStatus = loi?.status;
  openForm(host, {
    title: loi ? 'Edit LOI' : 'New LOI',
    values: loi ?? { companyId, status: 'draft', currency: CURRENCY, valueBasis: 'total', allocations: [], opportunityIds: [], binding: 'non_binding' },
    submitLabel: loi ? 'Save' : 'Add LOI',
    fields: [
      ...companyField(companyId || loi),
      { key: 'title', label: 'Title', placeholder: 'e.g. Lunar relay services LOI', wide: true },
      { key: 'status', label: 'Status', type: 'select', options: labels(LOI_STATUSES) },
      { key: 'binding', label: 'Binding character', type: 'select', options: { non_binding: 'Non-binding', partially_binding: 'Partially binding', binding: 'Binding' } },
      { key: 'amount', label: `Stated value (${CURRENCY})`, type: 'number', min: 0, help: 'Leave blank if unpriced (unknown is not $0)' },
      { key: 'valueBasis', label: 'Value basis', type: 'select', options: VALUE_BASIS },
      { type: 'custom', label: 'Product allocation', render: (v) => allocationEditor(v) },
      { key: 'opportunityIds', label: 'Linked opportunities', type: 'multi', options: opportunityOptions, wide: true, empty: 'No opportunities on this company yet' },
      { key: 'sentOn', label: 'Sent', type: 'date' },
      { key: 'signedOn', label: 'Signed', type: 'date' },
      { key: 'effectiveOn', label: 'Effective', type: 'date' },
      { key: 'expiresOn', label: 'Expires', type: 'date' },
      { key: 'signatories', label: 'Signatories', wide: true },
      { key: 'draftUrl', label: 'Draft link', type: 'url', placeholder: 'https://…', wide: true },
      { key: 'docUrl', label: 'Signed document link', type: 'url', placeholder: 'https://…', wide: true },
      { key: 'supersedesId', label: 'Replaces an earlier version', type: 'select', options: (v) => [['', '—'], ...lois.all().filter((l) => l.companyId === v.companyId && l.id !== loi?.id).map((l) => [l.id, l.title || `${companyName(l.companyId)} LOI`])], help: 'The earlier version is marked Superseded and stops counting toward totals' },
      { key: 'legalNotes', label: 'Exclusivity, confidentiality, conditions, termination', type: 'textarea', wide: true, rows: 2 },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
      ...(loi?.statusHistory?.length ? [{
        type: 'custom',
        label: 'Status and value history',
        render: () => h('ol', { class: 'bd-history' }, ...loi.statusHistory.slice().reverse().map((e) => h('li', {},
          e.note, h('span', { class: 'muted small' }, ` · ${new Date(e.at).toLocaleString()} · ${e.by}`)))),
      }] : []),
    ],
    onSubmit: (v) => {
      if (!isWebLink(v.draftUrl) || !isWebLink(v.docUrl)) return 'Document links must start with http:// or https://';
      const allocations = (v.allocations ?? []).filter((a) => a.amount != null && a.amount !== '');
      const left = unallocated({ amount: v.amount ?? null, allocations });
      if (left != null && left < 0) return 'Product allocations add up to more than the LOI value.';
      const history = [...(loi?.statusHistory ?? [])];
      if (v.status !== previousStatus) history.push({ note: `Status: ${LOI_STATUSES[previousStatus]?.label ?? 'New'} → ${LOI_STATUSES[v.status].label}`, at: Date.now(), by: by() });
      if (loi && (loi.amount ?? null) !== (v.amount ?? null)) history.push({ note: `Value: ${loi.amount ?? 'unpriced'} → ${v.amount ?? 'unpriced'}`, at: Date.now(), by: by() });
      saveRecord(lois, { ...v, allocations, statusHistory: history });
      // A new version retires the one it replaces, so they never both count.
      const older = v.supersedesId && lois.get(v.supersedesId);
      if (older && older.status !== 'superseded') {
        saveRecord(lois, { ...older, status: 'superseded', statusHistory: [...(older.statusHistory ?? []), { note: 'Status: superseded by a newer version', at: Date.now(), by: by() }] });
      }
    },
    onDelete: loi ? () => lois.remove(loi.id) : null,
    deleteLabel: 'Delete LOI',
  });
}
