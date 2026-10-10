# Probar Esfera360 en un teléfono real

El giroscopio (y en la Fase 2 la cámara) solo funcionan en **HTTPS**. Hay dos formas.

## A. Publicado en GitHub Pages (la más fácil)

1. `npm run build` (escribe la versión compilada en `../esfera360/`).
2. Subir los cambios a GitHub (`git push`). Tarda unos minutos en publicarse.
3. Abrir en el teléfono: <https://eddywong4.github.io/juegos/esfera360/>

## B. Desde tu computadora, en la misma Wi‑Fi

1. `npm run dev:telefono`
2. Vite muestra una dirección `https://192.168.x.x:5225/juegos/esfera360/`. Ábrela en el teléfono.
3. Acepta el aviso de certificado (es un certificado propio de prueba).
   - Si Windows pregunta por el firewall, permite el acceso en redes privadas.

## Lista de comprobación (Fase 1)

| # | Prueba | Resultado esperado |
|---|--------|--------------------|
| 1 | Abrir la app sin datos | Biblioteca vacía con «Importar 360°» y «Panorama de ejemplo» arriba |
| 2 | «Panorama de ejemplo» | Abre el visor; se ven la letra N, edificios y la cuadrícula |
| 3 | Arrastrar con un dedo / pellizcar | Gira la vista / cambia el zoom |
| 4 | Botón de brújula (abajo) | **iPhone:** pide permiso de movimiento; al aceptar, mover el teléfono mueve la vista. **Android:** funciona directo. En computadora el botón no aparece |
| 5 | Pantalla completa (abajo) | Android: pantalla completa. iPhone: Safari no la permite en páginas; instalada como app ya ocupa toda la pantalla |
| 6 | «Planeta pequeño» y «Vista normal» | Transición animada entre las dos vistas |
| 7 | «Guardar encuadre» | Vista previa de lo que se ve (o del planeta) a 1920 px / 2048 px; Compartir y Descargar |
| 8 | «Exportar 360°» → Compartir → Google Fotos | En Google Fotos aparece como foto 360° (ícono de esfera) |
| 9 | Exportar con «Incluir ubicación GPS» | El teléfono pide permiso de ubicación; en Google Fotos aparece en el mapa |
| 10 | Importar una foto 360° de otra cámara (Insta360, Ricoh Theta, Google Street View…) | Se abre en el visor. Si la foto original tenía GPS, el diálogo de exportar lo ofrece |
| 11 | Importar una foto normal (4:3) | Mensaje claro: debe ser 2:1 |
| 12 | Renombrar y borrar desde la biblioteca y desde el menú ⋮ del visor | Funciona y pide confirmación para borrar |
| 13 | Instalar (Android: «Instalar app»; iPhone: Compartir → «Agregar a inicio») | Abre a pantalla completa con el ícono de la esfera |
| 14 | Modo avión → abrir la app instalada → abrir un panorama | Todo funciona sin conexión |
| 15 | Bloque «Espacio» | Muestra lo usado; «Proteger» pide almacenamiento persistente |

## Lista de comprobación (captura y cosido)

| # | Prueba | Resultado esperado |
|---|--------|--------------------|
| 16 | «Tomar foto 360°» → «Empezar» | iPhone: pide permiso de movimiento y de cámara. Se ve la cámara a pantalla completa |
| 17 | Antes de la primera foto | Aparecen «Lente» (si hay varias cámaras traseras) y «Ángulo del lente». Con gran angular el total de fotos baja (≈16) |
| 18 | Girar el teléfono | Los puntos se quedan «pegados» al mundo. Si al girar se desplazan respecto a lo que ves, ajusta el ángulo del lente |
| 19 | Ladear el teléfono | El punto se pone rojo y aparece «Endereza el teléfono» |
| 20 | Apuntar al punto y quedarse quieto | Se pone verde, se llena el anillo, suena, vibra (Android) y destella |
| 21 | Deshacer | Baja el contador y el punto vuelve a estar pendiente |
| 22 | Salir a la mitad | Queda «Borrador» en la biblioteca; al tocarlo se puede continuar |
| 23 | Completar y «Unir fotos» | Barra de progreso; al terminar se abre el visor con la foto 360° completa |
| 24 | Revisar el resultado | Horizonte recto; las uniones pueden mostrar cortes en objetos a menos de 1–2 m |

Consejos para una buena foto: lugar con buena luz, girar el teléfono sobre sí mismo (no
estirar el brazo), y no tener personas moviéndose cerca.

## Facebook

Facebook reconoce fotos 360° por los metadatos GPano, pero su comportamiento cambia
con el tiempo. Si una foto exportada no aparece como 360°, anótalo para revisarlo.
