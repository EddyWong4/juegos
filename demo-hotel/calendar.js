import { $, addDays, addMonths, asDate, capitalize, el, fetchJson, localToday, money, monthStart, parts, storage } from './util.js';
import { createViewer } from './viewer.js';
import { estimate, firstBlockedNight, nightPrice, pickDate } from './stay.js';

const viewer = createViewer();
const MEDIA_TILES = 4;

const MONTHS_AHEAD = 12;
const WEEKDAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const ROOM_KEY = 'calendario:habitacion';
const monthFmt = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDayFmt = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
const shortDay = (iso) => shortDayFmt.format(asDate(iso)).replaceAll('.', '');
const dayMonthFmt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
const rangeDay = (iso) => dayMonthFmt.format(asDate(iso)).replaceAll('.', '');
// "27–28 de oct" si es el mismo mes; "30 oct – 2 nov" si cruza de mes.
function rangeLabel(a, b) {
  if (a.slice(0, 7) === b.slice(0, 7)) return `${parts(a)[2]}–${rangeDay(b).replace(' ', ' de ')}`;
  return `${rangeDay(a)} – ${rangeDay(b)}`;
}
// Precio corto para las celdas: 3500 → "$3.5 k", 2000 → "$2 k".
function compactPrice(n) {
  if (n == null) return '';
  return n >= 1000 ? `$${(n / 1000).toFixed(1).replace(/\.0$/, '')} k` : `$${n}`;
}

// Pantalla pública: disponibilidad por habitación.
export function createCalendar({ params, onData }) {
  // sel: estancia elegida (llegada y salida); pickError: aviso del último toque.
  const state = { config: null, data: null, roomId: null, sel: { checkIn: null, checkOut: null }, pickError: null };

  async function load(config) {
    state.config = config;
    const from = monthStart(config.today || localToday());
    const data = await fetchJson(`api/availability?from=${from}&to=${addMonths(from, MONTHS_AHEAD)}`);
    state.data = data;

    // La liga puede traer el id anterior de una habitación que cambió de nombre.
    const wanted = params.get('room') || storage.get(ROOM_KEY);
    const find = (id) => data.rooms.find((r) => r.id === id || r.alias_ids?.includes(id));
    if (!data.rooms.some((r) => r.id === state.roomId)) {
      state.roomId = find(wanted)?.id ?? data.rooms[0]?.id ?? null;
    }
    // Al entrar sin habitación en la liga se muestra primero la lista (en celular).
    state.showList ??= !new URLSearchParams(location.search).get('room');
    onData(data);
    applyLayout();
    renderRooms();
    renderRoom();
  }

  const isPhone = () => !matchMedia('(min-width: 900px)').matches;

  // Tarjetas al estilo de la app de anfitriones: foto, nombre, tipo, precio y mini calendario.
  function renderRooms() {
    const today = state.config.today || localToday();
    $('#room-list').replaceChildren(...state.data.rooms.map((room) => {
      const card = el('button', 'room-card');
      card.type = 'button';
      // En computadora la lista y el calendario se ven juntos: se resalta la habitación abierta.
      card.setAttribute('aria-current', String(room.id === state.roomId && (!state.showList || !isPhone())));

      const cover = room.media?.photos?.[0] ?? room.media?.panoramas?.[0];
      if (cover) {
        const img = el('img', 'room-thumb');
        img.src = cover.src;
        img.alt = '';
        img.loading = 'lazy';
        card.append(img);
      } else {
        const ph = el('span', 'room-thumb');
        ph.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M3 18v-6.5A2.5 2.5 0 0 1 5.5 9h13a2.5 2.5 0 0 1 2.5 2.5V18M3 18h18M3 18v2m18-2v2M6 9V6.5A1.5 1.5 0 0 1 7.5 5h9A1.5 1.5 0 0 1 18 6.5V9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
        card.append(ph);
      }

      const info = el('span', 'room-info');
      const price = money(room.price, room.currency);
      info.append(
        el('span', 'name', room.name),
        el('span', 'type', [room.category, room.units > 1 && `${room.units} cuartos`].filter(Boolean).join(' · ') || 'Habitación'),
        el('span', 'price', price ? `desde ${price} / noche` : ''),
      );
      card.append(info, miniCalendar(room, today));
      card.setAttribute('aria-label', `${room.name}${price ? `, desde ${price} por noche` : ''}. Ver calendario.`);
      card.addEventListener('click', () => selectRoom(room.id, { fromList: true }));
      return card;
    }));
  }

  // Mes actual en puntos: libre = punto, ocupado = barra (une noches seguidas), hoy = coral.
  function miniCalendar(room, today) {
    const start = monthStart(today);
    const end = addMonths(start, 1);
    const grid = el('span', 'mini-cal');
    grid.setAttribute('aria-hidden', 'true');
    const offset = (asDate(start).getDay() + 6) % 7;
    for (let i = 0; i < offset; i++) grid.append(el('span'));
    // El servidor manda las noches desde el inicio del mes actual, así que incluye los días pasados.
    const isFull = (d) => d >= start && d < end && (room.occupied?.[d] ?? 0) >= room.units;
    for (let d = start; d < end; d = addDays(d, 1)) {
      const col = (asDate(d).getDay() + 6) % 7;
      const occupied = isFull(d);
      const cls = [];
      if (occupied) {
        cls.push('occ');
        if (col === 0 || !isFull(addDays(d, -1))) cls.push('run-start');
        if (col === 6 || !isFull(addDays(d, 1))) cls.push('run-end');
      } else {
        cls.push('dot');
      }
      if (d < today) cls.push('past');
      if (d === today && !occupied) cls.push('today');
      grid.append(el('span', cls.join(' ')));
    }
    return grid;
  }

  function applyLayout() {
    const view = $('#view-calendar');
    view.classList.toggle('show-list', state.showList);
    view.classList.toggle('show-room', !state.showList);
  }

  function selectRoom(id, { fromList = false } = {}) {
    state.roomId = id;
    storage.set(ROOM_KEY, id);
    const url = new URL(location.href);
    url.searchParams.set('room', id);
    // En celular, abrir una habitación desde la lista es una "página" nueva: Atrás regresa a la lista.
    if (fromList && isPhone() && state.showList) {
      history.pushState({ room: id }, '', url);
      window.scrollTo(0, 0);
    } else {
      history.replaceState(history.state, '', url);
    }
    state.showList = false;
    applyLayout();
    renderRooms();
    renderRoom();
  }

  function backToList() {
    if (history.state?.room) return history.back();
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url);
    state.showList = true;
    applyLayout();
    renderRooms();
  }

  addEventListener('popstate', () => {
    if (!state.data || $('#view-calendar').hidden) return;
    const room = new URLSearchParams(location.search).get('room');
    state.showList = !room;
    if (room && state.data.rooms.some((r) => r.id === room)) state.roomId = room;
    applyLayout();
    renderRooms();
    renderRoom();
  });

  function dayStatus(room, iso, today) {
    if (iso < today) return { status: 'past', free: null };
    if (iso < state.data.from || iso >= state.data.to) return { status: 'unknown', free: null };
    const free = room.units - (room.occupied[iso] ?? 0);
    if (free <= 0) return { status: 'full', free: 0 };
    if (free < room.units) return { status: 'partial', free };
    return { status: 'free', free };
  }

  // Una noche se puede reservar si hay al menos un cuarto libre.
  const canSleep = (room, today) => (d) => ['free', 'partial'].includes(dayStatus(room, d, today).status);

  function onPickDay(date) {
    const room = state.data.rooms.find((r) => r.id === state.roomId);
    const today = state.config.today || localToday();
    const { selection, error } = pickDate(state.sel, date, canSleep(room, today));
    state.sel = selection;
    state.pickError = error;
    renderRoom();
  }

  function clearStay() {
    state.sel = { checkIn: null, checkOut: null };
    state.pickError = null;
    renderRoom();
  }

  // Panel flotante de la estancia (abajo), al estilo de la app de anfitriones:
  // píldora con las fechas, "Reserva aquí", precio por noche con el total y "Cambiar fechas".
  function renderStay(room, today) {
    const { checkIn, checkOut } = state.sel;
    const bar = $('#stay-bar');
    $('#stay').hidden = Boolean(checkIn);
    bar.hidden = !checkIn;
    document.body.classList.toggle('has-stay-bar', Boolean(checkIn));

    const msg = $('#stay-msg');
    msg.hidden = !state.pickError;
    if (state.pickError) {
      const { type, date } = state.pickError;
      msg.textContent = type === 'arrival'
        ? `La noche del ${shortDay(date)} ya está ocupada; elige otra fecha de llegada.`
        : `La noche del ${shortDay(date)} ya está ocupada; elige una salida antes de esa fecha o cambia la llegada.`;
    }
    if (!checkIn) return;

    const cards = $('#stay-cards');
    if (!checkOut) {
      $('#stay-range').textContent = `Llegada ${rangeDay(checkIn)} · elige tu salida`;
      cards.hidden = true;
      return;
    }

    $('#stay-range').textContent = rangeLabel(checkIn, checkOut);
    const blocked = firstBlockedNight(checkIn, checkOut, canSleep(room, today));
    const { nights, total, min, max } = estimate(checkIn, checkOut, (d) => nightPrice(room.price, d, state.data.pricing));
    cards.hidden = false;
    if (blocked) {
      msg.hidden = false;
      msg.textContent = `En esta habitación la noche del ${shortDay(blocked)} ya está ocupada. Elige otras fechas u otra habitación.`;
    }

    const book = $('#stay-book');
    book.hidden = !state.config.booking_url || state.config.staff || Boolean(blocked);
    book.href = state.config.booking_url || '#';
    cards.classList.toggle('no-book', book.hidden);

    // Si la estancia mezcla noches entre semana y de fin de semana, se muestra el rango.
    const night = $('#stay-night');
    night.textContent = min == null ? '—' : min === max ? money(min, room.currency) : `${money(min, room.currency)} – ${money(max, room.currency)}`;
    night.classList.toggle('is-range', min != null && min !== max);
    $('#stay-total').textContent = blocked
      ? 'Fechas no disponibles'
      : `${nights} ${nights === 1 ? 'noche' : 'noches'}${total == null ? '' : ` · ${money(total, room.currency)} total`}`;
  }

  function renderRoom() {
    if (!state.data) return;
    const room = state.data.rooms.find((r) => r.id === state.roomId) ?? null;
    const months = $('#months');
    if (!room) {
      $('#room-title').textContent = 'Sin habitaciones';
      $('#room-summary').textContent = 'No se encontraron habitaciones en el catálogo.';
      months.replaceChildren();
      return;
    }

    const today = state.config.today || localToday();
    // Una selección que ya quedó en el pasado se descarta.
    if (state.sel.checkIn && state.sel.checkIn < today) state.sel = { checkIn: null, checkOut: null };
    $('#room-title').textContent = room.name;
    renderStay(room, today);
    renderMedia(room);
    $('#legend-partial').hidden = room.units <= 1;

    let freeNights = 0;
    for (let i = 0, d = today; i < 30; i++, d = addDays(d, 1)) {
      if (['free', 'partial'].includes(dayStatus(room, d, today).status)) freeNights++;
    }
    $('#room-summary').textContent = `Próximos 30 días: ${freeNights} ${freeNights === 1 ? 'noche disponible' : 'noches disponibles'}`;


    // Todos los meses, uno debajo de otro (se recorren desplazándose hacia abajo).
    const list = [];
    for (let m = state.data.from; m < state.data.to; m = addMonths(m, 1)) list.push(monthView(room, m, today));
    months.replaceChildren(...list);
  }

  // Miniaturas de la habitación: primero la vista 360° (si hay) y luego las fotos.
  function renderMedia(room) {
    const box = $('#room-media');
    const photos = room.media?.photos ?? [];
    const panoramas = room.media?.panoramas ?? [];
    box.hidden = !photos.length && !panoramas.length;
    if (box.hidden) return box.replaceChildren();

    const tiles = [];
    if (panoramas.length) {
      const tile = mediaTile(panoramas[0], 'is-pano', () => viewer.open(room, 'pano'));
      tile.setAttribute('aria-label', `Vista 360° de ${room.name}`);
      tile.append(el('span', 'tile-badge', '360°'));
      tiles.push(tile);
    }
    const slots = MEDIA_TILES - tiles.length;
    photos.slice(0, slots).forEach((photo, i) => {
      const tile = mediaTile(photo, '', () => viewer.open(room, 'photos', i));
      tile.setAttribute('aria-label', `${photo.caption || 'Foto'} (${i + 1} de ${photos.length})`);
      const more = photos.length - slots;
      if (i === slots - 1 && more > 0) tile.append(el('span', 'tile-more', `+${more}`));
      tiles.push(tile);
    });
    box.replaceChildren(...tiles);
  }

  function mediaTile(item, extra, onClick) {
    const btn = el('button', `media-tile ${extra}`.trim());
    btn.type = 'button';
    const img = el('img');
    img.src = item.src;
    img.alt = '';
    img.loading = 'lazy';
    btn.append(img);
    btn.addEventListener('click', onClick);
    return btn;
  }

  function monthView(room, start, today) {
    const wrap = document.createElement('div');
    wrap.className = 'month';
    const title = document.createElement('h3');
    title.textContent = capitalize(monthFmt.format(asDate(start))).replace(' de ', ' ');
    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', title.textContent);
    const { checkIn, checkOut } = state.sel;

    for (const w of WEEKDAYS) {
      const cell = document.createElement('div');
      cell.className = 'dow';
      cell.textContent = w;
      cell.setAttribute('aria-hidden', 'true');
      grid.append(cell);
    }

    const offset = asDate(start).getDay(); // semana empieza en domingo
    for (let i = 0; i < offset; i++) grid.append(document.createElement('div'));

    for (let d = start; d < addMonths(start, 1); d = addDays(d, 1)) {
      const { status, free } = dayStatus(room, d, today);
      // Los días con información son botones para elegir llegada y salida.
      const selectable = status !== 'past' && status !== 'unknown';
      const cell = document.createElement(selectable ? 'button' : 'div');
      if (selectable) {
        cell.type = 'button';
        cell.addEventListener('click', () => onPickDay(d));
      }
      const isStart = d === checkIn;
      const isEnd = d === checkOut;
      const inRange = Boolean(checkIn && checkOut && d > checkIn && d < checkOut);
      const picked = isStart || isEnd || inRange;
      cell.className = `day s-${status}${d === today ? ' is-today' : ''}${picked ? ' is-picked' : ''}${isStart || isEnd ? ' is-edge' : ''}`;
      // Número del día arriba y precio por noche abajo (como en la app de anfitriones).
      cell.append(el('span', 'd-num', String(parts(d)[2])));
      const price = compactPrice(nightPrice(room.price, d, state.data.pricing));
      if (selectable && price) cell.append(el('span', 'd-price', price));
      if (status === 'partial' && !picked) cell.append(el('span', 'd-badge', `${free} ${free === 1 ? 'libre' : 'libres'}`));
      const label = {
        free: 'disponible',
        partial: `${free} de ${room.units} disponibles`,
        full: 'ocupado',
        past: 'fecha pasada',
        unknown: 'sin información',
      }[status];
      const role = isStart ? ', fecha de llegada' : isEnd ? ', fecha de salida' : inRange ? ', dentro de tu estancia' : '';
      cell.setAttribute('aria-label', `${dayFmt.format(asDate(d))}: ${label}${role}`);
      if (selectable) cell.setAttribute('aria-pressed', String(isStart || isEnd || inRange));
      grid.append(cell);
    }

    wrap.append(title, grid);
    return wrap;
  }

  $('#back-to-rooms').addEventListener('click', backToList);
  $('#stay-clear').addEventListener('click', clearStay);
  $('#stay-change').addEventListener('click', clearStay);
  matchMedia('(min-width: 900px)').addEventListener('change', () => state.data && renderRooms());

  return { load };
}
