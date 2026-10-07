/* =========================================================
   Bloque Diario — service worker
   Guarda todos los archivos en caché para jugar sin conexión.
   Para publicar una actualización: cambia VERSION_CACHE (y VERSION
   en game.js). Al abrir la app, el nuevo service worker descarga
   todo de nuevo y borra la caché anterior.
   ========================================================= */

const VERSION_CACHE = 'bloque-diario-v3';

// Rutas relativas: funcionan en la raíz o en una subcarpeta de GitHub Pages
const ARCHIVOS = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Instalación: descarga y guarda todos los archivos (saltando la caché HTTP)
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSION_CACHE)
      .then((cache) => cache.addAll(ARCHIVOS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

// Activación: borra las cachés de versiones anteriores
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((c) => c.startsWith('bloque-diario-') && c !== VERSION_CACHE)
          .map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

// Peticiones: primero la caché (así carga al instante y sin conexión).
// ignoreSearch hace que "./?seed=123&score=456" use la copia de "./".
self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET' || new URL(peticion.url).origin !== self.location.origin) return;

  evento.respondWith((async () => {
    const guardada = await caches.match(peticion, { ignoreSearch: true });
    if (guardada) return guardada;
    try {
      const respuesta = await fetch(peticion);
      if (respuesta.ok) {
        const cache = await caches.open(VERSION_CACHE);
        cache.put(peticion, respuesta.clone());
      }
      return respuesta;
    } catch (error) {
      // Sin conexión y sin copia: si es una página, entrega el juego
      if (peticion.mode === 'navigate') {
        const inicio = await caches.match('./index.html');
        if (inicio) return inicio;
      }
      return Response.error();
    }
  })());
});
