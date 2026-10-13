// Utilidades compartidas. Las fechas viajan como texto YYYY-MM-DD para no pelear con zonas horarias.

export const $ = (sel) => document.querySelector(sel);

const pad = (n) => String(n).padStart(2, '0');
export const toIso = (y, m, d) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};
export const parts = (iso) => iso.split('-').map(Number);
export const monthStart = (iso) => `${iso.slice(0, 7)}-01`;
export const addMonths = (iso, n) => { const [y, m] = parts(iso); return toIso(y, m + n, 1); };
export const addDays = (iso, n) => { const [y, m, d] = parts(iso); return toIso(y, m, d + n); };
export const asDate = (iso) => { const [y, m, d] = parts(iso); return new Date(y, m - 1, d); };
export const localToday = () => { const d = new Date(); return toIso(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const timeFmt = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' });

export function money(amount, currency) {
  if (amount == null) return '';
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: currency || 'MXN', maximumFractionDigits: 0 }).format(amount);
  } catch {
    return String(amount);
  }
}

export const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* sin almacenamiento */ } },
};

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new HttpError(res.status, body?.error || `Error ${res.status}`);
  return body;
}

// Crea un elemento con clase y texto (siempre como texto, nunca HTML).
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
