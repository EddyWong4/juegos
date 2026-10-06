# Bloque Diario

Puzzle de bloques 8×8 para jugar en el teléfono con un dedo. PWA estática: HTML, CSS y JavaScript puro, sin backend.

- **Reto diario**: la semilla es la fecha local `AAAAMMDD` (generador mulberry32). Todos reciben las mismas piezas ese día y solo cuenta un intento.
- **Práctica**: semilla aleatoria, intentos ilimitados. Al compartir se genera un enlace de reto `?seed=XXXX&score=YYYY`.
- Funciona sin conexión después de la primera visita.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Estructura: HUD, canvas, pantallas de inicio y resultado |
| `style.css` | Tema oscuro, áreas seguras, bloqueo de zoom/scroll |
| `game.js` | Todo el juego: piezas, semilla, reglas, dibujo, controles, sonido, guardado |
| `manifest.webmanifest` | Datos para instalarla como app |
| `sw.js` | Caché sin conexión (con número de versión) |
| `icons/` | Iconos de 192 y 512 px |

## Probar en local

Necesita `http://localhost` (con `file://` no funciona el service worker):

```bash
npx http-server bloque-diario -p 5200 -c-1
```

Abre `http://localhost:5200`. Para probarlo en el teléfono dentro de la misma red Wi-Fi, usa la IP de la computadora (el modo sin conexión solo funciona en `localhost` o `https`).

## Publicar en GitHub Pages

1. Crea un repositorio (por ejemplo `bloque-diario`) y sube el contenido de esta carpeta a la raíz.
2. En el repositorio: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
3. Queda en `https://TU-USUARIO.github.io/bloque-diario/`.

## Publicar una actualización

Cambia `VERSION_CACHE` en `sw.js` (por ejemplo `bloque-diario-v2`) y `VERSION` en `game.js`. Si no cambias la versión, los jugadores seguirán viendo la versión guardada en caché.
