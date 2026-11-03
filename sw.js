// Offline cache for the app shell. Bump VERSION (and src/version.js) on every
// release: a new VERSION installs a new cache and the page offers «Обновить».
const VERSION = '1.0.0';
const CACHE = `cashback-${VERSION}`;
const CACHE_PREFIX = 'cashback-';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './src/app.js',
  './src/version.js',
  './src/core/limits.js',
  './src/core/match.js',
  './src/core/months.js',
  './src/core/rank.js',
  './src/core/state.js',
  './src/data/banks.js',
  './src/data/mcc-groups.js',
  './src/data/stores.js',
  './src/ui/backup.js',
  './src/ui/banks.js',
  './src/ui/categories.js',
  './src/ui/format.js',
  './src/ui/more.js',
  './src/ui/pick.js',
  './src/ui/router.js',
  './src/ui/store-editor.js',
  './src/ui/store.js',
  './src/ui/stores.js',
  './src/ui/updates.js',
];

// cache: 'reload' bypasses the HTTP cache (GitHub Pages sends max-age=600),
// so a new version never installs stale files.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then((cached) => cached ?? fetch(request)));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
});
