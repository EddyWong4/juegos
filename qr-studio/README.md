# QR Studio

Generador de códigos QR personalizados. Es una PWA (aplicación web instalable) 100 % gratuita, funciona **sin servidor y sin internet**, y no envía ningún dato a ninguna parte: todo se genera en el navegador.

## Qué incluye

- **10 tipos de contenido**, cada uno con su formulario y validación: URL, texto, WhatsApp (`https://wa.me/NUMERO?text=MENSAJE`), llamada, SMS, correo, WiFi, contacto (vCard 3.0), ubicación (`geo:` o enlace de mapas) y evento de calendario.
- **Diseño con vista previa en tiempo real**: módulos en color sólido o degradado (lineal o radial, 2 colores, ángulo), fondo sólido, degradado o transparente, 6 formas de módulo, forma y color del marco y del punto de las esquinas por separado, logo al centro (tamaño, margen y ocultar los módulos de atrás), corrección de errores L/M/Q/H (con logo se fuerza H), tamaño en píxeles, margen y marco con texto (fuente, colores, posición y tamaño).
- **9 plantillas** y botón para restablecer el diseño.
- **Descarga en PNG, SVG, JPG y WebP** con resolución de 256 a 4096 px, copiar al portapapeles y compartir (Web Share API).
- **Avisos de legibilidad**: contraste bajo, colores invertidos, fondo transparente, logo grande y sin margen.
- **Mis diseños e historial** en `localStorage`, con opción de borrar y de desactivar el historial.
- Modo claro, oscuro o automático; accesible con teclado; textos en español.
- Todos los códigos son **estáticos**: no caducan y no pasan por enlaces intermedios.

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | Estructura de la página y formularios |
| `styles.css` | Estilos (celular primero, modo claro y oscuro) |
| `app.js` | Toda la lógica: contenido, diseño, vista previa, descargas y guardados |
| `manifest.json` | Datos para instalar la app |
| `sw.js` | Service worker: guarda la app para usarla sin internet |
| `icons/` | Íconos de la app |
| `vendor/qr-code-styling.js` | Librería [qr-code-styling](https://github.com/kozakdenys/qr-code-styling) v1.9.2 (licencia MIT, incluida en `vendor/`) |

No hay que instalar ni compilar nada: son archivos estáticos.

## Probarla en tu computadora

El service worker no funciona si abres `index.html` con doble clic (`file://`); hace falta un servidor local. Cualquiera de estas opciones sirve:

1. Abre una terminal en la carpeta `qr-studio`.
2. Inicia un servidor:
   - Con Node.js: `npx http-server -p 8080 -c-1`
   - Con Python: `python -m http.server 8080`
3. Abre `http://localhost:8080` en el navegador.
4. Para probar el modo sin internet: en las herramientas de desarrollo (F12) → **Application** → **Service workers**, marca **Offline** y recarga.

> Mientras desarrollas, el service worker sirve la copia guardada. Si no ves tus cambios, en **Application → Storage** usa **Clear site data** y recarga.

## Publicarla gratis en GitHub Pages

1. Crea una cuenta en [github.com](https://github.com) si no tienes.
2. Crea un repositorio nuevo (botón **New**), por ejemplo `qr-studio`, **público** y vacío.
3. Sube los archivos. Desde la carpeta `qr-studio`:
   ```bash
   git init
   git add .
   git commit -m "QR Studio"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/qr-studio.git
   git push -u origin main
   ```
   (O, sin terminal: en el repositorio, **Add file → Upload files** y arrastra todo el contenido de la carpeta, incluidas `icons` y `vendor`.)
4. En el repositorio ve a **Settings → Pages**.
5. En **Build and deployment**, elige **Deploy from a branch**, rama **main** y carpeta **/ (root)**. Guarda.
6. En unos minutos tu app estará en `https://TU-USUARIO.github.io/qr-studio/`.
7. Ábrela en el celular y usa **Instalar** (o «Agregar a pantalla de inicio» en iPhone).

### Publicar cambios después

Cada vez que modifiques archivos, sube el número de `VERSION_CACHE` en `sw.js` (por ejemplo `qr-studio-v2`) antes de hacer `git push`. Así los dispositivos descargan la versión nueva; la app mostrará el aviso «Hay una versión nueva» con el botón **Actualizar**.

### Otras opciones gratuitas

- **Netlify**: entra a [app.netlify.com/drop](https://app.netlify.com/drop) y arrastra la carpeta `qr-studio`.
- **Cloudflare Pages**: **Workers & Pages → Create → Pages → Upload assets** y sube la carpeta.

Todas las rutas son relativas, así que funciona igual en la raíz de un dominio o en una subcarpeta.
