# Webtop

A personal dashboard that works like a desktop: tap an icon and the app opens in its own window.

- **Computer:** windows can be dragged, resized, minimized, maximized and switched from the taskbar. The windows you had open come back when you reload.
- **Phone:** you get a home screen of icons. Apps open full screen, and the bottom bar has **All apps**, **Home** and **Open apps** (switcher) buttons.
- **Installable:** it's a Progressive Web App (PWA), so it can be added to a phone home screen or installed on a computer, opens without browser chrome and keeps working offline.

## Built-in apps

| App | What it does |
| --- | --- |
| Notes | Write and keep notes |
| Tasks | To-do list with filters |
| Calculator | Basic calculator (keyboard supported) |
| Clock | Time, date and a stopwatch with laps |
| Settings | Theme, wallpaper, accent colour, web apps, install, reset |

**Web apps:** in Settings → Web apps you can add any website as its own icon, and it opens inside a window. Some sites (Google, Facebook, banks, …) refuse to be shown inside other pages. For those, use the **Open in tab** button in the window's toolbar.

Data is stored in the browser on each device. Connect **Supabase** to sign in and sync across devices, with the database managed from this GitHub repo. See **[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)** for the step-by-step guide.

## Run it locally

There's no build step, just static files. Serve the folder with any web server:

```bash
npx http-server -c-1 .     # or: python3 -m http.server 8080
```

Then open <http://localhost:8080>. To try it on your phone, open `http://<your-computer-ip>:8080` while both are on the same Wi-Fi. Offline mode and installing need HTTPS, so you'll want a deployed copy for those.

## Put it online (GitHub Pages)

1. On GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, then choose your branch and `/ (root)`.
2. Open the URL GitHub gives you on your phone or computer.
3. Install it:
   - iPhone/iPad (Safari): Share → Add to Home Screen
   - Android (Chrome): menu → Install app
   - Computer (Chrome/Edge): install icon in the address bar, or Settings → Install inside the dashboard

Any static host (Netlify, Vercel, Cloudflare Pages) works too.

When you deploy changes, bump `VERSION` in `sw.js` so installed copies pick up the new files.

## Project layout

Every app is self-contained so it can be split off later: **one folder of code + styles, and (if it stores data) one migration file**.

```
index.html                    page shell (desktop, taskbar, launcher, switcher)
manifest.webmanifest          PWA metadata (name, icons, colours)
sw.js                         service worker (offline cache)
css/styles.css                shell styles + shared buttons/inputs; theme tokens at the top
js/main.js                    wires up icons, taskbar, launcher, switcher, session restore
js/wm.js                      window manager (open/focus/drag/resize/min/max/close)
js/config.js                  Supabase URL + publishable key (empty = local-only)
js/account.js                 top bar sign-in / sign-out and the sign-in dialog
js/cloud.js                   Supabase sign-in + offline-first synced collections
js/settings-sections.js       lets apps add their own section to Settings
js/prefs.js, storage.js, ui.js, pwa.js   small shared helpers

js/apps/index.js              app registry: the one list of installed apps
js/apps/notes/                notes.js, notes.css        ⇄ supabase/migrations/*_notes.sql
js/apps/tasks/                tasks.js, tasks.css        ⇄ supabase/migrations/*_tasks.sql
js/apps/web-apps/             web-apps.js, web-apps.css  ⇄ supabase/migrations/*_web_apps.sql
js/apps/calculator/           calculator.js, calculator.css   (no data)
js/apps/clock/                clock.js, clock.css             (no data)
js/apps/settings/             settings.js, settings.css

supabase/migrations/          database tables, applied by GitHub Actions
.github/workflows/supabase.yml   the Action that applies them
```

Apps only depend on the shared helpers in `js/` (never on each other).

## Adding your own app

1. Create a folder `js/apps/habits/` with `habits.js` and `habits.css`:

```js
// js/apps/habits/habits.js
import { h, loadStyles } from '../../ui.js';
import { createCollection } from '../../cloud.js';
import { uid } from '../../storage.js';

loadStyles(new URL('./habits.css', import.meta.url));

// Optional: data that syncs to Supabase (table defined in step 3).
const store = createCollection({
  table: 'habits',
  key: 'habits',
  toRow: (x) => ({ id: x.id, name: x.name }),
  fromRow: (r) => ({ id: r.id, name: r.name }),
  order: { column: 'id', ascending: true },
});

export default {
  id: 'habits',
  name: 'Habits',
  icon: '🔥',            // any emoji
  color: '#f97316',      // icon background
  size: { w: 500, h: 400 },

  // root is the window's content area. Return a function to clean up on close.
  mount(root, ctx) {
    const render = () => root.replaceChildren(h('div', { class: 'app habits' },
      ...store.all().map((x) => h('p', {}, x.name)),
      h('button', { class: 'btn primary', onclick: () => { store.upsert({ id: uid(), name: 'New habit' }); render(); } }, 'Add')));
    render();
    return store.subscribe(render); // re-render when data arrives from another device
  },
};
```

2. Import it and add it to `APPS` in `js/apps/index.js`.
3. If it stores data, add `supabase/migrations/<timestamp>_habits.sql` (copy `…_tasks.sql` and change the columns), then merge to `main` and GitHub creates the table.

**Requiring sign-in:** add `requiresSignIn: true` next to `name`/`icon`. When someone opens the app while signed out, the dashboard's sign-in dialog appears first, and the app opens once they're signed in. Signing out closes it. Inside the app, `currentUser()` from `js/cloud.js` gives the signed-in user, and the Supabase client from `getClient()` already carries their session, so the one sign-in carries over to every app. (Without Supabase configured, apps open without sign-in.)

`ctx` gives you `ctx.open(appId)`, `ctx.close()` and `ctx.setTitle(text)`. Store methods are `all()`, `get(id)`, `upsert(item)`, `remove(id)` and `subscribe(fn)`.

**Removing / splitting off an app:** delete its line in `js/apps/index.js` and its folder. If it had a table, add a migration that drops it, or keep the migration file with the app if you're moving it to its own project.

## Turning it into a store app later

The code is plain web code, so you can wrap it without rewriting anything:

- **[PWABuilder](https://www.pwabuilder.com/):** paste your deployed URL to generate Android (Play Store), Windows (Microsoft Store) and iOS packages.
- **[Capacitor](https://capacitorjs.com/):** wraps the folder as native iOS/Android projects and gives you access to native APIs (notifications, files, camera).
- **[Tauri](https://tauri.app/) / Electron:** desktop apps for Windows, macOS and Linux.

To rename the dashboard, change "Webtop" in `index.html` and `manifest.webmanifest`.
