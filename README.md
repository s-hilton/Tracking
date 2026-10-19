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

All data stays in the browser's local storage on that device.

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

```
index.html              page shell (desktop, taskbar, launcher, switcher)
manifest.webmanifest    PWA metadata (name, icons, colours)
sw.js                   service worker (offline cache)
css/styles.css          all styles; theme tokens at the top
js/main.js              wires up icons, taskbar, launcher, switcher, session restore
js/wm.js                window manager (open/focus/drag/resize/min/max/close)
js/apps/index.js        app registry
js/apps/*.js            one file per app
js/links.js             saved website links (web apps)
js/prefs.js             theme / wallpaper / accent settings
js/storage.js           localStorage helpers
js/ui.js                tiny DOM helper
icons/                  app icons
```

## Adding your own app

Create `js/apps/myapp.js`:

```js
import { h } from '../ui.js';

export default {
  id: 'myapp',
  name: 'My App',
  icon: '🚀',            // any emoji
  color: '#8b5cf6',      // icon background
  size: { w: 500, h: 400 },

  // root is the window's content area. Return a function to clean up (timers etc.) on close.
  mount(root, ctx) {
    root.append(h('div', { class: 'app', style: 'padding:16px' }, 'Hello!'));
  },
};
```

Then import it and add it to `BUILT_IN` in `js/apps/index.js`. If you want it to work offline, also add the file to `SHELL` in `sw.js`. `ctx` gives you `ctx.open(appId)`, `ctx.close()` and `ctx.setTitle(text)`.

## Turning it into a store app later

The code is plain web code, so you can wrap it without rewriting anything:

- **[PWABuilder](https://www.pwabuilder.com/):** paste your deployed URL to generate Android (Play Store), Windows (Microsoft Store) and iOS packages.
- **[Capacitor](https://capacitorjs.com/):** wraps the folder as native iOS/Android projects and gives you access to native APIs (notifications, files, camera).
- **[Tauri](https://tauri.app/) / Electron:** desktop apps for Windows, macOS and Linux.

To rename the dashboard, change "Webtop" in `index.html` and `manifest.webmanifest`.
