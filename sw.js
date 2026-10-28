// Offline support: always fetch the latest files, fall back to the cache when offline.
// Bump VERSION when you deploy so old caches are cleaned up.
const VERSION = 'v23';
const CACHE = `webtop-${VERSION}`;

// Core files are cached up front; app files (js/apps/**) are cached the
// first time they load, so adding or removing an app needs no change here.
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/main.js',
  'js/wm.js',
  'js/ui.js',
  'js/storage.js',
  'js/prefs.js',
  'js/pwa.js',
  'js/config.js',
  'js/cloud.js',
  'js/settings-sections.js',
  'js/account.js',
  'js/todos.js',
  'js/intents.js',
  'js/apps/index.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('webtop-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first, so a normal reload always shows the latest published version;
// the cache is only used when offline. `no-cache` makes the browser check with
// the server instead of reusing a stale copy from the browser's HTTP cache.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request, { cache: 'no-cache' });
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch {
      const cached = await cache.match(request, { ignoreSearch: true })
        ?? (request.mode === 'navigate' ? await cache.match('index.html') : undefined);
      return cached ?? Response.error();
    }
  })());
});
