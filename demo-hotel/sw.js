const VERSION = 'demo-feb4de1ad6';
const SHELL_CACHE = `shell-${VERSION}`;
const API_CACHE = 'api';
const SHELL = ['./', 'index.html', 'app.js', 'util.js', 'calendar.js', 'day.js', 'admin.js', 'viewer.js', 'media-admin.js', 'stay.js', 'zoom.js', 'styles.css',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'logo-claro.svg', 'logo-oscuro.svg', 'demo-api.js', 'lib/store.js', 'lib/dates.js', 'lib/reports.js', 'lib/mock.js', 'lib/shim-fs.js', 'lib/shim-path.js', 'reserva.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== API_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // Datos del personal (nombres, saldos): siempre de la red y nunca guardados en el dispositivo.
  if (url.pathname.includes('/api/staff/')) return;

  // Disponibilidad: primero la red; sin conexión, la última respuesta guardada.
  if (url.pathname.includes('/api/')) {
    event.respondWith((async () => {
      const cache = await caches.open(API_CACHE);
      try {
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      } catch (err) {
        const cached = await cache.match(request) ?? await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        throw err;
      }
    })());
    return;
  }

  // Navegación: la app siempre abre, aunque no haya conexión.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('index.html')));
    return;
  }

  // Archivos de la app: red primero (siempre la versión nueva); sin conexión, la guardada.
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    try {
      const res = await fetch(request);
      if (res.ok) cache.put(request, res.clone());
      return res;
    } catch (err) {
      const cached = await cache.match(request);
      if (cached) return cached;
      throw err;
    }
  })());
});
