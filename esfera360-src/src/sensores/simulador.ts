// SOLO PARA DESARROLLO (#/capturar?simular=1 con «npm run dev»).
// Cámara falsa que «filma» el panorama de ejemplo según hacia dónde apunta un teléfono
// virtual, y eventos deviceorientation sintéticos controlados con el teclado:
// flechas = girar / inclinar, Q/E = ladear, Espacio = sin uso (dispara la app sola).
import { desdeOrientacionDispositivo } from '../nucleo/cuaternion';
import { focal, rayoToma } from '../nucleo/cosido';
import { renderizar } from '../nucleo/muestreo';
import { gradosARad } from '../nucleo/proyeccion';
import { dibujarEjemplo } from '../imagen/ejemplo';

export const FOV_SIMULADO = 65;

export interface Simulador {
  stream: MediaStream;
  mirar: (yawGrados: number, pitchGrados: number, rollGrados?: number) => void;
  detener: () => void;
}

export function crearSimulador(): Simulador {
  const fuente = dibujarEjemplo();
  const pano = {
    datos: fuente.getContext('2d')!.getImageData(0, 0, fuente.width, fuente.height).data,
    ancho: fuente.width,
    alto: fuente.height,
  };
  const W = 300;
  const H = 400;
  const lienzo = document.createElement('canvas');
  lienzo.width = W;
  lienzo.height = H;
  const ctx = lienzo.getContext('2d')!;
  const f = focal({ ancho: W, alto: H }, gradosARad(FOV_SIMULADO));
  let yaw = 0;
  let pitch = 0;
  let roll = 0;

  // Teléfono vertical: alfa = −yaw, beta = 90 + pitch, gamma = −roll
  const angulos = () => ({ alpha: -yaw, beta: 90 + pitch, gamma: -roll });

  const tic = setInterval(() => {
    const a = angulos();
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', a));
    const q = desdeOrientacionDispositivo(a.alpha, a.beta, a.gamma, 0);
    const img = renderizar(pano, W, H, (u, v) => rayoToma(u + 0.5, v + 0.5, W, H, f, q));
    ctx.putImageData(new ImageData(img.datos as Uint8ClampedArray<ArrayBuffer>, W, H), 0, 0);
  }, 60);

  const tecla = (e: KeyboardEvent) => {
    const paso = e.shiftKey ? 10 : 2;
    if (e.key === 'ArrowLeft') yaw -= paso;
    else if (e.key === 'ArrowRight') yaw += paso;
    else if (e.key === 'ArrowUp') pitch = Math.min(90, pitch + paso);
    else if (e.key === 'ArrowDown') pitch = Math.max(-90, pitch - paso);
    else if (e.key === 'q') roll -= paso;
    else if (e.key === 'e') roll += paso;
    else return;
    e.preventDefault();
  };
  window.addEventListener('keydown', tecla);

  return {
    stream: lienzo.captureStream(15),
    mirar: (y, p, r = 0) => {
      yaw = y;
      pitch = p;
      roll = r;
    },
    detener: () => {
      clearInterval(tic);
      window.removeEventListener('keydown', tecla);
    },
  };
}
