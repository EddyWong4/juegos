import { ArrowLeft, Camera, HardDrive, ImagePlus, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAvisar } from '../componentes/Avisos';
import { Boton } from '../componentes/Boton';
import { DialogoBorrar, DialogoRenombrar } from '../componentes/DialogosCaptura';
import { estadoEspacio, formatoBytes, pedirPersistencia, type EstadoEspacio } from '../datos/almacenamiento';
import { borrarCaptura, listarCapturas, renombrarCaptura } from '../datos/capturas';
import type { Captura, EstadoCaptura } from '../datos/db';
import { crearPanoramaEjemplo } from '../imagen/ejemplo';
import { importarArchivo } from '../imagen/importar';

const ETIQUETA: Record<EstadoCaptura, { texto: string; clase: string }> = {
  borrador: { texto: 'Borrador', clase: 'bg-amber-300 text-amber-950' },
  procesando: { texto: 'Procesando', clase: 'bg-sky-300 text-sky-950' },
  listo: { texto: 'Listo', clase: 'bg-emerald-300 text-emerald-950' },
  error: { texto: 'Error', clase: 'bg-rose-300 text-rose-950' },
};

function Miniatura({ blob, alt }: { blob?: Blob; alt: string }) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  if (!url) return <div className="aspect-[2/1] w-full bg-slate-800" role="img" aria-label={alt} />;
  return <img src={url} alt={alt} className="aspect-[2/1] w-full object-cover" loading="lazy" />;
}

export default function Biblioteca() {
  const avisar = useAvisar();
  const navegar = useNavigate();
  const entrada = useRef<HTMLInputElement>(null);
  const [capturas, setCapturas] = useState<Captura[] | null>(null);
  const [espacio, setEspacio] = useState<EstadoEspacio | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [renombrar, setRenombrar] = useState<Captura | null>(null);
  const [borrar, setBorrar] = useState<Captura | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const recargar = useCallback(async () => {
    setCapturas(await listarCapturas());
    setEspacio(await estadoEspacio());
  }, []);

  useEffect(() => {
    recargar().catch(() => avisar('No se pudo abrir el almacenamiento local de este navegador.', 'error'));
  }, [recargar, avisar]);

  const importar = async (archivos: File[]) => {
    if (!archivos.length) return;
    let ultimo: string | null = null;
    let correctos = 0;
    for (const [i, archivo] of archivos.entries()) {
      setTrabajando(archivos.length > 1 ? `Importando ${i + 1} de ${archivos.length}…` : 'Importando…');
      try {
        ultimo = await importarArchivo(archivo);
        correctos++;
      } catch (e) {
        avisar(e instanceof Error ? e.message : String(e), 'error');
      }
    }
    setTrabajando(null);
    if (correctos) {
      await pedirPersistencia();
      await recargar();
      if (correctos === 1 && archivos.length === 1 && ultimo) navegar(`/ver/${ultimo}`);
      else avisar(`Se importaron ${correctos} panoramas.`, 'exito');
    }
  };

  const crearEjemplo = async () => {
    setTrabajando('Dibujando el panorama de ejemplo…');
    try {
      const id = await crearPanoramaEjemplo();
      navegar(`/ver/${id}`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setTrabajando(null);
    }
  };

  return (
    <div
      className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-5 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-24"
      onDragOver={(e) => {
        e.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setArrastrando(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setArrastrando(false);
        importar([...e.dataTransfer.files]);
      }}
    >
      <header className="flex flex-col gap-4">
        <a href="../" className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-slate-300 hover:text-white">
          <ArrowLeft size={18} aria-hidden /> Todos los juegos
        </a>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Esfera360</h1>
            <p className="text-sm text-slate-300">Tus fotos 360° se guardan solo en este dispositivo.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Boton variante="principal" icono={<Camera size={18} aria-hidden />} onClick={() => navegar('/capturar')} disabled={!!trabajando}>
              Tomar foto 360°
            </Boton>
            <Boton icono={<ImagePlus size={18} aria-hidden />} onClick={() => entrada.current?.click()} disabled={!!trabajando}>
              Importar 360°
            </Boton>
            <Boton icono={<Sparkles size={18} aria-hidden />} onClick={crearEjemplo} disabled={!!trabajando}>
              Panorama de ejemplo
            </Boton>
          </div>
        </div>
        <input
          ref={entrada}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => {
            importar([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </header>

      {trabajando && (
        <p role="status" className="rounded-xl bg-slate-800 px-4 py-3 text-sm">
          {trabajando}
        </p>
      )}

      {capturas === null ? (
        <p className="text-slate-400">Cargando…</p>
      ) : capturas.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-700 px-6 py-14 text-center">
          <h2 className="text-lg font-semibold">Aún no tienes panoramas</h2>
          <p className="max-w-md text-sm text-slate-300">
            Toma tu primera foto 360° con la cámara del teléfono, importa una de otra cámara (2:1) o prueba el visor con el panorama de ejemplo.
            En una computadora también puedes arrastrar las fotos aquí.
          </p>
        </section>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {capturas.map((c) => (
            <li key={c.id} className="overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-slate-800">
              <Link to={c.estado === 'listo' ? `/ver/${c.id}` : `/capturar/${c.id}`} className="relative block focus-visible:outline-2 focus-visible:outline-cyan-300">
                <Miniatura blob={c.miniatura} alt={`Vista previa de ${c.titulo}`} />
                <span className={`absolute top-2 left-2 rounded-full px-2 py-0.5 text-xs font-semibold ${ETIQUETA[c.estado].clase}`}>
                  {ETIQUETA[c.estado].texto}
                </span>
              </Link>
              <div className="flex items-center gap-1 py-1 pr-1 pl-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.titulo}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(c.creado).toLocaleDateString('es', { dateStyle: 'medium' })}
                    {c.ancho ? ` · ${c.ancho}×${c.alto}` : ''}
                    {c.bytes ? ` · ${formatoBytes(c.bytes)}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Renombrar ${c.titulo}`}
                  onClick={() => setRenombrar(c)}
                  className="grid size-11 place-items-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <Pencil size={18} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Borrar ${c.titulo}`}
                  onClick={() => setBorrar(c)}
                  className="grid size-11 place-items-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-rose-300"
                >
                  <Trash2 size={18} aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {espacio && (
        <section aria-label="Espacio de almacenamiento" className="mt-auto flex flex-col gap-2 rounded-2xl bg-slate-900 p-4 text-sm ring-1 ring-slate-800">
          <p className="flex items-center gap-2 font-medium">
            <HardDrive size={18} aria-hidden /> Espacio
          </p>
          {espacio.usado !== null && espacio.cuota ? (
            <>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((espacio.usado / espacio.cuota) * 100)}>
                <div className="h-full bg-cyan-400" style={{ width: `${Math.max(1, (espacio.usado / espacio.cuota) * 100)}%` }} />
              </div>
              <p className="text-slate-300">
                Usas {formatoBytes(espacio.usado)} de {formatoBytes(espacio.cuota)} disponibles para la app.
              </p>
            </>
          ) : (
            <p className="text-slate-300">Este navegador no informa cuánto espacio queda.</p>
          )}
          {espacio.persistente === true && <p className="text-emerald-300">Protegido: el navegador no borrará tus panoramas por falta de espacio.</p>}
          {espacio.persistente === false && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-amber-200">Sin protección: el navegador podría borrar los datos si le falta espacio.</p>
              <Boton
                onClick={async () => {
                  const ok = await pedirPersistencia();
                  avisar(ok ? 'Almacenamiento protegido.' : 'El navegador no lo concedió. Instalar la app suele ayudar.', ok ? 'exito' : 'info');
                  setEspacio(await estadoEspacio());
                }}
              >
                Proteger
              </Boton>
            </div>
          )}
        </section>
      )}

      {arrastrando && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-cyan-950/80 text-xl font-semibold">
          Suelta las fotos 360° para importarlas
        </div>
      )}

      <DialogoRenombrar
        titulo={renombrar?.titulo ?? null}
        alCerrar={() => setRenombrar(null)}
        alGuardar={async (t) => {
          await renombrarCaptura(renombrar!.id, t);
          setRenombrar(null);
          recargar();
        }}
      />
      <DialogoBorrar
        titulo={borrar?.titulo ?? null}
        alCerrar={() => setBorrar(null)}
        alBorrar={async () => {
          await borrarCaptura(borrar!.id);
          setBorrar(null);
          avisar('Panorama borrado.');
          recargar();
        }}
      />
    </div>
  );
}
