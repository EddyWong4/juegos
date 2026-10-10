// Proyección equirectangular (TypeScript puro, sin DOM).
//
// Convención (la misma que Photo Sphere Viewer):
// - lon (yaw) 0 = centro horizontal de la imagen; positivo hacia la derecha. Rango (-π, π].
// - lat (pitch) 0 = horizonte; +π/2 = cenit (arriba), −π/2 = nadir.
// - Ejes 3D derechos estilo three.js: x = derecha, y = arriba, −z = adelante (lon 0, lat 0).

export type Vec3 = [number, number, number];

export interface LonLat {
  lon: number;
  lat: number;
}

const DOS_PI = Math.PI * 2;

/** Lleva un ángulo a (−π, π]. */
export function normalizarAngulo(a: number): number {
  let r = a % DOS_PI;
  if (r <= -Math.PI) r += DOS_PI;
  else if (r > Math.PI) r -= DOS_PI;
  return r;
}

export function lonLatADireccion(lon: number, lat: number): Vec3 {
  const c = Math.cos(lat);
  return [c * Math.sin(lon), Math.sin(lat), -c * Math.cos(lon)];
}

export function direccionALonLat(v: Vec3): LonLat {
  const [x, y, z] = v;
  const largo = Math.hypot(x, y, z);
  const lat = Math.asin(Math.max(-1, Math.min(1, y / largo)));
  // En los polos lon es indefinida: atan2(0, 0) = 0, que es un valor aceptable.
  const lon = Math.atan2(x, -z);
  return { lon, lat };
}

/** Coordenadas de píxel continuas (0..ancho, 0..alto); el centro del píxel i es i + 0.5. */
export function lonLatAPixel(lon: number, lat: number, ancho: number, alto: number) {
  return {
    x: (normalizarAngulo(lon) / DOS_PI + 0.5) * ancho,
    y: (0.5 - lat / Math.PI) * alto,
  };
}

export function pixelALonLat(x: number, y: number, ancho: number, alto: number): LonLat {
  return {
    lon: (x / ancho - 0.5) * DOS_PI,
    lat: (0.5 - y / alto) * Math.PI,
  };
}

/** ¿La relación de aspecto es la de una esfera completa (2:1)? */
export function esEquirectangularCompleta(ancho: number, alto: number, tolerancia = 0.01): boolean {
  if (ancho <= 0 || alto <= 0) return false;
  return Math.abs(ancho / alto - 2) <= 2 * tolerancia;
}

export const gradosARad = (g: number) => (g * Math.PI) / 180;
export const radAGrados = (r: number) => (r * 180) / Math.PI;
