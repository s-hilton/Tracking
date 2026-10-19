// Follow-ups: tasks grouped into overdue, today, this week, later and done.
import { h } from '../../../ui.js';
import { PRIORITIES } from '../config.js';
import { tasks, companyName, todayIso, addDays, opportunities } from '../data.js';
import { editTask, completeTask, snoozeTask } from '../editors.js';
import { section, empty, button, pill, fmtDate } from './common.js';

export function followUps(ctx) {
  const { host, product } = ctx;
  const today = todayIso();
  const weekEnd = addDays(7);
  const inProduct = (t) => product === 'all' || !t.opportunityId || opportunities.get(t.opportunityId)?.product === product;
  const all = tasks.all().filter(inProduct);
  const open = all.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
  const sortDue = (a, b) => (a.dueOn || '9999').localeCompare(b.dueOn || '9999');

  const row = (t) => h('li', { class: 'bd-row' },
    h('input', { type: 'checkbox', checked: t.status === 'completed', 'aria-label': `Complete ${t.title}`, onchange: () => completeTask(t), disabled: t.status === 'completed' }),
    h('button', { class: 'bd-row-main', onclick: () => editTask(host, t) },
      h('strong', {}, t.title),
      h('span', { class: 'muted small' }, [companyName(t.companyId), t.dueOn ? `due ${fmtDate(t.dueOn)}` : 'no due date'].join(' · '))),
    h('div', { class: 'bd-row-meta' },
      t.priority === 'high' ? pill(PRIORITIES.high, 'bad') : null,
      t.status !== 'completed' ? h('select', {
        class: 'input bd-snooze',
        'aria-label': 'Snooze',
        onchange: (e) => { if (e.target.value) snoozeTask(t, Number(e.target.value)); },
      }, h('option', { value: '' }, 'Snooze…'), h('option', { value: '1' }, 'Tomorrow'), h('option', { value: '3' }, '3 days'), h('option', { value: '7' }, '1 week')) : null,
      h('button', { class: 'link-btn', onclick: () => ctx.go('company', { companyId: t.companyId }) }, 'Company')));

  const group = (title, items, tone) => (items.length
    ? section(`${title} (${items.length})`, null, h('ul', { class: `bd-rows${tone ? ` ${tone}` : ''}` }, ...items.map(row)))
    : null);

  const overdue = open.filter((t) => t.dueOn && t.dueOn < today).sort(sortDue);
  const dueToday = open.filter((t) => t.dueOn === today);
  const week = open.filter((t) => t.dueOn > today && t.dueOn <= weekEnd).sort(sortDue);
  const later = open.filter((t) => !t.dueOn || t.dueOn > weekEnd).sort(sortDue);
  const done = all.filter((t) => t.status === 'completed').sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)).slice(0, 15);

  return h('div', { class: 'bd-view' },
    h('div', { class: 'bd-toolbar' }, h('span', { class: 'spacer' }), button('+ Follow-up', () => editTask(host, null), 'btn primary')),
    open.length ? null : empty('No open follow-ups. Log an activity to schedule the next one.'),
    group('Overdue', overdue, 'overdue'),
    group('Today', dueToday),
    group('Next 7 days', week),
    group('Later / no date', later),
    group('Recently completed', done));
}
