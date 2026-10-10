// Muestreo de una imagen equirectangular en memoria (RGBA).
import { direccionALonLat, type Vec3 } from './proyeccion';

export interface ImagenRGBA {
  datos: Uint8ClampedArray;
  ancho: number;
  alto: number;
}

const DOS_PI = Math.PI * 2;

/** Escribe en salida[i..i+3] el color bilineal de la fuente en (lon, lat). Envuelve en longitud. */
export function muestrearBilineal(fuente: ImagenRGBA, lon: number, lat: number, salida: Uint8ClampedArray, i: number) {
  const { datos, ancho, alto } = fuente;
  const px = (lon / DOS_PI + 0.5) * ancho - 0.5;
  const py = (0.5 - lat / Math.PI) * alto - 0.5;
  const x0f = Math.floor(px);
  const y0f = Math.floor(py);
  const fx = px - x0f;
  const fy = py - y0f;
  const x0 = ((x0f % ancho) + ancho) % ancho;
  const x1 = (x0 + 1) % ancho;
  const y0 = Math.min(alto - 1, Math.max(0, y0f));
  const y1 = Math.min(alto - 1, Math.max(0, y0f + 1));
  const a = (y0 * ancho + x0) * 4;
  const b = (y0 * ancho + x1) * 4;
  const c = (y1 * ancho + x0) * 4;
  const d = (y1 * ancho + x1) * 4;
  const w00 = (1 - fx) * (1 - fy);
  const w01 = fx * (1 - fy);
  const w10 = (1 - fx) * fy;
  const w11 = fx * fy;
  for (let k = 0; k < 3; k++) {
    salida[i + k] = datos[a + k] * w00 + datos[b + k] * w01 + datos[c + k] * w10 + datos[d + k] * w11;
  }
  salida[i + 3] = 255;
}

/** Genera una imagen plana usando una función que da el rayo de cada píxel. */
export function renderizar(
  fuente: ImagenRGBA,
  ancho: number,
  alto: number,
  rayo: (x: number, y: number) => Vec3,
): ImagenRGBA {
  const datos = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const { lon, lat } = direccionALonLat(rayo(x, y));
      muestrearBilineal(fuente, lon, lat, datos, (y * ancho + x) * 4);
    }
  }
  return { datos, ancho, alto };
}
