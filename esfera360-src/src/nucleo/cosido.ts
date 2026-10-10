// Cosido, etapa A: proyecta cada toma sobre el lienzo equirectangular usando la
// orientación registrada y mezcla las uniones con pesos suaves (feathering).
import { aMatriz, conjugado, rotar, type Quat } from './cuaternion';
import type { ImagenRGBA } from './muestreo';
import { direccionALonLat, type Vec3 } from './proyeccion';

export interface TomaCosido {
  img: ImagenRGBA;
  q: Quat; // orientación de la cámara al disparar
}

export interface ResultadoCosido extends ImagenRGBA {
  cubierto: Uint8Array; // 1 = algún píxel de foto llegó aquí
}

const DOS_PI = Math.PI * 2;

/** Distancia focal en píxeles a partir del campo de visión del lado largo. */
export function focal(img: { ancho: number; alto: number }, fovLargo: number) {
  return Math.max(img.ancho, img.alto) / 2 / Math.tan(fovLargo / 2);
}

/** Rayo (mundo) del píxel (u, v) de una toma. */
export function rayoToma(u: number, v: number, ancho: number, alto: number, f: number, q: Quat): Vec3 {
  return rotar(q, [(u - ancho / 2) / f, -(v - alto / 2) / f, -1]);
}

interface Limites {
  latMin: number;
  latMax: number;
  lonCentro: number;
  lonMedio: number; // mitad del ancho en longitud; ≥ π = toda la vuelta
}

/** Región lon/lat que ocupa una toma (para recorrer solo esos píxeles de salida). */
export function limitesToma(ancho: number, alto: number, f: number, q: Quat): Limites {
  const puntos: [number, number][] = [];
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    puntos.push([t * ancho, 0], [t * ancho, alto], [0, t * alto], [ancho, t * alto]);
  }
  const centro = direccionALonLat(rayoToma(ancho / 2, alto / 2, ancho, alto, f, q));
  let latMin = Infinity;
  let latMax = -Infinity;
  let dMin = Infinity;
  let dMax = -Infinity;
  for (const [u, v] of puntos) {
    const { lon, lat } = direccionALonLat(rayoToma(u, v, ancho, alto, f, q));
    latMin = Math.min(latMin, lat);
    latMax = Math.max(latMax, lat);
    let d = lon - centro.lon;
    d -= DOS_PI * Math.round(d / DOS_PI);
    dMin = Math.min(dMin, d);
    dMax = Math.max(dMax, d);
  }
  // ¿Algún polo cae dentro de la foto?
  const inv = conjugado(q);
  let lonMedio = Math.max(-dMin, dMax) + 0.02;
  for (const polo of [1, -1]) {
    const c = rotar(inv, [0, polo, 0]);
    if (c[2] >= 0) continue;
    const u = ancho / 2 + (f * c[0]) / -c[2];
    const v = alto / 2 - (f * c[1]) / -c[2];
    if (u >= 0 && u <= ancho && v >= 0 && v <= alto) {
      lonMedio = Math.PI;
      if (polo === 1) latMax = Math.PI / 2;
      else latMin = -Math.PI / 2;
    }
  }
  return { latMin: latMin - 0.01, latMax: latMax + 0.01, lonCentro: centro.lon, lonMedio };
}

/**
 * Cose las tomas en un panorama de anchoSalida × anchoSalida/2.
 * Procesa por franjas para limitar la memoria (los acumuladores son de una franja).
 */
export function coser(
  tomas: TomaCosido[],
  fovLargo: number,
  anchoSalida: number,
  alProgreso?: (fraccion: number) => void,
  altoFranja = 128,
): ResultadoCosido {
  const W = anchoSalida;
  const H = Math.round(W / 2);
  const datos = new Uint8ClampedArray(W * H * 4);
  const cubierto = new Uint8Array(W * H);

  // Tablas por columna y por fila
  const senLon = new Float64Array(W);
  const cosLon = new Float64Array(W);
  for (let x = 0; x < W; x++) {
    const lon = ((x + 0.5) / W - 0.5) * DOS_PI;
    senLon[x] = Math.sin(lon);
    cosLon[x] = Math.cos(lon);
  }

  const prep = tomas.map((t) => {
    const f = focal(t.img, fovLargo);
    return { ...t, f, m: aMatriz(t.q), lim: limitesToma(t.img.ancho, t.img.alto, f, t.q) };
  });

  const acum = new Float32Array(W * altoFranja * 4);
  for (let y0 = 0; y0 < H; y0 += altoFranja) {
    const y1 = Math.min(H, y0 + altoFranja);
    acum.fill(0);
    for (const t of prep) {
      const { img, f, m, lim } = t;
      const yA = Math.max(y0, Math.floor((0.5 - lim.latMax / Math.PI) * H));
      const yB = Math.min(y1, Math.ceil((0.5 - lim.latMin / Math.PI) * H));
      if (yA >= yB) continue;
      let xA: number;
      let xB: number;
      if (lim.lonMedio >= Math.PI) {
        xA = 0;
        xB = W;
      } else {
        xA = Math.floor(((lim.lonCentro - lim.lonMedio) / DOS_PI + 0.5) * W);
        xB = Math.ceil(((lim.lonCentro + lim.lonMedio) / DOS_PI + 0.5) * W);
        if (xB - xA >= W) {
          xA = 0;
          xB = W;
        }
      }
      const { ancho: tw, alto: th, datos: px } = img;
      const cx = tw / 2;
      const cy = th / 2;
      for (let y = yA; y < yB; y++) {
        const lat = (0.5 - (y + 0.5) / H) * Math.PI;
        const cl = Math.cos(lat);
        const dy = Math.sin(lat);
        const fila = (y - y0) * W;
        for (let xx = xA; xx < xB; xx++) {
          const x = ((xx % W) + W) % W;
          const dx = cl * senLon[x];
          const dz = -cl * cosLon[x];
          // Al sistema de la cámara: Rᵀ·d
          const cz = m[2] * dx + m[5] * dy + m[8] * dz;
          if (cz >= -1e-6) continue;
          const ccx = m[0] * dx + m[3] * dy + m[6] * dz;
          const ccy = m[1] * dx + m[4] * dy + m[7] * dz;
          const u = cx + (f * ccx) / -cz;
          const v = cy - (f * ccy) / -cz;
          if (u < 0 || u >= tw - 1 || v < 0 || v >= th - 1) continue;
          // Peso: 1 en el centro, 0 en los bordes
          const pu = Math.min(u, tw - 1 - u) / cx;
          const pv = Math.min(v, th - 1 - v) / cy;
          const w = pu * pv + 1e-6;
          // Bilineal
          const u0 = u | 0;
          const v0 = v | 0;
          const fu = u - u0;
          const fv = v - v0;
          const a = (v0 * tw + u0) * 4;
          const b = a + 4;
          const c = a + tw * 4;
          const d = c + 4;
          const k = (fila + x) * 4;
          for (let ch = 0; ch < 3; ch++) {
            const arriba = px[a + ch] + (px[b + ch] - px[a + ch]) * fu;
            const abajo = px[c + ch] + (px[d + ch] - px[c + ch]) * fu;
            acum[k + ch] += w * (arriba + (abajo - arriba) * fv);
          }
          acum[k + 3] += w;
        }
      }
    }
    // Volcar la franja
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < W; x++) {
        const k = ((y - y0) * W + x) * 4;
        const w = acum[k + 3];
        const o = (y * W + x) * 4;
        if (w > 0) {
          datos[o] = acum[k] / w;
          datos[o + 1] = acum[k + 1] / w;
          datos[o + 2] = acum[k + 2] / w;
          cubierto[y * W + x] = 1;
        }
        datos[o + 3] = 255;
      }
    }
    alProgreso?.(y1 / H);
  }
  return { datos, ancho: W, alto: H, cubierto };
}

/**
 * Rellena lo que ninguna foto cubrió (normalmente el nadir, donde están tus pies)
 * con el color más cercano de la misma columna y un desenfoque horizontal.
 */
export function rellenarHuecos(r: ResultadoCosido, radioDesenfoque = 0.02) {
  const { datos, ancho: W, alto: H, cubierto } = r;
  const relleno = new Uint8Array(W * H);
  for (let x = 0; x < W; x++) {
    // Hacia abajo y hacia arriba: copiar el último píxel cubierto
    let ultimo = -1;
    for (let y = 0; y < H; y++) {
      const i = y * W + x;
      if (cubierto[i]) ultimo = i;
      else if (ultimo >= 0) {
        datos.copyWithin(i * 4, ultimo * 4, ultimo * 4 + 3);
        relleno[i] = 1;
      }
    }
    ultimo = -1;
    for (let y = H - 1; y >= 0; y--) {
      const i = y * W + x;
      if (cubierto[i]) ultimo = i;
      else if (ultimo >= 0 && !relleno[i]) {
        datos.copyWithin(i * 4, ultimo * 4, ultimo * 4 + 3);
        relleno[i] = 1;
      }
    }
  }
  // Desenfoque horizontal (con vuelta completa) solo en las filas rellenadas
  const radio = Math.max(1, Math.round(W * radioDesenfoque));
  const fila = new Float32Array(W * 3);
  for (let y = 0; y < H; y++) {
    let hay = false;
    for (let x = 0; x < W && !hay; x++) hay = relleno[y * W + x] === 1;
    if (!hay) continue;
    for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) fila[x * 3 + c] = datos[(y * W + x) * 4 + c];
    const suma = [0, 0, 0];
    for (let k = -radio; k <= radio; k++) {
      const x = ((k % W) + W) % W;
      for (let c = 0; c < 3; c++) suma[c] += fila[x * 3 + c];
    }
    const n = 2 * radio + 1;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (relleno[i]) for (let c = 0; c < 3; c++) datos[i * 4 + c] = suma[c] / n;
      const sale = (((x - radio) % W) + W) % W;
      const entra = (x + radio + 1) % W;
      for (let c = 0; c < 3; c++) suma[c] += fila[entra * 3 + c] - fila[sale * 3 + c];
    }
  }
  return relleno;
}
