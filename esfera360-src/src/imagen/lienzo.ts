// Utilidades de imagen que dependen del navegador.
import type { ImagenRGBA } from '../nucleo/muestreo';

/** Límite seguro de un canvas en Safari iOS (≈16,7 MP). */
export const MAX_PIXELES_LIENZO = 16_000_000;

export async function cargarImagen(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error('No se pudo leer la imagen. ¿Es un JPEG, PNG o WebP válido?');
  } finally {
    // El elemento ya decodificado sigue siendo dibujable tras revocar la URL
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function crearLienzo(ancho: number, alto: number) {
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('El navegador no permite dibujar en un lienzo 2D.');
  return { lienzo, ctx };
}

export function lienzoABlob(lienzo: HTMLCanvasElement, tipo = 'image/jpeg', calidad = 0.92): Promise<Blob> {
  return new Promise((ok, mal) =>
    lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No hay memoria suficiente para generar la imagen.'))), tipo, calidad),
  );
}

/** Píxeles de la imagen, reducida si supera el límite del lienzo. */
export async function aRGBA(blob: Blob, maxPixeles = MAX_PIXELES_LIENZO): Promise<ImagenRGBA> {
  const img = await cargarImagen(blob);
  const escala = Math.min(1, Math.sqrt(maxPixeles / (img.naturalWidth * img.naturalHeight)));
  const ancho = Math.max(2, Math.round(img.naturalWidth * escala));
  const alto = Math.max(1, Math.round(img.naturalHeight * escala));
  const { ctx } = crearLienzo(ancho, alto);
  ctx.drawImage(img, 0, 0, ancho, alto);
  return { datos: ctx.getImageData(0, 0, ancho, alto).data, ancho, alto };
}

export async function rgbaABlob(img: ImagenRGBA, calidad = 0.92): Promise<Blob> {
  const { lienzo, ctx } = crearLienzo(img.ancho, img.alto);
  ctx.putImageData(new ImageData(img.datos as Uint8ClampedArray<ArrayBuffer>, img.ancho, img.alto), 0, 0);
  return lienzoABlob(lienzo, 'image/jpeg', calidad);
}

/** Miniatura 2:1 del panorama completo. */
export async function crearMiniatura(fuente: Blob | HTMLImageElement, ancho = 640): Promise<Blob> {
  const img = fuente instanceof Blob ? await cargarImagen(fuente) : fuente;
  const alto = Math.round(ancho / 2);
  const { lienzo, ctx } = crearLienzo(ancho, alto);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, ancho, alto);
  return lienzoABlob(lienzo, 'image/jpeg', 0.8);
}

/** Cede el hilo para que la interfaz alcance a pintar un indicador antes de un cálculo largo. */
export const ceder = () => new Promise((r) => setTimeout(r, 30));
