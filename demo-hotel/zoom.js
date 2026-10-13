// Zoom y desplazamiento de una foto dentro del visor.
// Estado { s, x, y }: escala y corrimiento (px) respecto al centro del visor.
// La foto a escala 1 ocupa `content` (ancho/alto ya ajustados al visor) y el visor mide `stage`.

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;
export const IDENTITY = Object.freeze({ s: 1, x: 0, y: 0 });

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Tamaño con que se dibuja la foto a escala 1 (object-fit: contain).
export function fitSize(natural, stage) {
  if (!natural.w || !natural.h) return { w: stage.w, h: stage.h };
  const k = Math.min(stage.w / natural.w, stage.h / natural.h);
  return { w: natural.w * k, h: natural.h * k };
}

// Evita que la foto ampliada deje huecos: solo se puede mover lo que sobresale del visor.
export function clampPan(z, content, stage) {
  const s = clamp(z.s, MIN_ZOOM, MAX_ZOOM);
  if (s <= MIN_ZOOM) return { ...IDENTITY };
  const maxX = Math.max(0, (content.w * s - stage.w) / 2);
  const maxY = Math.max(0, (content.h * s - stage.h) / 2);
  return { s, x: clamp(z.x, -maxX, maxX), y: clamp(z.y, -maxY, maxY) };
}

// Escala `factor` veces dejando quieto el punto (px, py), medido desde el centro del visor.
export function zoomAt(z, factor, px, py, content, stage) {
  const s = clamp(z.s * factor, MIN_ZOOM, MAX_ZOOM);
  const k = s / z.s;
  return clampPan({ s, x: px - (px - z.x) * k, y: py - (py - z.y) * k }, content, stage);
}

// Pellizco: desde el estado al empezar, con la distancia y el punto medio inicial y actual.
export function pinch(start, d0, d1, mid0, mid1, content, stage) {
  const s = clamp(start.s * (d1 / d0), MIN_ZOOM, MAX_ZOOM);
  const k = s / start.s;
  return clampPan({
    s,
    x: mid1.x - (mid0.x - start.x) * k,
    y: mid1.y - (mid0.y - start.y) * k,
  }, content, stage);
}
