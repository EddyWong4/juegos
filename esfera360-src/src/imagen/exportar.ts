import type { Captura, Panorama } from '../datos/db';
import type { Gps } from '../nucleo/jpeg/exif';
import { prepararJpeg360 } from '../nucleo/jpeg/exportar';
import type { ImagenRGBA } from '../nucleo/muestreo';
import { aRGBA, rgbaABlob } from './lienzo';

export function nombreArchivo(titulo: string, sufijo: string) {
  const base =
    titulo
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'panorama';
  return `${base}-${sufijo}.jpg`;
}

/** JPEG 360° con XMP GPano y EXIF nuevo (GPS solo si se pasa). */
export async function archivo360(captura: Captura, panorama: Panorama, gps: Gps | null): Promise<File> {
  const bytes = new Uint8Array(await panorama.imagen.arrayBuffer());
  const salida = prepararJpeg360(bytes, { gps, rumbo: captura.rumbo });
  return new File([salida as Uint8Array<ArrayBuffer>], nombreArchivo(captura.titulo, '360'), { type: 'image/jpeg' });
}

export type Encuadre =
  | { modo: 'plano'; yaw: number; pitch: number; hFovGrados: number; ancho: number; alto: number }
  | { modo: 'planeta'; yaw: number; lado: number };

function renderizarEnWorker(fuente: ImagenRGBA, encuadre: Encuadre): Promise<ImagenRGBA> {
  return new Promise((ok, mal) => {
    const w = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<ImagenRGBA>) => {
      ok(e.data);
      w.terminate();
    };
    w.onerror = (e) => {
      mal(new Error(e.message || 'Falló el cálculo de la imagen.'));
      w.terminate();
    };
    w.postMessage({ fuente, encuadre }, [fuente.datos.buffer]);
  });
}

/** Imagen plana (encuadre normal o «planeta pequeño») calculada desde el panorama original. */
export async function archivoEncuadre(captura: Captura, panorama: Panorama, e: Encuadre): Promise<File> {
  const fuente = await aRGBA(panorama.imagen);
  const img = await renderizarEnWorker(fuente, e);
  const blob = await rgbaABlob(img);
  return new File([blob], nombreArchivo(captura.titulo, e.modo === 'plano' ? 'encuadre' : 'planeta'), {
    type: 'image/jpeg',
  });
}
