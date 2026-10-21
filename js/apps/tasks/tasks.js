// Tasks app. Self-contained: this folder + supabase/migrations/*_tasks.sql.
import { uid } from '../../storage.js';
import { h, loadStyles } from '../../ui.js';
import { createCollection } from '../../cloud.js';

loadStyles(new URL('./tasks.css', import.meta.url));

const FILTERS = { all: 'All', active: 'Active', done: 'Done' };

const store = createCollection({
  table: 'tasks',
  key: 'tasks',
  toRow: (t) => ({ id: t.id, text: t.text, done: t.done, created_at: new Date(t.created ?? 0).toISOString() }),
  fromRow: (r) => ({ id: r.id, text: r.text, done: r.done, created: Date.parse(r.created_at) }),
  order: { column: 'created_at', ascending: false },
});

// Let the dashboard (sticky note) know when the list changes.
store.subscribe(() => window.dispatchEvent(new Event('badges-changed')));

// Tasks saved before sync existed have no `created`; treat them as oldest.
const sorted = () => [...store.all()].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));

export default {
  id: 'tasks',
  name: 'Tasks',
  icon: '✅',
  color: '#10b981',
  size: { w: 420, h: 520 },

  // On the dashboard's sticky note: everything not done yet, oldest first; tick to finish.
  todos: () => sorted().filter((t) => !t.done).reverse().map((t) => ({
    id: t.id,
    text: t.text,
    done: () => store.upsert({ ...store.get(t.id) ?? t, done: true }),
  })),

  mount(root) {
    let filter = 'all';

    const input = h('input', { class: 'input', placeholder: 'Add a task…', enterkeyhint: 'done', 'aria-label': 'New task' });
    const list = h('ul', { class: 'task-items' });
    const footer = h('div', { class: 'tasks-footer' });

    function add(event) {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      store.upsert({ id: uid(), text, done: false, created: Date.now() });
      input.value = '';
      render();
    }

    function render() {
      const tasks = sorted();
      const shown = tasks.filter((t) => filter === 'all' || (filter === 'done') === t.done);
      list.replaceChildren(...shown.map((task) => h('li', { class: task.done ? 'done' : '' },
        h('label', {},
          h('input', { type: 'checkbox', checked: task.done, onchange: () => { store.upsert({ ...task, done: !task.done }); render(); } }),
          h('span', {}, task.text)),
        h('button', { class: 'icon-btn', 'aria-label': 'Delete task', onclick: () => { store.remove(task.id); render(); } }, '✕'))));
      if (!shown.length) {
        list.append(h('li', { class: 'empty muted' }, filter === 'done' ? 'Nothing completed yet' : 'Nothing to do — add a task above'));
      }

      const left = tasks.filter((t) => !t.done).length;
      footer.replaceChildren(
        h('span', { class: 'muted' }, `${left} left`),
        h('div', { class: 'seg' }, ...Object.entries(FILTERS).map(([key, label]) =>
          h('button', { class: key === filter ? 'on' : '', onclick: () => { filter = key; render(); } }, label))),
        h('button', {
          class: 'btn ghost',
          onclick: () => { tasks.filter((t) => t.done).forEach((t) => store.remove(t.id)); render(); },
        }, 'Clear done'),
      );
    }

    root.append(h('div', { class: 'app tasks' },
      h('form', { class: 'row', onsubmit: add }, input, h('button', { class: 'btn primary' }, 'Add')),
      list,
      footer));
    render();
    return store.subscribe(render);
  },
};
