import { $, el, fetchJson, storage } from './util.js';

// Sección "Fotos de las habitaciones" en Administración: subir, ordenar, poner pie y borrar.
// El navegador reduce cada imagen antes de subirla, así el servidor no necesita procesarla.
const ROOM_KEY = 'calendario:fotos-habitacion';
const LIMITS = {
  photo: { maxEdge: 2000, quality: 0.85 },
  pano: { maxWidth: 4096, quality: 0.82 },
};

// "02-terraza-con-vista.jpg" → "Terraza con vista" (igual que las fotos de carpeta).
export function captionFromFile(name) {
  const base = name.replace(/\.[^.]+$/, '').replace(/^\d+[\s._-]*/, '').replace(/[-_]+/g, ' ').trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : '';
}

async function decode(file) {
  try {
    return await createImageBitmap(file);
  } catch {
    // Respaldo para navegadores sin createImageBitmap para este formato.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

// Reduce y convierte a JPEG. Las vistas 360° deben ser 2:1.
async function prepare(file, kind) {
  let image;
  try {
    image = await decode(file);
  } catch {
    throw new Error(`"${file.name}" no se pudo abrir. Usa JPG, PNG o WebP; si es muy grande, súbela desde una computadora.`);
  }
  const width = image.width;
  const height = image.height;
  if (kind === 'pano' && Math.abs(width / height - 2) > 0.05) {
    image.close?.();
    throw new Error(`"${file.name}" no es una vista 360°: mide ${width} × ${height} y debe ser el doble de ancha que de alta (2:1).`);
  }
  const limit = LIMITS[kind];
  const scale = kind === 'pano' ? Math.min(1, limit.maxWidth / width) : Math.min(1, limit.maxEdge / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', limit.quality));
  if (!blob) throw new Error(`"${file.name}" no se pudo convertir en este dispositivo.`);
  return blob;
}

export function createMediaAdmin() {
  let data = null;
  let roomId = storage.get(ROOM_KEY);
  let busy = false;

  async function load() {
    data = await fetchJson('api/staff/media');
    if (!data.rooms.some((r) => r.item_id === roomId)) roomId = data.rooms[0]?.item_id ?? null;
    render();
  }

  function render() {
    const warning = $('#media-warning');
    warning.hidden = data.persistent && data.writable;
    warning.textContent = !data.writable
      ? 'El servidor no puede guardar fotos. Revisa que el volumen de Railway esté conectado.'
      : 'Falta conectar un volumen en Railway: las fotos que subas se borrarán en la siguiente publicación.';

    const count = (m) => m.photos.length + m.panoramas.length;
    const total = data.rooms.reduce((sum, r) => sum + count(r.uploaded) + count(r.folder), 0);
    $('#media-zip').hidden = total === 0;
    $('#media-zip-note').hidden = total === 0;
    $('#media-zip').title = `${total} ${total === 1 ? 'imagen' : 'imágenes'}`;

    const select = $('#media-room');
    select.replaceChildren(...data.rooms.map((r) => {
      const opt = el('option', null, r.name);
      opt.value = r.item_id;
      opt.selected = r.item_id === roomId;
      return opt;
    }));

    const room = data.rooms.find((r) => r.item_id === roomId);
    if (!room) return;
    renderGroup('pano', room.uploaded.panoramas, room.folder.panoramas, $('#media-panos'));
    renderGroup('photo', room.uploaded.photos, room.folder.photos, $('#media-photos'));
  }

  function renderGroup(kind, uploaded, folder, container) {
    const cards = uploaded.map((item, i) => card(kind, item, i, uploaded));
    for (const item of folder) cards.push(folderCard(item));
    if (!cards.length) cards.push(el('p', 'empty', kind === 'pano' ? 'Sin vistas 360° todavía.' : 'Sin fotos todavía.'));
    container.replaceChildren(...cards);
  }

  function card(kind, item, index, list) {
    const box = el('article', `media-card${kind === 'pano' ? ' is-pano' : ''}`);
    const img = el('img');
    img.src = item.src;
    img.alt = '';
    img.loading = 'lazy';

    const caption = el('input', 'media-caption');
    caption.type = 'text';
    caption.maxLength = 120;
    caption.placeholder = 'Pie de foto (opcional)';
    caption.value = item.caption;
    caption.setAttribute('aria-label', 'Pie de foto');
    caption.addEventListener('change', () => run(() => send('PATCH', { kind, id: item.id, caption: caption.value.trim() }), 'Pie de foto guardado.'));

    const actions = el('div', 'media-actions');
    const button = (label, text, onClick, disabled = false) => {
      const b = el('button', 'text-btn small', text);
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.disabled = disabled;
      b.addEventListener('click', onClick);
      return b;
    };
    const move = (delta) => {
      const ids = list.map((x) => x.id);
      [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
      run(() => send('PUT', { kind, ids }), 'Orden guardado.');
    };
    actions.append(
      button('Mover antes', '↑', () => move(-1), index === 0),
      button('Mover después', '↓', () => move(1), index === list.length - 1),
      button('Borrar', 'Borrar', () => {
        if (!confirm('¿Borrar esta foto? No se puede deshacer.')) return;
        run(() => fetchJson(`api/staff/media?room=${encodeURIComponent(roomId)}&kind=${kind}&id=${encodeURIComponent(item.id)}`, { method: 'DELETE' }), 'Foto borrada.');
      }),
    );
    actions.lastChild.classList.add('danger');

    box.append(img, caption, actions);
    return box;
  }

  function folderCard(item) {
    const box = el('article', 'media-card is-folder');
    const img = el('img');
    img.src = item.src;
    img.alt = '';
    img.loading = 'lazy';
    box.append(img, el('p', 'media-folder-note', `${item.caption || 'Sin pie'} · publicada en el proyecto`));
    return box;
  }

  const send = (method, body) => fetchJson('api/staff/media', { method, body: JSON.stringify({ room: roomId, ...body }) });

  async function run(task, done) {
    if (busy) return;
    busy = true;
    status('Guardando…');
    try {
      await task();
      await load();
      status(done);
    } catch (err) {
      status(err.message, true);
      await load().catch(() => {});
    } finally {
      busy = false;
    }
  }

  async function upload(files, kind) {
    if (busy || !files.length) return;
    busy = true;
    const errors = [];
    let ok = 0;
    for (const [i, file] of [...files].entries()) {
      status(`Preparando y subiendo ${i + 1} de ${files.length}…`);
      try {
        const blob = await prepare(file, kind);
        const query = new URLSearchParams({ room: roomId, kind, caption: captionFromFile(file.name) });
        await fetchJson(`api/staff/media?${query}`, { method: 'POST', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
        ok += 1;
      } catch (err) {
        errors.push(err.message);
      }
    }
    busy = false;
    await load().catch(() => {});
    const summary = ok ? `${ok} ${ok === 1 ? 'imagen subida' : 'imágenes subidas'}.` : '';
    status([summary, ...errors].filter(Boolean).join(' '), errors.length > 0);
  }

  function status(text, isError = false) {
    const box = $('#media-status');
    box.textContent = text;
    box.classList.toggle('is-error', isError);
  }

  $('#media-room').addEventListener('change', (e) => {
    roomId = e.target.value;
    storage.set(ROOM_KEY, roomId);
    status('');
    render();
  });
  for (const input of document.querySelectorAll('[data-upload]')) {
    input.addEventListener('change', async () => {
      await upload(input.files, input.dataset.upload);
      input.value = '';
    });
  }

  return { load };
}
