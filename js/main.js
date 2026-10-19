import { getApps, getApp } from './apps/index.js';
import { createWindowManager } from './wm.js';
import { applyPrefs } from './prefs.js';
import { load, save } from './storage.js';
import { registerPWA } from './pwa.js';
import { initCloud } from './cloud.js';
import { h, appIcon } from './ui.js';

applyPrefs();
registerPWA();
initCloud();

const $ = (selector) => document.querySelector(selector);
const mobileQuery = window.matchMedia('(max-width: 768px)');

const wm = createWindowManager({
  layer: $('#windows'),
  getApp,
  onChange() {
    renderTaskbar();
    save('session', wm.serialize());
  },
});

function openApp(appId) {
  hideOverlays();
  wm.open(appId);
}

// ---- Desktop / home screen icons -------------------------------------------
function renderIcons() {
  $('#icons').replaceChildren(...getApps().map((app) => appIcon(app, openApp)));
}

// ---- Taskbar ---------------------------------------------------------------
function renderTaskbar() {
  const open = wm.list();
  $('#task-list').replaceChildren(...open.map((w) =>
    h('button', {
      class: `task${w.active ? ' active' : ''}${w.minimized ? ' minimized' : ''}`,
      title: w.app.name,
      onclick: () => wm.toggle(w.id),
    },
    h('span', { class: 'task-icon' }, w.app.icon),
    h('span', { class: 'task-name' }, w.app.name)),
  ));
  const count = $('#switcher-count');
  count.hidden = open.length === 0;
  count.textContent = open.length;
  if (!$('#switcher').hidden) renderSwitcher();
}

function tickClock() {
  const now = new Date();
  $('#tb-clock').textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  $('#tb-clock').dateTime = now.toISOString();
}

// ---- Launcher (all apps) ---------------------------------------------------
function renderLauncher() {
  const query = $('#launcher-search').value.trim().toLowerCase();
  const apps = getApps().filter((app) => app.name.toLowerCase().includes(query));
  $('#launcher-grid').replaceChildren(
    ...(apps.length ? apps.map((app) => appIcon(app, openApp)) : [h('p', { class: 'muted' }, 'No apps found')]),
  );
}

function toggleLauncher() {
  const launcher = $('#launcher');
  const show = launcher.hidden;
  hideOverlays();
  launcher.hidden = !show;
  if (show) {
    $('#launcher-search').value = '';
    renderLauncher();
    if (!mobileQuery.matches) $('#launcher-search').focus();
  }
}

// ---- Switcher (open apps, mainly for phones) -------------------------------
function renderSwitcher() {
  const open = wm.list();
  $('#switcher-list').replaceChildren(...(open.length
    ? open.map((w) => h('div', { class: 'switch-card' },
      h('button', { class: 'switch-open', onclick: () => { hideOverlays(); wm.focus(w.id); } },
        h('span', { class: 'glyph', style: `--c:${w.app.color}` }, w.app.icon),
        h('span', {}, w.app.name)),
      h('button', { class: 'switch-close', 'aria-label': `Close ${w.app.name}`, onclick: () => wm.close(w.id) }, '✕')))
    : [h('p', { class: 'muted' }, 'No open apps')]));
}

function toggleSwitcher() {
  const switcher = $('#switcher');
  const show = switcher.hidden;
  hideOverlays();
  switcher.hidden = !show;
  if (show) renderSwitcher();
}

function hideOverlays() {
  $('#launcher').hidden = true;
  $('#switcher').hidden = true;
}

// ---- Wiring ----------------------------------------------------------------
function syncMode() {
  document.body.classList.toggle('mobile', mobileQuery.matches);
  wm.fit();
}

$('#btn-launcher').addEventListener('click', toggleLauncher);
$('#btn-switcher').addEventListener('click', toggleSwitcher);
$('#btn-home').addEventListener('click', () => { hideOverlays(); wm.minimizeAll(); });
$('#launcher-search').addEventListener('input', renderLauncher);
$('#launcher-search').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') $('#launcher-grid .app-icon')?.click();
});
$('#switcher').addEventListener('click', (event) => { if (event.target === event.currentTarget) hideOverlays(); });
$('#desktop').addEventListener('pointerdown', hideOverlays);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideOverlays(); });

mobileQuery.addEventListener('change', syncMode);
window.addEventListener('resize', () => wm.fit());
window.addEventListener('apps-changed', () => {
  renderIcons();
  renderLauncher();
  wm.prune();
});

syncMode();
renderIcons();
tickClock();
setInterval(tickClock, 10_000);

// Restore the windows that were open last time.
for (const saved of load('session', [])) wm.open(saved.appId, saved);
renderTaskbar();
