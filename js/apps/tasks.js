import { load, save, uid } from '../storage.js';
import { h } from '../ui.js';

const FILTERS = { all: 'All', active: 'Active', done: 'Done' };

export default {
  id: 'tasks',
  name: 'Tasks',
  icon: '✅',
  color: '#10b981',
  size: { w: 420, h: 520 },

  mount(root) {
    let tasks = load('tasks', []);
    let filter = 'all';

    const input = h('input', { class: 'input', placeholder: 'Add a task…', enterkeyhint: 'done', 'aria-label': 'New task' });
    const list = h('ul', { class: 'task-items' });
    const footer = h('div', { class: 'tasks-footer' });

    const persist = () => { save('tasks', tasks); render(); };

    function add(event) {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      tasks.unshift({ id: uid(), text, done: false });
      input.value = '';
      persist();
    }

    function render() {
      const shown = tasks.filter((t) => filter === 'all' || (filter === 'done') === t.done);
      list.replaceChildren(...shown.map((task) => h('li', { class: task.done ? 'done' : '' },
        h('label', {},
          h('input', { type: 'checkbox', checked: task.done, onchange: () => { task.done = !task.done; persist(); } }),
          h('span', {}, task.text)),
        h('button', { class: 'icon-btn', 'aria-label': 'Delete task', onclick: () => { tasks = tasks.filter((t) => t !== task); persist(); } }, '✕'))));
      if (!shown.length) {
        list.append(h('li', { class: 'empty muted' }, filter === 'done' ? 'Nothing completed yet' : 'Nothing to do — add a task above'));
      }

      const left = tasks.filter((t) => !t.done).length;
      footer.replaceChildren(
        h('span', { class: 'muted' }, `${left} left`),
        h('div', { class: 'seg' }, ...Object.entries(FILTERS).map(([key, label]) =>
          h('button', { class: key === filter ? 'on' : '', onclick: () => { filter = key; render(); } }, label))),
        h('button', { class: 'btn ghost', onclick: () => { tasks = tasks.filter((t) => !t.done); persist(); } }, 'Clear done'),
      );
    }

    root.append(h('div', { class: 'app tasks' },
      h('form', { class: 'row', onsubmit: add }, input, h('button', { class: 'btn primary' }, 'Add')),
      list,
      footer));
    render();
  },
};
