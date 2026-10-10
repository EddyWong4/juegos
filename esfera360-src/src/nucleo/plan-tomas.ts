// Plan de tomas: dónde apuntar para cubrir la esfera completa con traslape.
import { gradosARad } from './proyeccion';

export interface Objetivo {
  n: number;
  yaw: number; // rad
  pitch: number; // rad
  polo: boolean; // cenit o nadir (el giro de la imagen no importa)
}

/** Campo de visión del lado corto a partir del lado largo y la proporción (corto/largo). */
export function fovCorto(fovLargo: number, proporcion: number): number {
  return 2 * Math.atan(Math.tan(fovLargo / 2) * proporcion);
}

/**
 * Genera los objetivos para un teléfono en vertical (lado largo = vertical).
 * fovLargoGrados: campo de visión del lado largo de la imagen.
 * proporcion: lado corto / lado largo de la imagen (0,75 para 4:3; 0,5625 para 16:9).
 */
export function generarPlan(fovLargoGrados: number, proporcion: number, traslape = 0.3): Objetivo[] {
  const vFov = gradosARad(fovLargoGrados);
  const hFov = fovCorto(vFov, proporcion);
  const paso = vFov * (1 - traslape);
  const filas = Math.ceil(Math.PI / paso) + 1; // incluye cenit y nadir
  const pitches: number[] = [];
  for (let i = 0; i < filas; i++) pitches.push(-Math.PI / 2 + (Math.PI * i) / (filas - 1));

  const objetivos: Omit<Objetivo, 'n'>[] = [];
  const anillos = pitches.filter((p) => Math.abs(Math.abs(p) - Math.PI / 2) > 1e-6);
  // Primero el anillo más cercano al horizonte, luego alternando arriba y abajo
  anillos.sort((a, b) => Math.abs(a) - Math.abs(b) || b - a);
  anillos.forEach((pitch, k) => {
    // Ancho en longitud que cubre una foto en el borde del anillo más cercano al horizonte
    const latBorde = Math.max(0, Math.abs(pitch) - vFov / 2);
    const anchoLon = hFov / Math.cos(latBorde);
    const cantidad = Math.max(3, Math.ceil((2 * Math.PI) / (anchoLon * (1 - traslape))));
    const desfase = k % 2 === 1 ? Math.PI / cantidad : 0; // escalonar anillos
    for (let i = 0; i < cantidad; i++) {
      let yaw = desfase + (2 * Math.PI * i) / cantidad;
      if (yaw > Math.PI) yaw -= 2 * Math.PI;
      objetivos.push({ yaw, pitch, polo: false });
    }
  });
  objetivos.push({ yaw: 0, pitch: Math.PI / 2, polo: true }, { yaw: 0, pitch: -Math.PI / 2, polo: true });
  return objetivos.map((o, n) => ({ ...o, n }));
}
