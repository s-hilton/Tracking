// Updates: everyone who asked for investor updates (often firms that passed),
// when they last got one, and a quick way to email them all.
import { h } from '../../../ui.js';
import { UPDATE_EVERY_DAYS } from '../config.js';
import { updateList, updatesDue, markUpdateSent, saveRecord, firms, outreachFor, roundName, todayIso } from '../data.js';
import { ago, pill, section, empty, firmEmails, stagePill } from './common.js';

export function updates(ctx) {
  const view = h('div', { class: 'inv-view' });
  const list = updateList();
  const due = new Set(updatesDue().map((f) => f.id));
  const emails = [...new Set(list.flatMap(firmEmails))];
  const status = h('span', { class: 'muted small' });

  view.append(h('p', { class: 'muted small inv-hint' },
    `Investors who want to hear how things are going. Anyone not sent an update in ${UPDATE_EVERY_DAYS} days shows on your to-do note. Tick “Wants investor updates” on an investor (or when they pass) to add them here.`));

  if (!list.length) { view.append(empty('Nobody on the update list yet.')); return view; }

  view.append(h('div', { class: 'inv-toolbar' },
    h('button', {
      class: 'btn',
      disabled: !emails.length,
      onclick: async () => {
        try { await navigator.clipboard.writeText(emails.join(', ')); status.textContent = `Copied ${emails.length} address${emails.length === 1 ? '' : 'es'}.`; } catch { prompt('Copy these addresses:', emails.join(', ')); }
      },
    }, 'Copy all emails'),
    emails.length ? h('a', { class: 'btn', href: `mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent('Investor update')}` }, 'Email all (BCC)') : null,
    h('button', {
      class: 'btn primary',
      disabled: !due.size,
      onclick: () => { if (confirm(`Mark an update as sent today to ${due.size} investor${due.size === 1 ? '' : 's'}?`)) list.filter((f) => due.has(f.id)).forEach((f) => markUpdateSent(f)); },
    }, `Mark update sent to all due (${due.size})`),
    status));

  view.append(section(`Update list (${list.length})`, null, h('ul', { class: 'inv-rows' }, ...list.map((f) => {
    const latest = outreachFor({ firmId: f.id }).sort((a, b) => (b.stageEntered ?? 0) - (a.stageEntered ?? 0))[0];
    return h('li', { class: 'inv-row' },
      h('button', { class: 'inv-row-main', onclick: () => ctx.go('firm', { firmId: f.id, from: 'updates' }) },
        h('strong', {}, f.name),
        h('span', { class: 'muted small' }, [firmEmails(f).join(', ') || 'no email saved', latest ? roundName(latest.roundId) : ''].filter(Boolean).join(' · '))),
      h('div', { class: 'inv-row-meta' },
        latest ? stagePill(latest.stage) : null,
        due.has(f.id) ? pill(f.lastUpdateSent ? `Last sent ${ago(f.lastUpdateSent)}` : 'Never sent', 'warn') : pill(`Sent ${ago(f.lastUpdateSent)}`, 'good'),
        h('button', { class: 'btn small', disabled: f.lastUpdateSent === todayIso(), onclick: () => markUpdateSent(f) }, 'Sent today'),
        h('button', {
          class: 'btn ghost small', title: 'Take them off the update list',
          onclick: () => { if (confirm(`Stop sending updates to ${f.name}?`)) saveRecord(firms, { ...f, wantsUpdates: false }); },
        }, 'Remove')));
  }))));
  return view;
}
