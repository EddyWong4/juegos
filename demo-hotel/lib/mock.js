import { addDays, todayIn } from './dates.js';
import { slugify } from './store.js';

// Datos inventados con la misma forma que R2 Connect, para desarrollar sin llave.
const ROOMS = [
  { name: 'Habitación Estándar', price: 1450, units: 1 },
  { name: 'Habitación Doble', price: 1850, units: 1 },
  { name: 'Suite Vista al Mar', price: 2900, units: 1 },
  { name: 'Bungalow Jardín', price: 2300, units: 2 },
  { name: 'Cabaña Familiar', price: 3400, units: 1 },
  { name: 'Habitación Ocean View', price: 2100, units: 3 },
];

// Generador pseudoaleatorio con semilla, para que los datos no cambien en cada arranque.
function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function mockData(timeZone) {
  const rand = rng(20260928);
  const today = todayIn(timeZone);
  const items = ROOMS.map((room, i) => ({
    id: `mock-item-${i + 1}`,
    slug: slugify(room.name),
    name: room.name,
    description: null,
    sku: null,
    category_id: 'mock-cat-lodging',
    category_name: 'Hospedaje',
    product_type: 'lodging',
    base_price: room.price,
    currency: 'MXN',
    status: 'active',
  }));

  const NAMES = ['Ana López', 'Carlos Ruiz', 'María Fernández', 'Jorge Castillo', 'Lucía Romero', 'Diego Herrera',
    'Sofía Medina', 'Andrés Navarro', 'Valeria Ortiz', 'Miguel Torres', 'Paola Jiménez', 'Ricardo Vargas'];
  const CHANNELS = ['phone', 'phone', 'phone', 'airbnb', 'booking_com', 'booking_engine', 'whatsapp'];
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const reservations = [];
  let n = 1000;
  for (const room of ROOMS) {
    for (let unit = 0; unit < room.units; unit++) {
      let day = -15 + Math.floor(rand() * 5);
      while (day < 200) {
        day += Math.floor(rand() * 7); // hueco libre
        const nights = 1 + Math.floor(rand() * 5);
        const roll = rand();
        const status = roll < 0.8 ? 'confirmed' : roll < 0.9 ? 'pending' : 'cancelled';
        const checkIn = addDays(today, day);
        const checkOut = addDays(today, day + nights);
        n += 1;
        const total = room.price * nights;
        const paid = [0, total / 2, total][Math.floor(rand() * 3)];
        // Las estancias que ya empezaron (o terminaron) traen la hora real de llegada/salida.
        const checkedIn = day < 0 || (day === 0 && rand() < 0.5) ? `${checkIn}T21:15:00.000Z` : null;
        const checkedOut = day + nights < 0 ? `${checkOut}T18:05:00.000Z` : null;
        const leadDays = [1, 4, 12, 25, 45, 90, 150][Math.floor(rand() * 7)];
        reservations.push({
          id: `mock-order-${n}`,
          created_at: `${addDays(checkIn, -leadDays)}T17:00:00.000Z`,
          tax_total: 0,
          order_number: `H-${n}`,
          type: 'booking',
          status: status === 'confirmed' && checkedOut ? 'completed' : status === 'confirmed' && checkedIn ? 'in-progress' : status,
          channel: pick(CHANNELS),
          guest_name: pick(NAMES),
          check_in: checkIn,
          check_out: checkOut,
          guests: { adults: 1 + Math.floor(rand() * 3), children: Math.floor(rand() * 3) },
          currency: 'MXN',
          total,
          paid,
          balance: total - paid,
          lines: [{
            id: `mock-line-${n}`, item_name: room.name, quantity: nights, unit_price: room.price,
            check_in: checkIn, check_out: checkOut, checked_in_at: checkedIn, checked_out_at: checkedOut,
          }],
        });
        day += nights;
      }
    }
  }

  // Un duplicado a propósito (misma habitación y fechas por otro canal) para ver las alertas.
  const original = reservations.find((r) => r.lines[0].item_name === 'Suite Vista al Mar' && r.status === 'confirmed' && r.check_in > addDays(today, 5));
  if (original) {
    reservations.push({ ...original, id: 'mock-order-dup', order_number: 'HMDUPLICADO', channel: 'airbnb', lines: original.lines.map((l) => ({ ...l, id: 'mock-line-dup' })) });
  }

  const units = Object.fromEntries(ROOMS.map((r) => [r.name, r.units]));
  return { items, reservations, units };
}
