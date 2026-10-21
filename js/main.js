import { getApps, getDesktopApps, getApp } from './apps/index.js';
import { createWindowManager } from './wm.js';
import { applyPrefs } from './prefs.js';
import { load, save } from './storage.js';
import { registerPWA } from './pwa.js';
import { initCloud, needsSignIn, whenAuthReady } from './cloud.js';
import { initAccount, showSignIn } from './account.js';
import { h, appIcon, glyph, iconContent } from './ui.js';
import { createStickyNote } from './todos.js';
import { sendIntent } from './intents.js';

applyPrefs();
registerPWA();
initCloud();
initAccount();

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

// Apps with `requiresSignIn: true` ask for the dashboard sign-in first,
// then open automatically once signed in.
// `intent` (optional) asks the app to show something particular; see js/intents.js.
async function openApp(appId, intent) {
  hideOverlays();
  const app = getApp(appId);
  const open = () => { wm.open(appId); if (intent) sendIntent(appId, intent); };
  if (app?.requiresSignIn) {
    await whenAuthReady();
    if (needsSignIn()) {
      showSignIn({ reason: `Sign in to open ${app.name}.`, then: open });
      return;
    }
  }
  open();
}

// Signed out (or never signed in): close apps that need an account.
function closeProtectedApps() {
  if (needsSignIn()) wm.closeWhere((app) => app?.requiresSignIn);
}

// ---- Desktop / home screen icons -------------------------------------------
// Apps can show a number on their icon via `badge()`; a folder shows the total of its apps.
function badgeOf(app) {
  if (!app || needsSignIn()) return 0;
  if (app.contains) return app.contains.reduce((sum, id) => sum + badgeOf(getApp(id)), 0);
  try { return app.badge?.() ?? 0; } catch { return 0; }
}

const icon = (app) => appIcon(app, (id) => openApp(id), { locked: app.requiresSignIn && needsSignIn(), badge: badgeOf(app) });

function renderIcons() {
  $('#icons').replaceChildren(...getDesktopApps().map(icon));
}

// ---- Sticky note: to-dos gathered from every app (see js/todos.js) ---------------
const sticky = createStickyNote({ getApps, openApp });
$('#desktop').prepend(sticky.el);

// ---- Daily reminders ----------------------------------------------------------
// Apps can return a message from `reminder()`; it's shown once a day per app.
let reminderTimer;
function checkReminders() {
  clearTimeout(reminderTimer);
  reminderTimer = setTimeout(() => {
    if (needsSignIn()) return;
    const today = new Date().toDateString();
    for (const app of getApps()) {
      let message = null;
      try { message = app.reminder?.(); } catch { /* ignore */ }
      if (!message || load(`reminder:${app.id}`, '') === today) continue;
      save(`reminder:${app.id}`, today);
      showToast(app, message);
      break; // one at a time
    }
  }, 2000);
}

function showToast(app, message) {
  const toast = h('div', { class: 'toast', role: 'status' },
    h('span', { class: 'toast-icon' }, iconContent(app)),
    h('div', { class: 'toast-text' }, h('strong', {}, app.name), h('span', {}, message)),
    h('button', { class: 'btn primary', onclick: () => { toast.remove(); openApp(app.id); } }, 'Open'),
    h('button', { class: 'icon-btn', 'aria-label': 'Dismiss', onclick: () => toast.remove() }, '✕'));
  document.body.append(toast);
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
    h('span', { class: 'task-icon' }, iconContent(w.app)),
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
  const apps = getDesktopApps().filter((app) => app.name.toLowerCase().includes(query));
  $('#launcher-grid').replaceChildren(
    ...(apps.length ? apps.map(icon) : [h('p', { class: 'muted' }, 'No apps found')]),
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
        glyph(w.app),
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
window.addEventListener('auth-changed', () => {
  closeProtectedApps();
  renderIcons(); // lock badges
});
let iconsTimer;
window.addEventListener('badges-changed', () => {
  clearTimeout(iconsTimer);
  iconsTimer = setTimeout(renderIcons, 200);
  checkReminders();
});
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
whenAuthReady().then(() => { closeProtectedApps(); renderIcons(); checkReminders(); sticky.refresh(); });
