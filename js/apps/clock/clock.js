// Clock app. Self-contained: this folder only (no database table).
import { h, loadStyles } from '../../ui.js';

loadStyles(new URL('./clock.css', import.meta.url));

const pad = (n, len = 2) => String(n).padStart(len, '0');

function formatElapsed(ms) {
  const total = Math.floor(ms / 10);
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6000) % 60;
  const hrs = Math.floor(total / 360000);
  return `${hrs ? `${hrs}:` : ''}${pad(m)}:${pad(s)}.${pad(cs)}`;
}

export default {
  id: 'clock',
  name: 'Clock',
  icon: '⏰',
  color: '#0ea5e9',
  size: { w: 380, h: 420 },

  mount(root) {
    const time = h('div', { class: 'clock-time' });
    const date = h('div', { class: 'clock-date muted' });
    const watch = h('div', { class: 'clock-watch' });
    const laps = h('ol', { class: 'clock-laps' });

    let elapsed = 0;
    let startedAt = null;
    let watchTimer = null;

    const now = () => elapsed + (startedAt ? Date.now() - startedAt : 0);

    function tick() {
      const d = new Date();
      time.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
      date.textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    }

    function renderWatch() {
      watch.textContent = formatElapsed(now());
      startBtn.textContent = startedAt ? 'Stop' : 'Start';
      startBtn.classList.toggle('danger', !!startedAt);
      lapBtn.textContent = startedAt ? 'Lap' : 'Reset';
    }

    const startBtn = h('button', {
      class: 'btn primary',
      onclick: () => {
        if (startedAt) {
          elapsed = now();
          startedAt = null;
          clearInterval(watchTimer);
        } else {
          startedAt = Date.now();
          watchTimer = setInterval(renderWatch, 37);
        }
        renderWatch();
      },
    });

    const lapBtn = h('button', {
      class: 'btn',
      onclick: () => {
        if (startedAt) {
          laps.prepend(h('li', {}, formatElapsed(now())));
        } else {
          elapsed = 0;
          laps.replaceChildren();
        }
        renderWatch();
      },
    });

    root.append(h('div', { class: 'app clock' },
      time, date,
      h('div', { class: 'clock-stopwatch' },
        h('div', { class: 'muted small' }, 'Stopwatch'),
        watch,
        h('div', { class: 'row center' }, lapBtn, startBtn),
        laps)));

    tick();
    renderWatch();
    const clockTimer = setInterval(tick, 1000);

    return () => {
      clearInterval(clockTimer);
      clearInterval(watchTimer);
    };
  },
};
