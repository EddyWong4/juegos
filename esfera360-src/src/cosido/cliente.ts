import { cambiarEstado, guardarCosido, listarTomas, obtenerCaptura } from '../datos/capturas';
import type { MensajeCosido, PedidoCosido } from './coser.worker';

export const ANCHO_PANORAMA = 4096;

export interface TrabajoCosido {
  promesa: Promise<void>;
  cancelar: () => void;
}

/** Cose una captura guiada y guarda el resultado. */
export function coserCaptura(id: string, alProgreso: (etapa: string, fraccion: number) => void): TrabajoCosido {
  let worker: Worker | null = null;
  let rechazar: (e: Error) => void = () => {};
  const promesa = new Promise<void>((ok, mal) => {
    rechazar = mal;
    (async () => {
      const captura = await obtenerCaptura(id);
      if (!captura?.fovLargo) throw new Error('Esta captura no tiene datos de cámara.');
      const tomas = await listarTomas(id);
      if (tomas.length < 2) throw new Error('Hacen falta al menos dos fotos.');
      await cambiarEstado(id, 'procesando');
      worker = new Worker(new URL('./coser.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = async (e: MessageEvent<MensajeCosido>) => {
        const m = e.data;
        if (m.tipo === 'progreso') alProgreso(m.etapa, m.fraccion);
        else if (m.tipo === 'error') {
          worker?.terminate();
          await cambiarEstado(id, 'borrador');
          mal(new Error(m.mensaje));
        } else {
          worker?.terminate();
          await guardarCosido(id, m.imagen, m.ancho, m.alto, m.miniatura);
          ok();
        }
      };
      worker.onerror = async (e) => {
        worker?.terminate();
        await cambiarEstado(id, 'borrador');
        mal(new Error(e.message || 'Falló el cosido.'));
      };
      const pedido: PedidoCosido = {
        tomas: tomas.map((t) => ({ imagen: t.imagen, q: t.cuaternion, n: t.n })),
        fovLargo: captura.fovLargo,
        ancho: ANCHO_PANORAMA,
      };
      worker.postMessage(pedido);
    })().catch(mal);
  });
  return {
    promesa,
    cancelar: () => {
      worker?.terminate();
      void cambiarEstado(id, 'borrador');
      rechazar(new DOMException('Cancelado', 'AbortError'));
    },
  };
}
