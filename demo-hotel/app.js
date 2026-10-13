import { $, HttpError, fetchJson, localToday, timeFmt } from './util.js';
import { createCalendar } from './calendar.js';
import { createDayView } from './day.js';
import { createAdminView } from './admin.js';

// Las pantallas abiertas se recargan solas: el servidor consulta R2 cada minuto.
const REFRESH_MS = 60_000;

const params = new URLSearchParams(location.search);
const embed = params.get('embed') === '1';
if (embed) document.body.classList.add('embed');

let config = null;
let lastSync = null;

const calendar = createCalendar({ params, onData: (data) => setSync(data.last_sync) });
const dayView = createDayView({
  onData: (data) => setSync(data.last_sync),
  onNavigate: (date) => { location.hash = `#/hoy/${date}`; },
});
const adminView = createAdminView({ onData: () => {}, onReload: () => route() });

// ── Rutas: #/hoy[/YYYY-MM-DD] (personal), #/admin (administración), #/calendario (público)
// e #/inicio (elegir perfil) ──

function parseRoute(staff) {
  const [, view, arg] = location.hash.split('/');
  if (view === 'calendario') return { view: 'calendar' };
  if (view === 'hoy') return { view: 'day', date: /^\d{4}-\d{2}-\d{2}$/.test(arg ?? '') ? arg : null };
  if (view === 'inicio') return { view: 'choose' };
  if (view === 'admin') return { view: 'admin' };
  // Sin ruta: por defecto se entra como cliente (calendario). El personal con sesión
  // iniciada va directo a llegadas y salidas; sin sesión entra con "Personal".
  if (embed || params.has('room') || !staff) return { view: 'calendar' };
  return { view: 'day', date: null };
}

function showView(name) {
  for (const v of ['day', 'calendar', 'login', 'choose', 'admin']) $(`#view-${v}`).hidden = v !== name;
  $('#staff-link').hidden = name !== 'calendar' || Boolean(config?.staff) || embed;
  for (const tab of document.querySelectorAll('.tab')) {
    if (tab.dataset.view === name) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
}

function applyConfig() {
  document.title = `${config.staff ? 'Recepción' : 'Habitaciones'} · ${config.hotel_name}`;
  $('#hotel-name').textContent = config.hotel_name;
  $('#hotel-sub').textContent = config.staff ? 'Recepción' : 'Estancias';
  $('#mock-banner').hidden = config.mode !== 'mock';
  $('#tabs').hidden = !config.staff || embed;
  $('#logout').hidden = !config.staff;
  $('#staff-access').hidden = config.staff || embed;
  $('#tab-admin').hidden = config.role !== 'admin';
}

let routing = 0;
async function route() {
  const ticket = ++routing;
  hideError();
  try {
    config = await fetchJson('api/config');
    if (ticket !== routing) return;
    applyConfig();
    const r = parseRoute(config.staff);
    if (r.view === 'choose') {
      showView('choose');
    } else if (r.view === 'calendar') {
      showView('calendar');
      await calendar.load(config);
    } else if (r.view === 'admin' && config.role !== 'admin') {
      showLogin('Esta sección requiere la contraseña de administración.');
    } else if (!config.staff) {
      showLogin('Ingresa la contraseña para ver llegadas y salidas.');
    } else if (r.view === 'admin') {
      showView('admin');
      await adminView.load(config);
    } else {
      showView('day');
      await dayView.load(r.date || config.today || localToday());
    }
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) {
      if (config) { config.staff = false; config.role = null; applyConfig(); }
      showLogin('Tu sesión terminó. Vuelve a ingresar la contraseña.');
      return;
    }
    if (err instanceof HttpError && err.status === 403) {
      showLogin(err.message);
      return;
    }
    console.error(err);
    showError(navigator.onLine
      ? 'No se pudo cargar la información. Intenta de nuevo en un momento.'
      : 'Sin conexión. Conéctate para ver la información.');
  }
}

function showLogin(hint) {
  $('#login-hint').textContent = hint;
  showView('login');
  $('#password').focus();
}

// ── Estado de sincronización ──

function setSync(value) {
  lastSync = value ?? lastSync;
  renderStatus();
}

function renderStatus() {
  const status = $('#status');
  const sync = lastSync ? timeFmt.format(new Date(lastSync)) : null;
  status.classList.toggle('offline', !navigator.onLine);
  status.textContent = !navigator.onLine
    ? (sync ? `Sin conexión · datos de las ${sync}` : 'Sin conexión')
    : (sync ? `Actualizado ${sync}` : '');
}

// ── Acceso del personal ──

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = $('#login-btn');
  const error = $('#login-error');
  error.hidden = true;
  button.disabled = true;
  try {
    await fetchJson('api/staff/login', { method: 'POST', body: JSON.stringify({ password: $('#password').value }) });
    $('#password').value = '';
    // Se queda en la sección que pidió acceso (llegadas o administración).
    if (location.hash.startsWith('#/hoy') || location.hash.startsWith('#/admin')) await route();
    else location.hash = '#/hoy';
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
});

$('#logout').addEventListener('click', async () => {
  await fetchJson('api/staff/logout', { method: 'POST' }).catch(() => {});
  // Al salir se vuelve a la vista de cliente.
  if (location.hash.startsWith('#/calendario')) await route();
  else location.hash = '#/calendario';
});

// ── Elegir perfil (celular) ──

for (const btn of document.querySelectorAll('[data-profile]')) {
  btn.addEventListener('click', () => {
    location.hash = btn.dataset.profile === 'cliente' ? '#/calendario' : '#/hoy';
  });
}

// ── Errores ──

function showError(text) {
  $('#error-text').textContent = text;
  $('#error').hidden = false;
}
function hideError() {
  $('#error').hidden = true;
}

// ── Eventos ──

$('#retry').addEventListener('click', route);
addEventListener('hashchange', route);
addEventListener('online', () => { renderStatus(); route(); });
addEventListener('offline', renderStatus);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && config) route();
});
setInterval(() => {
  // Llegadas/salidas y calendario (Administración se actualiza con su botón).
  if (document.visibilityState === 'visible' && (!$('#view-day').hidden || !$('#view-calendar').hidden)) route();
}, REFRESH_MS);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker:', err));
}

route();
