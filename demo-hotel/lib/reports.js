import { addDays, toHotelDate } from './dates.js';
import { TAX_LINE_RE } from './store.js';

const CANCELLED = new Set(['cancelled', 'refunded']);
const LEAD_BUCKETS = [
  { label: '0–2 días', max: 2 },
  { label: '3–7 días', max: 7 },
  { label: '8–30 días', max: 30 },
  { label: '31–90 días', max: 90 },
  { label: 'Más de 90 días', max: Infinity },
];

const norm = (s) => String(s ?? '').trim().toLowerCase();
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const round2 = (n) => Math.round(n * 100) / 100;
const median = (list) => {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

export function monthsBetween(fromMonth, toMonth) {
  const out = [];
  for (let m = `${fromMonth}-01`; m.slice(0, 7) <= toMonth; m = addMonth(m)) out.push(m.slice(0, 7));
  return out;
}
const addMonth = (iso) => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
};
const daysInMonth = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

// Ingreso de la reserva sin impuestos. Los impuestos son el mayor entre tax_total y las líneas
// de impuesto: en las OTAs el IVA llega como línea y tax_total viene en 0.
export function reservationRevenue(r) {
  const taxLines = (r.lines ?? []).filter((l) => TAX_LINE_RE.test(l.item_name ?? '')).reduce((s, l) => s + (l.line_total ?? 0), 0);
  const taxes = Math.max(r.tax_total ?? 0, taxLines);
  return Math.max(0, (r.total ?? 0) - taxes);
}

// Prepara una reserva: sus líneas de habitación con fechas locales y la parte del ingreso de cada una.
// `roomKeys` relaciona cada nombre (actual o anterior) con la clave de la habitación actual.
function prepare(r, roomKeys, timezone, importedPrefixes) {
  const lines = (r.lines ?? [])
    .filter((l) => roomKeys.has(norm(l.item_name)))
    .map((l) => ({
      room: roomKeys.get(norm(l.item_name)),
      ci: toHotelDate(l.check_in ?? r.check_in, timezone),
      co: toHotelDate(l.check_out ?? r.check_out, timezone),
      weight: l.line_total ?? 0,
    }))
    .filter((l) => l.ci && l.co && l.co > l.ci);
  for (const l of lines) l.nights = daysBetween(l.ci, l.co);

  const revenue = reservationRevenue(r);
  const totalWeight = lines.reduce((s, l) => s + l.weight, 0);
  const totalNights = lines.reduce((s, l) => s + l.nights, 0);
  // El ingreso se reparte por el precio de cada línea (o por noches si no trae precio).
  for (const l of lines) {
    l.revenue = totalWeight > 0 ? revenue * (l.weight / totalWeight) : totalNights ? revenue * (l.nights / totalNights) : 0;
  }

  const arrival = lines.length ? lines.map((l) => l.ci).sort()[0] : toHotelDate(r.check_in, timezone);
  const departure = lines.length ? lines.map((l) => l.co).sort().at(-1) : toHotelDate(r.check_out, timezone);
  const created = toHotelDate(r.created_at, timezone);
  // Las reservas importadas a R2 traen como fecha de creación la de la importación, no la de
  // cuando el huésped reservó: no sirven para medir anticipación. Tampoco las creadas después de llegar.
  const imported = importedPrefixes.some((prefix) => String(r.order_number ?? '').startsWith(prefix));
  const leadKnown = !imported && created && arrival && created <= arrival;
  return {
    r,
    lines,
    revenue,
    arrival,
    stay: arrival && departure ? daysBetween(arrival, departure) : null,
    lead: leadKnown ? daysBetween(created, arrival) : null,
  };
}

// Reporte del periodo [fromMonth, toMonth] (meses YYYY-MM, inclusivos).
// - Ocupación e ingresos por noche dormida dentro del periodo.
// - Canales, cancelaciones y patrones por reservas con llegada dentro del periodo.
export function buildReport({ reservations, rooms, fromMonth, toMonth, today, timezone, blockingStatuses, importedPrefixes = [] }) {
  const blocking = new Set(blockingStatuses);
  const roomKeys = new Map(rooms.flatMap((r) => [norm(r.name), ...(r.aliases ?? [])].map((name) => [name, norm(r.name)])));
  const roomByKey = new Map(rooms.map((r) => [norm(r.name), r]));
  const months = monthsBetween(fromMonth, toMonth);
  const start = `${fromMonth}-01`;
  const end = addMonth(`${toMonth}-01`);
  const unitsTotal = rooms.reduce((s, r) => s + r.units, 0);

  const byMonth = new Map(months.map((m) => [m, { month: m, nights: 0, available: unitsTotal * daysInMonth(m), revenue: 0, arrivals: 0 }]));
  const byRoom = new Map(rooms.map((r) => [norm(r.name), { name: r.name, nights: 0, available: 0, revenue: 0 }]));
  for (const room of byRoom.values()) {
    const units = roomByKey.get(norm(room.name)).units;
    room.available = months.reduce((s, m) => s + units * daysInMonth(m), 0);
  }
  const byChannel = new Map();
  const channel = (name) => {
    const key = name || 'sin canal';
    if (!byChannel.has(key)) byChannel.set(key, { channel: key, reservations: 0, nights: 0, revenue: 0, leads: [], stays: [], cancelled: 0, cancelled_value: 0 });
    return byChannel.get(key);
  };

  const leads = [];
  const stays = [];
  let cancelled = 0;
  let cancelledValue = 0;
  let noShows = 0;
  let arrivalsActive = 0;

  const prepared = reservations.map((r) => prepare(r, roomKeys, timezone, importedPrefixes));
  let leadExcluded = 0;

  for (const p of prepared) {
    const { r } = p;
    const arrivesInPeriod = p.arrival && p.arrival >= start && p.arrival < end;

    if (arrivesInPeriod && CANCELLED.has(r.status)) {
      cancelled += 1;
      cancelledValue += p.revenue;
      const c = channel(r.channel);
      c.cancelled += 1;
      c.cancelled_value += p.revenue;
      continue;
    }
    if (arrivesInPeriod && r.status === 'noshow') noShows += 1;
    if (!blocking.has(r.status)) continue;

    // Noches dormidas dentro del periodo.
    for (const l of p.lines) {
      const perNight = l.revenue / l.nights;
      for (let d = l.ci > start ? l.ci : start; d < l.co && d < end; d = addDays(d, 1)) {
        const m = byMonth.get(d.slice(0, 7));
        const room = byRoom.get(l.room);
        m.nights += 1;
        m.revenue += perNight;
        room.nights += 1;
        room.revenue += perNight;
      }
    }

    if (!arrivesInPeriod || !p.lines.length) continue;
    arrivalsActive += 1;
    byMonth.get(p.arrival.slice(0, 7)).arrivals += 1;
    const c = channel(r.channel);
    c.reservations += 1;
    c.nights += p.lines.reduce((s, l) => s + l.nights, 0);
    c.revenue += p.revenue;
    if (p.lead != null) { c.leads.push(p.lead); leads.push(p.lead); } else leadExcluded += 1;
    if (p.stay != null) { c.stays.push(p.stay); stays.push(p.stay); }
  }

  const totals = [...byMonth.values()].reduce((t, m) => ({
    nights: t.nights + m.nights,
    available: t.available + m.available,
    revenue: t.revenue + m.revenue,
  }), { nights: 0, available: 0, revenue: 0 });

  const rate = (nights, available) => (available ? round2((nights / available) * 100) : null);
  const adr = (revenue, nights) => (nights ? round2(revenue / nights) : null);

  return {
    from: fromMonth,
    to: toMonth,
    today,
    summary: {
      occupancy: rate(totals.nights, totals.available),
      nights: totals.nights,
      available: totals.available,
      revenue: round2(totals.revenue),
      adr: adr(totals.revenue, totals.nights),
      reservations: arrivalsActive,
      cancelled,
      cancellation_rate: arrivalsActive + cancelled ? round2((cancelled / (arrivalsActive + cancelled)) * 100) : null,
      cancelled_value: round2(cancelledValue),
      no_shows: noShows,
    },
    months: [...byMonth.values()].map((m) => ({
      ...m,
      revenue: round2(m.revenue),
      occupancy: rate(m.nights, m.available),
      adr: adr(m.revenue, m.nights),
      future: m.month > today.slice(0, 7),
    })),
    rooms: [...byRoom.values()].map((r) => ({ ...r, revenue: round2(r.revenue), occupancy: rate(r.nights, r.available), adr: adr(r.revenue, r.nights) }))
      .sort((a, b) => b.revenue - a.revenue),
    channels: [...byChannel.values()].map(({ leads: l, stays: s, ...c }) => ({
      ...c,
      revenue: round2(c.revenue),
      cancelled_value: round2(c.cancelled_value),
      share: arrivalsActive ? round2((c.reservations / arrivalsActive) * 100) : 0,
      adr: adr(c.revenue, c.nights),
      avg_lead: avg(l) == null ? null : round2(avg(l)),
      avg_stay: avg(s) == null ? null : round2(avg(s)),
      cancellation_rate: c.reservations + c.cancelled ? round2((c.cancelled / (c.reservations + c.cancelled)) * 100) : null,
    })).sort((a, b) => b.reservations - a.reservations || b.cancelled - a.cancelled),
    patterns: {
      avg_lead: avg(leads) == null ? null : round2(avg(leads)),
      median_lead: median(leads),
      lead_counted: leads.length,
      lead_excluded: leadExcluded,
      avg_stay: avg(stays) == null ? null : round2(avg(stays)),
      median_stay: median(stays),
      lead_buckets: LEAD_BUCKETS.map((b, i) => ({
        label: b.label,
        count: leads.filter((d) => d <= b.max && (i === 0 || d > LEAD_BUCKETS[i - 1].max)).length,
      })),
    },
    alerts: {
      ...buildAlerts(prepared, { today, blocking, roomByKey }),
      renames: rooms.filter((r) => r.renamed_from?.length).map((r) => ({ room: r.name, from: r.renamed_from })),
    },
  };
}

// Cosas para revisar en R2, sin importar el periodo elegido.
function buildAlerts(prepared, { today, blocking, roomByKey }) {
  const soon = addDays(today, 7);
  const brief = (p) => ({
    order_number: p.r.order_number,
    guest_name: p.r.guest_name ?? null,
    channel: p.r.channel ?? null,
    status: p.r.status,
    check_in: p.arrival,
    created_at: p.r.created_at ?? null,
    rooms: [...new Set(p.lines.map((l) => roomByKey.get(l.room)?.name ?? l.room))],
  });

  const pending = prepared
    .filter((p) => ['pending', 'placed'].includes(p.r.status) && p.arrival && p.arrival >= today && p.arrival <= soon)
    .sort((a, b) => a.arrival.localeCompare(b.arrival))
    .map(brief);

  // Reservas activas de la misma habitación con noches encimadas (desde hoy).
  const overlaps = [];
  const perRoom = new Map();
  for (const p of prepared) {
    if (!blocking.has(p.r.status)) continue;
    for (const l of p.lines) {
      if (l.co <= today) continue;
      if (!perRoom.has(l.room)) perRoom.set(l.room, []);
      perRoom.get(l.room).push({ p, l });
    }
  }
  for (const [room, list] of perRoom) {
    const units = roomByKey.get(room)?.units ?? 1;
    if (units > 1) continue; // con varios cuartos iguales, encimarse es normal
    list.sort((a, b) => a.l.ci.localeCompare(b.l.ci));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length && list[j].l.ci < list[i].l.co; j++) {
        const a = list[i];
        const b = list[j];
        if (a.p.r.order_number === b.p.r.order_number) continue;
        overlaps.push({
          room: roomByKey.get(room)?.name ?? room,
          from: b.l.ci > a.l.ci ? b.l.ci : a.l.ci,
          to: b.l.co < a.l.co ? b.l.co : a.l.co,
          same_dates: a.l.ci === b.l.ci && a.l.co === b.l.co,
          reservations: [brief(a.p), brief(b.p)],
        });
      }
    }
  }
  overlaps.sort((a, b) => a.from.localeCompare(b.from));
  return { pending, overlaps };
}
