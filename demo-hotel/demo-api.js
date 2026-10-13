// Servidor de la demo dentro del navegador: responde las llamadas a api/... con los mismos
// módulos del servidor real (store, reports, mock) y datos inventados. Así la demo se publica
// como sitio estático (GitHub Pages) sin llave de R2 ni datos de ningún hotel real.
import { Store } from './lib/store.js';
import { mockData } from './lib/mock.js';
import { buildReport, monthsBetween } from './lib/reports.js';
import { addDays, isIsoDate, todayIn } from './lib/dates.js';

const HOTEL_NAME = 'Hotel Arena Azul';
const TIMEZONE = 'America/Mexico_City';
const PASSWORDS = { demo: 'staff', admin: 'admin' };
const ROLE_KEY = 'demo-hotel:rol';
const BLOCKING = ['pending', 'placed', 'confirmed', 'in-progress', 'completed'];

const PHOTO = {
  recamara: 'Recámara', bano: 'Baño', terraza: 'Terraza', atardecer: 'Atardecer en la playa',
  alberca: 'Alberca', jardin: 'Jardín',
};
const ROOM_PHOTOS = {
  'habitacion-estandar': { photos: ['recamara', 'bano'] },
  'habitacion-doble': { photos: ['recamara', 'jardin', 'bano'] },
  'suite-vista-al-mar': { photos: ['terraza', 'recamara', 'atardecer', 'bano'], pano: true },
  'bungalow-jardin': { photos: ['jardin', 'recamara', 'alberca'], pano: true },
  'cabana-familiar': { photos: ['jardin', 'alberca', 'recamara', 'bano'] },
  'habitacion-ocean-view': { photos: ['atardecer', 'recamara', 'terraza'], pano: true },
};

class DemoStore extends Store {
  roomsConfig() {
    return { pricing: { weekend_nights: [5, 6], weekend_extra: 400 } };
  }
}

const store = new DemoStore({ dataDir: '', timezone: TIMEZONE, roomsConfigFile: '', blockingStatuses: BLOCKING });
const data = mockData(TIMEZONE);
store.setItems(data.items);
store.replaceReservations(data.reservations);
store.unitDefaults = data.units;
store.lastSync = new Date().toISOString();

// Fotos: empiezan con las ilustraciones; lo que se suba en la demo vive solo en esta pestaña.
let nextId = 1;
const library = new Map();
for (const room of store.rooms()) {
  const plan = ROOM_PHOTOS[room.id] ?? { photos: ['recamara'] };
  library.set(room.item_id, {
    photos: plan.photos.map((p) => ({ id: `f${nextId++}`, src: `fotos/${p}.jpg`, caption: PHOTO[p], width: 1600, height: 1067 })),
    panoramas: plan.pano ? [{ id: `f${nextId++}`, src: 'fotos/panorama.jpg', caption: 'Vista 360° de la playa', width: 4096, height: 2048 }] : [],
  });
}
const LISTS = { photo: 'photos', pano: 'panoramas' };

const getRole = () => { try { return localStorage.getItem(ROLE_KEY); } catch { return null; } };
const setRole = (role) => { try { role ? localStorage.setItem(ROLE_KEY, role) : localStorage.removeItem(ROLE_KEY); } catch { /* sin almacenamiento */ } };

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

async function handle(route, url, method, body) {
  const role = getRole();
  const today = todayIn(TIMEZONE);

  if (route === '/api/config') {
    return json(200, { hotel_name: HOTEL_NAME, booking_url: 'reserva.html', mode: 'mock', today, staff: Boolean(role), role });
  }

  if (route === '/api/availability') {
    const from = url.searchParams.get('from') || today;
    const to = url.searchParams.get('to') || addDays(from, 365);
    if (!isIsoDate(from) || !isIsoDate(to) || to <= from) return json(400, { error: 'fechas inválidas' });
    const itemIds = new Map(store.rooms().map((r) => [r.id, r.item_id]));
    return json(200, {
      from, to, today, mode: 'mock', last_sync: store.lastSync, pricing: store.pricing(),
      rooms: store.availability(from, to).map((room) => {
        const media = library.get(itemIds.get(room.id));
        return { ...room, media: media && (media.photos.length || media.panoramas.length) ? media : null };
      }),
    });
  }

  if (route === '/api/health') return json(200, { ok: true, mode: 'mock', last_sync: store.lastSync });

  if (route === '/api/staff/login' && method === 'POST') {
    const next = PASSWORDS[String(JSON.parse(body || '{}').password ?? '').trim().toLowerCase()];
    if (!next) return json(401, { error: 'Contraseña incorrecta. En la demo usa «demo» o «admin».' });
    setRole(next);
    return json(200, { ok: true, role: next });
  }
  if (route === '/api/staff/logout' && method === 'POST') {
    setRole(null);
    return json(200, { ok: true });
  }

  if (route === '/api/staff/media') {
    if (role !== 'admin') return json(403, { error: 'Se requiere la contraseña de administración' });
    return handleMedia(url, method, body);
  }

  if (!role) return json(401, { error: 'sesión requerida' });
  if (route === '/api/staff/me') return json(200, { ok: true });

  if (route === '/api/staff/day') {
    const date = url.searchParams.get('date') || today;
    if (!isIsoDate(date)) return json(400, { error: 'date debe ser YYYY-MM-DD' });
    return json(200, { ...store.day(date), today, history_from: addDays(today, -31), last_sync: store.lastSync });
  }

  if (route === '/api/staff/report') {
    if (role !== 'admin') return json(403, { error: 'Se requiere la contraseña de administración' });
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!/^\d{4}-\d{2}$/.test(from ?? '') || !/^\d{4}-\d{2}$/.test(to ?? '') || to < from) return json(400, { error: 'periodo inválido' });
    if (monthsBetween(from, to).length > 24) return json(400, { error: 'el periodo máximo es de 24 meses' });
    const arrivals = data.reservations.map((r) => r.check_in).filter(Boolean).sort();
    return json(200, {
      ...buildReport({
        reservations: data.reservations, rooms: store.rooms(), fromMonth: from, toMonth: to, today,
        timezone: TIMEZONE, blockingStatuses: BLOCKING, importedPrefixes: ['IMP-'],
      }),
      data_from: arrivals[0]?.slice(0, 7) ?? null,
      generated_at: new Date().toISOString(),
    });
  }

  return json(404, { error: 'no encontrado' });
}

function handleMedia(url, method, body) {
  const rooms = store.rooms();
  if (method === 'GET') {
    return json(200, {
      writable: true, persistent: true, limits: { photo: 8 * 1048576, pano: 16 * 1048576 },
      rooms: rooms.map((r) => ({ item_id: r.item_id, id: r.id, name: r.name, uploaded: library.get(r.item_id), folder: { photos: [], panoramas: [] } })),
    });
  }
  const params = method === 'POST' || method === 'DELETE' ? Object.fromEntries(url.searchParams) : JSON.parse(body || '{}');
  const media = library.get(params.room);
  const list = media && LISTS[params.kind];
  if (!list) return json(400, { error: 'Habitación o tipo no válido.' });

  if (method === 'POST') {
    media[list].push({ id: `f${nextId++}`, src: URL.createObjectURL(body), caption: params.caption ?? '' });
    return json(201, { ok: true });
  }
  if (method === 'DELETE') {
    media[list] = media[list].filter((e) => e.id !== params.id);
    return json(200, { ok: true });
  }
  if (method === 'PATCH') {
    const entry = media[list].find((e) => e.id === params.id);
    if (entry) entry.caption = String(params.caption ?? '').slice(0, 120);
    return json(200, { ok: true });
  }
  if (method === 'PUT') {
    media[list] = params.ids.map((id) => media[list].find((e) => e.id === id)).filter(Boolean);
    return json(200, { ok: true });
  }
  return json(405, { error: 'método no permitido' });
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  const at = url.pathname.indexOf('/api/');
  if (url.origin !== location.origin || at < 0) return realFetch(input, init);
  const method = (init.method || 'GET').toUpperCase();
  const body = typeof init.body === 'string' ? init.body : init.body ?? null;
  try {
    return await handle(url.pathname.slice(at), url, method, body);
  } catch (err) {
    console.error('[demo]', err);
    return json(500, { error: 'error interno de la demo' });
  }
};
