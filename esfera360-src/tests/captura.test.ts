import { describe, expect, it } from 'vitest';
import {
  adelante,
  alabeo,
  anguloEntre,
  arriba,
  conjugado,
  desdeOrientacionDispositivo,
  desdeYawPitch,
  ejeAngulo,
  multiplicar,
  rotar,
  type Quat,
} from '../src/nucleo/cuaternion';
import { coser, focal, rayoToma, rellenarHuecos, type TomaCosido } from '../src/nucleo/cosido';
import { renderizar, type ImagenRGBA } from '../src/nucleo/muestreo';
import { generarPlan, fovCorto } from '../src/nucleo/plan-tomas';
import { direccionALonLat, gradosARad, lonLatADireccion } from '../src/nucleo/proyeccion';

const cerca = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);
const vecCerca = (a: number[], b: number[], eps = 1e-6) => a.forEach((v, i) => cerca(v, b[i], eps));

describe('cuaterniones', () => {
  it('rotar con el producto equivale a rotar dos veces', () => {
    const a = ejeAngulo([1, 2, 3], 0.7);
    const b = ejeAngulo([-2, 0.5, 1], 1.9);
    const v: [number, number, number] = [0.3, -0.4, 0.8];
    vecCerca(rotar(multiplicar(a, b), v), rotar(a, rotar(b, v)));
    vecCerca(rotar(conjugado(a), rotar(a, v)), v);
  });

  it('desdeYawPitch mira hacia la dirección pedida, con el cielo arriba', () => {
    for (const [yaw, pitch] of [
      [0, 0],
      [1.2, 0.4],
      [-2.5, -0.9],
    ]) {
      const q = desdeYawPitch(yaw, pitch);
      vecCerca(adelante(q), lonLatADireccion(yaw, pitch));
      expect(arriba(q)[1]).toBeGreaterThan(0);
      cerca(alabeo(q)!, 0);
    }
  });

  it('alabeo detecta el teléfono inclinado hacia un lado', () => {
    cerca(Math.abs(alabeo(desdeYawPitch(0.3, 0.2, gradosARad(15)))!), gradosARad(15));
    expect(alabeo(desdeYawPitch(0, Math.PI / 2))).toBeNull();
  });

  it('teléfono acostado boca arriba: la cámara trasera mira al suelo', () => {
    vecCerca(adelante(desdeOrientacionDispositivo(0, 0, 0)), [0, -1, 0]);
  });

  it('teléfono vertical: mira al horizonte; alfa positivo gira a la izquierda', () => {
    vecCerca(adelante(desdeOrientacionDispositivo(0, 90, 0)), [0, 0, -1]);
    vecCerca(arriba(desdeOrientacionDispositivo(0, 90, 0)), [0, 1, 0]);
    vecCerca(adelante(desdeOrientacionDispositivo(90, 90, 0)), [-1, 0, 0]);
  });

  it('teléfono vertical inclinado hacia atrás mira hacia arriba', () => {
    expect(adelante(desdeOrientacionDispositivo(0, 120, 0))[1]).toBeGreaterThan(0.4);
  });

  it('pantalla girada (horizontal): el arriba de la imagen sigue al cielo', () => {
    // Teléfono en horizontal (gamma ±90, mira al horizonte de lado) con la pantalla
    // girada lo mismo: la imagen queda derecha.
    for (const [gamma, pantalla] of [
      [-90, 90],
      [90, -90],
    ]) {
      const q = desdeOrientacionDispositivo(0, 0, gamma, pantalla);
      cerca(adelante(q)[1], 0);
      vecCerca(arriba(q), [0, 1, 0]);
    }
  });

  it('el ángulo entre orientaciones', () => {
    cerca(anguloEntre(desdeYawPitch(0, 0), desdeYawPitch(0.5, 0)), 0.5);
  });
});

describe('plan de tomas', () => {
  it('lente normal: anillos en el horizonte y ±45°, cenit y nadir; unas 30–50 tomas', () => {
    const plan = generarPlan(65, 0.75);
    const pitches = [...new Set(plan.map((o) => Math.round((o.pitch * 180) / Math.PI)))].sort((a, b) => a - b);
    expect(pitches).toEqual([-90, -45, 0, 45, 90]);
    expect(plan.length).toBeGreaterThanOrEqual(30);
    expect(plan.length).toBeLessThanOrEqual(50);
    expect(plan.filter((o) => o.polo).length).toBe(2);
    expect(plan[0].pitch).toBe(0); // se empieza por el horizonte
  });

  it('gran angular: unas 16 tomas', () => {
    const plan = generarPlan(100, 0.75);
    expect(plan.length).toBeGreaterThanOrEqual(12);
    expect(plan.length).toBeLessThanOrEqual(20);
  });

  it('a mayor campo de visión, menos tomas', () => {
    expect(generarPlan(80, 0.75).length).toBeLessThan(generarPlan(60, 0.75).length);
  });

  it('el lado corto de 16:9 es más estrecho que el de 4:3', () => {
    expect(fovCorto(gradosARad(65), 0.5625)).toBeLessThan(fovCorto(gradosARad(65), 0.75));
  });
});

/** Panorama de prueba con colores suaves que dependen de la dirección. */
function panoramaPrueba(W: number): ImagenRGBA {
  const H = W / 2;
  const datos = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W - 0.5) * 2 * Math.PI;
      const lat = (0.5 - (y + 0.5) / H) * Math.PI;
      const [dx, dy, dz] = lonLatADireccion(lon, lat);
      datos.set([128 + 120 * dx, 128 + 120 * dy, 128 + 120 * dz, 255], (y * W + x) * 4);
    }
  }
  return { datos, ancho: W, alto: H };
}

/** Simula la foto que tomaría la cámara con orientación q. */
function fotografiar(pano: ImagenRGBA, q: Quat, ancho: number, alto: number, fovLargo: number): ImagenRGBA {
  const f = focal({ ancho, alto }, fovLargo);
  return renderizar(pano, ancho, alto, (u, v) => rayoToma(u + 0.5, v + 0.5, ancho, alto, f, q));
}

function errorMedio(a: ImagenRGBA, b: ImagenRGBA) {
  let suma = 0;
  for (let i = 0; i < a.datos.length; i += 4) {
    for (let c = 0; c < 3; c++) suma += Math.abs(a.datos[i + c] - b.datos[i + c]);
  }
  return suma / ((a.datos.length / 4) * 3);
}

describe('cosido (etapa A)', () => {
  it('rayoToma: el centro de la foto apunta hacia donde mira la cámara', () => {
    const q = desdeYawPitch(0.8, -0.3);
    const r = direccionALonLat(rayoToma(60, 80, 120, 160, 100, q));
    cerca(r.lon, 0.8);
    cerca(r.lat, -0.3);
  });

  it('con el plan completo cubre toda la esfera y reconstruye el panorama', () => {
    const fovLargo = gradosARad(65);
    const original = panoramaPrueba(256);
    const plan = generarPlan(65, 0.75);
    const tomas: TomaCosido[] = plan.map((o) => {
      // Pequeño error de puntería, como al disparar a mano
      const q = desdeYawPitch(o.yaw + 0.03, o.pitch - 0.02, 0.04);
      return { q, img: fotografiar(original, q, 90, 120, fovLargo) };
    });
    let progreso = 0;
    const r = coser(tomas, fovLargo, 256, (p) => (progreso = p), 32);
    expect(progreso).toBe(1);
    expect(r.cubierto.every((c) => c === 1)).toBe(true);
    expect(errorMedio(r, original)).toBeLessThan(3);
  });

  it('una toma que cruza ±180° y una que contiene el nadir se proyectan bien', () => {
    const fovLargo = gradosARad(65);
    const original = panoramaPrueba(128);
    const tomas = [desdeYawPitch(Math.PI, 0), desdeYawPitch(0.4, -Math.PI / 2)].map((q) => ({
      q,
      img: fotografiar(original, q, 60, 80, fovLargo),
    }));
    const r = coser(tomas, fovLargo, 128);
    // Píxeles cubiertos a ambos lados del borde ±180° y en la fila del nadir
    const H = 64;
    expect(r.cubierto[(H / 2) * 128 + 0]).toBe(1);
    expect(r.cubierto[(H / 2) * 128 + 127]).toBe(1);
    expect(r.cubierto[(H - 1) * 128 + 10]).toBe(1);
    expect(r.cubierto[(H - 1) * 128 + 100]).toBe(1);
    let suma = 0;
    let n = 0;
    for (let i = 0; i < r.cubierto.length; i++) {
      if (!r.cubierto[i]) continue;
      for (let c = 0; c < 3; c++) suma += Math.abs(r.datos[i * 4 + c] - original.datos[i * 4 + c]);
      n++;
    }
    expect(suma / (n * 3)).toBeLessThan(3);
  });

  it('rellena el nadir que no fotografiaste', () => {
    const fovLargo = gradosARad(65);
    const original = panoramaPrueba(128);
    const tomas = generarPlan(65, 0.75)
      .filter((o) => o.pitch > -Math.PI / 2 + 0.01) // sin nadir
      .map((o) => {
        const q = desdeYawPitch(o.yaw, o.pitch);
        return { q, img: fotografiar(original, q, 60, 80, fovLargo) };
      });
    const r = coser(tomas, fovLargo, 128);
    expect(r.cubierto.some((c) => c === 0)).toBe(true);
    const relleno = rellenarHuecos(r);
    // Lo rellenado está en la parte de abajo y no quedó negro
    for (let i = 0; i < relleno.length; i++) {
      if (!relleno[i]) continue;
      expect(Math.floor(i / 128)).toBeGreaterThan(40);
      expect(r.datos[i * 4] + r.datos[i * 4 + 1] + r.datos[i * 4 + 2]).toBeGreaterThan(30);
    }
  });
});
