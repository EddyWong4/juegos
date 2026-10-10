import { desdeOrientacionDispositivo, type Quat } from '../nucleo/cuaternion';

type EventoConPermiso = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

export function hayOrientacion() {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

/** En iOS hay que pedir permiso dentro de un toque del usuario. */
export async function pedirPermisoOrientacion(): Promise<boolean> {
  const E = window.DeviceOrientationEvent as EventoConPermiso | undefined;
  if (!E) return false;
  if (typeof E.requestPermission !== 'function') return true;
  try {
    return (await E.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export function anguloPantalla(): number {
  const a = screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0;
  return a;
}

/**
 * Escucha la orientación de la cámara trasera. Devuelve la función para dejar de escuchar.
 * Si en `msSinDatos` no llega ningún dato válido, llama a `alFallar` (p. ej. computadora sin giroscopio).
 */
export function escucharOrientacion(alCambiar: (q: Quat) => void, alFallar: () => void, msSinDatos = 2500) {
  let recibido = false;
  const manejar = (e: DeviceOrientationEvent) => {
    if (e.alpha === null || e.beta === null || e.gamma === null) return;
    recibido = true;
    alCambiar(desdeOrientacionDispositivo(e.alpha, e.beta, e.gamma, anguloPantalla()));
  };
  window.addEventListener('deviceorientation', manejar);
  const espera = setTimeout(() => {
    if (!recibido) alFallar();
  }, msSinDatos);
  return () => {
    clearTimeout(espera);
    window.removeEventListener('deviceorientation', manejar);
  };
}
