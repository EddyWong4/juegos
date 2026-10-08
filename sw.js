/* =========================================================
   Service worker del menú principal.
   Guarda el menú y los juegos de un solo archivo para abrirlos sin
   conexión. Los juegos en carpeta (Bloque Diario, Lluvia de Letras,
   Banda de Colores) tienen su propio service worker, que tiene
   prioridad sobre este dentro de su carpeta.
   Primero intenta la red (así se ven los cambios al momento) y, si no
   hay conexión, usa la copia guardada.
   Al agregar un juego, súmalo a ARCHIVOS y sube VERSION_CACHE.
   ========================================================= */

const VERSION_CACHE = 'menu-juegos-v5';

const ARCHIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './tetris.html',
  './loteria.html',
  './logica.html',
  './matematicas.html',
  './bloque-diario/icons/icon-192.png',
  './lluvia-letras/icons/icon-192.png',
  './banda-colores/icons/icon-192.png',
  './rebote-cromatico/icons/icon-192.png',
  './qr-studio/icons/icon-192.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSION_CACHE)
      .then((cache) => cache.addAll(ARCHIVOS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

// Borra solo las cachés viejas del menú (no las de cada juego)
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((c) => c.startsWith('menu-juegos-') && c !== VERSION_CACHE).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET' || new URL(peticion.url).origin !== self.location.origin) return;
  evento.respondWith((async () => {
    try {
      const respuesta = await fetch(peticion);
      if (respuesta.ok) {
        const cache = await caches.open(VERSION_CACHE);
        cache.put(peticion, respuesta.clone());
      }
      return respuesta;
    } catch (error) {
      const guardada = await caches.match(peticion, { ignoreSearch: true });
      if (guardada) return guardada;
      if (peticion.mode === 'navigate') {
        const menu = await caches.match('./index.html');
        if (menu) return menu;
      }
      return Response.error();
    }
  })());
});
