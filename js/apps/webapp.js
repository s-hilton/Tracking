import { h } from '../ui.js';

// Turns a saved link into an app that shows the website in an iframe.
export function webApp(link) {
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
