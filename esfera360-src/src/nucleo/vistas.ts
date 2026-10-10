// Rayos de cámara para generar imágenes planas a partir del panorama.
import { lonLatADireccion, type Vec3 } from './proyeccion';

/**
 * Rayo del píxel (x, y) de una vista rectilínea (cámara normal).
 * hFov en radianes; yaw/pitch indican hacia dónde mira el centro de la imagen.
 */
export function rayoRectilineo(
  x: number,
  y: number,
  ancho: number,
  alto: number,
  hFov: number,
  yaw: number,
  pitch: number,
): Vec3 {
  const tx = Math.tan(hFov / 2);
  const ty = (tx * alto) / ancho;
  // Dirección en el sistema de la cámara (mira hacia −z)
  const cx = ((2 * (x + 0.5)) / ancho - 1) * tx;
  const cy = (1 - (2 * (y + 0.5)) / alto) * ty;
  const cz = -1;
  // Inclinar (pitch) alrededor de x
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const y1 = cy * cp - cz * sp;
  const z1 = cy * sp + cz * cp;
  // Girar (yaw) alrededor de y; yaw positivo = a la derecha
  const cyw = Math.cos(yaw);
  const syw = Math.sin(yaw);
  const x2 = cx * cyw - z1 * syw;
  const z2 = cx * syw + z1 * cyw;
  const largo = Math.hypot(x2, y1, z2);
  return [x2 / largo, y1 / largo, z2 / largo];
}

/**
 * Rayo del píxel (x, y) de una vista «planeta pequeño» (proyección estereográfica
 * con el nadir en el centro). radioHorizonte = radio del horizonte en fracción de
 * media imagen (0..1). La parte de arriba de la imagen mira hacia `yaw`.
 */
export function rayoPlaneta(x: number, y: number, lado: number, yaw: number, radioHorizonte = 0.45): Vec3 {
  const a = (2 * (x + 0.5)) / lado - 1;
  const b = 1 - (2 * (y + 0.5)) / lado;
  const t = Math.hypot(a, b) / radioHorizonte;
  const desdeNadir = 2 * Math.atan(t); // 0 en el centro, π/2 en el horizonte
  const lat = desdeNadir - Math.PI / 2;
  const lon = yaw + Math.atan2(a, b);
  return lonLatADireccion(lon, lat);
}
