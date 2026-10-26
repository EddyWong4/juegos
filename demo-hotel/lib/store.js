import fs from './shim-fs.js';
import path from './shim-path.js';
import { addDays, toHotelDate } from './dates.js';

// Tipos de artículo que consideramos hospedaje aunque todavía no tengan reservas.
const LODGING_RE = /lodg|room|hosped|habitac|aloj|accommod/i;

// Líneas de impuesto que mandan las OTAs como si fueran productos ("VAT on Accommodation (Mexico)").
export const TAX_LINE_RE = /\b(vat|iva|tax|impuesto|ish)\b/i;

// Cargo de desayuno (en R2 es el artículo "Desayuno Incluido", tipo other, sin fechas propias).
export const BREAKFAST_RE = /desayuno|breakfast/i;

const norm = (s) => String(s ?? '').trim().toLowerCase();

// Palabras significativas de un nombre, para comparar "Estancia frente al Mar" con
// "Mini Depto. Frente al Mar".
const STOPWORDS = new Set(['del', 'las', 'los', 'con', 'para', 'the']);
const tokens = (name) => new Set(slugify(name).split('-').filter((t) => t.length > 2 && !STOPWORDS.has(t)));
function similarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  const shared = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union ? shared / union : 0;
}

export function slugify(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Guardamos solo lo que usan el calendario y la pantalla de llegadas/salidas.
// Los datos del huésped y los montos nunca salen por los endpoints públicos.
function slimReservation(r) {
  return {
    order_number: r.order_number,
    status: r.status,
    channel: r.channel ?? null,
    guest_name: r.guest_name ?? null,
    guests: r.guests ?? null,
    check_in: r.check_in ?? null,
    check_out: r.check_out ?? null,
    currency: r.currency ?? null,
    total: r.total ?? null,
    paid: r.paid ?? null,
    balance: r.balance ?? null,
    updated_at: r.updated_at ?? null,
    lines: (r.lines ?? []).map(({ item_name, quantity, check_in, check_out, checked_in_at, checked_out_at }) => (
      { item_name, quantity: quantity ?? null, check_in, check_out, checked_in_at: checked_in_at ?? null, checked_out_at: checked_out_at ?? null }
    )),
  };
}

const nightsBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

// Guarda catálogo y reservas en memoria y en data/cache.json, y calcula la ocupación por noche.
export class Store {
  constructor(config) {
    this.config = config;
    this.file = path.join(config.dataDir, 'cache.json');
    this.items = [];
    this.reservations = new Map();
    this.lastSync = null;
    this.unitDefaults = {};
    // Nombres anteriores de cada habitación, por id del catálogo: las reservas guardan el
    // nombre que tenía la habitación al reservar, y R2 no da el id en las líneas.
    this.nameHistory = {};
  }

  load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.items = data.items ?? [];
      this.reservations = new Map((data.reservations ?? []).map((r) => [r.order_number, r]));
      this.lastSync = data.lastSync ?? null;
      this.nameHistory = data.nameHistory ?? {};
    } catch {
      // Sin caché previa: se llenará en la primera sincronización.
    }
  }

  save() {
    fs.mkdirSync(this.config.dataDir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({
      lastSync: this.lastSync,
      nameHistory: this.nameHistory,
      items: this.items,
      reservations: [...this.reservations.values()],
    }));
    fs.renameSync(tmp, this.file);
  }

  setItems(items) {
    const previous = new Map(this.items.filter((i) => i.id).map((i) => [i.id, i]));
    this.items = items.map(({ id, name, slug, description, product_type, category_name, base_price, currency }) => (
      { id, name, slug, description, product_type, category_name, base_price, currency }
    ));
    // Si una habitación cambió de nombre, recordamos el anterior.
    for (const item of this.items) {
      const before = previous.get(item.id);
      if (!before || norm(before.name) === norm(item.name)) continue;
      const history = (this.nameHistory[item.id] ??= []);
      if (!history.some((h) => norm(h.name) === norm(before.name))) history.push({ name: before.name, slug: before.slug ?? null });
      console.log(`[catálogo] "${before.name}" ahora se llama "${item.name}"`);
    }
  }

  replaceReservations(list) {
    this.reservations = new Map(list.map((r) => [r.order_number, slimReservation(r)]));
  }

  upsertReservation(reservation) {
    if (!reservation?.order_number) return;
    const prev = this.reservations.get(reservation.order_number);
    const next = slimReservation(reservation);
    // Un webhook sin líneas no debe borrar las líneas que ya teníamos.
    if (!reservation.lines && prev) next.lines = prev.lines;
    this.reservations.set(reservation.order_number, { ...prev, ...next });
  }

  // Quita estancias que terminaron antes de `before`: el calendario no las muestra.
  pruneBefore(before) {
    const { timezone } = this.config;
    for (const [key, r] of this.reservations) {
      const ends = [r.check_out, ...r.lines.map((l) => l.check_out)].map((d) => toHotelDate(d, timezone)).filter(Boolean);
      if (ends.length && ends.every((d) => d < before)) this.reservations.delete(key);
    }
  }

  roomsConfig() {
    try {
      return JSON.parse(fs.readFileSync(this.config.roomsConfigFile, 'utf8'));
    } catch {
      return {};
    }
  }

  // Regla de precios por noche (R2 solo da el precio base): extra en noches de fin de semana.
  pricing() {
    const p = this.roomsConfig().pricing ?? {};
    const nights = Array.isArray(p.weekend_nights) ? p.weekend_nights.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : [];
    const extra = Number(p.weekend_extra) || 0;
    return { weekend_nights: nights, weekend_extra: extra };
  }

  // Habitaciones = artículos del catálogo con product_type de hospedaje (R2 usa "room").
  // Solo si el catálogo no trae ninguno se deducen de las líneas con fechas de estancia;
  // así no se cuelan líneas con fechas que no son cuartos, como el IVA que mandan las OTAs.
  rooms() {
    const cfg = this.roomsConfig();
    const isLodging = (item) => LODGING_RE.test(item.product_type ?? '');
    const catalogHasRooms = this.items.some(isLodging);

    const datedNames = new Map();
    if (!catalogHasRooms) {
      for (const r of this.reservations.values()) {
        for (const line of r.lines ?? []) {
          if ((line.check_in || line.check_out) && line.item_name) datedNames.set(norm(line.item_name), line.item_name);
        }
      }
    }

    const byName = new Map();
    for (const item of this.items) {
      const key = norm(item.name);
      const looksLikeRoom = isLodging(item) || datedNames.has(key);
      if (!looksLikeRoom || byName.has(key)) continue;
      byName.set(key, {
        id: item.slug || slugify(item.name),
        item_id: item.id ?? null,
        name: item.name,
        category: item.category_name ?? null,
        description: item.description ?? null,
        price: item.base_price ?? null,
        currency: item.currency ?? null,
      });
    }
    for (const [key, name] of datedNames) {
      if (!byName.has(key)) byName.set(key, { id: slugify(name), name, description: null, price: null, currency: null });
    }

    const include = (cfg.include ?? []).map(norm);
    const exclude = new Set((cfg.exclude ?? []).map(norm));
    const units = Object.fromEntries(Object.entries({ ...this.unitDefaults, ...cfg.units }).map(([k, v]) => [norm(k), v]));
    const order = (cfg.order ?? []).map(norm);

    let rooms = [...byName.entries()]
      .filter(([key]) => (include.length ? include.includes(key) : true) && !exclude.has(key))
      .map(([key, room]) => ({ ...room, key, units: Math.max(1, Number(units[key]) || 1) }));

    const rank = (key) => (order.includes(key) ? order.indexOf(key) : order.length);
    rooms.sort((a, b) => rank(a.key) - rank(b.key) || a.name.localeCompare(b.name, 'es'));
    this.addAliases(rooms, cfg, catalogHasRooms);
    return rooms;
  }

  // Nombres anteriores de cada habitación (aliases), de tres fuentes:
  //  1. "manual": rooms.config.json → aliases { "Nombre anterior": "Nombre actual" }.
  //  2. "historial": cambios de nombre vistos entre sincronizaciones (mismo id de catálogo).
  //  3. "automático": nombres en reservas que ya no existen en el catálogo se relacionan con
  //     una habitación que no tiene reservas con su nombre actual, si el parecido es claro.
  addAliases(rooms, cfg, catalogHasRooms) {
    const byKey = new Map(rooms.map((r) => [r.key, r]));
    const owner = new Map(rooms.map((r) => [r.key, r]));
    for (const r of rooms) Object.assign(r, { aliases: [], alias_ids: [], renamed_from: [] });
    const add = (room, name, slug, how) => {
      const key = norm(name);
      if (!room || owner.has(key)) return;
      owner.set(key, room);
      room.aliases.push(key);
      room.alias_ids.push(slug || slugify(name));
      room.renamed_from.push({ name, how });
    };

    for (const [oldName, currentName] of Object.entries(cfg.aliases ?? {})) add(byKey.get(norm(currentName)), oldName, null, 'manual');
    for (const room of rooms) {
      for (const h of this.nameHistory[room.item_id] ?? []) add(room, h.name, h.slug, 'historial');
    }
    if (!catalogHasRooms) return;

    const matched = new Map();
    const orphans = new Map();
    for (const r of this.reservations.values()) {
      for (const line of r.lines ?? []) {
        if (!line.check_in && !line.check_out) continue;
        const key = norm(line.item_name);
        if (!key) continue;
        const room = owner.get(key);
        if (room) matched.set(room.key, (matched.get(room.key) ?? 0) + 1);
        else if (!TAX_LINE_RE.test(line.item_name)) orphans.set(key, line.item_name);
      }
    }
    const candidates = rooms.filter((r) => !matched.has(r.key));
    for (const name of orphans.values()) {
      if (!candidates.length) break;
      const scored = candidates.map((room) => ({ room, score: similarity(name, room.name) })).sort((a, b) => b.score - a.score);
      const onlyChoice = orphans.size === 1 && candidates.length === 1;
      const clearWinner = scored[0].score >= 0.3 && (scored.length === 1 || scored[0].score > scored[1].score);
      if (!onlyChoice && !clearWinner) continue;
      add(scored[0].room, name, null, 'automático');
      candidates.splice(candidates.indexOf(scored[0].room), 1);
    }
  }

  // Índice nombre (actual o anterior) → habitación.
  static roomIndex(rooms) {
    const index = new Map();
    for (const room of rooms) {
      index.set(room.key, room);
      for (const alias of room.aliases ?? []) index.set(alias, room);
    }
    return index;
  }

  // Noches ocupadas por habitación en [from, to). La noche del día de salida no cuenta.
  availability(from, to) {
    const { timezone, blockingStatuses } = this.config;
    const blocking = new Set(blockingStatuses);
    const rooms = this.rooms().map((r) => ({ ...r, occupied: {} }));
    const byKey = Store.roomIndex(rooms);

    for (const r of this.reservations.values()) {
      if (!blocking.has(r.status)) continue;
      for (const line of r.lines ?? []) {
        if (!line.check_in && !line.check_out) continue;
        const room = byKey.get(norm(line.item_name));
        if (!room) continue;
        const checkIn = toHotelDate(line.check_in ?? r.check_in, timezone);
        const checkOut = toHotelDate(line.check_out ?? r.check_out, timezone);
        if (!checkIn || !checkOut || checkOut <= checkIn) continue;

        for (let d = checkIn > from ? checkIn : from; d < checkOut && d < to; d = addDays(d, 1)) {
          room.occupied[d] = (room.occupied[d] ?? 0) + 1;
        }
      }
    }

    // No exponemos nombres de huéspedes ni montos: solo conteos por noche.
    return rooms.map(({ key, item_id, aliases, renamed_from, ...room }) => room);
  }

  // Llegadas y salidas de un día (solo para el personal). Una tarjeta por reserva,
  // con las habitaciones que llegan o salen ese día.
  day(date) {
    const { timezone, blockingStatuses } = this.config;
    const blocking = new Set(blockingStatuses);
    const rooms = this.rooms();
    const index = Store.roomIndex(rooms);
    const arrivals = [];
    const departures = [];
    let occupiedTonight = 0;

    const card = (r, lines, doneField) => ({
      order_number: r.order_number,
      status: r.status,
      channel: r.channel,
      guest_name: r.guest_name,
      guests: r.guests,
      currency: r.currency,
      total: r.total,
      paid: r.paid,
      balance: r.balance,
      rooms: lines.map((l) => ({
        name: l.room.name,
        check_in: l.ci,
        check_out: l.co,
        nights: nightsBetween(l.ci, l.co),
        done_at: l[doneField],
      })),
      done: lines.every((l) => l[doneField]),
      breakfast: breakfast(r),
    });
    // Desayunos de la reserva: { quantity } (null si la línea no trae cantidad) o null si no tiene.
    const breakfast = (r) => {
      const found = (r.lines ?? []).filter((l) => BREAKFAST_RE.test(l.item_name ?? ''));
      if (!found.length) return null;
      const quantity = found.every((l) => l.quantity != null) ? found.reduce((sum, l) => sum + Number(l.quantity), 0) : null;
      return { quantity };
    };

    for (const r of this.reservations.values()) {
      if (!blocking.has(r.status)) continue;
      const lines = (r.lines ?? [])
        .filter((l) => index.has(norm(l.item_name)))
        .map((l) => ({
          ...l,
          room: index.get(norm(l.item_name)),
          ci: toHotelDate(l.check_in ?? r.check_in, timezone),
          co: toHotelDate(l.check_out ?? r.check_out, timezone),
        }))
        .filter((l) => l.ci && l.co && l.co > l.ci);

      const arriving = lines.filter((l) => l.ci === date);
      const leaving = lines.filter((l) => l.co === date);
      if (arriving.length) arrivals.push(card(r, arriving, 'checked_in_at'));
      if (leaving.length) departures.push(card(r, leaving, 'checked_out_at'));
      occupiedTonight += lines.filter((l) => l.ci <= date && date < l.co).length;
    }

    const byRoom = (a, b) => a.rooms[0].name.localeCompare(b.rooms[0].name, 'es');
    arrivals.sort(byRoom);
    departures.sort(byRoom);
    const totalUnits = rooms.reduce((sum, r) => sum + r.units, 0);
    return { date, arrivals, departures, occupied_tonight: occupiedTonight, total_rooms: totalUnits };
  }
}
