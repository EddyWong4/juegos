// Metadatos XMP GPano: lo que Google Photos, Facebook y otros usan para
// reconocer una foto como 360°.
// https://developers.google.com/streetview/spherical-metadata
import { APP1, ascii, contenido, crearSegmento, empiezaCon, leerEstructura, reescribir, type Segmento } from './segmentos';

export const PREFIJO_XMP = ascii('http://ns.adobe.com/xap/1.0/\0');
const PREFIJO_XMP_EXTENDIDO = ascii('http://ns.adobe.com/xmp/extension/\0');

export interface DatosGPano {
  proyeccion: string;
  anchoCompleto: number;
  altoCompleto: number;
  anchoRecorte: number;
  altoRecorte: number;
  izquierda: number;
  arriba: number;
  rumbo?: number; // PoseHeadingDegrees: hacia dónde mira el centro de la imagen (0 = norte)
}

/** Datos GPano de una esfera completa sin recorte. */
export function gpanoCompleto(ancho: number, alto: number, rumbo?: number): DatosGPano {
  return {
    proyeccion: 'equirectangular',
    anchoCompleto: ancho,
    altoCompleto: alto,
    anchoRecorte: ancho,
    altoRecorte: alto,
    izquierda: 0,
    arriba: 0,
    rumbo,
  };
}

export function crearXmpGPano(d: DatosGPano, software = 'Esfera360'): string {
  const rumbo = d.rumbo === undefined ? '' : `\n    GPano:PoseHeadingDegrees="${d.rumbo.toFixed(1)}"`;
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="${software}">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:GPano="http://ns.google.com/photos/1.0/panorama/"
    GPano:UsePanoramaViewer="True"
    GPano:ProjectionType="${d.proyeccion}"
    GPano:FullPanoWidthPixels="${d.anchoCompleto}"
    GPano:FullPanoHeightPixels="${d.altoCompleto}"
    GPano:CroppedAreaImageWidthPixels="${d.anchoRecorte}"
    GPano:CroppedAreaImageHeightPixels="${d.altoRecorte}"
    GPano:CroppedAreaLeftPixels="${d.izquierda}"
    GPano:CroppedAreaTopPixels="${d.arriba}"${rumbo}
    GPano:StitchingSoftware="${software}"/>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/** Lee un campo GPano tanto en forma de atributo como de elemento. */
function campo(xmp: string, nombre: string): string | undefined {
  const attr = new RegExp(`GPano:${nombre}\\s*=\\s*["']([^"']*)["']`).exec(xmp);
  if (attr) return attr[1];
  const elem = new RegExp(`<GPano:${nombre}>([^<]*)</GPano:${nombre}>`).exec(xmp);
  return elem?.[1];
}

export function leerGPano(xmp: string): DatosGPano | null {
  const proyeccion = campo(xmp, 'ProjectionType');
  if (!proyeccion) return null;
  const n = (nombre: string) => {
    const v = campo(xmp, nombre);
    return v === undefined ? NaN : Number(v);
  };
  const anchoCompleto = n('FullPanoWidthPixels');
  const altoCompleto = n('FullPanoHeightPixels');
  const anchoRecorte = n('CroppedAreaImageWidthPixels');
  const altoRecorte = n('CroppedAreaImageHeightPixels');
  const rumbo = n('PoseHeadingDegrees');
  return {
    proyeccion,
    anchoCompleto,
    altoCompleto,
    anchoRecorte: Number.isFinite(anchoRecorte) ? anchoRecorte : anchoCompleto,
    altoRecorte: Number.isFinite(altoRecorte) ? altoRecorte : altoCompleto,
    izquierda: n('CroppedAreaLeftPixels') || 0,
    arriba: n('CroppedAreaTopPixels') || 0,
    rumbo: Number.isFinite(rumbo) ? rumbo : undefined,
  };
}

const esXmp = (b: Uint8Array) => (s: Segmento) =>
  s.marcador === APP1 &&
  (empiezaCon(contenido(b, s), PREFIJO_XMP) || empiezaCon(contenido(b, s), PREFIJO_XMP_EXTENDIDO));

/** Texto XMP principal del JPEG, o null. */
export function extraerXmp(b: Uint8Array): string | null {
  const { segmentos } = leerEstructura(b);
  for (const s of segmentos) {
    const c = contenido(b, s);
    if (s.marcador === APP1 && empiezaCon(c, PREFIJO_XMP)) {
      return new TextDecoder().decode(c.subarray(PREFIJO_XMP.length));
    }
  }
  return null;
}

export function segmentoXmp(xmp: string): Uint8Array {
  const texto = ascii(xmp);
  const datos = new Uint8Array(PREFIJO_XMP.length + texto.length);
  datos.set(PREFIJO_XMP, 0);
  datos.set(texto, PREFIJO_XMP.length);
  return crearSegmento(APP1, datos);
}

/** Sustituye cualquier XMP existente por uno con los datos GPano. */
export function insertarGPano(b: Uint8Array, d: DatosGPano): Uint8Array {
  return reescribir(b, esXmp(b), [segmentoXmp(crearXmpGPano(d))]);
}
