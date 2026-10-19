import { h } from './ui.js';

const MIN_W = 280;
const MIN_H = 180;
const TITLE_H = 40;

// Manages app windows: open/close, focus order, drag, resize, minimize, maximize.
// On phones (body.mobile) CSS shows only the active window, full screen.
export function createWindowManager({ layer, getApp, onChange }) {
  const wins = new Map();
  let seq = 0;
  let zTop = 1;

  const isMobile = () => document.body.classList.contains('mobile');
  const bounds = () => ({ w: layer.clientWidth, h: layer.clientHeight });

  function topmost() {
    let best = null;
    for (const win of wins.values()) {
      if (!win.minimized && (!best || win.z > best.z)) best = win;
    }
    return best;
  }

  function clamp(geom) {
    const b = bounds();
    const w = Math.min(Math.max(geom.w, MIN_W), b.w);
    const h = Math.min(Math.max(geom.h, MIN_H), b.h);
    return {
      w, h,
      x: Math.min(Math.max(geom.x, 0), Math.max(0, b.w - w)),
      y: Math.min(Math.max(geom.y, 0), Math.max(0, b.h - TITLE_H)),
    };
  }

  function defaultGeom(app) {
    const b = bounds();
    const w = Math.min(app.size?.w ?? 560, b.w - 32);
    const h = Math.min(app.size?.h ?? 420, b.h - 32);
    const offset = (wins.size % 8) * 28;
    return { w, h, x: Math.round((b.w - w) / 2) - 80 + offset, y: Math.round((b.h - h) / 3) + offset };
  }

  function render(win) {
    const { el, geom } = win;
    el.style.setProperty('--x', `${geom.x}px`);
    el.style.setProperty('--y', `${geom.y}px`);
    el.style.setProperty('--w', `${geom.w}px`);
    el.style.setProperty('--h', `${geom.h}px`);
    el.style.zIndex = win.z;
    el.classList.toggle('maximized', win.maximized);
    el.classList.toggle('minimized', win.minimized);
  }

  function refresh() {
    const top = topmost();
    for (const win of wins.values()) win.el.classList.toggle('active', win === top);
    onChange();
  }

  // Pointer-captured drag gesture shared by move and resize.
  function gesture(event, target, onMove) {
    event.preventDefault();
    target.setPointerCapture(event.pointerId);
    document.body.classList.add('dragging');
    const end = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      document.body.classList.remove('dragging');
      onChange();
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }

  function wire(win) {
    const { el, id } = win;
    const titlebar = el.querySelector('.titlebar');
    const handle = el.querySelector('.resize-handle');

    el.addEventListener('pointerdown', () => { if (topmost() !== win) focus(id); }, true);

    el.querySelector('.win-controls').addEventListener('click', (event) => {
      const act = event.target.closest('button')?.dataset.act;
      if (act === 'min') minimize(id);
      else if (act === 'max') toggleMaximize(id);
      else if (act === 'close') close(id);
    });

    let lastTap = 0;
    titlebar.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('button') || isMobile()) return;
      const now = Date.now();
      if (now - lastTap < 350) { lastTap = 0; toggleMaximize(id); return; }
      lastTap = now;
      if (win.maximized) return;
      const start = { px: event.clientX, py: event.clientY, ...win.geom };
      gesture(event, titlebar, (ev) => {
        win.geom = clamp({ ...win.geom, x: start.x + ev.clientX - start.px, y: start.y + ev.clientY - start.py });
        render(win);
      });
    });

    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || win.maximized) return;
      const start = { px: event.clientX, py: event.clientY, ...win.geom };
      gesture(event, handle, (ev) => {
        const b = bounds();
        win.geom = {
          ...win.geom,
          w: Math.min(Math.max(start.w + ev.clientX - start.px, MIN_W), b.w - start.x),
          h: Math.min(Math.max(start.h + ev.clientY - start.py, MIN_H), b.h - start.y),
        };
        render(win);
      });
    });
  }

  function open(appId, saved) {
    const app = getApp(appId);
    if (!app) return null;
    const existing = [...wins.values()].find((w) => w.appId === appId);
    if (existing) { focus(existing.id); return existing.id; }

    const id = `w${++seq}`;
    const title = h('span', { class: 'title-text' }, app.name);
    const body = h('div', { class: 'window-body' });
    const el = h('section', { class: 'window', role: 'dialog', 'aria-label': app.name },
      h('header', { class: 'titlebar' },
        h('span', { class: 'title-icon' }, app.icon),
        title,
        h('div', { class: 'win-controls' },
          h('button', { 'data-act': 'min', 'aria-label': 'Minimize', title: 'Minimize' }, '–'),
          h('button', { 'data-act': 'max', 'aria-label': 'Maximize', title: 'Maximize' }, '□'),
          h('button', { 'data-act': 'close', class: 'close', 'aria-label': 'Close', title: 'Close' }, '✕'),
        ),
      ),
      body,
      h('div', { class: 'resize-handle', 'aria-hidden': 'true' }),
    );

    const win = {
      id, appId, app, el,
      z: ++zTop,
      geom: clamp(saved?.geom ?? defaultGeom(app)),
      maximized: saved?.maximized ?? false,
      minimized: saved?.minimized ?? false,
    };
    wins.set(id, win);
    render(win);
    wire(win);
    layer.append(el);

    const ctx = {
      open: (otherId) => open(otherId),
      close: () => close(id),
      setTitle: (text) => { title.textContent = text || app.name; },
    };
    try {
      win.cleanup = app.mount(body, ctx);
    } catch (err) {
      console.error(err);
      body.append(h('p', { class: 'app-error' }, `${app.name} failed to start.`));
    }
    refresh();
    return id;
  }

  function focus(id) {
    const win = wins.get(id);
    if (!win) return;
    win.minimized = false;
    win.z = ++zTop;
    render(win);
    refresh();
  }

  function minimize(id) {
    const win = wins.get(id);
    if (!win) return;
    win.minimized = true;
    render(win);
    refresh();
  }

  function toggleMaximize(id) {
    const win = wins.get(id);
    if (!win) return;
    win.maximized = !win.maximized;
    render(win);
    onChange();
  }

  function close(id) {
    const win = wins.get(id);
    if (!win) return;
    try { win.cleanup?.(); } catch (err) { console.error(err); }
    win.el.remove();
    wins.delete(id);
    refresh();
  }

  // Taskbar behaviour: clicking the active app minimizes it, anything else brings it forward.
  function toggle(id) {
    if (topmost() === wins.get(id)) minimize(id);
    else focus(id);
  }

  function minimizeAll() {
    for (const win of wins.values()) { win.minimized = true; render(win); }
    refresh();
  }

  // Keep windows reachable after the viewport shrinks (rotation, resize).
  function fit() {
    for (const win of wins.values()) { win.geom = clamp(win.geom); render(win); }
  }

  // Close windows whose app was removed (e.g. a deleted web link).
  function prune() {
    for (const win of [...wins.values()]) if (!getApp(win.appId)) close(win.id);
  }

  function list() {
    const top = topmost();
    return [...wins.values()].map((w) => ({ id: w.id, app: w.app, active: w === top, minimized: w.minimized }));
  }

  function serialize() {
    return [...wins.values()]
      .sort((a, b) => a.z - b.z)
      .map(({ appId, geom, maximized, minimized }) => ({ appId, geom, maximized, minimized }));
  }

  // Clicks inside a cross-origin iframe never reach us; focus its window when the frame takes focus.
  window.addEventListener('blur', () => setTimeout(() => {
    const frame = document.activeElement;
    if (frame?.tagName !== 'IFRAME') return;
    const win = [...wins.values()].find((w) => w.el.contains(frame));
    if (win && topmost() !== win) focus(win.id);
  }));

  return { open, focus, close, minimize, toggle, minimizeAll, fit, prune, list, serialize };
}
