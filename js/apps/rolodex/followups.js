// Who to follow up with: overdue and due today first, then the next two weeks.
import { h } from '../../ui.js';
import { SNOOZES, UPCOMING_DAYS } from './config.js';
import { contacts, displayName, followUpList, logTouch, snooze, prettyDate } from './data.js';
import { dueText } from './contact.js';
import { safeUrl } from './widgets.js';

export function followUpsPage(ctx) {
  const list = followUpList();
  const now = list.filter((x) => x.days <= 0);
  const soon = list.filter((x) => x.days > 0 && x.days <= UPCOMING_DAYS);
  const none = contacts.all().length - list.length;

  const row = ({ contact: c, due, days }) => {
    const phone = c.phones?.[0]?.value;
    const email = c.emails?.[0]?.value;
    const hope = c.hopingForTags?.join(', ') || c.hopingFor;
    return h('li', { class: `rdx-follow${days < 0 ? ' over' : days === 0 ? ' today' : ''}` },
      h('div', { class: 'rdx-follow-main' },
        h('button', { class: 'rdx-name-link rdx-typed', onclick: () => ctx.openContact(c.id) }, displayName(c)),
        c.company ? h('span', { class: 'rdx-dim' }, c.company) : null,
        h('span', { class: 'rdx-follow-due' }, dueText(due)),
        hope ? h('span', { class: 'rdx-ink inline small' }, `Hoping for: ${hope}`) : null,
        c.lastContacted ? h('span', { class: 'rdx-dim small' }, `Last in touch ${prettyDate(c.lastContacted)}`) : null),
      h('div', { class: 'rdx-follow-actions' },
        phone ? h('a', { class: 'rdx-chip', href: safeUrl(`tel:${phone.replace(/[^\d+]/g, '')}`) }, '☎ Call') : null,
        email ? h('a', { class: 'rdx-chip', href: safeUrl(`mailto:${email}`) }, '✉ Email') : null,
        h('button', { class: 'rdx-chip on', onclick: () => { logTouch(c); ctx.toast(`Nice. ${displayName(c)} is up to date.`); } }, '✓ Done'),
        ...SNOOZES.map(([d, label]) => h('button', { class: 'rdx-chip', title: `Snooze ${label}`, onclick: () => snooze(c, d) }, `⏰ ${label}`))));
  };

  const group = (title, items, empty) => h('section', { class: 'rdx-follow-group' },
    h('h3', { class: 'rdx-typed' }, title, items.length ? h('span', { class: 'rdx-count' }, String(items.length)) : null),
    items.length ? h('ul', { class: 'rdx-follow-list' }, ...items.map(row)) : h('p', { class: 'rdx-blank' }, empty));

  return h('div', { class: 'rdx-pulled' },
    h('article', { class: 'rdx-bigcard' },
      h('span', { class: 'rdx-bigcard-slots', 'aria-hidden': 'true' }),
      h('header', { class: 'rdx-bigcard-head' },
        h('div', {}, h('h2', { class: 'rdx-typed' }, 'Follow-ups'), h('p', { class: 'rdx-typed sub' }, new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))),
        now.length ? h('span', { class: 'rdx-stamp' }, `${now.length} due`) : h('span', { class: 'rdx-stamp blue' }, 'All caught up')),
      group('Reach out now', now, 'Nobody is waiting on you. 🎉'),
      group(`Coming up (next ${UPCOMING_DAYS} days)`, soon, 'Nothing scheduled in the next two weeks.'),
      none > 0 ? h('p', { class: 'rdx-dim small' }, `${none} card${none === 1 ? ' has' : 's have'} no follow-up set. Open a card and pick a cadence (monthly, quarterly…) to keep in touch automatically.`) : null));
}
