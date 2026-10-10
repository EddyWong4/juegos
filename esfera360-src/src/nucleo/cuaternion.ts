// Cuaterniones [x, y, z, w] para la orientación de la cámara (sin bloqueo de cardán).
// Mundo: x = derecha, y = arriba (gravedad), −z = adelante. La cámara mira hacia su −z local,
// con +y local hacia arriba de la pantalla y +x hacia la derecha.
import type { Vec3 } from './proyeccion';

export type Quat = [number, number, number, number];

export const IDENTIDAD: Quat = [0, 0, 0, 1];

export function multiplicar(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export const conjugado = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

export function normalizar(q: Quat): Quat {
  const n = Math.hypot(...q) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

export function ejeAngulo(eje: Vec3, angulo: number): Quat {
  const s = Math.sin(angulo / 2);
  const n = Math.hypot(...eje) || 1;
  return [(eje[0] / n) * s, (eje[1] / n) * s, (eje[2] / n) * s, Math.cos(angulo / 2)];
}

/** Gira el vector v con q. */
export function rotar(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  // v' = v + 2w(q×v) + 2 q×(q×v)
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

/** Matriz de rotación 3×3 (filas) — más rápida que rotar() en bucles. */
export function aMatriz(q: Quat): number[] {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}

/** Ángulo (rad) entre dos orientaciones. */
export function anguloEntre(a: Quat, b: Quat): number {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, d));
}

const EJE_X: Vec3 = [1, 0, 0];
const EJE_Y: Vec3 = [0, 1, 0];
const EJE_Z: Vec3 = [0, 0, 1];
const MENOS_90_X = ejeAngulo(EJE_X, -Math.PI / 2);

/**
 * Orientación de la cámara trasera a partir de DeviceOrientationEvent (grados)
 * y del ángulo de la pantalla (screen.orientation.angle, grados).
 * Equivale a DeviceOrientationControls de three.js.
 */
export function desdeOrientacionDispositivo(alfa: number, beta: number, gamma: number, pantalla = 0): Quat {
  const r = Math.PI / 180;
  // Euler en orden YXZ: Y(alfa) · X(beta) · Z(−gamma)
  let q = multiplicar(multiplicar(ejeAngulo(EJE_Y, alfa * r), ejeAngulo(EJE_X, beta * r)), ejeAngulo(EJE_Z, -gamma * r));
  q = multiplicar(q, MENOS_90_X); // la cámara mira por la espalda del teléfono
  q = multiplicar(q, ejeAngulo(EJE_Z, -pantalla * r)); // pantalla girada
  return normalizar(q);
}

/** Orientación que mira hacia (yaw, pitch) con la parte de arriba de la imagen hacia el cielo. */
export function desdeYawPitch(yaw: number, pitch: number, roll = 0): Quat {
  return normalizar(multiplicar(multiplicar(ejeAngulo(EJE_Y, -yaw), ejeAngulo(EJE_X, pitch)), ejeAngulo(EJE_Z, -roll)));
}

export const adelante = (q: Quat): Vec3 => rotar(q, [0, 0, -1]);
export const arriba = (q: Quat): Vec3 => rotar(q, [0, 1, 0]);

const punto = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cruz = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * Inclinación lateral (rad): cuánto está girada la imagen respecto al horizonte.
 * Devuelve null mirando casi recto arriba o abajo, donde no importa.
 */
export function alabeo(q: Quat): number | null {
  const f = adelante(q);
  const u = arriba(q);
  const w: Vec3 = [-f[0] * f[1], 1 - f[1] * f[1], -f[2] * f[1]]; // vertical proyectada
  if (Math.hypot(...w) < 0.2) return null;
  return Math.atan2(punto(cruz(u, w), f), punto(u, w));
}
