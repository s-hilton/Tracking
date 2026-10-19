// Web apps: any website pinned to the dashboard, each opening in its own window.
// Self-contained: this folder + supabase/migrations/*_web_apps.sql.
// Unlike other apps this module provides a *list* of apps (one per saved link)
// and adds a "Web apps" section to Settings for managing them.
import { uid } from '../../storage.js';
import { h, loadStyles } from '../../ui.js';
import { createCollection } from '../../cloud.js';
import { registerSettingsSection } from '../../settings-sections.js';

loadStyles(new URL('./web-apps.css', import.meta.url));

const COLORS = ['#475569', '#2563eb', '#0d9488', '#16a34a', '#ca8a04', '#ea580c', '#dc2626', '#9333ea'];

const DEFAULT_LINKS = [
  {
    id: 'map',
    name: 'Map',
    icon: '🗺️',
    color: '#0d9488',
    url: 'https://www.openstreetmap.org/export/embed.html?bbox=-0.25%2C51.45%2C0.05%2C51.56&layer=mapnik',
    created: 0,
  },
];

const store = createCollection({
  table: 'web_apps',
  key: 'links',
  fallback: DEFAULT_LINKS,
  toRow: (l) => ({ id: l.id, name: l.name, url: l.url, icon: l.icon, color: l.color, created_at: new Date(l.created ?? 0).toISOString() }),
  fromRow: (r) => ({ id: r.id, name: r.name, url: r.url, icon: r.icon, color: r.color, created: Date.parse(r.created_at) }),
  order: { column: 'created_at', ascending: true },
});

const links = () => [...store.all()].sort((a, b) => (a.created ?? 0) - (b.created ?? 0));
const changed = () => window.dispatchEvent(new Event('apps-changed'));
store.subscribe(changed);

// Accepts "example.com" or a full URL; returns a normalized http(s) URL or null.
export function normalizeUrl(input) {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

// Turns a saved link into an app that shows the website in an iframe.
function webApp(link) {
  return {
    id: `web:${link.id}`,
    name: link.name,
    icon: link.icon || '🌐',
    color: link.color || '#475569',
    size: { w: 900, h: 600 },

    mount(root) {
      const frame = h('iframe', {
        class: 'web-frame',
        src: link.url,
        title: link.name,
        sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals',
        allow: 'fullscreen; clipboard-write; geolocation',
        loading: 'lazy',
      });
      let host = link.url;
      try { host = new URL(link.url).host; } catch { /* keep raw */ }

      root.append(h('div', { class: 'app web' },
        h('div', { class: 'web-bar' },
          h('button', { class: 'icon-btn', title: 'Reload', 'aria-label': 'Reload', onclick: () => { frame.src = link.url; } }, '⟳'),
          h('span', { class: 'web-host muted' }, host),
          h('a', { class: 'btn ghost', href: link.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open in tab ↗')),
        frame,
        h('p', { class: 'web-hint muted small' }, 'Page blank? Some websites block being shown inside other sites — use "Open in tab".')));
    },
  };
}

// ---- Settings → Web apps ------------------------------------------------------
function settingsSection() {
  const list = h('div');
  const renderList = () => {
    const all = links();
    list.replaceChildren(all.length
      ? h('ul', { class: 'link-list' }, ...all.map((link) => h('li', {},
        h('span', { class: 'glyph sm', style: `--c:${link.color}` }, link.icon),
        h('div', { class: 'link-text' }, h('strong', {}, link.name), h('span', { class: 'muted small' }, link.url)),
        h('button', {
          class: 'icon-btn',
          'aria-label': `Remove ${link.name}`,
          onclick: () => { store.remove(link.id); changed(); },
        }, '✕'))))
      : h('p', { class: 'muted' }, 'No web apps yet.'));
  };

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
      store.upsert({
        id: uid(),
        name: name.value.trim(),
        url: href,
        icon: icon.value.trim() || '🌐',
        color: COLORS[store.all().length % COLORS.length],
        created: Date.now(),
      });
      changed();
      form.reset();
      error.hidden = true;
    },
  },
  h('div', { class: 'set-label' }, 'Add a website'),
  h('div', { class: 'row' }, icon, name),
  url,
  error,
  h('button', { class: 'btn primary' }, 'Add to dashboard'));

  renderList();
  window.addEventListener('apps-changed', renderList);
  return { el: h('div', { class: 'set-body' }, list, form), cleanup: () => window.removeEventListener('apps-changed', renderList) };
}

registerSettingsSection({ title: 'Web apps', order: 20, render: settingsSection });

export default {
  apps: () => links().map(webApp),
};
