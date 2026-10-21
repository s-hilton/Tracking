// Settings app. Core shell settings (account, appearance, install, data) live here;
// other apps add their own sections through js/settings-sections.js.
import { h, loadStyles } from '../../ui.js';
import { getPrefs, setPrefs, WALLPAPERS, ACCENTS } from '../../prefs.js';
import { clearAll, remove } from '../../storage.js';
import { isStandalone, canPromptInstall, promptInstall } from '../../pwa.js';
import { getSettingsSections } from '../../settings-sections.js';
import { isConfigured, currentUser, signOut } from '../../cloud.js';
import { showSignIn, statusText } from '../../account.js';

loadStyles(new URL('./settings.css', import.meta.url));

// A section whose body can be rebuilt in place when its data changes.
function section(title, build) {
  const body = h('div', { class: 'set-body' });
  const refresh = () => body.replaceChildren(...build(refresh));
  refresh();
  return { el: h('section', { class: 'set-section' }, h('h3', {}, title), body), refresh };
}

function account() {
  const status = h('p', { class: 'muted small' });
  const showStatus = () => { status.textContent = statusText(); };

  const sec = section('Account', () => {
    if (!isConfigured()) {
      return [h('p', { class: 'muted' },
        'Cloud sync is off, so data is saved on this device only. To sync between devices, connect Supabase (see docs/SUPABASE_SETUP.md).')];
    }
    const user = currentUser();
    if (!user) {
      return [
        h('p', { class: 'muted' }, 'Sign in to save your notes, tasks and web apps to the cloud and sync them across devices.'),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => showSignIn() }, 'Sign in or create account')),
      ];
    }
    return [
      h('p', {}, 'Signed in as ', h('strong', {}, user.email)),
      status,
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn', onclick: () => window.dispatchEvent(new Event('sync-now')) }, 'Sync now'),
        h('button', { class: 'btn', onclick: () => signOut() }, 'Sign out')),
    ];
  });

  showStatus();
  window.addEventListener('auth-changed', sec.refresh);
  window.addEventListener('sync-status', showStatus);
  return {
    el: sec.el,
    cleanup: () => {
      window.removeEventListener('auth-changed', sec.refresh);
      window.removeEventListener('sync-status', showStatus);
    },
  };
}

function appearance() {
  return section('Appearance', (refresh) => {
    const prefs = getPrefs();
    const pick = (patch) => { setPrefs(patch); refresh(); };
    return [
      h('label', { class: 'set-row' }, 'Theme',
        h('select', { class: 'input', onchange: (e) => pick({ theme: e.target.value }) },
          ...[['auto', 'Match device'], ['dark', 'Dark'], ['light', 'Light']].map(([value, label]) =>
            h('option', { value, selected: prefs.theme === value }, label)))),
      h('div', { class: 'set-label' }, 'Wallpaper'),
      h('div', { class: 'swatches' }, ...Object.entries(WALLPAPERS).map(([key, css]) =>
        h('button', {
          class: `swatch wall${prefs.wallpaper === key ? ' on' : ''}`,
          style: `background:${css}`,
          title: key,
          'aria-label': `${key} wallpaper`,
          onclick: () => pick({ wallpaper: key }),
        }))),
      h('div', { class: 'set-label' }, 'Accent colour'),
      h('div', { class: 'swatches' }, ...ACCENTS.map((color) =>
        h('button', {
          class: `swatch dot${prefs.accent === color ? ' on' : ''}`,
          style: `background:${color}`,
          'aria-label': `Accent ${color}`,
          onclick: () => pick({ accent: color }),
        }))),
    ];
  }).el;
}

function install() {
  const sec = section('Install', (refresh) => {
    if (isStandalone()) return [h('p', {}, '✅ Running as an installed app.')];
    if (canPromptInstall()) {
      return [
        h('p', { class: 'muted' }, 'Install the dashboard so it opens in its own window like a native app.'),
        h('button', { class: 'btn primary', onclick: async () => { await promptInstall(); refresh(); } }, 'Install app'),
      ];
    }
    return [
      h('p', { class: 'muted' }, 'iPhone / iPad: open in Safari, tap Share, then "Add to Home Screen".'),
      h('p', { class: 'muted' }, 'Android: browser menu → "Install app" or "Add to Home screen".'),
      h('p', { class: 'muted' }, 'Computer (Chrome / Edge): click the install icon in the address bar.'),
    ];
  });
  window.addEventListener('installable', sec.refresh);
  return { el: sec.el, cleanup: () => window.removeEventListener('installable', sec.refresh) };
}

function data() {
  return section('Data', () => [
    h('p', { class: 'muted small' },
      currentUser()
        ? 'Your data is saved in the cloud and cached on this device.'
        : 'Everything is stored in this browser on this device.'),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn', onclick: () => { remove('session'); location.reload(); } }, 'Reset windows'),
      h('button', {
        class: 'btn danger',
        onclick: async () => {
          const cloud = currentUser() ? ' You will be signed out; your cloud copy is kept.' : '';
          if (!confirm(`Erase all notes, tasks, web apps and settings from this device?${cloud}`)) return;
          await signOut();
          clearAll();
          location.reload();
        },
      }, 'Erase this device')),
  ]).el;
}

// Sections contributed by other apps (e.g. Web apps).
function extraSection({ title, render }) {
  const result = render();
  const content = result instanceof Element ? result : result.el;
  return {
    el: h('section', { class: 'set-section' }, h('h3', {}, title), content),
    cleanup: result.cleanup,
  };
}

// No todos: settings only (see README → To-dos on the sticky note).
export default {
  id: 'settings',
  name: 'Settings',
  icon: '⚙️',
  color: '#6366f1',
  requiresSignIn: false,
  size: { w: 480, h: 600 },

  mount(root) {
    const acct = account();
    const extras = getSettingsSections().map(extraSection);
    const inst = install();
    root.append(h('div', { class: 'app settings' },
      acct.el, appearance(), ...extras.map((x) => x.el), inst.el, data()));
    return () => {
      acct.cleanup();
      inst.cleanup();
      extras.forEach((x) => x.cleanup?.());
    };
  },
};
