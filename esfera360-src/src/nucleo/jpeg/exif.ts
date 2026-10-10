// EXIF mínimo: leer la ubicación GPS y escribir un bloque nuevo (programa + GPS opcional).
// Al exportar se reemplaza el EXIF original para no filtrar datos sin permiso.
import { APP1, ascii, contenido, crearSegmento, empiezaCon, leerEstructura, type Segmento } from './segmentos';

export const PREFIJO_EXIF = ascii('Exif\0\0');

export interface Gps {
  lat: number;
  lng: number;
  alt?: number;
}

const TAG_SOFTWARE = 0x0131;
const TAG_GPS_IFD = 0x8825;
const BYTE = 1;
const ASCII = 2;
const LONG = 4;
const RATIONAL = 5;

export const esExif = (b: Uint8Array) => (s: Segmento) =>
  s.marcador === APP1 && empiezaCon(contenido(b, s), PREFIJO_EXIF);

// ───────────────────────── Lectura ─────────────────────────

export function leerGps(b: Uint8Array): Gps | null {
  const { segmentos } = leerEstructura(b);
  const seg = segmentos.find(esExif(b));
  if (!seg) return null;
  const tiff = contenido(b, seg).subarray(PREFIJO_EXIF.length);
  try {
    return leerGpsTiff(tiff);
  } catch {
    return null; // EXIF dañado: se ignora
  }
}

function leerGpsTiff(t: Uint8Array): Gps | null {
  const vista = new DataView(t.buffer, t.byteOffset, t.byteLength);
  const le = t[0] === 0x49; // 'II' = little endian, 'MM' = big endian
  const u16 = (o: number) => vista.getUint16(o, le);
  const u32 = (o: number) => vista.getUint32(o, le);
  const entradas = (ifd: number) => {
    const n = u16(ifd);
    const lista = [];
    for (let k = 0; k < n; k++) {
      const e = ifd + 2 + k * 12;
      lista.push({ tag: u16(e), tipo: u16(e + 2), cuenta: u32(e + 4), pos: e + 8 });
    }
    return lista;
  };
  const gpsPtr = entradas(u32(4)).find((e) => e.tag === TAG_GPS_IFD);
  if (!gpsPtr) return null;
  const gps = new Map(entradas(u32(gpsPtr.pos)).map((e) => [e.tag, e]));
  const racional = (o: number) => u32(o) / (u32(o + 4) || 1);
  const grados = (tag: number) => {
    const e = gps.get(tag);
    if (!e || e.tipo !== RATIONAL || e.cuenta < 3) return null;
    const o = u32(e.pos);
    return racional(o) + racional(o + 8) / 60 + racional(o + 16) / 3600;
  };
  const letra = (tag: number) => {
    const e = gps.get(tag);
    return e ? String.fromCharCode(t[e.pos]) : '';
  };
  const lat = grados(2);
  const lng = grados(4);
  if (lat === null || lng === null) return null;
  const resultado: Gps = {
    lat: letra(1) === 'S' ? -lat : lat,
    lng: letra(3) === 'W' ? -lng : lng,
  };
  const alt = gps.get(6);
  if (alt && alt.tipo === RATIONAL) {
    const signo = gps.get(5) && t[gps.get(5)!.pos] === 1 ? -1 : 1;
    resultado.alt = signo * racional(u32(alt.pos));
  }
  return resultado;
}

// ───────────────────────── Escritura (little endian) ─────────────────────────

interface Entrada {
  tag: number;
  tipo: number;
  cuenta: number;
  valor: Uint8Array; // ya codificado en little endian
}

const par = (n: number) => n + (n & 1);

function tamanoIfd(entradas: Entrada[]) {
  return 2 + entradas.length * 12 + 4 + entradas.reduce((s, e) => s + (e.valor.length > 4 ? par(e.valor.length) : 0), 0);
}

function escribirIfd(destino: DataView, bytes: Uint8Array, inicio: number, entradas: Entrada[]) {
  destino.setUint16(inicio, entradas.length, true);
  let datos = inicio + 2 + entradas.length * 12 + 4;
  entradas.forEach((e, k) => {
    const p = inicio + 2 + k * 12;
    destino.setUint16(p, e.tag, true);
    destino.setUint16(p + 2, e.tipo, true);
    destino.setUint32(p + 4, e.cuenta, true);
    if (e.valor.length <= 4) {
      bytes.set(e.valor, p + 8);
    } else {
      destino.setUint32(p + 8, datos, true);
      bytes.set(e.valor, datos);
      datos += par(e.valor.length);
    }
  });
  destino.setUint32(inicio + 2 + entradas.length * 12, 0, true); // sin IFD siguiente
}

const texto = (s: string): Entrada['valor'] => ascii(s + '\0');

function largo(n: number) {
  const v = new Uint8Array(4);
  new DataView(v.buffer).setUint32(0, n, true);
  return v;
}

function racionales(valores: [number, number][]) {
  const v = new Uint8Array(valores.length * 8);
  const d = new DataView(v.buffer);
  valores.forEach(([num, den], k) => {
    d.setUint32(k * 8, num, true);
    d.setUint32(k * 8 + 4, den, true);
  });
  return v;
}

/** Grados decimales → [grados, minutos, segundos×10000] como racionales. */
export function aGms(valor: number): [number, number][] {
  const abs = Math.abs(valor);
  let g = Math.floor(abs);
  let m = Math.floor((abs - g) * 60);
  let s = Math.round(((abs - g) * 60 - m) * 60 * 10000);
  if (s >= 600000) {
    s -= 600000;
    m += 1;
  }
  if (m >= 60) {
    m -= 60;
    g += 1;
  }
  return [
    [g, 1],
    [m, 1],
    [s, 10000],
  ];
}

/** Segmento APP1 EXIF nuevo con el nombre del programa y, si se da, la ubicación. */
export function crearSegmentoExif(gps: Gps | null, software = 'Esfera360'): Uint8Array {
  const ifd0: Entrada[] = [{ tag: TAG_SOFTWARE, tipo: ASCII, cuenta: software.length + 1, valor: texto(software) }];
  let ifdGps: Entrada[] = [];
  if (gps) {
    ifdGps = [
      { tag: 0, tipo: BYTE, cuenta: 4, valor: new Uint8Array([2, 3, 0, 0]) },
      { tag: 1, tipo: ASCII, cuenta: 2, valor: texto(gps.lat < 0 ? 'S' : 'N') },
      { tag: 2, tipo: RATIONAL, cuenta: 3, valor: racionales(aGms(gps.lat)) },
      { tag: 3, tipo: ASCII, cuenta: 2, valor: texto(gps.lng < 0 ? 'W' : 'E') },
      { tag: 4, tipo: RATIONAL, cuenta: 3, valor: racionales(aGms(gps.lng)) },
    ];
    if (gps.alt !== undefined && Number.isFinite(gps.alt)) {
      ifdGps.push(
        { tag: 5, tipo: BYTE, cuenta: 1, valor: new Uint8Array([gps.alt < 0 ? 1 : 0]) },
        { tag: 6, tipo: RATIONAL, cuenta: 1, valor: racionales([[Math.round(Math.abs(gps.alt) * 100), 100]]) },
      );
    }
    ifd0.push({ tag: TAG_GPS_IFD, tipo: LONG, cuenta: 1, valor: new Uint8Array(4) });
  }
  const inicioGps = 8 + tamanoIfd(ifd0);
  if (gps) ifd0[ifd0.length - 1].valor = largo(inicioGps);
  const total = inicioGps + (gps ? tamanoIfd(ifdGps) : 0);

  const tiff = new Uint8Array(total);
  const vista = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49, 0x2a, 0x00]); // "II*\0"
  vista.setUint32(4, 8, true);
  escribirIfd(vista, tiff, 8, ifd0);
  if (gps) escribirIfd(vista, tiff, inicioGps, ifdGps);

  const datos = new Uint8Array(PREFIJO_EXIF.length + tiff.length);
  datos.set(PREFIJO_EXIF, 0);
  datos.set(tiff, PREFIJO_EXIF.length);
  return crearSegmento(APP1, datos);
}
