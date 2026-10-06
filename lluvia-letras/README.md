# Lluvia de Letras

Puzzle de letras que caen, para jugar en el teléfono con un dedo. PWA estática: HTML, CSS y JavaScript puro, sin backend.

- Tablero de 6×9. Mueve la letra a una columna y forma palabras de 3 letras o más, en horizontal (izquierda a derecha) o en vertical (de arriba a abajo).
- **Clásico**: letras aleatorias, sin fin hasta perder.
- **Diario**: la semilla es la fecha local `AAAAMMDD` (mulberry32). Todos reciben las mismas letras y solo cuenta un intento.
- Funciona sin conexión después de la primera visita.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | HUD, canvas, barra inferior y pantallas (inicio, pausa, resultado) |
| `style.css` | Tema oscuro, áreas seguras, bloqueo de zoom y scroll |
| `game.js` | Todo el juego: letras, diccionario, motor de palabras y cadenas, dibujo, controles, sonido, guardado |
| `palabras.txt` | Diccionario: una palabra por línea |
| `manifest.webmanifest` | Datos para instalarla como app |
| `sw.js` | Caché sin conexión (con número de versión) |
| `icons/` | Iconos de 192 y 512 px |

## Controles

- **Teléfono**: toca una columna o desliza a los lados para mover la letra. Desliza hacia abajo o toca dos veces para soltarla.
- **Computadora**: ← → para mover, ↓ o espacio para soltar, P o Esc para pausa. El ratón funciona igual que el dedo.

## Cambiar el diccionario

Reemplaza `palabras.txt` por otra lista, con una palabra por línea. Puedes escribirlas con acentos y en minúsculas. Al cargarlas, el juego:

- las pasa a mayúsculas y les quita los acentos (conserva la Ñ);
- descarta las que no tengan de 3 a 6 letras o que lleven puntos, números o guiones (como las abreviaturas);
- descarta las que empiezan con mayúscula, porque las toma como nombres propios. Este filtro solo se aplica si la mayoría de la lista viene en minúsculas;
- ignora las líneas que empiezan con `#`.

**Después de cambiar la lista, sube la versión de caché en `sw.js`**. Si no, los jugadores seguirán usando la lista anterior.

## Probar en local

```bash
npx http-server lluvia-letras -p 5205 -c-1
```

Abre `http://localhost:5205`. Necesita `http://localhost` o `https://`: con `file://` no se puede leer `palabras.txt` ni funciona el modo sin conexión.

## Publicar en GitHub Pages

1. Sube el contenido de esta carpeta a la raíz de un repositorio (por ejemplo `lluvia-letras`).
2. **Settings → Pages → Deploy from a branch → `main` / `(root)`**.
3. Queda en `https://TU-USUARIO.github.io/lluvia-letras/`.

Si publicas varios juegos con el mismo usuario de GitHub, todos comparten el dominio `TU-USUARIO.github.io`. Por eso este juego guarda sus datos con el prefijo `lluvia_` y su caché con el prefijo `lluvia-letras-`: así no choca con los otros juegos.

## Publicar una actualización

Cambia `VERSION_CACHE` en `sw.js` (por ejemplo `lluvia-letras-v2`) y `VERSION` en `game.js`.
