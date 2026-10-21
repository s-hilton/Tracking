// The rotary card file: cards hang on an axle and flip over the top as it turns.
// Only the cards near the open one are in the page, so a drum of a thousand
// cards turns as smoothly as one of ten.
//
//   const drum = createDrum({ face: (item) => el, onOpen: (item) => …, onTurn: (index) => … });
//   drum.setItems([...]);  drum.goTo(12);  drum.spin(40, { duration: 2600 });
import { h } from '../../ui.js';

const FRONT = 4;   // cards rendered in front of the open one (fallen towards you)
const BEHIND = 14; // and behind it (leaning back)
const DRAG_PX = 42; // drag distance that turns one card

// Where a card sits on the drum, by how far it is from the open card.
// The open card stands upright; the ones behind lean back in a fan, and the
// one you just turned past flops forward to hang down into the base.
function angle(d) {
  if (d >= 0) return d <= 1 ? d * 16 : Math.min(16 + (d - 1) * 6, 100);
  return d >= -1 ? d * 150 : Math.max(-150 - (-d - 1) * 8, -176);
}

const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function createDrum({ face, back, onOpen, onTurn, interactive = true, label = 'Cards' }) {
  let items = [];
  let pos = 0;
  let lastIndex = -1;
  let anim = null;
  let frame = 0;
  let enabled = interactive;
  const nodes = new Map(); // index -> element

  const wheel = h('div', { class: 'rdx-wheel' });
  const knob = (side, step) => h('button', {
    class: `rdx-knob ${side}`,
    'aria-label': step < 0 ? 'Previous card' : 'Next card',
    tabIndex: -1,
    onclick: () => enabled && goTo(Math.round(target()) + step),
  });
  const stage = h('div', { class: 'rdx-stage', tabIndex: 0, role: 'group', 'aria-roledescription': 'card file', 'aria-label': label }, wheel);
  // The base sits in front of the cards hanging below the axle, as on the real thing.
  const el = h('div', { class: 'rdx-device' },
    stage,
    h('div', { class: 'rdx-base', 'aria-hidden': 'true' }),
    h('div', { class: 'rdx-rod', 'aria-hidden': 'true' }),
    knob('left', -1),
    knob('right', 1));

  const clampIndex = (i) => Math.max(0, Math.min(items.length - 1, i));
  const target = () => anim?.to ?? pos;

  function cardNode(i) {
    const item = items[i];
    const node = h('div', { class: `rdx-card${item.kind ? ` ${item.kind}` : ''}`, 'data-index': i },
      h('div', { class: 'rdx-face' }, face(item, i)),
      h('div', { class: 'rdx-back', 'aria-hidden': 'true' }, back?.(item, i) ?? null));
    wheel.append(node);
    return node;
  }

  function layout() {
    const base = Math.round(pos);
    const lo = Math.max(0, Math.floor(pos) - FRONT);
    const hi = Math.min(items.length - 1, Math.ceil(pos) + BEHIND);
    for (const [i, node] of nodes) if (i < lo || i > hi) { node.remove(); nodes.delete(i); }
    for (let i = lo; i <= hi; i++) {
      const node = nodes.get(i) ?? nodes.set(i, cardNode(i)).get(i);
      const d = i - pos;
      const a = angle(d);
      node.style.transform = `translateX(-50%) rotateX(${a.toFixed(2)}deg)`;
      // Light comes from above and in front: cards leaning away get darker.
      node.style.setProperty('--shade', (Math.min(Math.abs(a), 90) / 90).toFixed(3));
      node.classList.toggle('open', i === base);
      node.inert = i !== base;
    }
    el.style.setProperty('--spin', `${(pos * 28).toFixed(1)}deg`);
    if (base !== lastIndex && items.length) {
      lastIndex = base;
      onTurn?.(base, items[base]);
    }
  }

  function tick(now) {
    frame = 0;
    if (anim) {
      const t = anim.duration ? Math.min(1, (now - anim.start) / anim.duration) : 1;
      pos = anim.from + (anim.to - anim.from) * anim.ease(t);
      if (t >= 1) { pos = anim.to; const done = anim.done; anim = null; done(); }
    }
    layout();
    if (anim) frame = requestAnimationFrame(tick);
  }

  function animate(to, duration, ease = easeOut) {
    if (anim) anim.done();
    return new Promise((done) => {
      anim = { from: pos, to, start: performance.now(), duration: reducedMotion() ? 0 : duration, ease, done };
      if (!frame) frame = requestAnimationFrame(tick);
    });
  }

  // Turn to a card. Long trips take a little longer, but never forever.
  function goTo(i, { duration } = {}) {
    const to = clampIndex(i);
    const dist = Math.abs(to - pos);
    return animate(to, duration ?? Math.min(220 + dist * 45, 1100), dist > 3 ? easeInOut : easeOut);
  }

  const snap = () => goTo(Math.round(pos));

  // ---- Input ---------------------------------------------------------------------
  let wheelTimer;
  stage.addEventListener('wheel', (event) => {
    if (!enabled || !items.length) return;
    event.preventDefault();
    if (anim) { anim = null; }
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    pos = Math.max(-0.3, Math.min(items.length - 0.7, pos + delta / 70));
    if (!frame) frame = requestAnimationFrame(tick);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(snap, 140);
  }, { passive: false });

  let drag = null;
  stage.addEventListener('pointerdown', (event) => {
    if (!enabled || event.button !== 0 || event.target.closest('button, a, input, select, textarea')) return;
    anim = null;
    drag = { id: event.pointerId, y: event.clientY, x: event.clientX, from: pos, moved: false, samples: [[performance.now(), pos]] };
  });
  stage.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dy, event.clientX - drag.x) < 6) return;
    if (!drag.moved) { drag.moved = true; stage.setPointerCapture(event.pointerId); stage.classList.add('turning'); }
    // Pull the top card down towards you to flip to the next one.
    let next = drag.from + dy / DRAG_PX;
    const max = items.length - 1;
    if (next < 0) next /= 1 - next * 2; // rubber band past the ends
    if (next > max) next = max + (next - max) / (1 + (next - max) * 2);
    pos = next;
    drag.samples.push([performance.now(), pos]);
    if (drag.samples.length > 6) drag.samples.shift();
    if (!frame) frame = requestAnimationFrame(tick);
  });
  const endDrag = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const { moved, samples } = drag;
    drag = null;
    stage.classList.remove('turning');
    if (!moved) {
      // A tap: open the upright card, or turn to the one you tapped.
      const card = event.target.closest('.rdx-card');
      if (!card) return;
      const i = Number(card.dataset.index);
      if (i === Math.round(pos)) onOpen?.(items[i], i);
      else goTo(i);
      return;
    }
    const [t0, p0] = samples[0];
    const [t1, p1] = samples[samples.length - 1];
    const velocity = t1 > t0 ? (p1 - p0) / (t1 - t0) : 0; // cards per ms
    const to = clampIndex(Math.round(pos + velocity * 220));
    animate(to, Math.min(260 + Math.abs(to - pos) * 60, 1200));
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  stage.addEventListener('keydown', (event) => {
    if (!enabled || event.target !== stage) return;
    const now = Math.round(target());
    const moves = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, PageDown: 10, PageUp: -10 };
    if (event.key in moves) goTo(now + moves[event.key]);
    else if (event.key === 'Home') goTo(0);
    else if (event.key === 'End') goTo(items.length - 1);
    else if (event.key === 'Enter' || event.key === ' ') onOpen?.(items[now], now);
    else return;
    event.preventDefault();
  });

  return {
    el,
    stage,
    get index() { return Math.round(target()); },
    get items() { return items; },
    // Replace the cards, staying on `index` (default: the same position).
    setItems(next, index = Math.round(pos)) {
      items = next;
      nodes.forEach((node) => node.remove());
      nodes.clear();
      anim = null;
      pos = items.length ? clampIndex(index) : 0;
      lastIndex = -1;
      layout();
    },
    goTo,
    // The opening flourish: whirl through `turns` cards and land on the last.
    spin(to, { duration = 2600 } = {}) {
      return animate(clampIndex(to), duration, (t) => 1 - (1 - t) ** 4);
    },
    setInteractive(on) { enabled = on; },
    focus: () => stage.focus({ preventScroll: true }),
    destroy() { cancelAnimationFrame(frame); clearTimeout(wheelTimer); anim = null; },
  };
}
