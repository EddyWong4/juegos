/* =========================================================
   Tanda Fácil — service worker
   Guarda la app en caché para que funcione sin internet.
   Al publicar cambios, sube VERSION_CACHE para que los
   dispositivos descarguen la versión nueva: la app les
   muestra el aviso «Hay una versión nueva».
   ========================================================= */
const VERSION_CACHE = 'tanda-v14';

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

// Instalación: descarga los archivos sin usar la caché HTTP del navegador
// (si no, la versión nueva podría guardar archivos viejos). La versión nueva
// queda esperando hasta que la persona toque «Actualizar» en el aviso.
self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(VERSION_CACHE).then((cache) =>
    cache.addAll(ARCHIVOS.map((url) => new Request(url, { cache: 'reload' })))));
});

// La página pide activar la versión nueva cuando se toca «Actualizar»
self.addEventListener('message', (evento) => {
  if (evento.data === 'ACTUALIZAR') self.skipWaiting();
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
