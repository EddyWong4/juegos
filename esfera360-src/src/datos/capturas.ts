import { db, type Captura, type EstadoCaptura, type OrigenCaptura, type Toma } from './db';
import type { Objetivo } from '../nucleo/plan-tomas';
import type { Gps } from '../nucleo/jpeg/exif';

export async function listarCapturas(): Promise<Captura[]> {
  const todas = await (await db()).getAllFromIndex('capturas', 'actualizado');
  return todas.reverse();
}

export async function obtenerCaptura(id: string) {
  return (await db()).get('capturas', id);
}

export async function obtenerPanorama(id: string) {
  return (await db()).get('panoramas', id);
}

export async function guardarPanoramaListo(datos: {
  titulo: string;
  origen: OrigenCaptura;
  imagen: Blob;
  ancho: number;
  alto: number;
  miniatura: Blob;
  gps: Gps | null;
  rumbo?: number;
}): Promise<string> {
  const id = crypto.randomUUID();
  const ahora = Date.now();
  const base = await db();
  const tx = base.transaction(['capturas', 'panoramas'], 'readwrite');
  await Promise.all([
    tx.objectStore('panoramas').put({ captura: id, imagen: datos.imagen, ancho: datos.ancho, alto: datos.alto }),
    tx.objectStore('capturas').put({
      id,
      titulo: datos.titulo,
      estado: 'listo',
      origen: datos.origen,
      creado: ahora,
      actualizado: ahora,
      ancho: datos.ancho,
      alto: datos.alto,
      bytes: datos.imagen.size + datos.miniatura.size,
      miniatura: datos.miniatura,
      gps: datos.gps,
      rumbo: datos.rumbo,
    }),
    tx.done,
  ]);
  return id;
}

export async function renombrarCaptura(id: string, titulo: string) {
  const base = await db();
  const c = await base.get('capturas', id);
  if (!c) return;
  await base.put('capturas', { ...c, titulo: titulo.trim() || c.titulo, actualizado: Date.now() });
}

export async function borrarCaptura(id: string) {
  const base = await db();
  const tx = base.transaction(['capturas', 'panoramas', 'tomas'], 'readwrite');
  const tomas = tx.objectStore('tomas');
  let cursor = await tomas.index('captura').openCursor(IDBKeyRange.only(id));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await Promise.all([tx.objectStore('capturas').delete(id), tx.objectStore('panoramas').delete(id), tx.done]);
}

// ───────────── Capturas guiadas ─────────────

export async function crearBorrador(datos: { plan: Objetivo[]; fovLargo: number; lente: string }): Promise<string> {
  const id = crypto.randomUUID();
  const ahora = Date.now();
  const fecha = new Date(ahora).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
  await (await db()).put('capturas', {
    id,
    titulo: `Foto 360° ${fecha}`,
    estado: 'borrador',
    origen: 'capturada',
    creado: ahora,
    actualizado: ahora,
    gps: null,
    ...datos,
  });
  return id;
}

export async function listarTomas(captura: string): Promise<Toma[]> {
  const tomas = await (await db()).getAllFromIndex('tomas', 'captura', captura);
  return tomas.sort((a, b) => a.creado - b.creado);
}

export async function guardarToma(toma: Toma, miniatura?: Blob) {
  const base = await db();
  const tx = base.transaction(['tomas', 'capturas'], 'readwrite');
  await tx.objectStore('tomas').put(toma);
  const c = await tx.objectStore('capturas').get(toma.captura);
  if (c) {
    await tx.objectStore('capturas').put({
      ...c,
      actualizado: Date.now(),
      bytes: (c.bytes ?? 0) + toma.imagen.size,
      miniatura: c.miniatura ?? miniatura,
    });
  }
  await tx.done;
}

/** Borra la última toma y devuelve su número de objetivo. */
export async function deshacerUltimaToma(captura: string): Promise<number | null> {
  const tomas = await listarTomas(captura);
  const ultima = tomas.at(-1);
  if (!ultima) return null;
  const base = await db();
  await base.delete('tomas', [captura, ultima.n]);
  const c = await base.get('capturas', captura);
  if (c) await base.put('capturas', { ...c, bytes: Math.max(0, (c.bytes ?? 0) - ultima.imagen.size), actualizado: Date.now() });
  return ultima.n;
}

export async function cambiarEstado(id: string, estado: EstadoCaptura) {
  const base = await db();
  const c = await base.get('capturas', id);
  if (c) await base.put('capturas', { ...c, estado, actualizado: Date.now() });
}

/** Guarda el panorama cosido. Las tomas se conservan para poder volver a coser. */
export async function guardarCosido(id: string, imagen: Blob, ancho: number, alto: number, miniatura: Blob) {
  const base = await db();
  const tx = base.transaction(['capturas', 'panoramas', 'tomas'], 'readwrite');
  const c = await tx.objectStore('capturas').get(id);
  if (!c) throw new Error('La captura ya no existe.');
  await tx.objectStore('panoramas').put({ captura: id, imagen, ancho, alto });
  const tomas = await tx.objectStore('tomas').index('captura').getAll(id);
  const tomasBytes = tomas.reduce((s, t) => s + t.imagen.size, 0);
  await tx.objectStore('capturas').put({
    ...c,
    estado: 'listo',
    ancho,
    alto,
    miniatura,
    bytes: tomasBytes + imagen.size,
    actualizado: Date.now(),
  });
  await tx.done;
}
