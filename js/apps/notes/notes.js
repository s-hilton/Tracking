// Notes app. Self-contained: this folder + supabase/migrations/*_notes.sql.
import { uid } from '../../storage.js';
import { h, loadStyles } from '../../ui.js';
import { createCollection } from '../../cloud.js';

loadStyles(new URL('./notes.css', import.meta.url));

const WELCOME = {
  title: 'Welcome 👋',
  body: 'This is your dashboard.\n\n• Tap an icon to open an app\n• Drag windows by their title bar (desktop)\n• Add your favourite websites in Settings → Web apps\n• Sign in under Settings → Account to sync across devices\n• Install it from Settings → Install to use it like a real app',
};

const store = createCollection({
  table: 'notes',
  key: 'notes',
  fallback: [{ id: uid(), ...WELCOME, updated: Date.now() }],
  toRow: (n) => ({ id: n.id, title: n.title, body: n.body, updated_at: new Date(n.updated).toISOString() }),
  fromRow: (r) => ({ id: r.id, title: r.title, body: r.body, updated: Date.parse(r.updated_at) }),
  order: { column: 'updated_at', ascending: false },
});

const sorted = () => [...store.all()].sort((a, b) => b.updated - a.updated);

export default {
  id: 'notes',
  name: 'Notes',
  icon: '📝',
  color: '#f59e0b',
  size: { w: 680, h: 460 },

  mount(root) {
    let currentId = sorted()[0]?.id;

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
      const note = store.get(currentId);
      if (!note) return;
      store.upsert({ ...note, ...patch, updated: Date.now() });
      renderList();
    }

    function select(id) {
      currentId = id;
      const note = store.get(id);
      title.value = note?.title ?? '';
      body.value = note?.body ?? '';
      editor.hidden = !note;
      empty.hidden = !!note;
      renderList();
    }

    function create() {
      const note = { id: uid(), title: '', body: '', updated: Date.now() };
      store.upsert(note);
      select(note.id);
      app.classList.add('editing');
      title.focus();
    }

    function removeCurrent() {
      if (!store.get(currentId) || !confirm('Delete this note?')) return;
      store.remove(currentId);
      select(sorted()[0]?.id);
      app.classList.remove('editing');
    }

    function renderList() {
      list.replaceChildren(...sorted().map((note) => h('li', {},
        h('button', {
          class: `notes-item${note.id === currentId ? ' active' : ''}`,
          onclick: () => { select(note.id); app.classList.add('editing'); },
        },
        h('strong', {}, note.title || 'Untitled'),
        h('span', { class: 'muted' }, note.body.split('\n').find((line) => line.trim()) || 'No text'),
        h('small', { class: 'muted' }, new Date(note.updated).toLocaleDateString())))));
    }

    // Data arrived from another device: refresh, but don't clobber what's being typed.
    const unsubscribe = store.subscribe(() => {
      const typing = root.contains(document.activeElement) && store.get(currentId);
      if (typing) renderList();
      else select(store.get(currentId) ? currentId : sorted()[0]?.id);
    });

    root.append(app);
    select(currentId);
    return unsubscribe;
  },
};
