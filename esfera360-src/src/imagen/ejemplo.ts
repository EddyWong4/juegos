// Panorama de ejemplo dibujado en el momento (sin descargar nada), útil para
// probar el visor y la exportación sin tener todavía una foto 360°.
import { guardarPanoramaListo } from '../datos/capturas';
import { lonLatAPixel, gradosARad } from '../nucleo/proyeccion';
import { crearLienzo, crearMiniatura, lienzoABlob } from './lienzo';

const W = 4096;
const H = 2048;

function aleatorio(semilla: number) {
  return () => {
    semilla = (semilla * 1664525 + 1013904223) >>> 0;
    return semilla / 2 ** 32;
  };
}

const px = (lonGrados: number, latGrados: number) => lonLatAPixel(gradosARad(lonGrados), gradosARad(latGrados), W, H);

/** Dibuja el panorama de ejemplo en un lienzo (también lo usa el simulador de captura). */
export function dibujarEjemplo(): HTMLCanvasElement {
  const { lienzo, ctx } = crearLienzo(W, H);

  // Cielo y suelo
  const cielo = ctx.createLinearGradient(0, 0, 0, H / 2);
  cielo.addColorStop(0, '#0b2a6b');
  cielo.addColorStop(1, '#9cc8f5');
  ctx.fillStyle = cielo;
  ctx.fillRect(0, 0, W, H / 2);
  const suelo = ctx.createLinearGradient(0, H / 2, 0, H);
  suelo.addColorStop(0, '#5b7f2a');
  suelo.addColorStop(1, '#22340d');
  ctx.fillStyle = suelo;
  ctx.fillRect(0, H / 2, W, H / 2);

  // Sol
  const sol = px(45, 35);
  const brillo = ctx.createRadialGradient(sol.x, sol.y, 10, sol.x, sol.y, 160);
  brillo.addColorStop(0, 'rgba(255,250,200,1)');
  brillo.addColorStop(0.35, 'rgba(255,230,140,0.9)');
  brillo.addColorStop(1, 'rgba(255,230,140,0)');
  ctx.fillStyle = brillo;
  ctx.fillRect(sol.x - 200, sol.y - 200, 400, 400);

  // Edificios en el horizonte
  const azar = aleatorio(360);
  const colores = ['#c2410c', '#0f766e', '#7c3aed', '#be123c', '#a16207', '#1d4ed8', '#475569'];
  for (let lon = -180; lon < 180; ) {
    const ancho = 6 + azar() * 12;
    const alto = 4 + azar() * 22;
    // Sin normalizar la longitud: un edificio que cruza ±180° se dibuja dos veces
    const a = px(lon, alto);
    const anchoPx = (ancho / 360) * W - 3;
    const altoPx = H / 2 - a.y;
    const color = colores[Math.floor(azar() * colores.length)];
    for (const x of a.x + anchoPx > W ? [a.x, a.x - W] : [a.x]) {
      ctx.fillStyle = color;
      ctx.fillRect(x, a.y, anchoPx, altoPx);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let fy = a.y + 14; fy < H / 2 - 18; fy += 26) {
        for (let fx = x + 8; fx < x + anchoPx - 15; fx += 22) ctx.fillRect(fx, fy, 9, 13);
      }
    }
    lon += ancho + azar() * 6;
  }

  // Cuadrícula cada 30° (útil para comprobar la proyección)
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let lon = -180; lon <= 180; lon += 30) {
    const { x } = px(lon, 0);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const { y } = px(0, lat);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Puntos cardinales y grados en el horizonte
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cardinales: [number, string][] = [
    [0, 'N'],
    [90, 'E'],
    [180, 'S'],
    [-90, 'O'],
  ];
  for (const [lon, letra] of cardinales) {
    for (const x of lon === 180 ? [0, W] : [px(lon, 0).x]) {
      const { y } = px(lon, -12);
      ctx.fillStyle = 'rgba(15,23,42,0.75)';
      ctx.beginPath();
      ctx.arc(x, y, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 96px system-ui, sans-serif';
      ctx.fillText(letra, x, y + 4);
    }
  }
  ctx.font = '600 34px system-ui, sans-serif';
  for (let lon = -150; lon <= 150; lon += 30) {
    if (lon % 90 === 0) continue;
    const { x, y } = px(lon, -8);
    ctx.fillStyle = '#fff';
    ctx.fillText(`${lon}°`, x, y);
  }

  // Firma en la zona del nadir
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let lon = -150; lon <= 180; lon += 60) {
    const { x, y } = px(lon, -72);
    ctx.fillText('Esfera360', x, y);
  }

  return lienzo;
}

export async function crearPanoramaEjemplo(): Promise<string> {
  const imagen = await lienzoABlob(dibujarEjemplo(), 'image/jpeg', 0.9);
  return guardarPanoramaListo({
    titulo: 'Panorama de ejemplo',
    origen: 'ejemplo',
    imagen,
    ancho: W,
    alto: H,
    miniatura: await crearMiniatura(imagen),
    gps: null,
  });
}
