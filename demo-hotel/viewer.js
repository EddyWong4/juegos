import { $, el } from './util.js';
import { IDENTITY, MAX_ZOOM, MIN_ZOOM, clampPan, fitSize, pinch, zoomAt } from './zoom.js';

// Visor de fotos de una habitación: fotos normales (con flechas, deslizar y miniaturas)
// y panorámicas 360° con Pannellum, que se carga solo la primera vez que se abre una.
const PANNELLUM_STRINGS = {
  loadButtonLabel: 'Toca para cargar<br>la vista 360°',
  loadingLabel: 'Cargando…',
  bylineLabel: '',
  noPanoramaError: 'No se indicó una imagen 360°.',
  fileAccessError: 'No se pudo abrir la imagen %s.',
  malformedURLError: 'La dirección de la imagen no es válida.',
  iOS8WebGLError: 'Este dispositivo no puede mostrar la vista 360°.',
  genericWebGLError: 'Este navegador no puede mostrar la vista 360°.',
  textureSizeError: 'La imagen 360° es demasiado grande para este dispositivo (máximo %spx de ancho).',
  unknownError: 'No se pudo mostrar la vista 360°.',
  twoTouchActivate: 'Usa dos dedos para moverte',
  twoTouchXActivate: 'Usa dos dedos para moverte',
  twoTouchYActivate: 'Usa dos dedos para moverte',
  ctrlZoomActivate: 'Usa Ctrl + rueda para acercar',
};

let pannellumReady = null;
function loadPannellum() {
  pannellumReady ??= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'vendor/pannellum/pannellum.css';
    document.head.append(css);
    const script = document.createElement('script');
    script.src = 'vendor/pannellum/pannellum.js';
    script.onload = () => resolve(window.pannellum);
    script.onerror = () => { pannellumReady = null; reject(new Error('No se pudo cargar el visor 360°')); };
    document.head.append(script);
  });
  return pannellumReady;
}

export function createViewer() {
  const dialog = $('#viewer');
  const state = { room: null, mode: 'photos', photo: 0, pano: 0, viewer: null };

  function open(room, mode = 'photos', index = 0) {
    state.room = room;
    state.photo = mode === 'photos' ? index : 0;
    state.pano = 0;
    $('#viewer-title').textContent = room.name;
    const { photos, panoramas } = room.media;
    $('#viewer-tab-photos').hidden = !photos.length;
    $('#viewer-tab-pano').hidden = !panoramas.length;
    $('#viewer-tab-photos').textContent = `Fotos (${photos.length})`;
    $('#viewer-tab-pano').textContent = panoramas.length > 1 ? `360° (${panoramas.length})` : '360°';
    dialog.showModal();
    setMode(mode === 'pano' && panoramas.length ? 'pano' : photos.length ? 'photos' : 'pano');
  }

  function close() {
    destroyPano();
    dialog.close();
  }

  function setMode(mode) {
    state.mode = mode;
    for (const tab of dialog.querySelectorAll('[data-mode]')) tab.setAttribute('aria-selected', String(tab.dataset.mode === mode));
    $('#viewer-photos').hidden = mode !== 'photos';
    $('#viewer-pano').hidden = mode !== 'pano';
    if (mode === 'photos') {
      destroyPano();
      showPhoto(state.photo);
    } else {
      showPano(state.pano);
    }
  }

  // ── Fotos normales ──

  function showPhoto(i) {
    const photos = state.room.media.photos;
    if (!photos.length) return;
    state.photo = (i + photos.length) % photos.length;
    const photo = photos[state.photo];
    const img = $('#viewer-img');
    img.src = photo.src;
    img.alt = photo.caption || `${state.room.name}, foto ${state.photo + 1}`;
    $('#viewer-caption').textContent = photo.caption;
    $('#viewer-count').textContent = `${state.photo + 1} / ${photos.length}`;
    $('#viewer-prev').hidden = photos.length < 2;
    $('#viewer-next').hidden = photos.length < 2;
    // Precarga la siguiente para que el cambio sea inmediato.
    if (photos.length > 1) new Image().src = photos[(state.photo + 1) % photos.length].src;
    renderThumbs(photos, state.photo, (j) => showPhoto(j));
  }

  // ── Panorámicas 360° ──

  async function showPano(i) {
    const panos = state.room.media.panoramas;
    state.pano = (i + panos.length) % panos.length;
    const pano = panos[state.pano];
    $('#viewer-pano-caption').textContent = pano.caption;
    renderThumbs(panos, state.pano, (j) => showPano(j), true);
    destroyPano();
    const status = $('#viewer-pano-status');
    status.hidden = false;
    status.textContent = 'Cargando vista 360°…';
    try {
      const pannellum = await loadPannellum();
      if (state.mode !== 'pano' || !dialog.open) return;
      state.viewer = pannellum.viewer('pano', {
        type: 'equirectangular',
        panorama: pano.src,
        autoLoad: true,
        showZoomCtrl: true,
        showFullscreenCtrl: true,
        compass: false,
        // Ángulo de visión horizontal: más cerrado en pantallas verticales para que no se deforme.
        hfov: innerHeight > innerWidth ? 70 : 100,
        autoRotate: -2,
        autoRotateInactivityDelay: 4000,
        strings: PANNELLUM_STRINGS,
      });
      state.viewer.on('load', () => { status.hidden = true; });
      state.viewer.on('error', () => { status.hidden = true; });
    } catch (err) {
      status.textContent = err.message;
    }
  }

  function destroyPano() {
    if (state.viewer) {
      state.viewer.destroy();
      state.viewer = null;
    }
    $('#pano').replaceChildren();
  }

  // ── Miniaturas ──

  function renderThumbs(items, current, onPick, isPano = false) {
    const strip = $('#viewer-thumbs');
    strip.hidden = items.length < 2;
    strip.replaceChildren(...items.map((item, j) => {
      const btn = el('button', `viewer-thumb${isPano ? ' is-pano' : ''}`);
      btn.type = 'button';
      btn.setAttribute('aria-label', item.caption || `${isPano ? 'Vista 360°' : 'Foto'} ${j + 1}`);
      btn.setAttribute('aria-current', String(j === current));
      const img = el('img');
      img.src = item.src;
      img.alt = '';
      img.loading = 'lazy';
      btn.append(img);
      btn.addEventListener('click', () => onPick(j));
      return btn;
    }));
    strip.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  // ── Eventos ──

  $('#viewer-close').addEventListener('click', close);
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  for (const tab of dialog.querySelectorAll('[data-mode]')) tab.addEventListener('click', () => setMode(tab.dataset.mode));
  $('#viewer-prev').addEventListener('click', () => showPhoto(state.photo - 1));
  $('#viewer-next').addEventListener('click', () => showPhoto(state.photo + 1));
  dialog.addEventListener('keydown', (e) => {
    if (state.mode !== 'photos') return;
    if (e.key === 'ArrowLeft') showPhoto(state.photo - 1);
    if (e.key === 'ArrowRight') showPhoto(state.photo + 1);
    if (e.key === '+' || e.key === '=') zoomBy(1.6);
    if (e.key === '-') zoomBy(1 / 1.6);
    if (e.key === '0') resetZoom(true);
  });

  // ── Zoom de fotos ──
  // Pellizcar o rueda del ratón para acercar, arrastrar para moverse, doble toque o doble clic
  // para acercar/restablecer. Sin zoom, deslizar cambia de foto.

  const stage = $('#viewer-photos');
  const img = $('#viewer-img');
  let z = { ...IDENTITY };

  const sizes = () => {
    const r = stage.getBoundingClientRect();
    const stageSize = { w: r.width, h: r.height };
    return { stage: stageSize, content: fitSize({ w: img.naturalWidth, h: img.naturalHeight }, stageSize), rect: r };
  };
  // Punto de la pantalla medido desde el centro del visor.
  const fromCenter = (clientX, clientY) => {
    const r = stage.getBoundingClientRect();
    return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
  };

  function applyZoom(next, animate = false) {
    z = next;
    img.classList.toggle('is-animating', animate);
    img.style.transform = z.s > 1 ? `translate(${z.x}px, ${z.y}px) scale(${z.s})` : '';
    stage.classList.toggle('is-zoomed', z.s > 1);
    $('#zoom-out').disabled = z.s <= MIN_ZOOM;
    $('#zoom-reset').disabled = z.s <= MIN_ZOOM;
    $('#zoom-in').disabled = z.s >= MAX_ZOOM;
  }
  const resetZoom = (animate = false) => applyZoom({ ...IDENTITY }, animate);
  const zoomBy = (factor, point = { x: 0, y: 0 }, animate = true) => {
    const { content, stage: st } = sizes();
    applyZoom(zoomAt(z, factor, point.x, point.y, content, st), animate);
  };

  // Al cambiar de foto o cerrar, el zoom vuelve a 1.
  img.addEventListener('load', () => resetZoom());
  dialog.addEventListener('close', () => resetZoom());
  addEventListener('resize', () => { if (dialog.open && z.s > 1) { const { content, stage: st } = sizes(); applyZoom(clampPan(z, content, st)); } });

  $('#zoom-in').addEventListener('click', () => zoomBy(1.6));
  $('#zoom-out').addEventListener('click', () => zoomBy(1 / 1.6));
  $('#zoom-reset').addEventListener('click', () => resetZoom(true));

  stage.addEventListener('wheel', (e) => {
    if (state.mode !== 'photos') return;
    e.preventDefault();
    zoomBy(Math.exp(-e.deltaY * 0.0015), fromCenter(e.clientX, e.clientY), false);
  }, { passive: false });

  const pointers = new Map();
  let gesture = null;
  let lastTap = { time: 0, x: 0, y: 0 };

  const startGesture = () => {
    const pts = [...pointers.values()];
    const mid = pts.length === 2
      ? fromCenter((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2)
      : fromCenter(pts[0].x, pts[0].y);
    gesture = {
      z: { ...z },
      pts: pts.map((p) => ({ ...p })),
      mid,
      dist: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
      pinched: gesture?.pinched || pts.length === 2,
      moved: gesture?.moved || false,
    };
  };

  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || pointers.size >= 2) return;
    // Capturar el puntero mantiene el arrastre aunque el dedo salga del visor; si el navegador
    // no lo permite, el gesto sigue funcionando sin captura.
    try { stage.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
    if (!pointers.size) gesture = null;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
    startGesture();
  });

  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, { ...pointers.get(e.pointerId), x: e.clientX, y: e.clientY });
    const pts = [...pointers.values()];
    const { content, stage: st } = sizes();
    if (pts.length === 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = fromCenter((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      applyZoom(pinch(gesture.z, gesture.dist || dist, dist, gesture.mid, mid, content, st));
      gesture.moved = true;
    } else {
      const dx = e.clientX - gesture.pts[0].x;
      const dy = e.clientY - gesture.pts[0].y;
      if (Math.hypot(dx, dy) > 6) gesture.moved = true;
      // Con zoom, un dedo (o el ratón) mueve la foto.
      if (z.s > 1) applyZoom(clampPan({ ...gesture.z, x: gesture.z.x + dx, y: gesture.z.y + dy }, content, st));
    }
  });

  const endPointer = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const start = gesture?.pts.find((p) => p.t === pointers.get(e.pointerId).t) ?? gesture?.pts[0];
    pointers.delete(e.pointerId);
    if (pointers.size) return startGesture(); // de pellizco a un dedo: sigue moviendo sin saltos
    const g = gesture;
    gesture = null;
    if (!g || !start) return;
    const dx = e.clientX - start.x;

    // Sin zoom, deslizar cambia de foto.
    if (!g.pinched && g.z.s <= 1 && Math.abs(dx) > 50 && e.type === 'pointerup') {
      return showPhoto(state.photo + (dx < 0 ? 1 : -1));
    }
    // Doble toque o doble clic: acercar a ese punto, o volver al tamaño normal.
    if (!g.moved && !g.pinched && e.type === 'pointerup') {
      const now = performance.now();
      const near = Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30;
      if (now - lastTap.time < 320 && near) {
        lastTap = { time: 0, x: 0, y: 0 };
        if (z.s > 1) resetZoom(true);
        else zoomBy(2.5, fromCenter(e.clientX, e.clientY));
      } else {
        lastTap = { time: now, x: e.clientX, y: e.clientY };
      }
    }
  };
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  return { open };
}
