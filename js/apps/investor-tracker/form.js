// One form component for every add/edit screen in the Investors app. It opens as
// a panel over the app window.
//
// Field spec: { key, label, type, options, required, wide, placeholder, help,
//               refresh (re-draw when this changes), show(values), render(values, redraw) for 'custom' }
import { h } from '../../ui.js';

const optionList = (options) => (Array.isArray(options)
  ? options.map((x) => (Array.isArray(x) ? x : [x, x || '—']))
  : Object.entries(options ?? {}));

export function openForm(host, {
  title, intro, fields, values: initial = {}, submitLabel = 'Save', onSubmit, onDelete, deleteLabel = 'Delete',
}) {
  const values = JSON.parse(JSON.stringify(initial));
  const grid = h('div', { class: 'inv-form-grid' });
  const error = h('p', { class: 'error small', hidden: true });

  function field(f) {
    const current = values[f.key];
    const set = (v) => { values[f.key] = v; if (f.refresh) redraw(); };
    let input;
    switch (f.type) {
      case 'heading':
        return h('h4', { class: 'inv-form-heading' }, f.label);
      case 'custom':
        return h('div', { class: 'inv-field wide' }, f.label ? h('span', {}, f.label) : null, f.render(values, redraw));
      case 'textarea':
        input = h('textarea', { class: 'input', rows: f.rows ?? 3, value: current ?? '', placeholder: f.placeholder ?? '', oninput: (e) => set(e.target.value) });
        break;
      case 'select':
        input = h('select', { class: 'input', onchange: (e) => set(e.target.value) },
          ...optionList(typeof f.options === 'function' ? f.options(values) : f.options)
            .map(([v, label]) => h('option', { value: v, selected: v === (current ?? '') }, label)));
        break;
      case 'checkbox':
        return h('label', { class: `inv-check inv-field-check${f.wide ? ' wide' : ''}` },
          h('input', { type: 'checkbox', checked: Boolean(current), onchange: (e) => set(e.target.checked) }),
          h('span', {}, f.label));
      case 'number':
        input = h('input', {
          class: 'input', type: 'number', step: 'any', min: 0, inputMode: 'decimal', value: current ?? '', placeholder: f.placeholder ?? '',
          oninput: (e) => set(e.target.value === '' ? null : Number(e.target.value)),
        });
        break;
      default:
        input = h('input', {
          class: 'input', type: f.type ?? 'text', value: current ?? '', placeholder: f.placeholder ?? '', maxLength: 500,
          autocomplete: 'off', oninput: (e) => set(e.target.value),
        });
        if (f.suggestions) input.setAttribute('list', `inv-dl-${f.key}`); // `list` is read-only as a property
    }
    return h('label', { class: `inv-field${f.wide ? ' wide' : ''}` },
      h('span', {}, f.label, f.required ? ' *' : ''), input,
      f.suggestions ? h('datalist', { id: `inv-dl-${f.key}` }, ...f.suggestions.map((s) => h('option', { value: s }))) : null,
      f.help ? h('small', { class: 'muted' }, f.help) : null);
  }

  function redraw() {
    grid.replaceChildren(...fields.filter((f) => !f.show || f.show(values)).map(field));
  }

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  const onKey = (e) => { if (e.key === 'Escape' && host.contains(overlay)) close(); };

  function submit(event) {
    event.preventDefault();
    const missing = fields.find((f) => f.required && (!f.show || f.show(values)) && !String(values[f.key] ?? '').trim());
    if (missing) {
      error.textContent = `${missing.label} is required.`;
      error.hidden = false;
      return;
    }
    const problem = onSubmit(values);
    if (typeof problem === 'string') {
      error.textContent = problem;
      error.hidden = false;
      return;
    }
    close();
  }

  const overlay = h('div', { class: 'inv-overlay' },
    h('form', { class: 'inv-panel', onsubmit: submit, novalidate: true },
      h('div', { class: 'inv-panel-head' },
        h('h3', {}, title),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕')),
      intro ? h('p', { class: 'muted small inv-intro' }, intro) : null,
      grid,
      error,
      h('div', { class: 'inv-panel-actions' },
        onDelete ? h('button', {
          type: 'button',
          class: 'btn ghost danger',
          onclick: () => { if (confirm(`${deleteLabel}?`)) { onDelete(); close(); } },
        }, deleteLabel) : null,
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn', onclick: close }, 'Cancel'),
        h('button', { class: 'btn primary' }, submitLabel))));

  redraw();
  host.append(overlay);
  document.addEventListener('keydown', onKey);
  overlay.querySelector('input:not([type=checkbox]), select, textarea')?.focus();
  return { close };
}
