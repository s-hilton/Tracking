import { load, save, uid } from '../storage.js';
import { h } from '../ui.js';

const WELCOME = {
  title: 'Welcome 👋',
  body: 'This is your dashboard.\n\n• Tap an icon to open an app\n• Drag windows by their title bar (desktop)\n• Add your favourite websites in Settings → Web apps\n• Install it from Settings → Install to use it like a real app',
};

export default {
  id: 'notes',
  name: 'Notes',
  icon: '📝',
  color: '#f59e0b',
  size: { w: 680, h: 460 },

  mount(root) {
    let notes = load('notes', null) ?? [{ id: uid(), ...WELCOME, updated: Date.now() }];
    let currentId = notes[0]?.id;

    const persist = () => save('notes', notes);
    const current = () => notes.find((n) => n.id === currentId);

    const list = h('ul', { class: 'notes-list' });
    const title = h('input', { class: 'notes-title', placeholder: 'Title', oninput: () => update({ title: title.value }) });
    const body = h('textarea', { class: 'notes-body', placeholder: 'Start writing…', oninput: () => update({ body: body.value }) });
    const editor = h('div', { class: 'notes-editor' },
      h('div', { class: 'notes-toolbar' },
        h('button', { class: 'btn ghost notes-back', onclick: () => app.classList.remove('editing') }, '‹ Notes'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn ghost danger', onclick: removeCurrent }, 'Delete')),
      title,
      body);
    const empty = h('div', { class: 'notes-empty muted' }, 'Create a note to get started');
    const app = h('div', { class: 'app notes' },
      h('aside', { class: 'notes-side' },
        h('button', { class: 'btn primary', onclick: create }, '+ New note'),
        list),
      editor,
      empty);

    function update(patch) {
      const note = current();
      if (!note) return;
      Object.assign(note, patch, { updated: Date.now() });
      notes.sort((a, b) => b.updated - a.updated);
      persist();
      renderList();
    }

    function select(id) {
      currentId = id;
      const note = current();
      title.value = note?.title ?? '';
      body.value = note?.body ?? '';
      editor.hidden = !note;
      empty.hidden = !!note;
      renderList();
    }

    function create() {
      const note = { id: uid(), title: '', body: '', updated: Date.now() };
      notes.unshift(note);
      persist();
      select(note.id);
      app.classList.add('editing');
      title.focus();
    }

    function removeCurrent() {
      if (!current() || !confirm('Delete this note?')) return;
      notes = notes.filter((n) => n.id !== currentId);
      persist();
      select(notes[0]?.id);
      app.classList.remove('editing');
    }

    function renderList() {
      list.replaceChildren(...notes.map((note) => h('li', {},
        h('button', {
          class: `notes-item${note.id === currentId ? ' active' : ''}`,
          onclick: () => { select(note.id); app.classList.add('editing'); },
        },
        h('strong', {}, note.title || 'Untitled'),
        h('span', { class: 'muted' }, note.body.split('\n').find((line) => line.trim()) || 'No text'),
        h('small', { class: 'muted' }, new Date(note.updated).toLocaleDateString())))));
    }

    root.append(app);
    select(currentId);
  },
};
