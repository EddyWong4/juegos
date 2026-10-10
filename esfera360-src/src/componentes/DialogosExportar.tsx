import { Download, Share2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Captura, Panorama } from '../datos/db';
import { formatoBytes } from '../datos/almacenamiento';
import type { Gps } from '../nucleo/jpeg/exif';
import { compartirArchivo, descargar, puedeCompartirArchivos } from '../imagen/compartir';
import { archivo360, archivoEncuadre, type Encuadre } from '../imagen/exportar';
import { ceder } from '../imagen/lienzo';
import { useAvisar } from './Avisos';
import { Boton } from './Boton';
import { Dialogo } from './Dialogo';

function BotonesSalida({ obtener, titulo, alTerminar }: { obtener: () => Promise<File>; titulo: string; alTerminar: () => void }) {
  const avisar = useAvisar();
  const [ocupado, setOcupado] = useState(false);
  const compartible = useMemo(puedeCompartirArchivos, []);

  const ejecutar = async (accion: 'compartir' | 'descargar') => {
    setOcupado(true);
    try {
      const archivo = await obtener();
      if (accion === 'compartir') {
        if (await compartirArchivo(archivo, titulo)) alTerminar();
      } else {
        descargar(archivo);
        avisar(`Descargado «${archivo.name}» (${formatoBytes(archivo.size)}).`, 'exito');
        alTerminar();
      }
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo generar el archivo.', 'error');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Boton onClick={alTerminar}>Cerrar</Boton>
      <Boton icono={<Download size={18} aria-hidden />} onClick={() => ejecutar('descargar')} disabled={ocupado}>
        Descargar
      </Boton>
      {compartible && (
        <Boton variante="principal" icono={<Share2 size={18} aria-hidden />} onClick={() => ejecutar('compartir')} disabled={ocupado}>
          Compartir
        </Boton>
      )}
    </div>
  );
}

const fmt = (g: Gps) => `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}`;

export function DialogoExportar360({
  abierto,
  captura,
  panorama,
  alCerrar,
}: {
  abierto: boolean;
  captura: Captura;
  panorama: Panorama;
  alCerrar: () => void;
}) {
  const avisar = useAvisar();
  const [conGps, setConGps] = useState(false);
  const [gpsActual, setGpsActual] = useState<Gps | null>(null);
  const [buscando, setBuscando] = useState(false);
  const gpsFoto = captura.gps ?? null;
  const gps = conGps ? (gpsFoto ?? gpsActual) : null;

  useEffect(() => {
    if (!abierto) setConGps(false);
  }, [abierto]);

  const marcar = (valor: boolean) => {
    setConGps(valor);
    if (!valor || gpsFoto || gpsActual) return;
    if (!('geolocation' in navigator)) {
      avisar('Este navegador no da la ubicación.', 'error');
      setConGps(false);
      return;
    }
    setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGpsActual({ lat: p.coords.latitude, lng: p.coords.longitude, alt: p.coords.altitude ?? undefined });
        setBuscando(false);
      },
      () => {
        avisar('No se obtuvo la ubicación (permiso denegado o sin señal).', 'error');
        setConGps(false);
        setBuscando(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <Dialogo abierto={abierto} titulo="Exportar foto 360°" alCerrar={alCerrar}>
      <p className="text-sm text-slate-300">
        JPEG de {panorama.ancho}×{panorama.alto} con metadatos 360° (GPano), para que Google Fotos, Facebook y otros visores
        la reconozcan como foto esférica. Los datos EXIF originales se quitan.
      </p>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1 size-5 accent-cyan-400" checked={conGps} onChange={(e) => marcar(e.target.checked)} />
        <span>
          Incluir ubicación GPS
          <span className="block text-slate-400">
            {gpsFoto
              ? `La de la foto original: ${fmt(gpsFoto)}`
              : buscando
                ? 'Buscando tu ubicación…'
                : gpsActual
                  ? `Tu ubicación actual: ${fmt(gpsActual)}`
                  : 'Se usará tu ubicación actual. Cualquiera que reciba el archivo podrá verla.'}
          </span>
        </span>
      </label>
      <BotonesSalida
        titulo={captura.titulo}
        obtener={() => {
          if (conGps && !gps) return Promise.reject(new Error('Espera a que se obtenga la ubicación.'));
          return archivo360(captura, panorama, gps);
        }}
        alTerminar={alCerrar}
      />
    </Dialogo>
  );
}

export function DialogoEncuadre({
  abierto,
  captura,
  panorama,
  encuadre,
  alCerrar,
}: {
  abierto: boolean;
  captura: Captura;
  panorama: Panorama;
  encuadre: Encuadre | null;
  alCerrar: () => void;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = useMemo(() => (archivo ? URL.createObjectURL(archivo) : null), [archivo]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  useEffect(() => {
    if (!abierto || !encuadre) return;
    let vivo = true;
    setArchivo(null);
    setError(null);
    ceder()
      .then(() => archivoEncuadre(captura, panorama, encuadre))
      .then((a) => vivo && setArchivo(a))
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo generar la imagen.'));
    return () => {
      vivo = false;
    };
  }, [abierto, encuadre, captura, panorama]);

  const titulo = encuadre?.modo === 'planeta' ? 'Guardar «planeta pequeño»' : 'Guardar encuadre';
  return (
    <Dialogo abierto={abierto} titulo={titulo} alCerrar={alCerrar}>
      {error ? (
        <p className="text-sm text-rose-300">{error}</p>
      ) : url ? (
        <img src={url} alt="Vista previa de la imagen que se guardará" className="max-h-[50vh] w-full rounded-lg object-contain" />
      ) : (
        <p role="status" className="py-8 text-center text-sm text-slate-300">
          Generando la imagen a resolución completa…
        </p>
      )}
      {archivo && (
        <p className="text-xs text-slate-400">
          {encuadre?.modo === 'plano' && `${encuadre.ancho}×${encuadre.alto} · `}
          {encuadre?.modo === 'planeta' && `${encuadre.lado}×${encuadre.lado} · `}
          {formatoBytes(archivo.size)}
        </p>
      )}
      {archivo ? (
        <BotonesSalida titulo={captura.titulo} obtener={async () => archivo} alTerminar={alCerrar} />
      ) : (
        <div className="flex justify-end">
          <Boton onClick={alCerrar}>Cerrar</Boton>
        </div>
      )}
    </Dialogo>
  );
}
