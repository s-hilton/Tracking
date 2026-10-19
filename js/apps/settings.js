import { h } from '../ui.js';
import { getPrefs, setPrefs, WALLPAPERS, ACCENTS } from '../prefs.js';
import { getLinks, saveLinks, normalizeUrl } from '../links.js';
import { clearAll, remove, uid } from '../storage.js';
import { isStandalone, canPromptInstall, promptInstall } from '../pwa.js';

const LINK_COLORS = ['#475569', '#2563eb', '#0d9488', '#16a34a', '#ca8a04', '#ea580c', '#dc2626', '#9333ea'];

// A section whose body can be rebuilt in place when its data changes.
function section(title, build) {
  const body = h('div', { class: 'set-body' });
  const refresh = () => body.replaceChildren(...build(refresh));
  refresh();
  return { el: h('section', { class: 'set-section' }, h('h3', {}, title), body), refresh };
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

function webApps() {
  const list = section('Web apps', () => {
    const links = getLinks();
    if (!links.length) return [h('p', { class: 'muted' }, 'No web apps yet.')];
    return [h('ul', { class: 'link-list' }, ...links.map((link) => h('li', {},
      h('span', { class: 'glyph sm', style: `--c:${link.color}` }, link.icon),
      h('div', { class: 'link-text' }, h('strong', {}, link.name), h('span', { class: 'muted small' }, link.url)),
      h('button', {
        class: 'icon-btn',
        'aria-label': `Remove ${link.name}`,
        onclick: () => saveLinks(getLinks().filter((l) => l.id !== link.id)),
      }, '✕'))))];
  });

  const name = h('input', { class: 'input', placeholder: 'Name (e.g. Calendar)', required: true, maxLength: 30 });
  const url = h('input', { class: 'input', placeholder: 'Website (e.g. calendar.google.com)', required: true, inputMode: 'url', autocapitalize: 'off' });
  const icon = h('input', { class: 'input icon-input', placeholder: '🌐', maxLength: 4, 'aria-label': 'Icon (emoji)' });
  const error = h('p', { class: 'error small', hidden: true });

  const form = h('form', {
    class: 'link-form',
    onsubmit: (event) => {
      event.preventDefault();
      const href = normalizeUrl(url.value);
      if (!href) {
        error.textContent = 'Please enter a valid web address.';
        error.hidden = false;
        return;
      }
      const links = getLinks();
      saveLinks([...links, {
        id: uid(),
        name: name.value.trim(),
        url: href,
        icon: icon.value.trim() || '🌐',
        color: LINK_COLORS[links.length % LINK_COLORS.length],
      }]);
      form.reset();
      error.hidden = true;
    },
  },
  h('div', { class: 'set-label' }, 'Add a website'),
  h('div', { class: 'row' }, icon, name),
  url,
  error,
  h('button', { class: 'btn primary' }, 'Add to dashboard'));

  list.el.append(form);
  const onChange = () => list.refresh();
  window.addEventListener('apps-changed', onChange);
  return { el: list.el, cleanup: () => window.removeEventListener('apps-changed', onChange) };
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
    h('p', { class: 'muted small' }, 'Everything is stored in this browser on this device.'),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn', onclick: () => { remove('session'); location.reload(); } }, 'Reset windows'),
      h('button', {
        class: 'btn danger',
        onclick: () => {
          if (!confirm('Erase all notes, tasks, web apps and settings?')) return;
          clearAll();
          location.reload();
        },
      }, 'Erase all data')),
  ]).el;
}

export default {
  id: 'settings',
  name: 'Settings',
  icon: '⚙️',
  color: '#6366f1',
  size: { w: 480, h: 560 },

  mount(root) {
    const links = webApps();
    const inst = install();
    root.append(h('div', { class: 'app settings' }, appearance(), links.el, inst.el, data()));
    return () => { links.cleanup(); inst.cleanup(); };
  },
};
