# Rebote Cromático

Rompebloques para jugar en el teléfono en vertical con un dedo. PWA estática: HTML, CSS y JavaScript puro, sin backend.

- **Cuadrados independientes:** entran de 3 en 3 (línea horizontal, línea vertical o "L" en 4 orientaciones) con el mismo color inicial, pero cada cuadrado es un objeto aparte: tiene su propia resistencia, recibe sus propios golpes y se destruye solo.
- **Resistencia por color, sin números.** Los golpes que faltan van del 10 al 1:

  | 10 | 9 | 8 | 7 | 6 | 5 | 4 | 3 | 2 | 1 |
  |---|---|---|---|---|---|---|---|---|---|
  | negro | morado | azul | celeste | verde | amarillo | naranja | rojo | rosa | blanco |

  Hay una opción de marcas (puntos) para daltonismo, en el inicio y en la pausa.
- **30 colores para dibujar (modo Figuras):** cada resistencia tiene 3 tonos que valen lo mismo, y al recibir un golpe el cuadro conserva su tono (un vino pasa a fucsia y luego a gris).

  | Golpes | Claro | Normal | Oscuro |
  |---|---|---|---|
  | 1 | crema `b` | blanco `B` | gris `1` |
  | 2 | rosa pálido `p` | rosa `P` | fucsia `2` |
  | 3 | coral `r` | rojo `R` | vino `3` |
  | 4 | piel `o` | naranja `O` | café `4` |
  | 5 | limón `y` | amarillo `Y` | dorado `5` |
  | 6 | menta `v` | verde `V` | bosque `6` |
  | 7 | cielo `c` | celeste `C` | turquesa `7` |
  | 8 | azul claro `a` | azul `A` | marino `8` |
  | 9 | lavanda `m` | morado `M` | uva `9` |
  | 10 | carbón `n` | negro `N` | negro puro `0` |

  En las capas de una figura puedes poner el código (`l: '4'`) o el nombre (`l: 'café'`).
- **Dos modos de juego:**
  - 🧱 **Muro:** cada cierto tiempo entra una fila por arriba y todo baja una celda. Si un cuadro toca la línea límite, se acaba la partida. Si el campo queda vacío, hay bono y entran 3 filas.
  - 🖼️ **Figuras:** cuadros de 1/6 de celda (60 columnas) que forman un dibujo definido que no baja. Al romper toda la figura hay bono (+1,000 pts y +30 monedas) y sigue la próxima.
    - **Línea metálica:** debajo de cada figura hay una línea gris de bloques que **no se rompen**, con compuertas blancas (3 en las primeras figuras y 2 en las difíciles). Rompe una compuerta para meter la pelota.
    - **Salpicadura:** cada rebote golpea todos los cuadros en un radio pequeño. Puntos y monedas se reparten según el tamaño del cuadro.
    - **Limpieza final:** cuando queda menos del 3 % de la figura, el resto se rompe solo.
    - **Elige la figura:** "Elegir figura" abre un selector con miniaturas, dificultad en estrellas y una ✓ en las que ya completaste. Al terminar una figura sigue la próxima de su grupo, y después se repite el grupo con la pelota más rápida.
    - **Clásicas (10):** Estrella, Cohete, Corazón, Hongo, Pez, Flor, Casa, Gato, Corona y Robot.
    - **Halloween 🎃 (6):** Fantasma, Calavera, Araña, Calabaza, Sombrero de bruja y Murciélago.
    - Dentro de cada grupo se ordenan solas de menos a más golpes. Para agregar un grupo nuevo, súmalo a `GRUPOS_FIGURAS` y ponle `grupo: 'su-id'` a sus figuras.
    - En este modo el poder ❄️ "Congelar muro" se vuelve 🐢 "Cámara lenta".
    - **Para agregar o cambiar figuras**, edita `FIGURAS` en `game.js`. Se describen con formas (círculos, elipses, polígonos, rectángulos…) sobre un lienzo de 60 × 48, con una letra de color (resistencia) por capa.
    - **Para ajustar este modo** usa `figRadioGolpe`, `figAnchoCompuerta`, `figLetraCompuerta`, `figCompuertas` y `figLimpiezaFinal` en `DIFICULTAD`.
- **Monedas:** solo duran la partida. Se gastan en 5 poderes: barra ancha, multipelota, pelota de fuego, congelar muro y escudo. Cada compra sube el precio 20 %.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | HUD, campo, tienda, barra de pausa y pantallas |
| `style.css` | Tema oscuro, tienda con cuenta regresiva circular, áreas seguras |
| `game.js` | Todo el juego: muro, física, tienda, dibujo, controles, sonido, tutorial |
| `manifest.webmanifest` | Datos para instalarla como app |
| `sw.js` | Caché sin conexión (con número de versión) |
| `icons/` | Iconos de 192 y 512 px |

## Ajustar el juego

Al inicio de `game.js` están estas tablas:

- `PODERES`: precio, duración y tecla de cada poder.
- `AUMENTO_PRECIO`: cuánto sube el precio con cada compra.
- `DIFICULTAD`: velocidad de la pelota, ritmo del muro, filas por nivel, densidad y bono de campo vacío.
- `ESCALA`: los colores de la resistencia.

## Controles

- **Teléfono:** desliza por el campo para mover la barra y suelta para lanzar. Los botones de la tienda responden aunque otro dedo esté moviendo la barra.
- **Computadora:** ratón o flechas para la barra, espacio para lanzar, teclas 1 a 5 para comprar y P o Esc para pausa.

## Probar en local

Desde la carpeta de todos los juegos:

```bash
npx http-server . -p 5210 -c-1
```

Abre `http://localhost:5210/rebote-cromatico/`, o entra desde el menú en `http://localhost:5210`.

## Publicar

Este juego va dentro del sitio de todos los juegos: lee el `README.md` de la carpeta principal. Para publicar una actualización, sube `VERSION_CACHE` en `sw.js` y `VERSION` en `game.js`.
