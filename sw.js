// Offline support: serve the app shell from cache, refresh it in the background.
// Bump VERSION when you deploy so old caches are cleaned up.
const VERSION = 'v1';
const CACHE = `webtop-${VERSION}`;

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
  'js/links.js',
  'js/apps/index.js',
  'js/apps/notes.js',
  'js/apps/tasks.js',
  'js/apps/calculator.js',
  'js/apps/clock.js',
  'js/apps/settings.js',
  'js/apps/webapp.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('webtop-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true })
      ?? (request.mode === 'navigate' ? await cache.match('index.html') : undefined);
    const network = fetch(request)
      .then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
      .catch(() => cached);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    return network;
  })());
});
