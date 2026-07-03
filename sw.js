// MuscuLog — service worker : cache-first pour un fonctionnement 100 % hors-ligne.
// Incrémenter CACHE à chaque déploiement pour invalider l'ancien cache.

const CACHE = 'musculog-v1';

const FICHIERS = [
  '.',
  'index.html',
  'styles.css',
  'app.js',
  'store.js',
  'sync.js',
  'timer.js',
  'manifest.json',
  'fonts/Barlow-400.woff2',
  'fonts/Barlow-500.woff2',
  'fonts/Barlow-600.woff2',
  'fonts/BarlowCondensed-600.woff2',
  'fonts/BarlowCondensed-700.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  // L'API GitHub ne passe jamais par le cache
  if (url.origin !== location.origin) return;
  ev.respondWith(
    caches.match(ev.request, { ignoreSearch: true }).then((rep) => rep || fetch(ev.request))
  );
});
