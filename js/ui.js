// Tiny DOM helper: h('button', { class: 'btn', onclick }, 'Label')
// Children are appended as text nodes, so user content is never parsed as HTML.
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key in el) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

// Each app loads its own stylesheet: loadStyles(new URL('./notes.css', import.meta.url))
export function loadStyles(url) {
  const href = String(url);
  if ([...document.styleSheets].some((sheet) => sheet.href === href)) return;
  document.head.append(h('link', { rel: 'stylesheet', href }));
}

// What goes inside an icon tile: the app's picture if it has one (e.g. a website's
// own icon), trying each candidate URL in turn, otherwise its emoji.
export function iconContent(app) {
  const sources = [app.image].flat().filter(Boolean);
  if (!sources.length) return app.icon;
  const img = h('img', { class: 'icon-img', alt: '', src: sources[0], referrerPolicy: 'no-referrer' });
  let next = 1;
  img.addEventListener('error', () => {
    if (next < sources.length) img.src = sources[next++];
    else img.replaceWith(app.icon || '🌐');
  });
  return img;
}

export function glyph(app, size = '') {
  return h('span', { class: `glyph ${size}${app.image ? ' has-img' : ''}`, style: `--c:${app.color}` }, iconContent(app));
}

export function appIcon(app, onOpen, { locked = false, badge = 0 } = {}) {
  return h('button', {
    class: `app-icon${locked ? ' locked' : ''}`,
    title: locked ? `${app.name} (sign in to open)` : badge ? `${app.name} (${badge} need attention)` : app.name,
    onclick: () => onOpen(app.id),
  },
  glyph(app),
  locked ? h('span', { class: 'lock-badge', 'aria-hidden': 'true' }, '🔒') : null,
  !locked && badge ? h('span', { class: 'count-badge', 'aria-hidden': 'true' }, badge > 99 ? '99+' : String(badge)) : null,
  h('span', { class: 'label' }, app.name),
  );
}
