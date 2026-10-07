/* =========================================================
   Rebote Cromático — service worker
   Guarda todos los archivos para jugar sin conexión.
   Para publicar una actualización: sube VERSION_CACHE (y VERSION
   en game.js).
   ========================================================= */

const VERSION_CACHE = 'rebote-cromatico-v10';

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

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSION_CACHE)
      .then((cache) => cache.addAll(ARCHIVOS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

// Borra solo las cachés viejas de ESTE juego (el sitio tiene varios juegos)
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((c) => c.startsWith('rebote-cromatico-') && c !== VERSION_CACHE).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

// Primero la caché: carga al instante y funciona sin conexión
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
      if (peticion.mode === 'navigate') {
        const inicio = await caches.match('./index.html');
        if (inicio) return inicio;
      }
      return Response.error();
    }
  })());
});
