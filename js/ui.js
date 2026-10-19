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

export function appIcon(app, onOpen) {
  return h('button', { class: 'app-icon', title: app.name, onclick: () => onOpen(app.id) },
    h('span', { class: 'glyph', style: `--c:${app.color}` }, app.icon),
    h('span', { class: 'label' }, app.name),
  );
}
