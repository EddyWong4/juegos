import { $, asDate, capitalize, el, fetchJson, money } from './util.js';
import { createMediaAdmin } from './media-admin.js';

const CHANNELS = {
  phone: 'Teléfono',
  whatsapp: 'WhatsApp',
  airbnb: 'Airbnb',
  booking_com: 'Booking.com',
  expedia: 'Expedia',
  booking_engine: 'Motor de reservas',
  'sin canal': 'Sin canal',
};
const channelName = (c) => CHANNELS[c] ?? c;

const monthShort = new Intl.DateTimeFormat('es-MX', { month: 'short' });
const monthLong = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });
const dateShort = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
const int = new Intl.NumberFormat('es-MX');
const dec1 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });

const pct = (v) => (v == null ? '—' : `${dec1.format(v)} %`);
const mxn = (v) => (v == null ? '—' : money(v, 'MXN'));
const monthLabel = (m) => capitalize(monthLong.format(asDate(`${m}-01`)));
const shortMonth = (m) => `${monthShort.format(asDate(`${m}-01`)).replace('.', '')} ${m.slice(2, 4)}`;
const shiftMonth = (m, n) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

// Pantalla de administración: ocupación, ingresos, canales, cancelaciones, patrones y alertas.
export function createAdminView({ onData, onReload }) {
  let range = null;
  let dataFrom = null;
  const mediaAdmin = createMediaAdmin();
  const tip = $('#adm-tip'); // vive dentro del contenedor de la gráfica

  async function load(config, { photos = true } = {}) {
    // Las fotos se cargan aparte para no esperar al reporte (que consulta R2).
    if (photos) mediaAdmin.load().catch((err) => { $('#media-status').textContent = err.message; });
    const current = (config.today || new Date().toISOString()).slice(0, 7);
    if (!range) range = { from: shiftMonth(current, -11), to: shiftMonth(current, 2) };
    $('#adm-from').value = range.from;
    $('#adm-to').value = range.to;
    $('#adm-status').textContent = 'Calculando…';
    const report = await fetchJson(`api/staff/report?from=${range.from}&to=${range.to}`);
    // La primera vez, si no hay datos tan atrás, empezamos en el primer mes con reservas.
    if (!dataFrom && report.data_from && report.data_from > range.from) {
      dataFrom = report.data_from;
      range.from = report.data_from;
      return load(config, { photos: false });
    }
    dataFrom ??= report.data_from;
    onData();
    render(report);
  }

  function render(report) {
    $('#adm-status').textContent = `Del ${monthLabel(report.from).toLowerCase()} al ${monthLabel(report.to).toLowerCase()}`;
    renderTiles(report.summary);
    renderMonthChart(report.months);
    renderMonthTable(report.months);
    renderRooms(report.rooms);
    renderChannels(report.channels, report.summary);
    renderPatterns(report.patterns);
    renderAlerts(report.alerts);
  }

  function tile(label, value, sub) {
    const box = el('div', 'kpi');
    box.append(el('span', 'kpi-label', label), el('strong', 'kpi-value', value));
    if (sub) box.append(el('span', 'kpi-sub', sub));
    return box;
  }

  function renderTiles(s) {
    $('#adm-kpis').replaceChildren(
      tile('Ocupación', pct(s.occupancy), `${int.format(s.nights)} de ${int.format(s.available)} noches`),
      tile('Ingresos', mxn(s.revenue), 'sin impuestos'),
      tile('Tarifa promedio', mxn(s.adr), 'por noche vendida'),
      tile('Reservas', int.format(s.reservations), 'con llegada en el periodo'),
      tile('Cancelaciones', int.format(s.cancelled), s.cancellation_rate == null ? '' : `${pct(s.cancellation_rate)} · ${mxn(s.cancelled_value)}`),
      tile('No-shows', int.format(s.no_shows), 'huésped no llegó'),
    );
  }

  // Columnas de ocupación por mes (una sola serie: sin leyenda, el título la nombra).
  function renderMonthChart(months) {
    const chart = $('#adm-chart');
    const ticks = [0, 25, 50, 75, 100];
    const plot = el('div', 'colchart');
    plot.style.setProperty('--cols', months.length);

    const axis = el('div', 'colchart-axis');
    for (const t of [...ticks].reverse()) axis.append(el('span', null, `${t} %`));
    const grid = el('div', 'colchart-grid');
    for (let i = 0; i < ticks.length; i++) grid.append(el('span'));

    const bars = el('div', 'colchart-bars');
    for (const m of months) {
      const col = el('button', `colchart-col${m.future ? ' is-future' : ''}`);
      col.type = 'button';
      const value = Math.min(100, m.occupancy ?? 0);
      const bar = el('span', 'colchart-bar');
      bar.style.height = `${value}%`;
      col.append(bar);
      const label = `${monthLabel(m.month)}: ${pct(m.occupancy)} de ocupación, ${int.format(m.nights)} noches, ${mxn(m.revenue)}${m.future ? ' (reservado hasta hoy)' : ''}`;
      col.setAttribute('aria-label', label);
      col.dataset.tip = JSON.stringify({ title: monthLabel(m.month), value: pct(m.occupancy), rows: [`${int.format(m.nights)} de ${int.format(m.available)} noches`, `${mxn(m.revenue)} · tarifa ${mxn(m.adr)}`, m.future ? 'Reservado hasta hoy' : ''] });
      bars.append(col);
    }

    const labels = el('div', 'colchart-labels');
    months.forEach((m, i) => {
      // Etiquetas selectivas: con muchos meses, una sí y una no.
      const show = months.length <= 8 || i % 2 === 0 || i === months.length - 1;
      labels.append(el('span', null, show ? shortMonth(m.month) : ''));
    });

    plot.append(axis, grid, bars, el('span'), labels);
    chart.replaceChildren(plot, tip);
    bindTooltips(bars);
  }

  function renderMonthTable(months) {
    const rows = months.map((m) => [monthLabel(m.month) + (m.future ? ' *' : ''), pct(m.occupancy), int.format(m.nights), mxn(m.revenue), mxn(m.adr), int.format(m.arrivals)]);
    $('#adm-months').replaceChildren(table(['Mes', 'Ocupación', 'Noches', 'Ingresos', 'Tarifa prom.', 'Llegadas'], rows));
  }

  function renderRooms(rooms) {
    const rows = rooms.map((r) => [r.name, meterCell(r.occupancy), int.format(r.nights), mxn(r.revenue), mxn(r.adr)]);
    $('#adm-rooms').replaceChildren(table(['Habitación', 'Ocupación', 'Noches', 'Ingresos', 'Tarifa prom.'], rows));
  }

  function renderChannels(channels, summary) {
    const rows = channels.map((c) => [
      channelName(c.channel),
      int.format(c.reservations),
      meterCell(c.share),
      mxn(c.revenue),
      mxn(c.adr),
      c.avg_lead == null ? '—' : `${dec1.format(c.avg_lead)} días`,
      c.avg_stay == null ? '—' : `${dec1.format(c.avg_stay)} noches`,
      c.cancelled ? `${int.format(c.cancelled)} (${pct(c.cancellation_rate)})` : '0',
    ]);
    $('#adm-channels').replaceChildren(table(['Canal', 'Reservas', 'Participación', 'Ingresos', 'Tarifa prom.', 'Anticipación', 'Estancia', 'Canceladas'], rows));
    $('#adm-channels-note').textContent = summary.reservations
      ? 'Participación = porcentaje de las reservas con llegada en el periodo. Con los ingresos por canal puedes estimar cuánto se va en comisiones.'
      : 'No hay reservas con llegada en este periodo.';
  }

  function renderPatterns(p) {
    $('#adm-pattern-kpis').replaceChildren(
      tile('Anticipación promedio', p.avg_lead == null ? '—' : `${dec1.format(p.avg_lead)} días`, p.median_lead == null ? '' : `la mitad reserva con ${dec1.format(p.median_lead)} días o menos`),
      tile('Estancia promedio', p.avg_stay == null ? '—' : `${dec1.format(p.avg_stay)} noches`, p.median_stay == null ? '' : `mediana: ${dec1.format(p.median_stay)} noches`),
    );
    $('#adm-leads-note').textContent = p.lead_excluded
      ? `Calculado con ${int.format(p.lead_counted)} reservas capturadas directamente en R2. No se incluyen ${int.format(p.lead_excluded)} importadas o registradas después de la llegada, porque su fecha de creación no es la de la reserva real.`
      : '';
    const total = p.lead_buckets.reduce((s, b) => s + b.count, 0);
    const max = Math.max(1, ...p.lead_buckets.map((b) => b.count));
    const list = el('div', 'hbars');
    for (const b of p.lead_buckets) {
      const row = el('div', 'hbar');
      const track = el('div', 'hbar-track');
      const fill = el('span', 'hbar-fill');
      fill.style.width = `${(b.count / max) * 100}%`;
      track.append(fill);
      row.append(el('span', 'hbar-label', b.label), track, el('span', 'hbar-value', `${int.format(b.count)} · ${total ? Math.round((b.count / total) * 100) : 0} %`));
      list.append(row);
    }
    $('#adm-leads').replaceChildren(list);
  }

  function renderAlerts(alerts) {
    const pending = $('#adm-pending');
    if (!alerts.pending.length) pending.replaceChildren(el('p', 'empty', 'No hay reservas pendientes que lleguen en los próximos 7 días.'));
    else pending.replaceChildren(...alerts.pending.map((p) => alertCard(
      `${p.guest_name ?? 'Sin nombre'} · llega ${dateShort.format(asDate(p.check_in))}`,
      `${p.rooms.join(', ')} · ${channelName(p.channel)} · Folio ${p.order_number}`,
      'Confírmala o cancélala en R2.',
    )));

    const overlaps = $('#adm-overlaps');
    if (!alerts.overlaps.length) overlaps.replaceChildren(el('p', 'empty', 'No hay reservas encimadas en la misma habitación.'));
    else overlaps.replaceChildren(...alerts.overlaps.map((o) => alertCard(
      `${o.room} · ${dateShort.format(asDate(o.from))} → ${dateShort.format(asDate(o.to))}`,
      o.reservations.map((r) => `${r.guest_name ?? 'Sin nombre'} (${channelName(r.channel)}, folio ${r.order_number})`).join('  ·  '),
      o.same_dates ? 'Mismas fechas: probablemente es la misma reserva duplicada.' : 'Fechas encimadas: posible sobreventa.',
    )));
    // Nombres anteriores relacionados con una habitación (por cambios de nombre en R2).
    const renames = alerts.renames ?? [];
    const HOW = {
      historial: 'Cambio de nombre detectado en R2.',
      manual: 'Configurado en rooms.config.json.',
      automático: 'Relacionado automáticamente por parecido: si no es correcto, configúralo en rooms.config.json.',
    };
    $('#adm-renames-block').hidden = !renames.length;
    $('#adm-renames').replaceChildren(...renames.flatMap((r) => r.from.map((f) => alertCard(
      `"${f.name}" → ${r.room}`,
      'Las reservas hechas con el nombre anterior se cuentan en esta habitación.',
      HOW[f.how] ?? '',
    ))));
    $('#adm-alert-count').textContent = String(alerts.pending.length + alerts.overlaps.length);
  }

  function alertCard(title, detail, hint) {
    const card = el('article', 'alert-card');
    card.append(el('h4', null, title), el('p', 'alert-detail', detail), el('p', 'alert-hint', hint));
    return card;
  }

  function meterCell(value) {
    const wrap = el('span', 'meter-cell');
    const track = el('span', 'meter');
    const fill = el('span', 'meter-fill');
    fill.style.width = `${Math.min(100, value ?? 0)}%`;
    track.append(fill);
    wrap.append(el('span', 'meter-value', pct(value)), track);
    return wrap;
  }

  function table(headers, rows) {
    const wrap = el('div', 'table-wrap');
    const t = el('table', 'data-table');
    const thead = el('thead');
    const hr = el('tr');
    for (const h of headers) hr.append(el('th', null, h));
    thead.append(hr);
    const tbody = el('tbody');
    for (const row of rows) {
      const tr = el('tr');
      row.forEach((cell, i) => {
        const td = el(i === 0 ? 'th' : 'td');
        if (i === 0) td.scope = 'row';
        if (cell instanceof Node) td.append(cell);
        else td.textContent = cell;
        tr.append(td);
      });
      tbody.append(tr);
    }
    if (!rows.length) {
      const tr = el('tr');
      const td = el('td', 'empty-cell', 'Sin datos en este periodo');
      td.colSpan = headers.length;
      tr.append(td);
      tbody.append(tr);
    }
    t.append(thead, tbody);
    wrap.append(t);
    return wrap;
  }

  // Tooltip de las columnas: con el puntero o con el teclado (foco).
  function bindTooltips(container) {
    const show = (target) => {
      const data = JSON.parse(target.dataset.tip);
      tip.replaceChildren(el('strong', null, data.value), el('span', 'tip-title', data.title), ...data.rows.filter(Boolean).map((r) => el('span', null, r)));
      tip.hidden = false;
      const box = target.getBoundingClientRect();
      const host = $('#adm-chart').getBoundingClientRect();
      const x = Math.min(Math.max(box.left + box.width / 2 - host.left, 80), host.width - 80);
      tip.style.left = `${x}px`;
      tip.style.top = `${Math.max(0, box.top - host.top - tip.offsetHeight - 6)}px`;
    };
    const hide = () => { tip.hidden = true; };
    for (const col of container.children) {
      col.addEventListener('pointerenter', () => show(col));
      col.addEventListener('focus', () => show(col));
      col.addEventListener('pointerleave', hide);
      col.addEventListener('blur', hide);
    }
  }

  $('#adm-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const from = $('#adm-from').value;
    const to = $('#adm-to').value;
    if (!from || !to) return;
    range = from <= to ? { from, to } : { from: to, to: from };
    onReload();
  });

  return { load };
}
