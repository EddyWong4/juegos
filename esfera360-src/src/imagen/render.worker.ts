// Genera encuadres planos / «planeta pequeño» fuera del hilo de la interfaz.
import { renderizar, type ImagenRGBA } from '../nucleo/muestreo';
import { gradosARad } from '../nucleo/proyeccion';
import { rayoPlaneta, rayoRectilineo } from '../nucleo/vistas';
import type { Encuadre } from './exportar';

self.onmessage = (e: MessageEvent<{ fuente: ImagenRGBA; encuadre: Encuadre }>) => {
  const { fuente, encuadre: c } = e.data;
  const img =
    c.modo === 'plano'
      ? renderizar(fuente, c.ancho, c.alto, (x, y) => rayoRectilineo(x, y, c.ancho, c.alto, gradosARad(c.hFovGrados), c.yaw, c.pitch))
      : renderizar(fuente, c.lado, c.lado, (x, y) => rayoPlaneta(x, y, c.lado, c.yaw));
  (self as unknown as Worker).postMessage(img, [img.datos.buffer]);
};
