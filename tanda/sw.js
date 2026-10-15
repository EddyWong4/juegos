/* =========================================================
   Tanda Fácil — service worker
   Guarda la app en caché para que funcione sin internet.
   Al publicar cambios, sube VERSION_CACHE para que los
   dispositivos descarguen la versión nueva.
   ========================================================= */
const VERSION_CACHE = 'tanda-v9';

const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './logica.js',
  './almacen.js',
  './compartir.js',
  './manifest.json',
  './fonts/caveat-latin-400-normal.woff2',
  './fonts/caveat-latin-700-normal.woff2',
  './fonts/dm-serif-display-latin-400-normal.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(VERSION_CACHE).then((cache) => cache.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c.startsWith('tanda-') && c !== VERSION_CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

// Primero la caché; si no está, la red (y se guarda la copia)
self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET' || new URL(peticion.url).origin !== self.location.origin) return;

  evento.respondWith(
    caches.match(peticion, { ignoreSearch: peticion.mode === 'navigate' }).then((enCache) => {
      if (enCache) return enCache;
      return fetch(peticion).then((respuesta) => {
        if (respuesta.ok && respuesta.type === 'basic') {
          const copia = respuesta.clone();
          caches.open(VERSION_CACHE).then((cache) => cache.put(peticion, copia));
        }
        return respuesta;
      }).catch(() => {
        if (peticion.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
