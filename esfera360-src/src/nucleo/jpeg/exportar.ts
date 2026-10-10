// Prepara un JPEG para exportar: quita EXIF y XMP originales y escribe
// un EXIF nuevo (con GPS solo si el usuario lo autorizó) más el XMP GPano.
import { crearSegmentoExif, esExif, type Gps } from './exif';
import { crearXmpGPano, gpanoCompleto, PREFIJO_XMP, segmentoXmp } from './gpano';
import { APP1, contenido, dimensionesJpeg, empiezaCon, reescribir } from './segmentos';

const PREFIJO_XMP_EXT = new TextEncoder().encode('http://ns.adobe.com/xmp/extension/\0');

export function prepararJpeg360(b: Uint8Array, opciones: { gps: Gps | null; rumbo?: number }): Uint8Array {
  const { ancho, alto } = dimensionesJpeg(b);
  const quitar = esExif(b);
  return reescribir(
    b,
    (s) =>
      quitar(s) ||
      (s.marcador === APP1 &&
        (empiezaCon(contenido(b, s), PREFIJO_XMP) || empiezaCon(contenido(b, s), PREFIJO_XMP_EXT))),
    [crearSegmentoExif(opciones.gps), segmentoXmp(crearXmpGPano(gpanoCompleto(ancho, alto, opciones.rumbo)))],
  );
}
