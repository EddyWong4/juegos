# Esfera360 (código fuente)

PWA para ver, capturar, coser y compartir fotos 360°, hecha solo con software libre.
Plan completo (arquitectura, SQL, riesgos): [PLAN.md](PLAN.md).

- Publicada en: <https://eddywong4.github.io/juegos/esfera360/>
- La versión compilada vive en `../esfera360/` (la genera `npm run build`; no se edita a mano).

## Comandos

```bash
npm install
npm run dev            # http://localhost:5225/juegos/esfera360/
npm run dev:telefono   # HTTPS en la red local, para probar en un teléfono
npm test               # pruebas unitarias (proyección, cuaterniones, plan de tomas, cosido, JPEG/XMP/EXIF)
npm run typecheck
npm run build          # compila hacia ../esfera360/
```

Pruebas en teléfono: [docs/prueba-en-telefono.md](docs/prueba-en-telefono.md).

## Estado

- [x] Fase 1: esqueleto PWA, biblioteca, visor (giroscopio, zoom, pantalla completa,
      planeta pequeño), encuadre plano, importar y exportar con XMP GPano y EXIF GPS opcional.
- [x] Fase 2: captura guiada con sensores (puntos en la esfera, disparo automático, borradores, deshacer).
- [x] Fase 3, etapa A: cosido por orientación con mezcla suave y relleno del nadir (4096×2048).
- [ ] Fase 3, etapa B: refinamiento con ORB y compensación de exposición.
- [ ] Fase 4: compartir por enlace y comunidad (Supabase).
- [ ] Fase 5: Street View, VR y efecto 3D.

## Simulador de captura (solo en desarrollo)

Con `npm run dev`, abre `#/capturar?simular=1`: una cámara falsa «filma» el panorama de
ejemplo y el giroscopio se simula con el teclado (flechas, Shift = más rápido, Q/E = ladear).
No se incluye en la versión publicada.
