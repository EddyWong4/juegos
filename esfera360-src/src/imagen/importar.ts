import { guardarPanoramaListo } from '../datos/capturas';
import { leerGps } from '../nucleo/jpeg/exif';
import { extraerXmp, leerGPano } from '../nucleo/jpeg/gpano';
import { esJpeg } from '../nucleo/jpeg/segmentos';
import { esEquirectangularCompleta } from '../nucleo/proyeccion';
import { cargarImagen, crearLienzo, crearMiniatura, lienzoABlob, MAX_PIXELES_LIENZO } from './lienzo';

const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];

function tituloDesdeArchivo(nombre: string) {
  return nombre.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 120) || 'Panorama';
}

/** Importa una imagen equirectangular. Devuelve el id o lanza un Error con un mensaje para el usuario. */
export async function importarArchivo(archivo: File): Promise<string> {
  if (archivo.type && !TIPOS.includes(archivo.type)) {
    throw new Error(`«${archivo.name}» no es JPEG, PNG ni WebP.`);
  }
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const jpeg = esJpeg(bytes);

  let gpano = null;
  let gps = null;
  if (jpeg) {
    try {
      const xmp = extraerXmp(bytes);
      gpano = xmp ? leerGPano(xmp) : null;
      gps = leerGps(bytes);
    } catch {
      // Cabeceras raras: se sigue sin metadatos
    }
  }

  const img = await cargarImagen(archivo);
  const ancho = img.naturalWidth;
  const alto = img.naturalHeight;

  if (gpano && gpano.proyeccion !== 'equirectangular') {
    throw new Error(`«${archivo.name}» usa la proyección «${gpano.proyeccion}»; solo se admite la equirectangular.`);
  }
  if (gpano && (gpano.anchoRecorte < gpano.anchoCompleto || gpano.altoRecorte < gpano.altoCompleto)) {
    throw new Error(`«${archivo.name}» es un panorama parcial (no cubre la esfera completa). Por ahora solo se admiten esferas completas 2:1.`);
  }
  if (!esEquirectangularCompleta(ancho, alto)) {
    throw new Error(
      `«${archivo.name}» mide ${ancho}×${alto}. Una foto 360° equirectangular debe ser el doble de ancha que de alta (2:1).`,
    );
  }

  // Si no es JPEG se convierte, para poder escribir los metadatos GPano al exportar.
  let imagen: Blob = archivo;
  let anchoFinal = ancho;
  let altoFinal = alto;
  if (!jpeg) {
    const escala = Math.min(1, Math.sqrt(MAX_PIXELES_LIENZO / (ancho * alto)));
    anchoFinal = Math.round(ancho * escala);
    altoFinal = Math.round(alto * escala);
    const { lienzo, ctx } = crearLienzo(anchoFinal, altoFinal);
    ctx.drawImage(img, 0, 0, anchoFinal, altoFinal);
    imagen = await lienzoABlob(lienzo, 'image/jpeg', 0.92);
  }

  return guardarPanoramaListo({
    titulo: tituloDesdeArchivo(archivo.name),
    origen: 'importada',
    imagen,
    ancho: anchoFinal,
    alto: altoFinal,
    miniatura: await crearMiniatura(img),
    gps,
    rumbo: gpano?.rumbo,
  });
}
