import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Gps } from '../nucleo/jpeg/exif';
import type { Objetivo } from '../nucleo/plan-tomas';

export type EstadoCaptura = 'borrador' | 'procesando' | 'listo' | 'error';
export type OrigenCaptura = 'importada' | 'capturada' | 'ejemplo';

export interface Captura {
  id: string;
  titulo: string;
  estado: EstadoCaptura;
  origen: OrigenCaptura;
  creado: number;
  actualizado: number;
  ancho?: number;
  alto?: number;
  bytes?: number;
  miniatura?: Blob;
  gps?: Gps | null; // ubicación conocida (de la foto original o de la captura)
  rumbo?: number; // grados respecto al norte del centro de la imagen, si se conoce
  // Solo capturas guiadas:
  plan?: Objetivo[];
  fovLargo?: number; // grados, lado largo de la foto
  lente?: string;
}

export interface Panorama {
  captura: string;
  imagen: Blob;
  ancho: number;
  alto: number;
}

/** Toma individual de una captura guiada (se usa a partir de la Fase 2). */
export interface Toma {
  captura: string;
  n: number;
  imagen: Blob;
  cuaternion: [number, number, number, number];
  creado: number;
}

interface Esquema extends DBSchema {
  capturas: { key: string; value: Captura; indexes: { actualizado: number } };
  tomas: { key: [string, number]; value: Toma; indexes: { captura: string } };
  panoramas: { key: string; value: Panorama };
  cola: { key: string; value: { id: string; tipo: string; datos: unknown; intentos: number; error?: string } };
  ajustes: { key: string; value: unknown };
}

let promesa: Promise<IDBPDatabase<Esquema>> | null = null;

export function db() {
  promesa ??= openDB<Esquema>('esfera360', 1, {
    upgrade(base) {
      base.createObjectStore('capturas', { keyPath: 'id' }).createIndex('actualizado', 'actualizado');
      base.createObjectStore('tomas', { keyPath: ['captura', 'n'] }).createIndex('captura', 'captura');
      base.createObjectStore('panoramas', { keyPath: 'captura' });
      base.createObjectStore('cola', { keyPath: 'id' });
      base.createObjectStore('ajustes');
    },
  });
  return promesa;
}
