/* =========================================================
   Tanda — lógica pura (sin DOM), para poder probarla aparte.
   Una tanda tiene N números. El número i recibe en el turno i.
   En cada turno pagan todos los números menos el que recibe.
   ========================================================= */

export const FRECUENCIAS = {
  semanal:    'Semanal',
  catorcenal: 'Catorcenal',
  quincenal:  'Quincenal',
  mensual:    'Mensual',
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// --- Fechas (siempre como texto AAAA-MM-DD, sin horas, para evitar líos de zona horaria) ---

export function aTexto(a, m, d) {
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function partes(texto) {
  const [a, m, d] = texto.split('-').map(Number);
  return { a, m, d };
}

export function diasDelMes(a, m) {
  return new Date(a, m, 0).getDate(); // m va de 1 a 12
}

export function hoyTexto(fecha = new Date()) {
  return aTexto(fecha.getFullYear(), fecha.getMonth() + 1, fecha.getDate());
}

function sumarDias(texto, dias) {
  const { a, m, d } = partes(texto);
  const f = new Date(a, m - 1, d + dias);
  return aTexto(f.getFullYear(), f.getMonth() + 1, f.getDate());
}

function sumarMeses(a, m, meses) {
  const total = (a * 12 + (m - 1)) + meses;
  return { a: Math.floor(total / 12), m: (total % 12) + 1 };
}

/**
 * Fechas de cada turno.
 * - semanal / catorcenal: cada 7 / 14 días desde el inicio.
 * - mensual: el mismo día de cada mes (si el mes es más corto, su último día).
 * - quincenal: el 15 y el último día de cada mes, empezando por el primero
 *   de esos días que caiga en la fecha de inicio o después.
 */
export function fechasDeTurnos(inicio, frecuencia, n) {
  const fechas = [];
  if (frecuencia === 'semanal' || frecuencia === 'catorcenal') {
    const paso = frecuencia === 'semanal' ? 7 : 14;
    for (let i = 0; i < n; i++) fechas.push(sumarDias(inicio, paso * i));
    return fechas;
  }

  const { a, m, d } = partes(inicio);
  if (frecuencia === 'mensual') {
    for (let i = 0; i < n; i++) {
      const p = sumarMeses(a, m, i);
      fechas.push(aTexto(p.a, p.m, Math.min(d, diasDelMes(p.a, p.m))));
    }
    return fechas;
  }

  // quincenal
  let mesActual = { a, m };
  let mitad = d <= 15; // true = toca el 15; false = toca fin de mes
  while (fechas.length < n) {
    const dia = mitad ? 15 : diasDelMes(mesActual.a, mesActual.m);
    fechas.push(aTexto(mesActual.a, mesActual.m, dia));
    if (!mitad) mesActual = sumarMeses(mesActual.a, mesActual.m, 1);
    mitad = !mitad;
  }
  return fechas;
}

export function fechaLarga(texto) {
  const { a, m, d } = partes(texto);
  return `${d} ${MESES[m - 1]} ${a}`;
}

export function fechaCorta(texto) {
  const { m, d } = partes(texto);
  return `${d} ${MESES[m - 1].slice(0, 3)}`;
}

// --- Dinero ---

export function pesos(cantidad) {
  return '$' + Number(cantidad || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

export function totalARecibir(tanda) {
  return tanda.monto * (tanda.numeros.length - 1);
}

export const MAX_LUGARES = 60;

/** Cuántos turnos caen entre el primer pago y el último (incluidos). */
export function contarTurnos(inicio, frecuencia, fin) {
  const fechas = fechasDeTurnos(inicio, frecuencia, MAX_LUGARES + 2);
  return fechas.filter((f) => f <= fin).length;
}

/**
 * Plan de la tanda a partir de lo que elige quien organiza:
 * total a recibir, frecuencia, primer y último pago, y si hay número 0.
 * Devuelve cuántos números (lugares) hay y cuánto paga cada uno.
 */
export function planDesdeTotal({ total, frecuencia, inicio, fin, conCero }) {
  const turnosEnFechas = contarTurnos(inicio, frecuencia, fin);
  const lugares = conCero ? turnosEnFechas - 1 : turnosEnFechas;
  const monto = lugares > 1 ? Math.round((total / (lugares - 1)) * 100) / 100 : 0;
  const exacto = lugares > 1 && Math.abs(monto * (lugares - 1) - total) < 0.005;
  return { turnosEnFechas, lugares, monto, exacto };
}

/** En el número 0 pagan todos los números (nadie descansa). */
export function totalCero(tanda) {
  return tanda.monto * tanda.numeros.length;
}

// --- Turnos ---
// Un turno es el índice del número que recibe (0, 1, 2…) o CERO, el turno
// opcional del principio en que recibe quien organiza la tanda.

export const CERO = 'c';

export function tieneCero(tanda) {
  return Boolean(tanda.cero?.activo);
}

export function nombreCero(tanda) {
  return tanda.cero?.nombre?.trim() || 'Organizadora';
}

/** Turnos en orden: [CERO, 0, 1, 2…] o [0, 1, 2…]. */
export function turnos(tanda) {
  const lista = tanda.numeros.map((_, i) => i);
  return tieneCero(tanda) ? [CERO, ...lista] : lista;
}

/** Fecha de cada turno, como objeto: fechas[CERO], fechas[0], fechas[1]… */
export function fechasTanda(tanda) {
  const lista = turnos(tanda);
  const fechas = fechasDeTurnos(tanda.inicio, tanda.frecuencia, lista.length);
  const porTurno = {};
  lista.forEach((turno, i) => { porTurno[turno] = fechas[i]; });
  return porTurno;
}

/** Número que se muestra para un turno: «0» para el de quien organiza. */
export function etiquetaTurno(turno) {
  return turno === CERO ? '0' : String(turno + 1);
}

/** Convierte el texto de una clave o ruta («c», «3») a turno. */
export function leerTurno(texto) {
  return texto === CERO ? CERO : Number(texto);
}

// --- Pagos ---

export function clavePago(numero, turno) {
  return `${numero}-${turno}`;
}

export function estaPagado(tanda, numero, turno) {
  return Boolean(tanda.pagos[clavePago(numero, turno)]);
}

/** Turno que toca hoy: el primero cuya fecha es hoy o después. */
export function turnoActual(tanda, hoy = hoyTexto()) {
  const fechas = fechasTanda(tanda);
  const lista = turnos(tanda);
  return lista.find((turno) => fechas[turno] >= hoy) ?? lista[lista.length - 1];
}

/**
 * Estado de una celda:
 *  'recibe'    → es el turno en que ese número cobra
 *  'pagado'    → ya pagó
 *  'atrasado'  → la fecha del turno ya pasó y no ha pagado
 *  'pendiente' → todavía no llega o es el turno actual sin pagar
 */
export function estadoCelda(tanda, numero, turno, fechas, hoy = hoyTexto()) {
  if (numero === turno) return 'recibe';
  if (estaPagado(tanda, numero, turno)) return 'pagado';
  if (fechas[turno] < hoy) return 'atrasado';
  return 'pendiente';
}

/** Resumen del turno: cuánto se ha juntado y quién falta. */
export function resumenTurno(tanda, turno, hoy = hoyTexto()) {
  const fechas = fechasTanda(tanda);
  const pagaron = [];
  const faltan = [];
  tanda.numeros.forEach((_, numero) => {
    if (numero === turno) return;
    (estaPagado(tanda, numero, turno) ? pagaron : faltan).push(numero);
  });
  return {
    fecha: fechas[turno],
    recibe: turno,
    pagaron,
    faltan,
    juntado: pagaron.length * tanda.monto,
    total: turno === CERO ? totalCero(tanda) : totalARecibir(tanda),
    vencido: fechas[turno] < hoy,
  };
}

/** Pagos atrasados de cada número (para saber quién debe). */
export function adeudos(tanda, hoy = hoyTexto()) {
  const fechas = fechasTanda(tanda);
  const lista = turnos(tanda);
  return tanda.numeros.map((_, numero) =>
    lista.reduce((cuenta, turno) =>
      cuenta + (estadoCelda(tanda, numero, turno, fechas, hoy) === 'atrasado' ? 1 : 0), 0));
}

/** Cuántos pagos tiene que haber en total (para la barra de avance). */
export function pagosEsperados(tanda) {
  const n = tanda.numeros.length;
  return n * (n - 1) + (tieneCero(tanda) ? n : 0);
}

// --- Crear / normalizar ---

export function nuevoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function tandaVacia() {
  const hoy = new Date();
  // Por omisión empieza el próximo 15 o fin de mes
  const d = hoy.getDate();
  const a = hoy.getFullYear();
  const m = hoy.getMonth() + 1;
  const inicio = d <= 15 ? aTexto(a, m, 15) : aTexto(a, m, diasDelMes(a, m));
  return {
    id: nuevoId(),
    nombre: '',
    total: 11000,
    monto: 1000,
    frecuencia: 'quincenal',
    inicio,
    fin: fechasDeTurnos(inicio, 'quincenal', 12)[11],
    numeros: Array.from({ length: 12 }, () => ({ nombre: '', telefono: '' })),
    cero: { activo: false, nombre: '' },
    pagos: {},
    creada: Date.now(),
    actualizada: Date.now(),
  };
}

/**
 * Tanda de muestra para conocer la app: 12 números quincenales de $1,000
 * que empezó hace unos meses, con pagos al corriente y un par de atrasos.
 */
export function tandaEjemplo(hoy = hoyTexto()) {
  const { a, m } = partes(hoy);
  const atras = sumarMeses(a, m, -2);
  const inicio = aTexto(atras.a, atras.m, 15);
  const nombres = ['Ana', 'Beto', 'Carmen', 'Diego', 'Elena', 'Fer', 'Gaby', 'Hugo', 'Isa', 'Juan', 'Karla', 'Luis'];
  const tanda = {
    ...tandaVacia(),
    nombre: 'Tanda de ejemplo',
    total: 11000,
    monto: 1000,
    inicio,
    fin: fechasDeTurnos(inicio, 'quincenal', 12)[11],
    numeros: nombres.map((nombre) => ({ nombre, telefono: '' })),
    ejemplo: true,
  };
  const fechas = fechasTanda(tanda);
  const actual = turnoActual(tanda, hoy);
  tanda.numeros.forEach((_, numero) => {
    for (let turno = 0; turno <= actual; turno++) {
      if (numero === turno) continue;
      const atrasado = (numero === 5 && turno === actual - 1) || (numero === 8 && turno >= actual - 2);
      const pendienteHoy = turno === actual && numero % 2 === 1;
      if (!atrasado && !pendienteHoy) tanda.pagos[clavePago(numero, turno)] = { fecha: fechas[turno] };
    }
  });
  return tanda;
}

/** Revuelve los números (Fisher–Yates). Devuelve el orden nuevo como índices. */
export function sorteo(n, azar = Math.random) {
  const orden = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [orden[i], orden[j]] = [orden[j], orden[i]];
  }
  return orden;
}

/** Quita pagos que ya no caben (si se redujo el número de lugares). */
export function limpiarPagos(tanda) {
  const n = tanda.numeros.length;
  for (const clave of Object.keys(tanda.pagos)) {
    const [textoNumero, textoTurno] = clave.split('-');
    const numero = Number(textoNumero);
    const turno = leerTurno(textoTurno);
    const valido = turno === CERO
      ? tieneCero(tanda) && numero < n
      : numero < n && turno < n && numero !== turno;
    if (!valido) delete tanda.pagos[clave];
  }
  return tanda;
}

/** Valida un respaldo importado y devuelve solo tandas bien formadas. */
export function tandasValidas(datos) {
  const lista = Array.isArray(datos) ? datos : Array.isArray(datos?.tandas) ? datos.tandas : [];
  return lista.filter((t) =>
    t && typeof t.id === 'string' && Array.isArray(t.numeros) && t.numeros.length >= 2 &&
    typeof t.monto === 'number' && typeof t.inicio === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.inicio) &&
    FRECUENCIAS[t.frecuencia] && t.pagos && typeof t.pagos === 'object');
}
