# Juegos

Todos los juegos en un solo menú.

**Jugar en línea:** https://eddywong4.github.io/juegos/

En el teléfono, ábrelo y usa "Agregar a pantalla de inicio" para tener todos los juegos en un solo ícono.

| Juego | Ubicación | Tipo |
|---|---|---|
| Bloque Diario | `bloque-diario/` | Reto diario, PWA propia |
| Lluvia de Letras | `lluvia-letras/` | Reto diario, PWA propia |
| Banda de Colores | `banda-colores/` | Reto diario, PWA propia |
| Rebote Cromático | `rebote-cromatico/` | Rompebloques, PWA propia |
| Tetris | `tetris.html` | Un solo archivo |
| Lotería Mexicana | `loteria.html` | Un solo archivo |
| Codi el Robot | `logica.html` | Para niños |
| Matemáticas | `matematicas.html` | Para niños |

Cada juego tiene un botón para volver al menú.

## Probar en local

```bash
npx http-server . -p 5210 -c-1
```

Abre `http://localhost:5210`.

## Publicar en GitHub Pages (un solo sitio con todo)

1. Sube a la raíz de un repositorio (por ejemplo `juegos`): `index.html`, `manifest.webmanifest`, `sw.js`, `icons/`, los juegos de un solo archivo y las carpetas `bloque-diario/`, `lluvia-letras/`, `banda-colores/` y `rebote-cromatico/`.
   No hace falta subir las herramientas (`tableros-loteria`, `copias-negocio`, `finanzas-personales`, `calendario-hotel`).
2. **Settings → Pages → Deploy from a branch → `main` / `(root)`**.
3. El menú queda en `https://TU-USUARIO.github.io/juegos/` y cada juego en su subcarpeta.

Si instalas el menú en el teléfono, aparece un solo ícono, "Juegos", desde el que se abren todos.

## Agregar un juego nuevo

1. Copia una tarjeta `<a class="juego">` en `index.html` y cambia el enlace, el ícono y el texto.
2. Agrega un regreso al menú en el juego:
   - Juego en carpeta: un enlace `<a href="../">← Todos los juegos</a>`.
   - Juego de un solo archivo: copia el bloque `#volver-menu` de `tetris.html`.
3. Si es de un solo archivo, agrégalo a `ARCHIVOS` en `sw.js` y sube `VERSION_CACHE`.
