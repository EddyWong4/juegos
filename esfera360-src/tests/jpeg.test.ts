import { describe, expect, it } from 'vitest';
import { aGms, crearSegmentoExif, leerGps } from '../src/nucleo/jpeg/exif';
import { prepararJpeg360 } from '../src/nucleo/jpeg/exportar';
import { crearXmpGPano, extraerXmp, gpanoCompleto, insertarGPano, leerGPano } from '../src/nucleo/jpeg/gpano';
import { APP1, ascii, crearSegmento, dimensionesJpeg, leerEstructura } from '../src/nucleo/jpeg/segmentos';

/** JPEG mínimo con la estructura real de cabeceras (los datos de imagen son de relleno). */
function jpegFalso(ancho: number, alto: number, extra: Uint8Array[] = []): Uint8Array {
  const app0 = crearSegmento(0xe0, new Uint8Array([0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]));
  const sof0 = crearSegmento(
    0xc0,
    new Uint8Array([8, alto >> 8, alto & 0xff, ancho >> 8, ancho & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
  );
  const sos = crearSegmento(0xda, new Uint8Array([3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]));
  const datos = new Uint8Array([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9]);
  const partes = [new Uint8Array([0xff, 0xd8]), app0, ...extra, sof0, sos, datos];
  const total = partes.reduce((n, p) => n + p.length, 0);
  const b = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    b.set(p, pos);
    pos += p.length;
  }
  return b;
}

const contarXmp = (b: Uint8Array) =>
  leerEstructura(b).segmentos.filter(
    (s) => s.marcador === APP1 && new TextDecoder().decode(b.subarray(s.inicio + 4, s.inicio + 32)).startsWith('http://ns.adobe.com/xap'),
  ).length;

describe('segmentos JPEG', () => {
  it('lee las dimensiones de SOF', () => {
    expect(dimensionesJpeg(jpegFalso(8192, 4096))).toEqual({ ancho: 8192, alto: 4096 });
  });

  it('rechaza lo que no es JPEG', () => {
    expect(() => dimensionesJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toThrow();
  });
});

describe('XMP GPano', () => {
  it('escribe y vuelve a leer los campos de una esfera completa', () => {
    const b = insertarGPano(jpegFalso(6000, 3000), gpanoCompleto(6000, 3000, 90));
    const g = leerGPano(extraerXmp(b)!);
    expect(g).toEqual({
      proyeccion: 'equirectangular',
      anchoCompleto: 6000,
      altoCompleto: 3000,
      anchoRecorte: 6000,
      altoRecorte: 3000,
      izquierda: 0,
      arriba: 0,
      rumbo: 90,
    });
  });

  it('incluye ProjectionType y UsePanoramaViewer, requeridos por Google Photos y Facebook', () => {
    const xmp = crearXmpGPano(gpanoCompleto(4096, 2048));
    expect(xmp).toContain('GPano:ProjectionType="equirectangular"');
    expect(xmp).toContain('GPano:UsePanoramaViewer="True"');
    expect(xmp).toContain('xmlns:GPano="http://ns.google.com/photos/1.0/panorama/"');
  });

  it('reemplaza el XMP existente en vez de duplicarlo y conserva la imagen', () => {
    const original = jpegFalso(4096, 2048);
    const una = insertarGPano(original, gpanoCompleto(4096, 2048));
    const dos = insertarGPano(una, gpanoCompleto(4096, 2048, 10));
    expect(contarXmp(dos)).toBe(1);
    expect(leerGPano(extraerXmp(dos)!)!.rumbo).toBe(10);
    // Los datos desde SOS quedan idénticos
    const finOriginal = original.subarray(leerEstructura(original).inicioDatos);
    const finNuevo = dos.subarray(leerEstructura(dos).inicioDatos);
    expect([...finNuevo]).toEqual([...finOriginal]);
    expect(dimensionesJpeg(dos)).toEqual({ ancho: 4096, alto: 2048 });
  });

  it('el XMP va después de SOI y de APP0', () => {
    const b = insertarGPano(jpegFalso(4096, 2048), gpanoCompleto(4096, 2048));
    const s = leerEstructura(b).segmentos;
    expect(s[0].marcador).toBe(0xe0);
    expect(s[1].marcador).toBe(APP1);
  });

  it('lee GPano escrito como elementos (otras cámaras)', () => {
    const xmp = `<rdf:Description><GPano:ProjectionType>equirectangular</GPano:ProjectionType>
      <GPano:FullPanoWidthPixels>5376</GPano:FullPanoWidthPixels>
      <GPano:FullPanoHeightPixels>2688</GPano:FullPanoHeightPixels></rdf:Description>`;
    const g = leerGPano(xmp)!;
    expect(g.proyeccion).toBe('equirectangular');
    expect(g.anchoRecorte).toBe(5376);
    expect(g.altoRecorte).toBe(2688);
  });

  it('devuelve null si no hay GPano', () => {
    expect(leerGPano('<x:xmpmeta/>')).toBeNull();
    expect(extraerXmp(jpegFalso(10, 5))).toBeNull();
  });
});

describe('EXIF GPS', () => {
  it('convierte a grados, minutos y segundos', () => {
    expect(aGms(19.5)).toEqual([
      [19, 1],
      [30, 1],
      [0, 10000],
    ]);
    // Redondeo que llega a 60 segundos sube al minuto siguiente
    expect(aGms(10.99999999)[1][0]).toBe(0);
    expect(aGms(10.99999999)[0][0]).toBe(11);
  });

  it('escribe y lee latitud, longitud y altitud con hemisferios', () => {
    const exif = crearSegmentoExif({ lat: -33.856784, lng: 151.215297, alt: -12.5 });
    const g = leerGps(jpegFalso(100, 50, [exif]))!;
    expect(g.lat).toBeCloseTo(-33.856784, 6);
    expect(g.lng).toBeCloseTo(151.215297, 6);
    expect(g.alt).toBeCloseTo(-12.5, 2);
  });

  it('sin ubicación no hay GPS', () => {
    expect(leerGps(jpegFalso(100, 50, [crearSegmentoExif(null)]))).toBeNull();
    expect(leerGps(jpegFalso(100, 50))).toBeNull();
  });
});

describe('exportar 360', () => {
  it('quita el GPS original si no se autoriza y deja un solo EXIF y un solo XMP', () => {
    const conGps = jpegFalso(4096, 2048, [
      crearSegmentoExif({ lat: 21.1, lng: -86.8 }),
      crearSegmento(APP1, ascii('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>')),
    ]);
    const b = prepararJpeg360(conGps, { gps: null });
    expect(leerGps(b)).toBeNull();
    expect(contarXmp(b)).toBe(1);
    expect(leerGPano(extraerXmp(b)!)!.anchoCompleto).toBe(4096);
    const exifs = leerEstructura(b).segmentos.filter(
      (s) => s.marcador === APP1 && b[s.inicio + 4] === 0x45 /* 'E' */,
    );
    expect(exifs.length).toBe(1);
  });

  it('escribe el GPS autorizado', () => {
    const b = prepararJpeg360(jpegFalso(4096, 2048), { gps: { lat: 21.161908, lng: -86.851528 } });
    const g = leerGps(b)!;
    expect(g.lat).toBeCloseTo(21.161908, 6);
    expect(g.lng).toBeCloseTo(-86.851528, 6);
  });
});
