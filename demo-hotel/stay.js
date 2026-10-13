// Estancia elegida en el calendario: fechas de llegada/salida, noches y total estimado.
// Las fechas son texto YYYY-MM-DD. La noche del día de salida no se usa, así que ese día
// puede estar ocupado.

const toUtc = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const nextDay = (iso) => new Date(toUtc(iso) + 86_400_000).toISOString().slice(0, 10);

export function nightsBetween(checkIn, checkOut) {
  return Math.round((toUtc(checkOut) - toUtc(checkIn)) / 86_400_000);
}

// Primera noche del rango que no se puede reservar, o null si todas están libres.
export function firstBlockedNight(checkIn, checkOut, canSleep) {
  for (let d = checkIn; d < checkOut; d = nextDay(d)) {
    if (!canSleep(d)) return d;
  }
  return null;
}

// Aplica un toque en el calendario a la selección actual.
// Devuelve { selection, error } donde error es la fecha de la noche ocupada, si la hay.
export function pickDate(selection, date, canSleep) {
  const { checkIn, checkOut } = selection;
  // Sin llegada, con rango completo, o tocando antes de la llegada: empieza de nuevo.
  if (!checkIn || checkOut || date <= checkIn) {
    if (!canSleep(date)) return { selection, error: { type: 'arrival', date } };
    return { selection: { checkIn: date, checkOut: null }, error: null };
  }
  const blocked = firstBlockedNight(checkIn, date, canSleep);
  if (blocked) return { selection, error: { type: 'range', date: blocked } };
  return { selection: { checkIn, checkOut: date }, error: null };
}

// Precio de una noche: el base de R2 más el extra de fin de semana (por defecto, las noches
// de viernes y sábado). `pricing` = { weekend_nights: [5, 6], weekend_extra: 500 }.
export function nightPrice(basePrice, date, pricing) {
  if (basePrice == null) return null;
  const weekday = new Date(toUtc(date)).getUTCDay();
  const weekend = pricing?.weekend_extra && (pricing.weekend_nights ?? []).includes(weekday);
  return basePrice + (weekend ? pricing.weekend_extra : 0);
}

// Total estimado sumando noche por noche. `price` es un número fijo o una función fecha → precio.
// Devuelve también el precio más bajo y más alto de las noches (para "Precio por noche").
export function estimate(checkIn, checkOut, price) {
  const nights = nightsBetween(checkIn, checkOut);
  const priceFor = typeof price === 'function' ? price : () => price;
  const prices = [];
  for (let d = checkIn; d < checkOut; d = nextDay(d)) prices.push(priceFor(d));
  if (!prices.length || prices.some((p) => p == null)) return { nights, total: null, min: null, max: null };
  return {
    nights,
    total: prices.reduce((sum, p) => sum + p, 0),
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
}
