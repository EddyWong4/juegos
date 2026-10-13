const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MIDNIGHT_UTC = /^(\d{4}-\d{2}-\d{2})T00:00(:00(\.0+)?)?(Z|\+00:00)$/;

// Convierte lo que mande R2 (fecha sola, ISO con hora o epoch) a "YYYY-MM-DD" en la zona del hotel.
export function toHotelDate(value, timeZone) {
  if (value === null || value === undefined || value === '') return null;
  const str = String(value);
  if (DATE_ONLY.test(str)) return str;
  // Una fecha guardada como medianoche UTC suele ser "solo fecha": no la movemos de día.
  const midnight = str.match(MIDNIGHT_UTC);
  if (midnight) return midnight[1];

  const date = /^\d+$/.test(str) ? new Date(Number(str)) : new Date(str);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function todayIn(timeZone) {
  return toHotelDate(new Date().toISOString(), timeZone);
}

export function isIsoDate(value) {
  return typeof value === 'string' && DATE_ONLY.test(value) && !Number.isNaN(Date.parse(value));
}
