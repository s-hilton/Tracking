// One form component for every add/edit screen in the LOIs app. A form is a list
// of field specs; it opens as a panel over the app window.
//
// Field spec: { key, label, type, options, required, wide, placeholder, help,
//               refresh (re-draw the form when this changes), show(values),
//               onChange(values) (adjust other values), render(values, redraw) for type 'custom' }
// Keys may be nested one level, e.g. 'details.frequency_band'.
import { h } from '../../ui.js';

const toLocalDatetime = (ms) => {
  if (ms == null) return '';
  const d = new Date(ms);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function optionList(options, values) {
  const list = typeof options === 'function' ? options(values) : options;
  if (Array.isArray(list)) return list.map((x) => (Array.isArray(x) ? x : [x, x || '—']));
  return Object.entries(list ?? {});
}

function getValue(values, key) {
  const [a, b] = key.split('.');
  return b ? values[a]?.[b] : values[a];
}

function setValue(values, key, value) {
  const [a, b] = key.split('.');
  if (b) values[a] = { ...(values[a] ?? {}), [b]: value };
  else values[a] = value;
}

export function openForm(host, {
  title, fields, values: initial = {}, submitLabel = 'Save', onSubmit, onDelete, deleteLabel = 'Delete', onClose,
}) {
  const values = JSON.parse(JSON.stringify(initial));
  const grid = h('div', { class: 'bd-form-grid' });
  const error = h('p', { class: 'error small', hidden: true });

  function field(f) {
    const current = f.key ? getValue(values, f.key) : undefined;
    const set = (v) => {
      setValue(values, f.key, v);
      f.onChange?.(values);
      if (f.refresh) redraw();
    };
    let input;
    switch (f.type) {
      case 'heading':
        return h('h4', { class: 'bd-form-heading' }, f.label);
      case 'custom':
        return h('div', { class: `bd-field${f.wide !== false ? ' wide' : ''}` },
          f.label ? h('span', {}, f.label) : null, f.render(values, redraw));
      case 'textarea':
        input = h('textarea', { class: 'input', rows: f.rows ?? 3, value: current ?? '', placeholder: f.placeholder, oninput: (e) => set(e.target.value) });
        break;
      case 'select':
        input = h('select', { class: 'input', onchange: (e) => set(e.target.value) },
          ...optionList(f.options, values).map(([v, label]) => h('option', { value: v, selected: v === (current ?? '') }, label)));
        break;
      case 'multi': {
        const chosen = new Set(current ?? []);
        const opts = optionList(f.options, values);
        input = h('div', { class: 'bd-checks' }, ...(opts.length ? opts.map(([v, label]) => h('label', { class: 'bd-check' },
          h('input', {
            type: 'checkbox',
            checked: chosen.has(v),
            onchange: (e) => {
              if (e.target.checked) chosen.add(v); else chosen.delete(v);
              set([...chosen]);
            },
          }), h('span', {}, label))) : [h('span', { class: 'muted small' }, f.empty ?? 'Nothing to choose yet')]));
        break;
      }
      case 'checkbox':
        return h('label', { class: `bd-check bd-field-check${f.wide ? ' wide' : ''}` },
          h('input', { type: 'checkbox', checked: Boolean(current), onchange: (e) => set(e.target.checked) }),
          h('span', {}, f.label));
      case 'datetime':
        input = h('input', { class: 'input', type: 'datetime-local', value: toLocalDatetime(current), onchange: (e) => set(e.target.value ? new Date(e.target.value).getTime() : null) });
        break;
      case 'number':
        input = h('input', {
          class: 'input', type: 'number', step: 'any', min: f.min ?? '', inputMode: 'decimal', value: current ?? '', placeholder: f.placeholder,
          oninput: (e) => set(e.target.value === '' ? null : Number(e.target.value)),
        });
        break;
      default:
        input = h('input', {
          class: 'input', type: f.type ?? 'text', value: current ?? '', placeholder: f.placeholder, maxLength: f.maxLength ?? 500,
          autocomplete: 'off', oninput: (e) => set(e.target.value),
        });
    }
    if (f.required) input.required = true;
    return h('label', { class: `bd-field${f.wide ? ' wide' : ''}` },
      h('span', {}, f.label, f.required ? ' *' : ''), input,
      f.help ? h('small', { class: 'muted' }, f.help) : null);
  }

  function redraw() {
    const active = document.activeElement;
    const focusKey = active?.closest?.('.bd-field')?.dataset.key;
    grid.replaceChildren(...fields.filter((f) => !f.show || f.show(values)).map((f) => {
      const el = field(f);
      if (f.key) el.dataset.key = f.key;
      return el;
    }));
    if (focusKey) grid.querySelector(`[data-key="${focusKey}"] input, [data-key="${focusKey}"] select`)?.focus();
  }

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  }

  const onKey = (e) => { if (e.key === 'Escape' && host.contains(overlay)) close(); };

  async function submit(event) {
    event.preventDefault();
    const missing = fields.find((f) => f.required && (!f.show || f.show(values)) && !String(getValue(values, f.key) ?? '').trim());
    if (missing) {
      error.textContent = `${missing.label} is required.`;
      error.hidden = false;
      return;
    }
    const problem = await onSubmit(values);
    if (typeof problem === 'string') {
      error.textContent = problem;
      error.hidden = false;
      return;
    }
    close();
  }

  const overlay = h('div', { class: 'bd-overlay' },
    h('form', { class: 'bd-panel', onsubmit: submit, novalidate: true },
      h('div', { class: 'bd-panel-head' },
        h('h3', {}, title),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕')),
      grid,
      error,
      h('div', { class: 'bd-panel-actions' },
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
