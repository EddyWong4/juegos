import { $, addDays, asDate, capitalize, el, fetchJson, localToday, money, timeFmt } from './util.js';

const longFmt = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });

const CHANNELS = {
  phone: 'Teléfono',
  whatsapp: 'WhatsApp',
  airbnb: 'Airbnb',
  booking_com: 'Booking.com',
  expedia: 'Expedia',
  booking_engine: 'Motor de reservas',
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Pantalla del personal: quién llega y quién se va en un día.
export function createDayView({ onData, onNavigate }) {
  let current = null;

  async function load(date) {
    const data = await fetchJson(`api/staff/day?date=${encodeURIComponent(date)}`);
    current = data;
    onData(data);
    render(data);
  }

  function relativeLabel(date, today) {
    if (date === today) return 'Hoy';
    if (date === addDays(today, 1)) return 'Mañana';
    if (date === addDays(today, -1)) return 'Ayer';
    return '';
  }

  function render(data) {
    const today = data.today || localToday();
    $('#day-rel').textContent = relativeLabel(data.date, today);
    $('#day-label').textContent = capitalize(longFmt.format(asDate(data.date)));
    $('#day-date').value = data.date;
    $('#day-today').disabled = data.date === today;

    const stats = [
      [data.arrivals.length, data.arrivals.length === 1 ? 'llegada' : 'llegadas'],
      [data.departures.length, data.departures.length === 1 ? 'salida' : 'salidas'],
      [`${data.occupied_tonight}/${data.total_rooms}`, 'ocupadas esa noche'],
    ];
    $('#day-stats').replaceChildren(...stats.map(([value, label]) => {
      const box = el('div', 'stat');
      box.append(el('strong', null, String(value)), el('span', null, label));
      return box;
    }));

    const note = $('#day-note');
    note.hidden = data.date >= data.history_from;
    note.textContent = 'Solo se guardan los últimos días de historial; para fechas más antiguas la lista puede estar incompleta.';

    $('#arr-count').textContent = String(data.arrivals.length);
    $('#dep-count').textContent = String(data.departures.length);
    fill($('#arrivals'), data.arrivals, 'arrival', 'Nadie llega este día.');
    fill($('#departures'), data.departures, 'departure', 'Nadie sale este día.');
  }

  function fill(container, list, kind, emptyText) {
    if (!list.length) {
      container.replaceChildren(el('p', 'empty', emptyText));
      return;
    }
    container.replaceChildren(...list.map((r) => card(r, kind)));
  }

  function card(r, kind) {
    const node = el('article', `guest-card${r.done ? ' is-done' : ''}`);

    const top = el('div', 'gc-top');
    top.append(el('h4', null, r.guest_name || 'Sin nombre'), pill(r, kind));

    const rooms = el('ul', 'gc-rooms');
    for (const room of r.rooms) {
      const li = el('li');
      li.append(
        el('strong', null, room.name),
        el('span', null, ` · ${plural(room.nights, 'noche', 'noches')} · ${shortFmt.format(asDate(room.check_in))} → ${shortFmt.format(asDate(room.check_out))}`),
      );
      rooms.append(li);
    }

    const people = [];
    if (r.guests?.adults) people.push(plural(r.guests.adults, 'adulto', 'adultos'));
    if (r.guests?.children) people.push(plural(r.guests.children, 'niño', 'niños'));
    const meta = el('p', 'gc-meta', [...people, CHANNELS[r.channel] ?? r.channel, `Folio ${r.order_number}`].filter(Boolean).join(' · '));

    node.append(top, rooms, meta, moneyLine(r));
    return node;
  }

  function pill(r, kind) {
    const doneAt = r.rooms.map((room) => room.done_at).filter(Boolean).sort().at(-1);
    if (r.done) {
      const time = doneAt ? ` ${timeFmt.format(new Date(doneAt))}` : '';
      return el('span', 'pill pill-ok', `${kind === 'arrival' ? 'Llegó' : 'Salió'}${time}`);
    }
    if (r.status === 'pending' || r.status === 'placed') return el('span', 'pill pill-warn', 'Por confirmar');
    return el('span', 'pill', kind === 'arrival' ? 'Por llegar' : 'Por salir');
  }

  function moneyLine(r) {
    if (r.balance > 0) {
      const line = el('p', 'gc-money is-due');
      line.append(el('span', null, 'Saldo pendiente'), el('strong', null, money(r.balance, r.currency)));
      return line;
    }
    const line = el('p', 'gc-money is-paid');
    line.append(el('span', null, 'Pagado'), el('strong', null, money(r.total, r.currency)));
    return line;
  }

  const go = (date) => onNavigate(date);
  $('#day-prev').addEventListener('click', () => current && go(addDays(current.date, -1)));
  $('#day-next').addEventListener('click', () => current && go(addDays(current.date, 1)));
  $('#day-today').addEventListener('click', () => current && go(current.today));
  $('#day-date').addEventListener('change', (e) => e.target.value && go(e.target.value));

  return { load };
}
