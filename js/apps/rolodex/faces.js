// What's typed on each kind of card in the drum.
import { h } from '../../ui.js';
import { fileName, nextFollowUp, todayIso } from './data.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#';

// Divider tabs step across the top of the card like a real A–Z set.
const tabSlot = (letter) => (Math.max(0, LETTERS.indexOf(letter)) % 6);

const line = (content, cls = '') => (content ? h('div', { class: `rc-line ${cls}` }, content) : null);

export function personFace({ contact: c }) {
  const due = nextFollowUp(c);
  const met = [c.whereMetTags?.join(', '), c.whereMet].filter(Boolean).join(': ');
  return h('div', { class: 'rc' },
    h('div', { class: 'rc-head' },
      h('span', { class: 'rc-name' }, fileName(c)),
      due && due <= todayIso() ? h('span', { class: 'rc-stamp' }, 'Follow up') : null),
    h('div', { class: 'rc-lines' },
      line([c.title, c.company].filter(Boolean).join(', ')),
      line(c.phones?.[0]?.value ? `☎ ${c.phones[0].value}` : ''),
      line(c.emails?.[0]?.value ? `✉ ${c.emails[0].value}` : ''),
      line(met, 'hand'),
      line(c.similarities, 'hand')));
}

export function dividerFace({ letter }) {
  return h('div', { class: 'rc rc-divider', style: `--slot:${tabSlot(letter)}` },
    h('span', { class: 'rc-tab' }, letter),
    h('span', { class: 'rc-divider-letter', 'aria-hidden': 'true' }, letter));
}

export function blankFace({ hint }) {
  return h('div', { class: 'rc' }, h('div', { class: 'rc-head' }, h('span', { class: 'rc-name' }, hint ?? '')), h('div', { class: 'rc-lines' }));
}

// A plain back, with the faint mill watermark real cards have.
export const backFace = () => h('span', { class: 'rc-back-mark' }, '№ 2254');

export { LETTERS };
