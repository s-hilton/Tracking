// One person's card, pulled out of the file: everything you know about them,
// their follow-up, and the people they're connected to.
import { h } from '../../ui.js';
import { RELATIONS, CLOSENESS, ME } from './config.js';
import { contacts, displayName, linksOf, nextFollowUp, logTouch, setCadence, prettyDate, todayIso, addDays, daysBetween } from './data.js';
import { safeUrl, cadenceSelect } from './widgets.js';
import { createWeb } from './web.js';

const QUICK_FOLLOW = [[1, 'Tomorrow'], [7, '1 week'], [30, '1 month'], [90, '3 months']];

export function dueText(due) {
  if (!due) return '';
  const days = daysBetween(todayIso(), due);
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `in ${days} days · ${prettyDate(due)}`;
}

const link = (href, text) => {
  const url = safeUrl(href);
  return url ? h('a', { href: url, target: url.startsWith('http') ? '_blank' : null, rel: 'noopener noreferrer' }, text) : h('span', {}, text);
};

const blank = (text) => h('p', { class: 'rdx-blank' }, text);
const ink = (text) => h('p', { class: 'rdx-ink' }, text);
const tags = (list) => (list?.length ? h('div', { class: 'rdx-tags' }, ...list.map((t) => h('span', { class: 'rdx-tag' }, t))) : null);
// A section of the card; `onEdit` adds a pencil that opens the form at that part.
const block = (title, onEdit, ...content) => h('section', { class: 'rdx-block' },
  h('h3', {}, title, onEdit ? h('button', { type: 'button', class: 'rdx-edit', 'aria-label': `Edit ${title.toLowerCase()}`, title: `Edit ${title.toLowerCase()}`, onclick: onEdit }, '✎ Edit') : null),
  ...content.filter(Boolean));

export function contactPage(ctx, id) {
  const c = contacts.get(id);
  if (!c) return h('div', { class: 'rdx-pulled' }, h('p', {}, 'This card is no longer in the file.'), h('button', { class: 'rdx-btn', onclick: () => ctx.go('cards') }, 'Back to the file'));
  const due = nextFollowUp(c);
  const { edges, introducedBy, introduced } = linksOf(c.id);
  const nameOf = (pid) => (pid === ME ? 'You' : displayName(contacts.get(pid)));
  const person = (pid) => (contacts.get(pid) ? h('button', { class: 'rdx-name-link', onclick: () => ctx.openContact(pid) }, displayName(contacts.get(pid))) : h('span', {}, nameOf(pid)));
  const overdue = due && due <= todayIso();
  const editAt = (section) => () => ctx.edit(c.id, { focus: section });

  const reach = [
    ...(c.phones ?? []).map((p) => h('li', {}, h('span', { class: 'rdx-k' }, p.label || 'Phone'), link(`tel:${p.value.replace(/[^\d+]/g, '')}`, p.value))),
    ...(c.emails ?? []).map((e) => h('li', {}, h('span', { class: 'rdx-k' }, e.label || 'Email'), link(`mailto:${e.value}`, e.value))),
    c.linkedin ? h('li', {}, h('span', { class: 'rdx-k' }, 'LinkedIn'), link(c.linkedin, c.linkedin.replace(/^https?:\/\/(www\.)?/, ''))) : null,
    ...(c.urls ?? []).map((u) => h('li', {}, h('span', { class: 'rdx-k' }, u.label || 'Link'), link(u.value, u.value.replace(/^https?:\/\/(www\.)?/, '')))),
    c.location ? h('li', {}, h('span', { class: 'rdx-k' }, 'Lives in'), h('span', {}, c.location)) : null,
    c.birthday ? h('li', {}, h('span', { class: 'rdx-k' }, 'Birthday'), h('span', {}, c.birthday)) : null,
  ].filter(Boolean);

  const setFollow = (iso) => contacts.upsert({ ...contacts.get(c.id), followUpOn: iso, updated: Date.now() });
  const dateInput = h('input', { type: 'date', class: 'rdx-input small', value: c.followUpOn || '', 'aria-label': 'Follow-up date', onchange: (e) => setFollow(e.target.value) });

  const web = edges.length || introducedBy || introduced.length ? createWeb({ focus: c.id, compact: true, onOpen: (pid) => ctx.openContact(pid) }) : null;
  if (web) ctx.onLeave(web.destroy);

  return h('div', { class: 'rdx-pulled' },
    h('article', { class: 'rdx-bigcard' },
      h('span', { class: 'rdx-bigcard-slots', 'aria-hidden': 'true' }),
      h('header', { class: 'rdx-bigcard-head' },
        h('div', {},
          h('h2', { class: 'rdx-typed' }, displayName(c), c.nickname ? h('span', { class: 'rdx-dim' }, ` “${c.nickname}”`) : null),
          c.title || c.company ? h('p', { class: 'rdx-typed sub' }, [c.title, c.company].filter(Boolean).join(' · ')) : null,
          h('button', { type: 'button', class: 'rdx-edit', onclick: editAt('Name & work') }, '✎ Edit name & work')),
        c.closeness ? h('span', { class: 'rdx-stamp blue' }, CLOSENESS[c.closeness] ?? c.closeness) : null,
        overdue ? h('span', { class: 'rdx-stamp' }, 'Follow up') : null),
      h('div', { class: 'rdx-actions' },
        h('button', { class: 'rdx-btn', onclick: () => ctx.edit(c.id) }, '✎ Edit card'),
        h('button', { class: 'rdx-btn', onclick: () => { logTouch(c); ctx.toast(`Noted: you reached out to ${displayName(c)} today.`); } }, '✓ I reached out'),
        h('button', { class: 'rdx-btn', onclick: () => ctx.connect(c.id) }, '＋ Who they know')),

      h('div', { class: 'rdx-columns' },
        block('Reach', editAt('Reaching them'), reach.length ? h('ul', { class: 'rdx-list' }, ...reach) : blank('No phone or email yet.')),
        block('Follow-up', editAt('Follow-up'),
          h('p', { class: overdue ? 'rdx-due over' : 'rdx-due' }, due ? `Next: ${dueText(due)}` : 'No follow-up planned.'),
          h('label', { class: 'rdx-row small' }, 'Remind me', cadenceSelect(c, (days) => setCadence(contacts.get(c.id), days))),
          c.lastContacted ? h('p', { class: 'rdx-dim small' }, `Last reached out ${prettyDate(c.lastContacted)}`) : null,
          h('p', { class: 'rdx-dim small' }, 'Or a one-off date:'),
          h('div', { class: 'rdx-chips' },
            ...QUICK_FOLLOW.map(([d, label]) => h('button', { type: 'button', class: 'rdx-chip', onclick: () => setFollow(addDays(todayIso(), d)) }, label)),
            dateInput,
            c.followUpOn ? h('button', { type: 'button', class: 'rdx-chip', onclick: () => setFollow('') }, 'Clear') : null)),

        block('How we met', editAt('How we met'),
          tags(c.whereMetTags),
          c.whereMet ? ink(c.whereMet) : null,
          c.metOn ? h('p', { class: 'rdx-dim small' }, `Met ${prettyDate(c.metOn)}`) : null,
          introducedBy ? h('p', {}, 'Introduced by ', person(introducedBy.id), c.introNote ? h('span', { class: 'rdx-ink inline' }, ` (${c.introNote})`) : null) : null,
          !c.whereMetTags?.length && !c.whereMet && !introducedBy ? blank('Where did you meet? Tap Edit to add the story.') : null),
        block('Common ground', editAt('Common ground'), c.similarities ? ink(c.similarities) : blank('What do you have in common?')),
        block('What I’m hoping for', editAt('What I’m hoping for'), tags(c.hopingForTags), c.hopingFor ? ink(c.hopingFor) : null,
          !c.hopingForTags?.length && !c.hopingFor ? blank('What would you like from this relationship?') : null),
        block('Relationship', editAt('Relationship'),
          c.closeness ? h('p', { class: 'rdx-typed' }, CLOSENESS[c.closeness] ?? c.closeness) : null,
          c.tags ? tags(c.tags.split(',').map((t) => t.trim()).filter(Boolean)) : null,
          !c.closeness && !c.tags ? blank('How close are you? Any tags?') : null),
        block('Extra info', editAt('Extra info'), c.extraInfo ? ink(c.extraInfo) : blank('Anything else worth remembering.'))),

      h('section', { class: 'rdx-block rdx-connections' },
        h('h3', {}, 'Connections'),
        edges.length || introduced.length || introducedBy ? h('ul', { class: 'rdx-conn-list' },
          introducedBy ? h('li', {}, h('span', { class: 'rdx-rel intro' }, 'Introduced me'), person(introducedBy.id)) : null,
          ...introduced.map((p) => h('li', {}, h('span', { class: 'rdx-rel intro' }, 'Introduced me to'), person(p.id))),
          ...edges.map(({ edge, other }) => h('li', {},
            h('span', { class: 'rdx-rel', style: `--chip:${RELATIONS[edge.kind]?.color ?? RELATIONS.unknown.color}` }, RELATIONS[edge.kind]?.label ?? 'Unknown'),
            person(other),
            edge.note ? h('span', { class: 'rdx-ink inline' }, edge.note) : null,
            edge.introducedBy ? h('span', { class: 'rdx-dim small' }, `introduced by ${nameOf(edge.introducedBy)}`) : null,
            h('button', { class: 'rdx-x small', 'aria-label': 'Edit connection', title: 'Edit connection', onclick: () => ctx.connect(c.id, { edgeId: edge.id }) }, '✎'))))
          : blank('No connections yet. When you learn who they know, add it here.'),
        h('button', { class: 'rdx-link', onclick: () => ctx.connect(c.id) }, '＋ Add someone they know'),
        web ? web.el : null)));
}
