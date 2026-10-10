export interface CamaraTrasera {
  id: string;
  nombre: string;
  granAngular: boolean;
}

export function hayCamara() {
  return !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Abre la cámara trasera a la mayor resolución que acepte el navegador.
 * Se pide 4:3 porque usa todo el sensor (16:9 recorta el campo de visión).
 */
export async function abrirCamara(id?: string): Promise<MediaStream> {
  const video: MediaTrackConstraints = {
    width: { ideal: 4032 },
    height: { ideal: 3024 },
    aspectRatio: { ideal: 4 / 3 },
    ...(id ? { deviceId: { exact: id } } : { facingMode: { ideal: 'environment' } }),
  };
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: false });
  } catch (e) {
    const nombre = e instanceof DOMException ? e.name : '';
    if (nombre === 'NotAllowedError') throw new Error('No diste permiso para usar la cámara. Actívalo en los ajustes del navegador.');
    if (nombre === 'NotFoundError') throw new Error('No se encontró ninguna cámara.');
    if (nombre === 'NotReadableError') throw new Error('Otra app está usando la cámara. Ciérrala e inténtalo de nuevo.');
    throw new Error('No se pudo abrir la cámara.');
  }
}

const ES_TRASERA = /back|rear|trasera|posterior|environment|facing back/i;
const ES_FRONTAL = /front|frontal|user|facing front|selfie/i;
const ES_GRAN_ANGULAR = /ultra|0[.,]5|wide angle|gran angular/i;
// iOS ofrece cámaras «virtuales» que cambian de lente solas: no sirven para coser
const ES_VIRTUAL = /dual|triple/i;

/** Lista las cámaras traseras (las etiquetas solo existen después de dar permiso). */
export async function listarCamarasTraseras(): Promise<CamaraTrasera[]> {
  const dispositivos = await navigator.mediaDevices.enumerateDevices();
  const camaras = dispositivos.filter((d) => d.kind === 'videoinput');
  const traseras = camaras.filter((d) => ES_TRASERA.test(d.label) && !ES_VIRTUAL.test(d.label));
  const lista = traseras.length ? traseras : camaras.filter((d) => !ES_FRONTAL.test(d.label));
  return lista.map((d, i) => ({
    id: d.deviceId,
    nombre: d.label || `Cámara ${i + 1}`,
    granAngular: ES_GRAN_ANGULAR.test(d.label),
  }));
}

/**
 * Campo de visión aproximado del lado largo de la foto. El navegador no lo informa;
 * el usuario lo puede ajustar.
 */
export const fovPorDefecto = (granAngular: boolean) => (granAngular ? 100 : 65);

/** Intenta fijar la exposición y el balance de blancos (solo algunos Android lo permiten). */
export async function bloquearExposicion(track: MediaStreamTrack): Promise<boolean> {
  const capacidades = (track.getCapabilities?.() ?? {}) as Record<string, unknown>;
  const modos = (k: string) => (Array.isArray(capacidades[k]) ? (capacidades[k] as string[]) : []);
  const avanzado: Record<string, string>[] = [];
  if (modos('exposureMode').includes('manual')) avanzado.push({ exposureMode: 'manual' });
  if (modos('whiteBalanceMode').includes('manual')) avanzado.push({ whiteBalanceMode: 'manual' });
  if (!avanzado.length) return false;
  try {
    await track.applyConstraints({ advanced: avanzado } as MediaTrackConstraints);
    return true;
  } catch {
    return false;
  }
}

/** Copia el fotograma actual del video a un JPEG. */
export function capturarFotograma(video: HTMLVideoElement, lienzo: HTMLCanvasElement): Promise<Blob> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return Promise.reject(new Error('La cámara aún no está lista.'));
  lienzo.width = w;
  lienzo.height = h;
  lienzo.getContext('2d')!.drawImage(video, 0, 0, w, h);
  return new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo guardar la foto.'))), 'image/jpeg', 0.92));
}

/** Pitido corto de confirmación (Web Audio, sin archivos). */
let audio: AudioContext | null = null;
export function pitido() {
  try {
    audio ??= new AudioContext();
    const osc = audio.createOscillator();
    const gan = audio.createGain();
    osc.frequency.value = 1200;
    gan.gain.setValueAtTime(0.15, audio.currentTime);
    gan.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
    osc.connect(gan).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.12);
  } catch {
    // Sin audio: no pasa nada
  }
}

/** Desbloquea el audio en iOS (debe llamarse dentro de un toque). */
export function prepararAudio() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    // ignorar
  }
}
