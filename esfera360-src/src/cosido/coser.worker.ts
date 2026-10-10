// Cosido en segundo plano: decodifica las tomas, las proyecta y codifica el JPEG final.
import { ejeAngulo, multiplicar, adelante, type Quat } from '../nucleo/cuaternion';
import { coser, rellenarHuecos, type TomaCosido } from '../nucleo/cosido';
import { direccionALonLat, gradosARad } from '../nucleo/proyeccion';

export interface PedidoCosido {
  tomas: { imagen: Blob; q: Quat; n: number }[];
  fovLargo: number; // grados
  ancho: number;
}

export type MensajeCosido =
  | { tipo: 'progreso'; etapa: string; fraccion: number }
  | { tipo: 'listo'; imagen: Blob; miniatura: Blob; ancho: number; alto: number }
  | { tipo: 'error'; mensaje: string };

const enviar = (m: MensajeCosido) => (self as unknown as Worker).postMessage(m);

self.onmessage = async (e: MessageEvent<PedidoCosido>) => {
  try {
    const { tomas, fovLargo, ancho } = e.data;
    if (typeof OffscreenCanvas === 'undefined') {
      throw new Error('Este navegador no permite coser en segundo plano. Actualiza Safari (16.4 o más nuevo) o usa Chrome.');
    }
    const fov = gradosARad(fovLargo);
    // Resolución útil de cada toma: un poco más que la del panorama final
    const pxPorRad = ancho / (2 * Math.PI);
    const ladoLargo = Math.ceil(pxPorRad * fov * 1.15);

    // El centro del panorama será la dirección de la primera toma del horizonte
    const primera = tomas.reduce((a, b) => (b.n < a.n ? b : a));
    const yaw0 = direccionALonLat(adelante(primera.q)).lon;
    const giro = ejeAngulo([0, 1, 0], yaw0);

    const listas: TomaCosido[] = [];
    for (const [i, t] of tomas.entries()) {
      enviar({ tipo: 'progreso', etapa: 'Preparando fotos', fraccion: i / tomas.length });
      const bmp = await createImageBitmap(t.imagen);
      const escala = Math.min(1, ladoLargo / Math.max(bmp.width, bmp.height));
      const w = Math.max(2, Math.round(bmp.width * escala));
      const h = Math.max(2, Math.round(bmp.height * escala));
      const lienzo = new OffscreenCanvas(w, h);
      const ctx = lienzo.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, w, h);
      bmp.close();
      listas.push({ img: { datos: ctx.getImageData(0, 0, w, h).data, ancho: w, alto: h }, q: multiplicar(giro, t.q) });
    }

    const r = coser(listas, fov, ancho, (f) => enviar({ tipo: 'progreso', etapa: 'Uniendo fotos', fraccion: f }));
    listas.length = 0; // liberar memoria antes de codificar
    enviar({ tipo: 'progreso', etapa: 'Rellenando el suelo', fraccion: 1 });
    rellenarHuecos(r);

    enviar({ tipo: 'progreso', etapa: 'Guardando', fraccion: 1 });
    const lienzo = new OffscreenCanvas(r.ancho, r.alto);
    const ctx = lienzo.getContext('2d')!;
    ctx.putImageData(new ImageData(r.datos as Uint8ClampedArray<ArrayBuffer>, r.ancho, r.alto), 0, 0);
    const imagen = await lienzo.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
    const mini = new OffscreenCanvas(640, 320);
    const mctx = mini.getContext('2d')!;
    mctx.imageSmoothingQuality = 'high';
    mctx.drawImage(lienzo, 0, 0, 640, 320);
    const miniatura = await mini.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    enviar({ tipo: 'listo', imagen, miniatura, ancho: r.ancho, alto: r.alto });
  } catch (err) {
    const mensaje =
      err instanceof RangeError
        ? 'No hay memoria suficiente para unir las fotos. Cierra otras apps e inténtalo de nuevo.'
        : err instanceof Error
          ? err.message
          : 'Falló el cosido.';
    enviar({ tipo: 'error', mensaje });
  }
};
