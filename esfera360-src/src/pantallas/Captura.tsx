import { Camera, Check, Undo2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAvisar } from '../componentes/Avisos';
import { Boton } from '../componentes/Boton';
import { dibujarGuia } from '../captura/overlay';
import { coserCaptura, type TrabajoCosido } from '../cosido/cliente';
import { crearBorrador, deshacerUltimaToma, guardarToma, listarTomas, obtenerCaptura } from '../datos/capturas';
import { focal } from '../nucleo/cosido';
import { adelante, alabeo, anguloEntre, type Quat } from '../nucleo/cuaternion';
import { generarPlan, type Objetivo } from '../nucleo/plan-tomas';
import { direccionALonLat, gradosARad, lonLatADireccion, normalizarAngulo, type Vec3 } from '../nucleo/proyeccion';
import {
  abrirCamara,
  bloquearExposicion,
  capturarFotograma,
  fovPorDefecto,
  hayCamara,
  listarCamarasTraseras,
  pitido,
  prepararAudio,
  type CamaraTrasera,
} from '../sensores/camara';
import { escucharOrientacion, hayOrientacion, pedirPermisoOrientacion } from '../sensores/orientacion';
import type { Simulador } from '../sensores/simulador';

const TOLERANCIA = gradosARad(4); // qué tan cerca del punto hay que apuntar
const LADEO_MAX = gradosARad(8);
const QUIETO_MAX = gradosARad(1.5); // movimiento máximo en 200 ms
const ESPERA_DISPARO = 400; // ms quieto y alineado antes de disparar

type Fase = 'cargando' | 'inicio' | 'camara' | 'cosiendo';
type Pista = 'primera' | 'girar' | 'enderezar' | 'quieto' | 'cenit' | 'nadir' | 'listo' | 'sin-datos';

const TEXTO_PISTA: Record<Pista, string> = {
  primera: 'Apunta al horizonte con el teléfono derecho y toca «Disparar» para la primera foto. Las demás se toman solas.',
  girar: 'Gira el teléfono hacia el punto rojo. Gíralo sobre sí mismo, sin moverte del lugar.',
  enderezar: 'Endereza el teléfono: no lo inclines de lado.',
  quieto: 'Quieto…',
  cenit: 'Apunta hacia arriba, al cielo o al techo.',
  nadir: 'Apunta al suelo, bajo tus pies. Puedes voltear el teléfono si te es más cómodo.',
  listo: '¡Listo! Toca «Unir fotos».',
  'sin-datos': 'Esperando el giroscopio…',
};

const punto = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** El plan girado para que su primer objetivo quede hacia donde mira la cámara. */
const girarPlan = (plan: Objetivo[], yaw: number) => plan.map((o) => ({ ...o, yaw: normalizarAngulo(o.yaw + yaw) }));

export default function Captura() {
  const { id: idRuta } = useParams();
  const [busqueda] = useSearchParams();
  const simular = import.meta.env.DEV && busqueda.get('simular') === '1';
  const navegar = useNavigate();
  const avisar = useAvisar();

  const video = useRef<HTMLVideoElement>(null);
  const lienzoGuia = useRef<HTMLCanvasElement>(null);
  const lienzoFoto = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const sim = useRef<Simulador | null>(null);
  const dejarDeEscuchar = useRef<(() => void) | null>(null);
  const bloqueoPantalla = useRef<WakeLockSentinel | null>(null);
  const qActual = useRef<Quat | null>(null);
  const historial = useRef<{ t: number; q: Quat }[]>([]);
  const idCaptura = useRef<string | null>(idRuta ?? null);
  const tomadas = useRef(new Set<number>());
  const disparando = useRef(false);
  const quietoDesde = useRef<number | null>(null);
  const trabajo = useRef<TrabajoCosido | null>(null);

  const [fase, setFase] = useState<Fase>(idRuta ? 'cargando' : 'inicio');
  const [plan, setPlan] = useState<Objetivo[]>([]);
  const [fov, setFov] = useState(65);
  const [camaras, setCamaras] = useState<CamaraTrasera[]>([]);
  const [camaraId, setCamaraId] = useState<string>('');
  const [conteo, setConteo] = useState(0);
  const [pista, setPista] = useState<Pista>('sin-datos');
  const [error, setError] = useState<string | null>(null);
  const [destello, setDestello] = useState(0);
  const [progreso, setProgreso] = useState<{ etapa: string; fraccion: number } | null>(null);

  const planRef = useRef(plan);
  planRef.current = plan;
  const fovRef = useRef(fov);
  fovRef.current = fov;
  const reanudando = !!idRuta;
  const faltan = plan.length - conteo;

  // Al reanudar un borrador: cargar su plan y las tomas hechas
  useEffect(() => {
    if (!idRuta || idRuta === idCaptura.current && plan.length) return;
    (async () => {
      const c = await obtenerCaptura(idRuta);
      if (!c || !c.plan || !c.fovLargo) {
        setError('No se encontró este borrador.');
        setFase('inicio');
        return;
      }
      if (c.estado === 'listo') {
        navegar(`/ver/${idRuta}`, { replace: true });
        return;
      }
      const tomas = await listarTomas(idRuta);
      tomadas.current = new Set(tomas.map((t) => t.n));
      setConteo(tomadas.current.size);
      setPlan(c.plan);
      setFov(c.fovLargo);
      setCamaraId(c.lente ?? '');
      setFase('inicio');
    })();
  }, [idRuta, navegar, plan.length]);

  const apagar = useCallback(() => {
    dejarDeEscuchar.current?.();
    dejarDeEscuchar.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    sim.current?.detener();
    sim.current = null;
    void bloqueoPantalla.current?.release().catch(() => {});
    bloqueoPantalla.current = null;
  }, []);

  useEffect(() => () => {
    apagar();
    trabajo.current?.cancelar();
  }, [apagar]);

  const conectarVideo = async (s: MediaStream) => {
    stream.current = s;
    const v = video.current!;
    v.srcObject = s;
    await v.play().catch(() => {});
    if (!v.videoWidth) await new Promise((ok) => v.addEventListener('loadedmetadata', ok, { once: true }));
  };

  const planNuevo = (fovGrados: number) => {
    const v = video.current!;
    const proporcion = Math.min(v.videoWidth, v.videoHeight) / Math.max(v.videoWidth, v.videoHeight) || 0.75;
    setPlan(generarPlan(fovGrados, proporcion));
  };

  const empezar = async () => {
    setError(null);
    prepararAudio();
    try {
      if (simular) {
        const { crearSimulador, FOV_SIMULADO } = await import('../sensores/simulador');
        sim.current = crearSimulador();
        (window as unknown as { simulador?: Simulador }).simulador = sim.current; // para pruebas automáticas
        await conectarVideo(sim.current.stream);
        if (!reanudando) {
          setFov(FOV_SIMULADO);
          planNuevo(FOV_SIMULADO);
        }
      } else {
        if (!(await pedirPermisoOrientacion())) {
          setError('Sin permiso para usar el movimiento del teléfono no se puede guiar la captura. Actívalo e inténtalo de nuevo.');
          return;
        }
        // La cámara guardada puede haber cambiado de id: si falla, se abre la trasera por defecto
        await conectarVideo(await abrirCamara(camaraId || undefined).catch(() => abrirCamara()));
        const lista = await listarCamarasTraseras().catch(() => []);
        setCamaras(lista);
        const actual = stream.current!.getVideoTracks()[0]?.getSettings().deviceId ?? '';
        setCamaraId(actual);
        if (!reanudando) {
          const f = fovPorDefecto(lista.find((c) => c.id === actual)?.granAngular ?? false);
          setFov(f);
          planNuevo(f);
        }
      }
      dejarDeEscuchar.current = escucharOrientacion(
        (q) => (qActual.current = q),
        () => setError('No se detecta el giroscopio. Para tomar fotos 360° necesitas un teléfono o tableta con sensores de movimiento.'),
      );
      bloqueoPantalla.current = (await navigator.wakeLock?.request('screen').catch(() => null)) ?? null;
      setFase('camara');
    } catch (e) {
      apagar();
      setError(e instanceof Error ? e.message : 'No se pudo empezar.');
    }
  };

  const cambiarCamara = async (id: string) => {
    stream.current?.getTracks().forEach((t) => t.stop());
    try {
      await conectarVideo(await abrirCamara(id));
      setCamaraId(id);
      const f = fovPorDefecto(camaras.find((c) => c.id === id)?.granAngular ?? false);
      setFov(f);
      planNuevo(f);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo cambiar de cámara.', 'error');
    }
  };

  const disparar = useCallback(
    async (objetivo: Objetivo) => {
      const q = qActual.current;
      const v = video.current;
      if (!q || !v || disparando.current) return;
      disparando.current = true;
      try {
        const imagen = await capturarFotograma(v, lienzoFoto.current!);
        let id = idCaptura.current;
        const primera = !id;
        if (!id) {
          id = await crearBorrador({ plan: planRef.current, fovLargo: fovRef.current, lente: camaraId });
          idCaptura.current = id;
          window.history.replaceState(null, '', `#/capturar/${id}${simular ? '?simular=1' : ''}`);
        }
        let miniatura: Blob | undefined;
        if (primera) {
          const c = document.createElement('canvas');
          c.width = 320;
          c.height = 160;
          c.getContext('2d')!.drawImage(v, 0, (v.videoHeight - v.videoWidth / 2) / 2, v.videoWidth, v.videoWidth / 2, 0, 0, 320, 160);
          miniatura = await new Promise<Blob | undefined>((ok) => c.toBlob((b) => ok(b ?? undefined), 'image/jpeg', 0.7));
          const track = stream.current?.getVideoTracks()[0];
          if (track) void bloquearExposicion(track);
        }
        await guardarToma({ captura: id, n: objetivo.n, imagen, cuaternion: q, creado: Date.now() }, miniatura);
        tomadas.current.add(objetivo.n);
        setConteo(tomadas.current.size);
        navigator.vibrate?.(40);
        pitido();
        setDestello((d) => d + 1);
      } catch (e) {
        avisar(e instanceof Error ? e.message : 'No se pudo guardar la foto.', 'error');
      } finally {
        disparando.current = false;
        quietoDesde.current = null;
      }
    },
    [avisar, camaraId, simular],
  );

  // Bucle de la guía: alineación, estabilidad, disparo automático y dibujo
  useEffect(() => {
    if (fase !== 'camara') return;
    let cuadro = 0;
    let pistaPrevia: Pista | null = null;
    const ciclo = () => {
      cuadro = requestAnimationFrame(ciclo);
      const lienzo = lienzoGuia.current;
      const v = video.current;
      const q = qActual.current;
      if (!lienzo || !v) return;
      const dpr = window.devicePixelRatio || 1;
      const cw = lienzo.clientWidth;
      const ch = lienzo.clientHeight;
      if (lienzo.width !== Math.round(cw * dpr)) {
        lienzo.width = Math.round(cw * dpr);
        lienzo.height = Math.round(ch * dpr);
      }
      const ctx = lienzo.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      let nuevaPista: Pista = 'sin-datos';
      if (!q || !v.videoWidth) {
        ctx.clearRect(0, 0, cw, ch);
      } else {
        const ahora = performance.now();
        historial.current.push({ t: ahora, q });
        while (historial.current.length > 2 && historial.current[1].t < ahora - 200) historial.current.shift();
        const movimiento = anguloEntre(historial.current[0].q, q);
        const mira = adelante(q);
        // Antes de la primera foto el plan sigue a la cámara: la primera la dispara el usuario
        const primera = tomadas.current.size === 0;
        const planVisto = primera ? girarPlan(planRef.current, direccionALonLat(mira).lon) : planRef.current;
        const pendientes = planVisto.filter((o) => !tomadas.current.has(o.n));
        let actual: Objetivo | null = null;
        let mejor = -2;
        for (const o of pendientes) {
          const d = punto(mira, lonLatADireccion(o.yaw, o.pitch));
          if (d > mejor) {
            mejor = d;
            actual = o;
          }
        }
        const angulo = Math.acos(Math.min(1, mejor));
        const ladeo = alabeo(q);
        const derecho = !actual || actual.polo || ladeo === null || Math.abs(ladeo) < LADEO_MAX || Math.abs(ladeo) > Math.PI - LADEO_MAX;
        const alineado = !!actual && angulo < TOLERANCIA;
        let avance = 0;
        if (primera) actual = planVisto[0];
        if (!primera && actual && alineado && derecho && movimiento < QUIETO_MAX && !disparando.current) {
          quietoDesde.current ??= ahora;
          avance = Math.min(1, (ahora - quietoDesde.current) / ESPERA_DISPARO);
          if (avance >= 1) void disparar(actual);
        } else if (!disparando.current) {
          quietoDesde.current = null;
        }
        const s = Math.max(cw / v.videoWidth, ch / v.videoHeight);
        dibujarGuia(ctx, cw, ch, {
          q,
          plan: planVisto,
          tomadas: tomadas.current,
          actual,
          alineado,
          derecho,
          avance,
          focalPantalla: focal({ ancho: v.videoWidth, alto: v.videoHeight }, gradosARad(fovRef.current)) * s,
        });
        if (primera) nuevaPista = derecho ? 'primera' : 'enderezar';
        else if (!actual) nuevaPista = 'listo';
        else if (alineado && !derecho) nuevaPista = 'enderezar';
        else if (alineado) nuevaPista = 'quieto';
        else if (actual.polo && angulo < gradosARad(60)) nuevaPista = actual.pitch > 0 ? 'cenit' : 'nadir';
        else nuevaPista = 'girar';
      }
      if (nuevaPista !== pistaPrevia) {
        pistaPrevia = nuevaPista;
        setPista(nuevaPista);
      }
    };
    cuadro = requestAnimationFrame(ciclo);
    return () => cancelAnimationFrame(cuadro);
  }, [fase, disparar]);

  const deshacer = async () => {
    if (!idCaptura.current) return;
    const n = await deshacerUltimaToma(idCaptura.current);
    if (n === null) return;
    tomadas.current.delete(n);
    setConteo(tomadas.current.size);
  };

  const salir = () => {
    apagar();
    if (idCaptura.current && conteo) avisar('Guardado como borrador. Puedes continuarlo desde la biblioteca.');
    navegar('/');
  };

  const unir = async () => {
    const id = idCaptura.current;
    if (!id) return;
    apagar();
    setFase('cosiendo');
    setProgreso({ etapa: 'Empezando', fraccion: 0 });
    trabajo.current = coserCaptura(id, (etapa, fraccion) => setProgreso({ etapa, fraccion }));
    try {
      await trabajo.current.promesa;
      navegar(`/ver/${id}`, { replace: true });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setFase('inicio');
        return;
      }
      setError(e instanceof Error ? e.message : 'Falló el cosido.');
      setFase('inicio');
    } finally {
      trabajo.current = null;
    }
  };

  const faltaSoporte = !simular && (!hayCamara() || !hayOrientacion());
  const sinHttps = !simular && !window.isSecureContext;

  return (
    <main className="fixed inset-0 bg-black text-white">
      <video ref={video} playsInline muted autoPlay className={`absolute inset-0 h-full w-full object-cover ${fase === 'camara' ? '' : 'invisible'}`} />
      <canvas ref={lienzoFoto} hidden />

      {fase === 'camara' && (
        <>
          <canvas ref={lienzoGuia} className="absolute inset-0 h-full w-full" aria-hidden />
          {destello > 0 && <div key={destello} className="pointer-events-none absolute inset-0 animate-[destello_0.35s_ease-out_forwards] bg-white" />}
          <div className="absolute inset-x-0 top-0 flex flex-col gap-2 bg-gradient-to-b from-black/80 to-transparent px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6">
            <div className="flex items-center gap-2">
              <Boton variante="fantasma" aria-label="Salir (se guarda como borrador)" onClick={salir} icono={<X size={20} aria-hidden />} className="px-2" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold" aria-live="polite">
                  {conteo} de {plan.length} fotos
                </p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/25">
                  <div className="h-full bg-green-400 transition-all" style={{ width: `${plan.length ? (conteo / plan.length) * 100 : 0}%` }} />
                </div>
              </div>
              <Boton variante="fantasma" aria-label="Deshacer la última foto" onClick={deshacer} disabled={!conteo} icono={<Undo2 size={20} aria-hidden />} className="px-2" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Boton
                variante={faltan === 0 ? 'principal' : 'fantasma'}
                icono={<Check size={18} aria-hidden />}
                onClick={unir}
                disabled={conteo < 2}
              >
                Unir fotos{faltan > 0 && conteo >= 2 ? ` (faltan ${faltan})` : ''}
              </Boton>
              <Boton
                variante={conteo === 0 ? 'principal' : 'fantasma'}
                icono={<Camera size={18} aria-hidden />}
                onClick={() => {
                  // Disparo manual: se asigna al punto pendiente más cercano
                  const q = qActual.current;
                  if (!q) return;
                  const mira = adelante(q);
                  if (tomadas.current.size === 0) {
                    // Primera foto: el plan se orienta hacia donde apunta el usuario
                    const girado = girarPlan(plan, direccionALonLat(mira).lon);
                    planRef.current = girado;
                    setPlan(girado);
                    void disparar(girado[0]);
                    return;
                  }
                  const pendiente = plan
                    .filter((o) => !tomadas.current.has(o.n))
                    .sort((a, b) => punto(mira, lonLatADireccion(b.yaw, b.pitch)) - punto(mira, lonLatADireccion(a.yaw, a.pitch)))[0];
                  if (pendiente) void disparar(pendiente);
                }}
                disabled={faltan === 0}
              >
                Disparar
              </Boton>
            </div>
            {conteo === 0 && (
              <div className="flex flex-col gap-2 rounded-xl bg-black/60 p-3 text-sm">
                {camaras.length > 1 && (
                  <label className="flex items-center gap-2">
                    Lente
                    <select
                      value={camaraId}
                      onChange={(e) => cambiarCamara(e.target.value)}
                      className="min-h-11 flex-1 rounded-lg bg-slate-800 px-2 text-white"
                    >
                      {camaras.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                          {c.granAngular ? ' (gran angular)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="flex items-center gap-2">
                  <span className="shrink-0">Ángulo del lente: {fov}°</span>
                  <input
                    type="range"
                    min={40}
                    max={120}
                    step={1}
                    value={fov}
                    onChange={(e) => {
                      const f = Number(e.target.value);
                      setFov(f);
                      planNuevo(f);
                    }}
                    className="min-h-11 flex-1 accent-cyan-400"
                    aria-describedby="ayuda-angulo"
                  />
                </label>
                <p id="ayuda-angulo" className="text-xs text-slate-300">
                  Normal ≈ 65°, gran angular ≈ 100°. Si los puntos no coinciden con lo que ves al girar, ajústalo. Se fija con la primera foto.
                </p>
              </div>
            )}
          </div>
          <p
            role="status"
            className={`absolute inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] rounded-xl px-4 py-3 text-center text-base font-medium ${
              pista === 'enderezar' ? 'bg-rose-700/90' : pista === 'listo' || pista === 'quieto' ? 'bg-green-700/90' : 'bg-black/70'
            }`}
          >
            {TEXTO_PISTA[pista]}
          </p>
        </>
      )}

      {(fase === 'inicio' || fase === 'cargando') && (
        <div className="mx-auto flex h-full max-w-lg flex-col gap-5 overflow-y-auto px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-10">
          <Boton variante="fantasma" className="w-fit" onClick={() => navegar('/')} icono={<X size={18} aria-hidden />}>
            Cancelar
          </Boton>
          <h1 className="text-2xl font-bold">{reanudando ? 'Continuar foto 360°' : 'Tomar foto 360°'}</h1>
          {error && <p className="rounded-xl bg-rose-900/80 p-3 text-sm">{error}</p>}
          {sinHttps && <p className="rounded-xl bg-amber-900/80 p-3 text-sm">La cámara y los sensores solo funcionan con HTTPS.</p>}
          {faltaSoporte && (
            <p className="rounded-xl bg-amber-900/80 p-3 text-sm">
              Este navegador no tiene {!hayCamara() ? 'acceso a la cámara' : 'sensores de movimiento'}. Usa Chrome en Android o Safari en iPhone.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Boton variante="principal" icono={<Camera size={18} aria-hidden />} onClick={empezar} disabled={fase === 'cargando' || faltaSoporte}>
              {reanudando ? `Continuar (${conteo} de ${plan.length})` : 'Empezar'}
            </Boton>
            {reanudando && conteo >= 2 && (
              <Boton icono={<Check size={18} aria-hidden />} onClick={unir}>
                Unir con las {conteo} fotos
              </Boton>
            )}
          </div>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-slate-200">
            <li>Párate en un punto y no te muevas de ahí. Si puedes, sostén el teléfono cerca del pecho.</li>
            <li>Gira el teléfono, no tu cuerpo hacia adelante: imagina que la cámara gira sobre un eje.</li>
            <li>Apunta el centro de la pantalla al punto rojo. Cuando se pone verde, quédate quieto: la foto se toma sola.</li>
            <li>Primero el horizonte, luego arriba, abajo, el cielo y el suelo. Una flecha te indica hacia dónde ir.</li>
            <li>Mantén el teléfono derecho (sin ladearlo). Para el suelo puedes voltearlo.</li>
          </ol>
          <p className="text-xs text-slate-400">
            Los objetos muy cercanos pueden verse cortados en las uniones: es normal al tomar la foto a mano.
            {simular && ' MODO SIMULADOR: flechas para girar, Shift para ir más rápido, Q/E para ladear.'}
          </p>
        </div>
      )}

      {fase === 'cosiendo' && progreso && (
        <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-xl font-semibold">Uniendo tus fotos</h1>
          <p role="status" className="text-sm text-slate-300">
            {progreso.etapa}… {Math.round(progreso.fraccion * 100)} %
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progreso.fraccion * 100)}>
            <div className="h-full bg-cyan-400 transition-all" style={{ width: `${progreso.fraccion * 100}%` }} />
          </div>
          <p className="text-xs text-slate-400">Todo ocurre en tu teléfono; puede tardar un minuto.</p>
          <Boton onClick={() => trabajo.current?.cancelar()}>Cancelar</Boton>
        </div>
      )}
    </main>
  );
}
