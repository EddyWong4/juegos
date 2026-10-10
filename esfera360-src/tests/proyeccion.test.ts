import { describe, expect, it } from 'vitest';
import {
  direccionALonLat,
  esEquirectangularCompleta,
  gradosARad,
  lonLatADireccion,
  lonLatAPixel,
  normalizarAngulo,
  pixelALonLat,
} from '../src/nucleo/proyeccion';
import { rayoPlaneta, rayoRectilineo } from '../src/nucleo/vistas';
import { renderizar, type ImagenRGBA } from '../src/nucleo/muestreo';

const cerca = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);
const vecCerca = (a: number[], b: number[], eps = 1e-9) => a.forEach((v, i) => cerca(v, b[i], eps));

describe('proyección equirectangular', () => {
  it('adelante, derecha, cenit y nadir tienen la dirección esperada', () => {
    vecCerca(lonLatADireccion(0, 0), [0, 0, -1]);
    vecCerca(lonLatADireccion(Math.PI / 2, 0), [1, 0, 0]);
    vecCerca(lonLatADireccion(0, Math.PI / 2), [0, 1, 0]);
    vecCerca(lonLatADireccion(1.234, -Math.PI / 2), [0, -1, 0]);
  });

  it('dirección → lon/lat → dirección es la identidad', () => {
    for (let lon = -170; lon <= 180; lon += 17) {
      for (let lat = -85; lat <= 85; lat += 17) {
        const v = lonLatADireccion(gradosARad(lon), gradosARad(lat));
        const r = direccionALonLat(v);
        cerca(r.lat, gradosARad(lat));
        cerca(normalizarAngulo(r.lon - gradosARad(lon)), 0);
      }
    }
  });

  it('acepta vectores sin normalizar', () => {
    const r = direccionALonLat([0, 5, -5]);
    cerca(r.lat, Math.PI / 4);
    cerca(r.lon, 0);
  });

  it('los bordes y el centro de la imagen caen donde deben', () => {
    const W = 4096;
    const H = 2048;
    expect(lonLatAPixel(0, 0, W, H)).toEqual({ x: W / 2, y: H / 2 });
    const izq = pixelALonLat(0, 0, W, H);
    cerca(izq.lon, -Math.PI);
    cerca(izq.lat, Math.PI / 2);
    const der = pixelALonLat(W, H, W, H);
    cerca(der.lon, Math.PI);
    cerca(der.lat, -Math.PI / 2);
  });

  it('píxel → lon/lat → píxel es la identidad', () => {
    for (const [x, y] of [
      [10.5, 20.5],
      [2047.5, 1023.5],
      [4000.25, 1900.75],
    ]) {
      const { lon, lat } = pixelALonLat(x, y, 4096, 2048);
      const p = lonLatAPixel(lon, lat, 4096, 2048);
      cerca(p.x, x, 1e-6);
      cerca(p.y, y, 1e-6);
    }
  });

  it('normaliza ángulos a (−π, π]', () => {
    cerca(normalizarAngulo(3 * Math.PI), Math.PI);
    cerca(normalizarAngulo(-Math.PI), Math.PI);
    cerca(normalizarAngulo(Math.PI / 2 + 4 * Math.PI), Math.PI / 2);
  });

  it('reconoce la relación 2:1', () => {
    expect(esEquirectangularCompleta(8192, 4096)).toBe(true);
    expect(esEquirectangularCompleta(5376, 2688)).toBe(true);
    expect(esEquirectangularCompleta(4000, 2010)).toBe(true); // 0,5 % de tolerancia
    expect(esEquirectangularCompleta(4000, 3000)).toBe(false);
    expect(esEquirectangularCompleta(0, 0)).toBe(false);
  });
});

describe('vista rectilínea', () => {
  it('el centro mira hacia yaw/pitch', () => {
    const yaw = gradosARad(40);
    const pitch = gradosARad(-25);
    // Con ancho y alto pares el centro exacto cae entre píxeles: se usa un tamaño impar
    const v = rayoRectilineo(50, 50, 101, 101, gradosARad(90), yaw, pitch);
    const r = direccionALonLat(v);
    cerca(r.lon, yaw);
    cerca(r.lat, pitch);
  });

  it('el borde derecho está a hFov/2 del centro', () => {
    const hFov = gradosARad(90);
    const v = rayoRectilineo(1000 - 0.5, 300, 1000, 601, hFov, 0, 0);
    const r = direccionALonLat(v);
    cerca(r.lon, hFov / 2);
    cerca(r.lat, 0);
  });

  it('arriba en la imagen es arriba en la esfera', () => {
    const v = rayoRectilineo(50, 0, 101, 101, gradosARad(60), 0, 0);
    expect(direccionALonLat(v).lat).toBeGreaterThan(0);
  });
});

describe('vista planeta pequeño', () => {
  it('el centro es el nadir y el radio indicado es el horizonte', () => {
    vecCerca(rayoPlaneta(50, 50, 101, 0), [0, -1, 0]);
    // Punto sobre el radio del horizonte (0,45 de media imagen), hacia arriba de la imagen
    const lado = 1000;
    const y = lado / 2 - 0.45 * (lado / 2) - 0.5;
    const r = direccionALonLat(rayoPlaneta(lado / 2 - 0.5, y, lado, gradosARad(30)));
    cerca(r.lat, 0, 1e-6);
    cerca(r.lon, gradosARad(30), 1e-6); // arriba de la imagen = yaw
  });

  it('a la derecha del centro queda yaw + 90°', () => {
    const r = direccionALonLat(rayoPlaneta(80, 50, 101, 0));
    cerca(r.lon, Math.PI / 2, 1e-6);
  });
});

describe('renderizado', () => {
  it('una vista de un panorama de un solo color conserva el color', () => {
    const fuente: ImagenRGBA = { ancho: 64, alto: 32, datos: new Uint8ClampedArray(64 * 32 * 4) };
    for (let i = 0; i < fuente.datos.length; i += 4) fuente.datos.set([200, 100, 50, 255], i);
    const salida = renderizar(fuente, 16, 9, (x, y) => rayoRectilineo(x, y, 16, 9, 1.2, 2.5, 1.4));
    for (let i = 0; i < salida.datos.length; i += 4) {
      expect([...salida.datos.subarray(i, i + 4)]).toEqual([200, 100, 50, 255]);
    }
  });

  it('muestrea la columna correcta y envuelve en el borde ±180°', () => {
    // Panorama 8×4: la mitad izquierda negra, la derecha blanca
    const W = 8;
    const H = 4;
    const datos = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) datos.set(x < W / 2 ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * W + x) * 4);
    const fuente = { datos, ancho: W, alto: H };
    const mirar = (lon: number) => renderizar(fuente, 1, 1, () => lonLatADireccion(lon, 0)).datos[0];
    expect(mirar(gradosARad(-90))).toBe(0);
    expect(mirar(gradosARad(90))).toBe(255);
    // Justo en ±180° se mezcla la última columna (blanca) con la primera (negra)
    expect(mirar(Math.PI)).toBeGreaterThan(100);
    expect(mirar(Math.PI)).toBeLessThan(155);
  });
});
