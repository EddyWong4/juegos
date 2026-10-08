/* =========================================================
   QR Studio — service worker
   Guarda la app en caché para que funcione sin internet.
   Al publicar cambios, sube VERSION_CACHE para que los
   dispositivos descarguen la versión nueva.
   ========================================================= */
const VERSION_CACHE = 'qr-studio-v3';

// Archivos que forman la app (rutas relativas a la carpeta del sw.js)
const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './vendor/qr-code-styling.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

// Instalación: descarga y guarda todos los archivos
self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(VERSION_CACHE).then((cache) => cache.addAll(ARCHIVOS)));
});

// Activación: borra cachés de versiones anteriores
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c.startsWith('qr-studio-') && c !== VERSION_CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

// La página pide activar la versión nueva cuando el usuario toca "Actualizar"
self.addEventListener('message', (evento) => {
  if (evento.data === 'ACTUALIZAR') self.skipWaiting();
});

// Peticiones: primero la caché; si no está, la red (y se guarda la copia)
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
        // Sin conexión: para navegación se entrega la app
        if (peticion.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
