import { Viewer, utils } from '@photo-sphere-viewer/core';
import { GyroscopePlugin } from '@photo-sphere-viewer/gyroscope-plugin';
import { ArrowLeft, Crop, Globe, MoreVertical, Pencil, Share2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAvisar } from '../componentes/Avisos';
import { Boton } from '../componentes/Boton';
import { DialogoBorrar, DialogoRenombrar } from '../componentes/DialogosCaptura';
import { DialogoEncuadre, DialogoExportar360 } from '../componentes/DialogosExportar';
import { borrarCaptura, obtenerCaptura, obtenerPanorama, renombrarCaptura } from '../datos/capturas';
import type { Captura, Panorama } from '../datos/db';
import type { Encuadre } from '../imagen/exportar';

const LANG = {
  zoom: 'Zoom',
  zoomOut: 'Alejar',
  zoomIn: 'Acercar',
  moveUp: 'Mover arriba',
  moveDown: 'Mover abajo',
  moveLeft: 'Mover a la izquierda',
  moveRight: 'Mover a la derecha',
  description: 'Descripción',
  download: 'Descargar',
  fullscreen: 'Pantalla completa',
  loading: 'Cargando…',
  menu: 'Menú',
  close: 'Cerrar',
  twoFingers: 'Usa dos dedos para moverte',
  ctrlZoom: 'Usa Ctrl + rueda para hacer zoom',
  loadError: 'No se pudo cargar el panorama',
  webglError: 'Tu navegador no admite WebGL, necesario para ver panoramas 360°',
  gyroscope: 'Giroscopio: mueve el teléfono para mirar',
};

const ZOOM_NORMAL = 40;

export default function Visor() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const avisar = useAvisar();
  const contenedor = useRef<HTMLDivElement>(null);
  const visor = useRef<Viewer | null>(null);
  const [captura, setCaptura] = useState<Captura | null | undefined>(undefined);
  const [panorama, setPanorama] = useState<Panorama | null>(null);
  const [planeta, setPlaneta] = useState(false);
  const [animando, setAnimando] = useState(false);
  const [menu, setMenu] = useState(false);
  const [dialogo, setDialogo] = useState<null | 'renombrar' | 'borrar' | 'exportar' | 'encuadre'>(null);
  const [encuadre, setEncuadre] = useState<Encuadre | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([obtenerCaptura(id), obtenerPanorama(id)]).then(([c, p]) => {
      if (!vivo) return;
      setCaptura(c ?? null);
      setPanorama(p ?? null);
    });
    return () => {
      vivo = false;
    };
  }, [id]);

  // Crear el visor cuando ya está la imagen
  useEffect(() => {
    if (!panorama || !contenedor.current) return;
    const url = URL.createObjectURL(panorama.imagen);
    const v = new Viewer({
      container: contenedor.current,
      panorama: url,
      lang: LANG,
      navbar: ['zoom', 'gyroscope', 'fullscreen'],
      defaultZoomLvl: ZOOM_NORMAL,
      mousewheelCtrlKey: false,
      touchmoveTwoFingers: false,
      loadingTxt: 'Cargando…',
      plugins: [[GyroscopePlugin, { touchmove: true }]],
    });
    visor.current = v;
    return () => {
      v.destroy();
      visor.current = null;
      URL.revokeObjectURL(url);
    };
  }, [panorama]);

  const alternarPlaneta = useCallback(() => {
    const v = visor.current;
    if (!v || animando) return;
    const giro = v.getPlugin<GyroscopePlugin>(GyroscopePlugin);
    if (giro?.isEnabled()) giro.stop();
    const { yaw, pitch } = v.getPosition();
    const zoom = v.getZoomLevel();
    const entrar = !planeta;
    setAnimando(true);
    new utils.Animation({
      properties: entrar
        ? { pitch: { start: pitch, end: -Math.PI / 2 }, zoom: { start: zoom, end: 0 }, fisheye: { start: 0, end: 2 } }
        : { pitch: { start: pitch, end: 0 }, zoom: { start: zoom, end: ZOOM_NORMAL }, fisheye: { start: 2, end: 0 } },
      duration: 1200,
      easing: 'inOutQuad',
      onTick: (p: Record<string, number>) => {
        v.setOption('fisheye', p.fisheye);
        v.rotate({ yaw, pitch: p.pitch });
        v.zoom(p.zoom);
      },
    }).then(() => {
      setPlaneta(entrar);
      setAnimando(false);
    });
  }, [planeta, animando]);

  const pedirEncuadre = () => {
    const v = visor.current;
    if (!v) return;
    const { yaw, pitch } = v.getPosition();
    if (planeta) {
      setEncuadre({ modo: 'planeta', yaw, lado: 2048 });
    } else {
      const aspecto = v.state.aspect || 16 / 9;
      const largo = 1920;
      const ancho = aspecto >= 1 ? largo : Math.round(largo * aspecto);
      const alto = aspecto >= 1 ? Math.round(largo / aspecto) : largo;
      setEncuadre({ modo: 'plano', yaw, pitch, hFovGrados: v.state.hFov, ancho, alto });
    }
    setDialogo('encuadre');
  };

  if (captura === null || (captura && !panorama && captura.estado === 'listo')) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <p>No se encontró este panorama en el dispositivo.</p>
        <Boton variante="principal" onClick={() => navegar('/')}>
          Ir a la biblioteca
        </Boton>
      </main>
    );
  }

  const botonBarra = 'shrink-0';

  return (
    <main className="fixed inset-0 bg-black">
      <div ref={contenedor} className="absolute inset-0" aria-label={captura ? `Panorama 360° ${captura.titulo}` : 'Panorama 360°'} role="img" />

      <div className="absolute inset-x-0 top-0 z-10 flex flex-col gap-2 bg-gradient-to-b from-black/80 to-transparent px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6">
        <div className="flex items-center gap-2">
          <Boton variante="fantasma" aria-label="Volver a la biblioteca" onClick={() => navegar('/')} icono={<ArrowLeft size={20} aria-hidden />} className="px-2" />
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-white">{captura?.titulo ?? ''}</h1>
          <div className="relative">
            <Boton variante="fantasma" aria-label="Más opciones" aria-expanded={menu} onClick={() => setMenu((m) => !m)} icono={<MoreVertical size={20} aria-hidden />} className="px-2" />
            {menu && (
              <div role="menu" className="absolute top-12 right-0 flex w-48 flex-col overflow-hidden rounded-xl bg-slate-900 py-1 shadow-xl ring-1 ring-slate-700">
                <button role="menuitem" className="flex min-h-11 items-center gap-2 px-4 text-left text-sm hover:bg-slate-800" onClick={() => { setMenu(false); setDialogo('renombrar'); }}>
                  <Pencil size={16} aria-hidden /> Renombrar
                </button>
                <button role="menuitem" className="flex min-h-11 items-center gap-2 px-4 text-left text-sm text-rose-300 hover:bg-slate-800" onClick={() => { setMenu(false); setDialogo('borrar'); }}>
                  <Trash2 size={16} aria-hidden /> Borrar
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Boton variante="principal" className={botonBarra} icono={<Share2 size={18} aria-hidden />} onClick={() => setDialogo('exportar')} disabled={!panorama}>
            Exportar 360°
          </Boton>
          <Boton variante="fantasma" className={botonBarra} icono={<Globe size={18} aria-hidden />} aria-pressed={planeta} onClick={alternarPlaneta} disabled={!panorama || animando}>
            {planeta ? 'Vista normal' : 'Planeta pequeño'}
          </Boton>
          <Boton variante="fantasma" className={botonBarra} icono={<Crop size={18} aria-hidden />} onClick={pedirEncuadre} disabled={!panorama || animando}>
            Guardar encuadre
          </Boton>
        </div>
      </div>

      {captura && panorama && (
        <>
          <DialogoExportar360 abierto={dialogo === 'exportar'} captura={captura} panorama={panorama} alCerrar={() => setDialogo(null)} />
          <DialogoEncuadre abierto={dialogo === 'encuadre'} captura={captura} panorama={panorama} encuadre={encuadre} alCerrar={() => setDialogo(null)} />
        </>
      )}
      <DialogoRenombrar
        titulo={dialogo === 'renombrar' ? (captura?.titulo ?? '') : null}
        alCerrar={() => setDialogo(null)}
        alGuardar={async (t) => {
          await renombrarCaptura(id, t);
          setCaptura(await obtenerCaptura(id));
          setDialogo(null);
        }}
      />
      <DialogoBorrar
        titulo={dialogo === 'borrar' ? (captura?.titulo ?? '') : null}
        alCerrar={() => setDialogo(null)}
        alBorrar={async () => {
          await borrarCaptura(id);
          avisar('Panorama borrado.');
          navegar('/', { replace: true });
        }}
      />
    </main>
  );
}
