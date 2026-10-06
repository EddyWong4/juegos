# Banda de Colores

Puzzle de banda transportadora para jugar en el teléfono con un pulgar, solo con toques. PWA estática: HTML, CSS y JavaScript puro, sin backend.

- La banda tiene 12 espacios y los bloques dan vueltas sin parar. Toca un bloque y vuela al pedido de su color. Si ningún pedido es de ese color, va a la zona de espera (3 espacios).
- Pierdes si la banda está llena cuando debe entrar un bloque, si un bloque debe ir a la zona de espera y está llena, o si se juntan más de 3 bloques en fila en la entrada (el reloj de entrada no se detiene aunque la entrada esté ocupada).
- El ritmo se ajusta en `DIFICULTAD`, al inicio de `game.js`: empieza a 0.85 espacios/s con un bloque cada 1.6 s.
- **Clásico**: sin fin hasta perder.
- **Diario**: la semilla es la fecha local `AAAAMMDD` (mulberry32) y solo cuenta un intento.
- Funciona sin conexión después de la primera visita.

## Monedas y mejoras (v2)

Se usan **monedas del juego**; no hay dinero real.

- **Cómo se ganan:** 1 por pedido (más con combo) y 1 por cada 40 puntos. También salen del **regalo diario**, que crece si lo abres días seguidos, y de **3 misiones diarias**, iguales para todos.
- **Taller:** 7 mejoras permanentes (freno, bono de pedido, combo paciente, imán de monedas, más arcoíris, zona de espera grande y banda más larga) y 3 poderes de un solo uso:
  - ❄️ Congelar
  - 🧹 Barredora
  - 💖 Segunda oportunidad
- **Durante la partida:** los poderes se usan desde la barra de abajo. Si no te quedan, el botón muestra su precio y lo compra al tocarlo.
- **Reto diario:** no usa mejoras ni poderes para que sea justo comparar puntajes, pero paga **el doble de monedas**.

Los precios y efectos están en `MEJORAS`, `OBJETOS` y `MISIONES`, al inicio de `game.js`.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | HUD, canvas, tutorial, barra inferior y pantallas (inicio, pausa, resultado) |
| `style.css` | Tema oscuro, áreas seguras, bloqueo de zoom y scroll |
| `game.js` | Todo el juego: motor de la banda y los pedidos, dibujo, toques, sonido, tutorial, guardado |
| `manifest.webmanifest` | Datos para instalarla como app |
| `sw.js` | Caché sin conexión (con número de versión) |
| `icons/` | Iconos de 192 y 512 px |

## Ajustar la dificultad

Al inicio de `game.js` están `velocidad(nivel)`, `intervalo(nivel)` y `coloresEnNivel(nivel)`. **Ojo:** si los cambias, también cambian los retos diarios de todos.

## Probar en local

Desde la carpeta de todos los juegos:

```bash
npx http-server . -p 5210 -c-1
```

Abre `http://localhost:5210/banda-colores/`, o entra desde el menú en `http://localhost:5210`.

## Publicar

Este juego va dentro del sitio de todos los juegos: lee el `README.md` de la carpeta principal. Para publicar una actualización, sube `VERSION_CACHE` en `sw.js` y `VERSION` en `game.js`.
