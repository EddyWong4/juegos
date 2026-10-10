// Lectura y reescritura de segmentos de cabecera JPEG (sin recomprimir la imagen).

export interface Segmento {
  marcador: number; // segundo byte del marcador (0xE1 = APP1, 0xC0 = SOF0…)
  inicio: number; // posición del 0xFF
  fin: number; // posición siguiente al segmento (exclusiva)
}

export interface EstructuraJpeg {
  segmentos: Segmento[];
  inicioDatos: number; // posición del marcador SOS; de ahí al final se copia tal cual
}

export const APP0 = 0xe0;
export const APP1 = 0xe1;
const SOS = 0xda;

export function esJpeg(b: Uint8Array): boolean {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

export function leerEstructura(b: Uint8Array): EstructuraJpeg {
  if (!esJpeg(b)) throw new Error('No es un archivo JPEG');
  const segmentos: Segmento[] = [];
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error(`JPEG dañado en la posición ${i}`);
    while (b[i + 1] === 0xff) i++; // bytes de relleno
    const marcador = b[i + 1];
    if (marcador === SOS) return { segmentos, inicioDatos: i };
    if ((marcador >= 0xd0 && marcador <= 0xd7) || marcador === 0x01) {
      segmentos.push({ marcador, inicio: i, fin: i + 2 });
      i += 2;
      continue;
    }
    if (i + 3 >= b.length) break;
    const largo = (b[i + 2] << 8) | b[i + 3];
    const fin = i + 2 + largo;
    if (fin > b.length) throw new Error('JPEG truncado');
    segmentos.push({ marcador, inicio: i, fin });
    i = fin;
  }
  throw new Error('JPEG sin datos de imagen');
}

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

export function dimensionesJpeg(b: Uint8Array): { ancho: number; alto: number } {
  const { segmentos } = leerEstructura(b);
  const sof = segmentos.find((s) => SOF.has(s.marcador));
  if (!sof) throw new Error('JPEG sin cabecera de tamaño');
  return {
    alto: (b[sof.inicio + 5] << 8) | b[sof.inicio + 6],
    ancho: (b[sof.inicio + 7] << 8) | b[sof.inicio + 8],
  };
}

/** Contenido del segmento (sin marcador ni longitud). */
export function contenido(b: Uint8Array, s: Segmento): Uint8Array {
  return b.subarray(s.inicio + 4, s.fin);
}

export function empiezaCon(datos: Uint8Array, prefijo: Uint8Array): boolean {
  if (datos.length < prefijo.length) return false;
  for (let i = 0; i < prefijo.length; i++) if (datos[i] !== prefijo[i]) return false;
  return true;
}

export const ascii = (s: string) => new TextEncoder().encode(s);

export function crearSegmento(marcador: number, datos: Uint8Array): Uint8Array {
  const largo = datos.length + 2;
  if (largo > 0xffff) throw new Error('Segmento JPEG demasiado grande (máx. 64 KB)');
  const s = new Uint8Array(largo + 2);
  s[0] = 0xff;
  s[1] = marcador;
  s[2] = largo >> 8;
  s[3] = largo & 0xff;
  s.set(datos, 4);
  return s;
}

/**
 * Quita los segmentos que cumplan `quitar` e inserta `nuevos` justo después
 * de SOI y del APP0 (JFIF) inicial, si existe. El resto se copia sin cambios.
 */
export function reescribir(b: Uint8Array, quitar: (s: Segmento) => boolean, nuevos: Uint8Array[]): Uint8Array {
  const { segmentos, inicioDatos } = leerEstructura(b);
  const partes: Uint8Array[] = [b.subarray(0, 2)];
  let k = 0;
  while (k < segmentos.length && segmentos[k].marcador === APP0) {
    if (!quitar(segmentos[k])) partes.push(b.subarray(segmentos[k].inicio, segmentos[k].fin));
    k++;
  }
  partes.push(...nuevos);
  for (; k < segmentos.length; k++) {
    if (!quitar(segmentos[k])) partes.push(b.subarray(segmentos[k].inicio, segmentos[k].fin));
  }
  partes.push(b.subarray(inicioDatos));
  const total = partes.reduce((n, p) => n + p.length, 0);
  const salida = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    salida.set(p, pos);
    pos += p.length;
  }
  return salida;
}
