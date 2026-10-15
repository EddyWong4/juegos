/* =========================================================
   Tanda Fácil — aplicación (pantallas y eventos).
   Rutas (en el #):
     #/                  mis tandas
     #/nueva             crear tanda
     #/editar/ID         editar tanda
     #/t/ID              tablero de pagos
     #/t/ID/turno[/N]    turno actual (o el turno N)
   ========================================================= */
import * as L from './logica.js';
import * as almacen from './almacen.js';
import { imagenDeTablero } from './compartir.js';

const vista = document.getElementById('vista');
const aviso = document.getElementById('aviso');
const archivoRespaldo = document.getElementById('archivo-respaldo');

const tandas = new Map();
let borrador = null;      // copia de la tanda que se está editando
let ultimaRuta = '';
let celdaRecien = null;   // para animar la palomita recién puesta
let entregaRecien = null; // para animar el billete recién pegado

// Sticker de billete: ya se le entregó el dinero a quien le tocaba recibir
const BILLETE = '<svg class="billete" viewBox="0 0 40 28" aria-hidden="true"><rect x="1" y="1" width="38" height="26" rx="5" fill="#fff"/><rect x="4" y="4" width="32" height="20" rx="3" fill="#7cc47f"/><rect x="6.5" y="6.5" width="27" height="15" rx="2" fill="none" stroke="#2f7a43" stroke-width="1"/><circle cx="20" cy="14" r="5.5" fill="#a9dcaa" stroke="#2f7a43" stroke-width="1.2"/><text x="20" y="17.6" text-anchor="middle" font-size="10" font-weight="700" fill="#2f7a43" font-family="Georgia, serif">$</text></svg>';
const PALOMITA ='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13.5c2 1.5 3.6 3.3 5 5.5 3-6.5 6.5-11 11-14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ---------- Utilidades ----------

function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function nombreDe(tanda, numero) {
  const num = tanda.numeros[numero];
  const nombre = num?.nombre?.trim() || `Participante ${numero + 1}`;
  if (!num?.socio) return nombre;
  return `${nombre} y ${num.socio.nombre.trim() || 'otra persona'}`;
}

/** Nombre de una persona (de personasDe): en lugar compartido, solo su mitad. */
function nombrePersona(tanda, persona, conNombres = true) {
  if (!conNombres) return `Participante ${persona.numero + 1}${persona.parte === null ? '' : persona.parte === 0 ? 'A' : 'B'}`;
  if (persona.parte === null) return nombreDe(tanda, persona.numero);
  return persona.nombre.trim() || (persona.parte === 0 ? `Participante ${persona.numero + 1}` : 'Otra persona');
}

/** Quién recibe en un turno (en el número 0, quien organiza). */
function quienRecibe(tanda, turno) {
  return turno === L.CERO ? L.nombreCero(tanda) : nombreDe(tanda, turno);
}

let temporizadorAviso;
function avisar(texto) {
  aviso.textContent = texto;
  aviso.classList.add('ver');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => aviso.classList.remove('ver'), 2600);
}

function ordenadas() {
  return [...tandas.values()].sort((a, b) => b.actualizada - a.actualizada);
}

function ir(ruta) {
  location.hash = ruta;
}

/** Teléfono para WhatsApp: si son 10 dígitos se asume México (+52). */
function telefonoWhats(tel) {
  const digitos = String(tel || '').replace(/\D/g, '');
  if (!digitos) return '';
  return digitos.length === 10 ? '52' + digitos : digitos;
}

function enlaceWhats(tel, texto) {
  const numero = telefonoWhats(tel);
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

// ---------- Mis tandas ----------

function pantallaLista() {
  const lista = ordenadas();
  const hoy = L.hoyTexto();

  const tarjetas = lista.map((t) => {
    const n = t.numeros.length;
    const turno = L.turnoActual(t, hoy);
    const fechas = L.fechasTanda(t);
    const deben = L.adeudos(t, hoy).reduce((s, x) => s + x, 0);
    const terminada = fechas[n - 1] < hoy;
    const pagosHechos = Object.keys(t.pagos).length;
    const avance = Math.round((pagosHechos / L.pagosEsperados(t)) * 100);
    return `
      <a class="tarjeta" href="#/t/${esc(t.id)}">
        <div class="tarjeta-nombre">${esc(t.nombre || 'Tanda sin nombre')}${t.ejemplo ? ' <span class="postit etiqueta-ejemplo">ejemplo</span>' : ''}</div>
        <div class="tarjeta-dato">Recibe ${L.pesos(L.totalARecibir(t))} · ${n} números${L.tieneCero(t) ? ' + el 0' : ''} · ${esc(L.FRECUENCIAS[t.frecuencia].toLowerCase())}</div>
        <div class="tarjeta-dato">${terminada
          ? 'Terminó el ' + L.fechaLarga(fechas[n - 1])
          : `Turno ${L.etiquetaTurno(turno)}: recibe <strong>${esc(quienRecibe(t, turno))}</strong> el ${L.fechaCorta(fechas[turno])}`}</div>
        <div class="tarjeta-dato">${deben ? `<span class="debe">${deben} pago${deben === 1 ? '' : 's'} atrasado${deben === 1 ? '' : 's'}</span>` : 'Todos al corriente ✓'}</div>
        <div class="barra-avance" aria-label="Pagos registrados: ${avance}%"><span style="width:${avance}%"></span></div>
      </a>`;
  }).join('');

  vista.innerHTML = `
    <div class="acciones">
      <a class="btn btn-principal" href="#/nueva">＋ Nueva tanda</a>
      <button type="button" class="btn" data-accion="respaldar">Guardar respaldo</button>
      <button type="button" class="btn" data-accion="restaurar">Abrir respaldo</button>
      ${lista.some((t) => t.ejemplo) ? '' : '<button type="button" class="btn" data-accion="ejemplo">Ver un ejemplo</button>'}
    </div>
    <h2>Mis tandas</h2>
    ${lista.length ? `<div class="tarjetas">${tarjetas}</div>` : `
      <div class="vacio">
        <p class="nota-mano">Aún no hay tandas en esta libreta.</p>
        <p class="nota-mano">Toca «Nueva tanda» para empezar, o «Ver un ejemplo» para conocer cómo funciona.</p>
      </div>`}
  `;
}

// ---------- Crear / editar ----------

function prepararBorrador(id) {
  const original = id ? tandas.get(id) : null;
  borrador = structuredClone(original || L.tandaVacia());
  // Se recuerda la posición original de cada número para mover sus pagos si se reordena
  borrador.numeros.forEach((num, i) => { num._origen = i; });
  borrador.cero = { activo: false, nombre: '', ...borrador.cero };
  // Tandas guardadas antes de elegir total y último pago
  if (!(borrador.total > 0)) borrador.total = L.totalARecibir(borrador);
  if (!borrador.fin) borrador.fin = L.fechasDeTurnos(borrador.inicio, borrador.frecuencia, L.turnos(borrador).length).pop();
  borrador._sobrantes = []; // números quitados al acortar fechas, por si se vuelven a alargar
  borrador._esNueva = !original;
  recalcular();
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Con el total, la frecuencia y las fechas calcula cuántos números hay
 * y cuánto paga cada uno; agrega o quita renglones de la lista.
 */
function recalcular() {
  const b = borrador;
  if (!(b.total > 0) || !FECHA.test(b.inicio) || !FECHA.test(b.fin)) {
    b._plan = null;
    return null;
  }
  const plan = L.planDesdeTotal({ total: b.total, frecuencia: b.frecuencia, inicio: b.inicio, fin: b.fin, conCero: b.cero.activo });
  b._plan = plan;
  if (plan.lugares < 2 || plan.lugares > L.MAX_LUGARES) return plan;
  while (b.numeros.length < plan.lugares) b.numeros.push(b._sobrantes.pop() || { nombre: '', telefono: '' });
  while (b.numeros.length > plan.lugares) b._sobrantes.push(b.numeros.pop());
  b.monto = plan.monto;
  return plan;
}

/** Fecha del último pago para que la tanda tenga n lugares (más el 0 si lo hay). */
function finParaLugares(n) {
  const b = borrador;
  return L.fechasDeTurnos(b.inicio, b.frecuencia, n + (b.cero.activo ? 1 : 0)).pop();
}

/** Lugares y último pago se calculan uno del otro: actualiza el que no se está escribiendo. */
function sincronizarLugaresYFin(escribiendo) {
  const campoFin = document.getElementById('f-fin');
  const campoLugares = document.getElementById('f-lugares');
  if (campoFin && campoFin !== escribiendo && FECHA.test(borrador.fin)) campoFin.value = borrador.fin;
  const plan = borrador._plan;
  if (campoLugares && campoLugares !== escribiendo && plan && plan.lugares >= 2 && plan.lugares <= L.MAX_LUGARES) {
    campoLugares.value = plan.lugares;
  }
}

function resumenBorrador() {
  const b = borrador;
  const plan = b._plan;
  if (!plan) return '<p class="nota-mano debe">Escribe el total y elige las fechas del primer y último pago.</p>';
  if (plan.lugares < 2) return '<p class="nota-mano debe">Entre esas fechas no caben suficientes turnos: elige un último pago más lejano.</p>';
  if (plan.lugares > L.MAX_LUGARES) return `<p class="nota-mano debe">Son demasiados turnos (máximo ${L.MAX_LUGARES}): elige un último pago más cercano.</p>`;
  const fechas = L.fechasTanda(b);
  const lista = L.turnos(b);
  return `
    <div class="postit-par"><span class="etiqueta">Lugares:</span><span class="postit">${plan.lugares}${b.cero.activo ? ' + el 0' : ''}</span></div>
    <div class="postit-par"><span class="etiqueta">Cada número paga:</span><span class="postit">${L.pesos(plan.monto)}</span></div>
    ${L.tieneCero(b) ? `<div class="postit-par"><span class="etiqueta">Número 0 recibe:</span><span class="postit">${L.pesos(L.totalCero(b))}</span></div>` : ''}
    <div class="postit-par"><span class="etiqueta">Pagos:</span><span class="postit">${L.fechaCorta(fechas[lista[0]])} → ${L.fechaLarga(fechas[lista[lista.length - 1]])}</span></div>
    <span class="aclaracion">*El día que recibe no se da dinero</span>
    ${plan.exacto ? '' : `<p class="nota-mano debe" style="flex-basis:100%">Ojo: ${L.pesos(b.total)} entre ${plan.lugares - 1} pagos no sale exacto; cada quien recibiría ${L.pesos(plan.monto * (plan.lugares - 1))}.</p>`}`;
}

function filasNumeros() {
  const n = borrador.numeros.length;
  return borrador.numeros.map((num, i) => `
    <li data-i="${i}">
      <span class="circulo-num">${i + 1}</span>
      <input class="renglon-input" data-campo="nombre" value="${esc(num.nombre)}" placeholder="Participante ${i + 1}" aria-label="Nombre del número ${i + 1}" maxlength="40" autocomplete="off">
      <input class="renglon-input tel" data-campo="telefono" value="${esc(num.telefono)}" placeholder="WhatsApp (opcional)" aria-label="WhatsApp del número ${i + 1}" inputmode="tel" maxlength="20" autocomplete="off">
      <span class="mover">
        <button type="button" data-accion="subir" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" data-accion="bajar" aria-label="Bajar" ${i === n - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" data-accion="compartir-lugar" aria-label="${num.socio ? 'Dejar el lugar' : 'Compartir el lugar'} ${i + 1} ${num.socio ? 'para una persona' : 'entre 2 personas'}" title="${num.socio ? 'Quitar a la segunda persona' : 'Compartir entre 2 personas (medio número)'}" aria-pressed="${Boolean(num.socio)}" class="${num.socio ? 'activo' : ''}">½</button>
      </span>
      ${num.socio ? `
      <div class="socio">
        <span class="socio-y">y</span>
        <input class="renglon-input" data-campo-socio="nombre" value="${esc(num.socio.nombre)}" placeholder="Segunda persona" aria-label="Segunda persona del número ${i + 1}" maxlength="40" autocomplete="off">
        <input class="renglon-input tel" data-campo-socio="telefono" value="${esc(num.socio.telefono)}" placeholder="WhatsApp (opcional)" aria-label="WhatsApp de la segunda persona del número ${i + 1}" inputmode="tel" maxlength="20" autocomplete="off">
        <span class="socio-nota">pagan ${L.pesos(borrador.monto / 2)} cada quien</span>
      </div>` : ''}
    </li>`).join('');
}

function pantallaEditor() {
  const b = borrador;
  const opciones = Object.entries(L.FRECUENCIAS)
    .map(([valor, texto]) => `<option value="${valor}" ${b.frecuencia === valor ? 'selected' : ''}>${texto}</option>`).join('');
  const tienePagos = Object.keys(b.pagos).length > 0;

  vista.innerHTML = `
    <form class="formulario" id="form-tanda" novalidate>
      <div class="acciones">
        <button type="submit" class="btn btn-principal">Guardar tanda</button>
        <a class="btn" href="${b._esNueva ? '#/' : '#/t/' + esc(b.id)}">Cancelar</a>
      </div>
      <h2>${b._esNueva ? 'Nueva tanda' : 'Editar tanda'}</h2>

      <div class="campos">
        <div class="campo">
          <label for="f-nombre">Nombre de la tanda</label>
          <input id="f-nombre" class="renglon-input" data-campo-tanda="nombre" value="${esc(b.nombre)}" placeholder="Tanda de la oficina" maxlength="50" autocomplete="off">
        </div>
        <div class="campo">
          <label for="f-total">Total a recibir</label>
          <input id="f-total" class="renglon-input" data-campo-tanda="total" type="number" min="1" step="any" inputmode="decimal" value="${b.total}">
        </div>
        <div class="campo">
          <label for="f-lugares">Número de lugares</label>
          <input id="f-lugares" class="renglon-input" data-campo-tanda="lugares" type="number" min="2" max="${L.MAX_LUGARES}" step="1" inputmode="numeric" value="${b._plan?.lugares ?? b.numeros.length}">
        </div>
        <div class="campo">
          <label for="f-frecuencia">El pago es</label>
          <select id="f-frecuencia" data-campo-tanda="frecuencia">${opciones}</select>
        </div>
        <div class="campo">
          <label for="f-inicio">Primer pago (inicia)</label>
          <input id="f-inicio" class="renglon-input" data-campo-tanda="inicio" type="date" value="${b.inicio}">
        </div>
        <div class="campo">
          <label for="f-fin">Último pago (termina)</label>
          <input id="f-fin" class="renglon-input" data-campo-tanda="fin" type="date" value="${b.fin}" min="${b.inicio}">
        </div>
      </div>
      ${b.frecuencia === 'quincenal' ? '<p class="nota-mano">En quincenal los pagos caen el 15 y el último día de cada mes.</p>' : ''}

      <div class="postits" id="resumen">${resumenBorrador()}</div>

      <h3>Número 0</h3>
      <label class="opcion-cero">
        <input type="checkbox" data-campo-cero="activo" ${b.cero.activo ? 'checked' : ''}>
        <span class="nota-mano">Quien organiza se queda con el número 0: en el primer turno pagan todos y lo recibe ella.</span>
      </label>
      <div class="campo campo-cero" id="campo-cero" ${b.cero.activo ? '' : 'hidden'}>
        <label for="f-cero">¿Quién organiza?</label>
        <input id="f-cero" class="renglon-input" data-campo-cero="nombre" value="${esc(b.cero.nombre)}" placeholder="Organizadora" maxlength="40" autocomplete="off">
      </div>

      <h3>Números y turnos</h3>
      <p class="nota-mano">${b.cero.activo ? 'Después del 0, el' : 'El'} número 1 recibe en el ${b.cero.activo ? 'siguiente' : 'primer'} turno, el 2 en el que sigue… Puedes elegir los lugares o la fecha del último pago: uno se calcula con el otro. Una persona puede tener más de un número, y con «½» un lugar se comparte entre 2 personas (medio número cada una).</p>
      ${tienePagos ? '<p class="nota-mano debe">Esta tanda ya tiene pagos: si cambias el orden, cada pago se va con su persona.</p>' : ''}
      <div class="acciones">
        <button type="button" class="btn" data-accion="sortear">🎲 Sortear turnos</button>
      </div>
      <ol class="lista-numeros" id="lista-numeros">${filasNumeros()}</ol>
    </form>
  `;
}

function refrescarNumeros(animar = false) {
  const lista = document.getElementById('lista-numeros');
  lista.innerHTML = filasNumeros();
  if (animar) lista.querySelectorAll('li').forEach((li, i) => {
    li.style.animationDelay = `${i * 25}ms`;
    li.classList.add('sorteando');
  });
  document.getElementById('resumen').innerHTML = resumenBorrador();
}

async function guardarBorrador() {
  const b = borrador;
  if (!(b.total > 0)) { avisar('Escribe el total a recibir'); document.getElementById('f-total').focus(); return; }
  if (!FECHA.test(b.inicio)) { avisar('Elige la fecha del primer pago'); document.getElementById('f-inicio').focus(); return; }
  if (!FECHA.test(b.fin)) { avisar('Elige la fecha del último pago'); document.getElementById('f-fin').focus(); return; }
  const plan = recalcular();
  if (plan.lugares < 2 || plan.lugares > L.MAX_LUGARES) { avisar('Revisa las fechas: la tanda necesita de 2 a 60 lugares'); document.getElementById('f-fin').focus(); return; }

  // Mueve los pagos con su persona si cambió el orden o la cantidad de números
  const nuevaPosicion = new Map();
  b.numeros.forEach((num, i) => { if (num._origen !== undefined) nuevaPosicion.set(num._origen, i); });
  const pagos = {};
  for (const [clave, pago] of Object.entries(b.pagos)) {
    const [numero, turno] = clave.split('-');
    const nuevo = nuevaPosicion.get(Number(numero));
    if (nuevo !== undefined) pagos[L.clavePago(nuevo, L.leerTurno(turno))] = pago;
  }
  // La entrega del dinero también se va con su persona
  const entregas = {};
  for (const [turno, entrega] of Object.entries(b.entregas || {})) {
    const nuevo = turno === L.CERO ? L.CERO : nuevaPosicion.get(Number(turno));
    if (nuevo !== undefined) entregas[nuevo] = entrega;
  }

  const tanda = {
    id: b.id,
    nombre: b.nombre.trim(),
    total: b.total,
    monto: plan.monto,
    frecuencia: b.frecuencia,
    inicio: b.inicio,
    fin: b.fin,
    numeros: b.numeros.map((num) => ({
      nombre: num.nombre.trim(),
      telefono: num.telefono.trim(),
      ...(num.socio ? { socio: { nombre: num.socio.nombre.trim(), telefono: num.socio.telefono.trim() } } : {}),
    })),
    cero: { activo: Boolean(b.cero.activo), nombre: b.cero.nombre.trim() },
    pagos,
    entregas,
    creada: b.creada,
  };
  L.limpiarPagos(tanda);
  await almacen.guardar(tanda);
  tandas.set(tanda.id, tanda);
  borrador = null;
  avisar('Tanda guardada');
  ir(`#/t/${tanda.id}`);
}

// ---------- Tablero ----------

function encabezadoTanda(t, seccion) {
  return `
    <div class="acciones">
      <a class="btn" href="#/">← Mis tandas</a>
      <button type="button" class="btn btn-principal" data-accion="compartir">Compartir imagen</button>
      <a class="btn" href="#/editar/${esc(t.id)}">Editar</a>
      <button type="button" class="btn btn-peligro" data-accion="eliminar">Eliminar</button>
    </div>
    <h2 class="mano" style="font-family:var(--mano);font-weight:700;font-size:2.3rem">${esc(t.nombre || 'Tanda sin nombre')}</h2>
    <div class="postits">
      <div class="postit-par"><span class="etiqueta">Total a recibir:</span><span class="postit">${L.pesos(L.totalARecibir(t))}</span></div>
      <div class="postit-par"><span class="etiqueta">Cada número paga:</span><span class="postit">${L.pesos(t.monto)}</span></div>
      <div class="postit-par"><span class="etiqueta">El pago es:</span><span class="postit">${esc(L.FRECUENCIAS[t.frecuencia])}</span></div>
      <div class="postit-par"><span class="etiqueta">Inicia:</span><span class="postit">${L.fechaLarga(L.fechasTanda(t)[L.turnos(t)[0]])}</span></div>
      <div class="postit-par"><span class="etiqueta">Termina:</span><span class="postit">${L.fechaLarga(L.fechasTanda(t)[t.numeros.length - 1])}</span></div>
      ${L.tieneCero(t) ? `<div class="postit-par"><span class="etiqueta">Número 0 (${esc(L.nombreCero(t))}):</span><span class="postit">${L.pesos(L.totalCero(t))}</span></div>` : ''}
      <span class="aclaracion">*El día que recibe no se da dinero</span>
    </div>
    <nav class="pestanas" aria-label="Secciones">
      <a class="pestana" href="#/t/${esc(t.id)}" ${seccion === 'tablero' ? 'aria-current="page"' : ''}>Tablero</a>
      <a class="pestana" href="#/t/${esc(t.id)}/turno" ${seccion === 'turno' ? 'aria-current="page"' : ''}>Turno actual</a>
    </nav>`;
}

function pantallaTablero(t) {
  const n = t.numeros.length;
  const hoy = L.hoyTexto();
  const fechas = L.fechasTanda(t);
  const lista = L.turnos(t);
  const actual = L.turnoActual(t, hoy);
  const claseActual = (turno) => (turno === actual ? 'actual' : '');

  const cabeceraNumeros = lista.map((turno) =>
    `<th scope="col" class="${claseActual(turno)} ${turno === L.CERO ? 'col-cero' : ''}" title="${L.fechaLarga(fechas[turno])}">${L.etiquetaTurno(turno)}</th>`).join('');

  // Renglón de quien organiza: solo recibe en el 0 y no paga los demás turnos
  const filaCero = L.tieneCero(t) ? `
      <tr class="fila-cero ${actual === L.CERO ? 'fila-actual' : ''}">
        <th scope="row" class="col-nombre" title="${esc(L.nombreCero(t))} (organiza)">${esc(L.nombreCero(t))} <small class="organiza">organiza</small></th>
        ${lista.map((turno) => turno === L.CERO
          ? `<td class="${claseActual(turno)} recibe">${celdaRecibe(t, turno, L.nombreCero(t))}</td>`
          : `<td class="${claseActual(turno)} no-paga"><span class="celda" aria-hidden="true"></span></td>`).join('')}
        <td class="col-fecha">${L.fechaLarga(fechas[L.CERO])}</td>
      </tr>` : '';

  const filas = t.numeros.map((num, numero) => {
    const celdas = lista.map((turno) => {
      const estado = L.estadoCelda(t, numero, turno, fechas, hoy);
      const clases = [claseActual(turno), estado === 'recibe' ? 'recibe' : ''].join(' ');
      if (estado === 'recibe') {
        return `<td class="${clases}">${celdaRecibe(t, turno, nombreDe(t, numero))}</td>`;
      }
      const recien = celdaRecien === L.clavePago(numero, turno) ? ' recien' : '';
      // Medio pago vencido: se marca con media palomita y el círculo rojo
      const vencido = estado === 'medio' && fechas[turno] < hoy ? ' atrasado' : '';
      const etiqueta = `${nombreDe(t, numero)}, turno ${L.etiquetaTurno(turno)}: ${estado === 'medio' ? 'pagó la mitad' : estado}`;
      const contenido = estado === 'pagado' ? PALOMITA : estado === 'medio' ? `${PALOMITA}<span class="medio-marca">½</span>` : '';
      return `<td class="${clases}"><button type="button" class="celda ${estado}${vencido}${recien}" data-numero="${numero}" data-turno="${turno}" aria-pressed="${estado === 'pagado'}" aria-label="${esc(etiqueta)}">${contenido}</button></td>`;
    }).join('');
    const nombre = (num.nombre.trim()
      ? esc(num.nombre)
      : `<span class="sin-nombre">Participante ${numero + 1}</span>`)
      + (num.socio ? ` <span class="socio-y">y</span> ${esc(num.socio.nombre.trim() || 'otra persona')} <small class="organiza">½ c/u</small>` : '');
    return `
      <tr class="${numero === actual ? 'fila-actual' : ''}">
        <th scope="row" class="col-nombre" title="${esc(nombreDe(t, numero))}">${nombre}</th>
        ${celdas}
        <td class="col-fecha">${L.fechaLarga(fechas[numero])}</td>
      </tr>`;
  }).join('');
  celdaRecien = null;
  entregaRecien = null;

  vista.innerHTML = `
    ${encabezadoTanda(t, 'tablero')}
    <div class="tabla-caja">
      <table class="tablero">
        <thead>
          <tr>
            <th scope="col" class="col-nombre" rowspan="2">Participantes</th>
            <th scope="colgroup" colspan="${lista.length}">Números</th>
            <th scope="col" rowspan="2">Fecha que<br>recibe la tanda</th>
          </tr>
          <tr class="numeros-fila">${cabeceraNumeros}</tr>
        </thead>
        <tbody>${filaCero}${filas}</tbody>
      </table>
    </div>
    <div class="leyenda">
      <span><i class="muestra m-recibe"></i> recibe</span>
      <span><i class="muestra">${PALOMITA}</i> pagó</span>
      <span><i class="muestra m-atrasado"></i> atrasado</span>
      <span><i class="muestra m-actual"></i> turno actual</span>
      ${t.numeros.some((num) => num.socio) ? '<span><i class="muestra"><b class="mano">½</b></i> pagó solo una de las dos</span>' : ''}
      <span><i class="muestra m-recibe">${BILLETE}</i> ya se le entregó el dinero</span>
      <span>Toca un cuadro blanco para marcar un pago, o el morado cuando entregues el dinero.</span>
    </div>
  `;
}

/** Cuadrito morado de quien recibe: al tocarlo se marca que ya se le entregó el dinero. */
function celdaRecibe(t, turno, nombre) {
  const entregado = L.estaEntregado(t, turno);
  const etiqueta = `${nombre} recibe en el turno ${L.etiquetaTurno(turno)}: ${entregado ? 'ya se le entregó el dinero' : 'falta entregarle el dinero'}`;
  const recien = entregaRecien === `${turno}` ? ' recien' : '';
  return `<button type="button" class="celda celda-recibe${recien}" data-accion="entrega" data-turno="${turno}" aria-pressed="${entregado}" aria-label="${esc(etiqueta)}" title="${entregado ? 'Dinero entregado' : 'Toca cuando le entregues el dinero'}">${entregado ? BILLETE : ''}</button>`;
}

async function alternarEntrega(t, turno) {
  const entregado = L.alternarEntrega(t, turno);
  entregaRecien = entregado ? `${turno}` : null;
  await almacen.guardar(t);
  avisar(entregado ? `Dinero entregado a ${quienRecibe(t, turno)} 💵` : 'Se quitó la entrega');
}

/** parte: null = el lugar completo; 0 o 1 = una de las dos personas de un lugar compartido. */
async function alternarPago(t, numero, turno, parte = null) {
  if (L.alternarPago(t, numero, turno, parte)) celdaRecien = L.clavePago(numero, turno);
  await almacen.guardar(t);
}

function leerParte(texto) {
  return texto === undefined || texto === '' ? null : Number(texto);
}

// ---------- Turno ----------

function pantallaTurno(t, turnoPedido) {
  const n = t.numeros.length;
  const hoy = L.hoyTexto();
  const lista = L.turnos(t);
  const actual = L.turnoActual(t, hoy);
  const turno = lista.includes(turnoPedido) ? turnoPedido : actual;
  const posicion = lista.indexOf(turno);
  const anterior = lista[posicion - 1];
  const siguiente = lista[posicion + 1];
  const r = L.resumenTurno(t, turno, hoy);
  const avance = Math.round((r.juntado / r.total) * 100);

  const filaPersona = (persona, pagado) => {
    const { numero, parte, telefono: tel } = persona;
    const nombre = nombrePersona(t, persona);
    const recordatorio = `Hola ${nombre}, te recuerdo tu pago de la tanda «${t.nombre || 'Tanda'}»: ${L.pesos(persona.monto)} del ${turno === L.CERO ? 'número 0' : 'turno ' + L.etiquetaTurno(turno)} (${L.fechaLarga(r.fecha)}). ¡Gracias!`;
    const datos = `data-numero="${numero}" data-turno="${turno}" data-parte="${parte ?? ''}"`;
    return `
      <li>
        ${pagado ? PALOMITA : '<span style="width:22px;flex:none">○</span>'}
        <span class="nombre ${pagado ? 'tachado' : ''}">${esc(nombre)} <small style="color:var(--tinta-suave)">(#${numero + 1}${parte === null ? '' : ', ½ · ' + L.pesos(persona.monto)})</small></span>
        ${pagado
          ? `<button type="button" class="btn btn-chico" data-accion="pago" ${datos}>Quitar</button>`
          : `${tel ? `<a class="btn btn-chico btn-whats" href="${esc(enlaceWhats(tel, recordatorio))}" target="_blank" rel="noopener">Recordar</a>` : ''}
             <button type="button" class="btn btn-chico btn-principal" data-accion="pago" ${datos}>Pagó</button>`}
      </li>`;
  };

  vista.innerHTML = `
    ${encabezadoTanda(t, 'turno')}
    <div class="turno-nav">
      <a class="btn btn-chico" href="#/t/${esc(t.id)}/turno/${anterior}" aria-label="Turno anterior" ${anterior === undefined ? 'hidden' : ''}>‹</a>
      <h2>${turno === L.CERO ? 'Número 0' : `Turno ${L.etiquetaTurno(turno)} de ${n}`}</h2>
      <a class="btn btn-chico" href="#/t/${esc(t.id)}/turno/${siguiente}" aria-label="Turno siguiente" ${siguiente === undefined ? 'hidden' : ''}>›</a>
      ${turno !== actual ? `<a class="btn btn-chico" href="#/t/${esc(t.id)}/turno">Ir al actual</a>` : ''}
    </div>

    <div class="recibe-caja">
      <div class="recibe-dato">Recibe el ${L.fechaLarga(r.fecha)}${r.vencido ? ' (ya pasó)' : ''}:</div>
      <div class="recibe-nombre">${esc(quienRecibe(t, turno))}${turno === L.CERO ? ' <small class="organiza">organiza</small>' : ''}${L.estaEntregado(t, turno) ? ` <span class="billete-grande">${BILLETE}</span>` : ''}</div>
      <div class="recibe-dato">Juntado: <strong>${L.pesos(r.juntado)}</strong> de ${L.pesos(r.total)}</div>
      <div class="barra-avance"><span style="width:${avance}%"></span></div>
    </div>

    <div class="acciones">
      <button type="button" class="btn" data-accion="todos" data-turno="${turno}" ${r.faltan.length ? '' : 'hidden'}>Marcar a todos como pagado</button>
      <button type="button" class="btn ${L.estaEntregado(t, turno) ? '' : 'btn-principal'}" data-accion="entrega" data-turno="${turno}">${L.estaEntregado(t, turno) ? 'Quitar entrega' : '💵 Ya se le entregó el dinero'}</button>
      <button type="button" class="btn btn-whats" data-accion="mensaje-grupo" data-turno="${turno}">Mensaje para el grupo</button>
    </div>

    <h3>Faltan (${r.faltan.length})</h3>
    ${r.faltan.length ? `<ul class="lista-turno">${r.faltan.map((x) => filaPersona(x, false)).join('')}</ul>` : '<p class="nota-mano">¡Ya pagaron todos! ✓</p>'}
    <h3>Ya pagaron (${r.pagaron.length})</h3>
    ${r.pagaron.length ? `<ul class="lista-turno">${r.pagaron.map((x) => filaPersona(x, true)).join('')}</ul>` : '<p class="nota-mano">Nadie todavía.</p>'}
  `;
}

function textoGrupo(t, turno, conNombres = true) {
  const r = L.resumenTurno(t, turno);
  // Sin nombres: «Participante 3» (o 3A / 3B si el lugar es compartido) y «Organiza»
  const persona = (p) => nombrePersona(t, p, conNombres);
  const recibe = turno === L.CERO
    ? (conNombres ? L.nombreCero(t) : 'Organiza')
    : (conNombres ? nombreDe(t, turno) : `Participante ${turno + 1}`);
  const lineas = [
    `${t.nombre || 'Tanda'} — ${turno === L.CERO ? 'número 0' : `turno ${L.etiquetaTurno(turno)} de ${t.numeros.length}`}`,
    `Recibe: ${recibe} el ${L.fechaLarga(r.fecha)} (${L.pesos(r.total)})`,
    `Cada número paga ${L.pesos(t.monto)}.`,
    '',
    `✅ Ya pagaron: ${r.pagaron.map(persona).join(', ') || 'nadie todavía'}`,
    `⏳ Faltan: ${r.faltan.map(persona).join(', ') || 'nadie 🎉'}`,
  ];
  return lineas.join('\n');
}

async function compartirTexto(texto) {
  if (navigator.share) {
    try { await navigator.share({ text: texto }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  window.open(enlaceWhats('', texto), '_blank', 'noopener');
}

/** Pregunta si la imagen lleva los nombres: devuelve true, false o null (canceló). */
function preguntarNombres(titulo) {
  const dialogo = document.getElementById('dialogo-compartir');
  document.getElementById('titulo-compartir').textContent = titulo;
  return new Promise((resolver) => {
    dialogo.returnValue = '';
    dialogo.addEventListener('close', () => {
      resolver(dialogo.returnValue === 'con' ? true : dialogo.returnValue === 'sin' ? false : null);
    }, { once: true });
    dialogo.showModal();
  });
}

async function compartirImagen(t) {
  const conNombres = await preguntarNombres('Compartir imagen');
  if (conNombres === null) return;
  avisar('Preparando la imagen…');
  const blob = await imagenDeTablero(t, { conNombres });
  const nombreArchivo = `tanda-${(t.nombre || 'tabla').toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '-')}.png`;
  const archivo = new File([blob], nombreArchivo, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: t.nombre || 'Tanda' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  descargar(blob, nombreArchivo);
  avisar('Imagen descargada');
}

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- Respaldo ----------

function respaldar() {
  const datos = { app: 'tanda', version: 1, fecha: new Date().toISOString(), tandas: ordenadas() };
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  descargar(blob, `respaldo-tandas-${L.hoyTexto()}.json`);
  avisar('Respaldo guardado');
}

async function restaurar(archivo) {
  try {
    const datos = JSON.parse(await archivo.text());
    const validas = L.tandasValidas(datos);
    if (!validas.length) { avisar('Ese archivo no tiene tandas'); return; }
    for (const t of validas) {
      t.numeros = t.numeros.map((x) => ({ nombre: String(x?.nombre || ''), telefono: String(x?.telefono || '') }));
      t.cero = { activo: Boolean(t.cero?.activo), nombre: String(t.cero?.nombre || '') };
      L.limpiarPagos(t);
      await almacen.guardar(t);
      tandas.set(t.id, t);
    }
    avisar(`Se abrieron ${validas.length} tanda${validas.length === 1 ? '' : 's'}`);
    mostrar(true);
  } catch {
    avisar('No se pudo leer el respaldo');
  }
}

// ---------- Rutas ----------

function mostrar(forzar = false) {
  const ruta = location.hash || '#/';
  const partes = ruta.replace(/^#\/?/, '').split('/');
  const cambioDePagina = ruta.split('/').slice(0, 3).join('/') !== ultimaRuta.split('/').slice(0, 3).join('/');

  if (partes[0] === 'nueva' || partes[0] === 'editar') {
    const id = partes[0] === 'editar' ? partes[1] : null;
    if (id && !tandas.has(id)) { ir('#/'); return; }
    if (!borrador || forzar || cambioDePagina) prepararBorrador(id);
    pantallaEditor();
  } else if (partes[0] === 't' && tandas.has(partes[1])) {
    const t = tandas.get(partes[1]);
    if (partes[2] === 'turno') pantallaTurno(t, partes[3] === undefined ? undefined : L.leerTurno(partes[3]));
    else pantallaTablero(t);
    document.title = `${t.nombre || 'Tanda'} — Tanda Fácil`;
  } else {
    if (ruta !== '#/') { history.replaceState(null, '', '#/'); }
    pantallaLista();
    document.title = 'Tanda Fácil — Libreta de tandas';
  }

  if (cambioDePagina && ultimaRuta) {
    vista.classList.remove('pasar');
    void vista.offsetWidth; // reinicia la animación
    vista.classList.add('pasar');
    window.scrollTo({ top: 0 });
  }
  ultimaRuta = ruta;
}

// ---------- Eventos ----------

vista.addEventListener('input', (e) => {
  if (!borrador) return;
  const campoTanda = e.target.dataset.campoTanda;
  if (campoTanda) {
    const b = borrador;
    if (campoTanda === 'lugares') {
      // Elegir los lugares mueve la fecha del último pago
      const n = Math.round(Number(e.target.value));
      if (n >= 2 && n <= L.MAX_LUGARES && FECHA.test(b.inicio)) b.fin = finParaLugares(n);
      else return;
    } else {
      b[campoTanda] = campoTanda === 'total' ? Number(e.target.value) : e.target.value;
    }
    if (campoTanda === 'inicio') document.getElementById('f-fin').min = b.inicio;
    // Cambiar el inicio o la frecuencia conserva los lugares y recorre el último pago
    if ((campoTanda === 'inicio' || campoTanda === 'frecuencia') && FECHA.test(b.inicio)) b.fin = finParaLugares(b.numeros.length);
    if (campoTanda !== 'nombre') {
      const antes = b.numeros.length;
      recalcular();
      if (b.numeros.length !== antes) refrescarNumeros();
      else document.getElementById('resumen').innerHTML = resumenBorrador();
      sincronizarLugaresYFin(e.target);
    }
    return;
  }
  if (e.target.dataset.campoCero === 'nombre') { borrador.cero.nombre = e.target.value; return; }
  const campo = e.target.dataset.campo;
  const li = e.target.closest('li[data-i]');
  if (campo && li) borrador.numeros[Number(li.dataset.i)][campo] = e.target.value;
  const campoSocio = e.target.dataset.campoSocio;
  if (campoSocio && li) borrador.numeros[Number(li.dataset.i)].socio[campoSocio] = e.target.value;
});

vista.addEventListener('change', (e) => {
  // Si se escribió un número de lugares que no vale (menos de 2 o más de 60), regresa al actual
  if (borrador && e.target.id === 'f-lugares') {
    const n = Math.round(Number(e.target.value));
    if (!(n >= 2 && n <= L.MAX_LUGARES)) {
      avisar(`Los lugares van de 2 a ${L.MAX_LUGARES}`);
      e.target.value = borrador.numeros.length;
    }
  }
  if (borrador && e.target.dataset.campoTanda === 'frecuencia') {
    borrador.frecuencia = e.target.value;
    recalcular();
    pantallaEditor();
    document.getElementById('f-frecuencia').focus();
  }
  if (borrador && e.target.dataset.campoCero === 'activo') {
    borrador.cero.activo = e.target.checked;
    // El número 0 agrega un turno al principio: se conservan los lugares
    if (FECHA.test(borrador.inicio)) borrador.fin = finParaLugares(borrador.numeros.length);
    recalcular();
    pantallaEditor();
    vista.querySelector(borrador.cero.activo ? '#f-cero' : '[data-campo-cero="activo"]')?.focus();
  }
});

vista.addEventListener('submit', (e) => {
  e.preventDefault();
  guardarBorrador();
});

vista.addEventListener('click', async (e) => {
  const celda = e.target.closest('button.celda');
  const boton = e.target.closest('[data-accion]');
  const partes = location.hash.replace(/^#\/?/, '').split('/');
  const t = partes[0] === 't' ? tandas.get(partes[1]) : null;

  if (celda && t && celda.dataset.accion === 'entrega') {
    await alternarEntrega(t, L.leerTurno(celda.dataset.turno));
    mostrar();
    vista.querySelector(`[data-accion="entrega"][data-turno="${celda.dataset.turno}"]`)?.focus();
    return;
  }
  if (celda && t) {
    await alternarPago(t, Number(celda.dataset.numero), L.leerTurno(celda.dataset.turno));
    const foco = `[data-numero="${celda.dataset.numero}"][data-turno="${celda.dataset.turno}"]`;
    mostrar();
    vista.querySelector(foco)?.focus();
    return;
  }
  if (!boton) return;

  switch (boton.dataset.accion) {
    case 'respaldar': respaldar(); break;
    case 'restaurar': archivoRespaldo.click(); break;
    case 'ejemplo': {
      const ejemplo = L.tandaEjemplo();
      await almacen.guardar(ejemplo);
      tandas.set(ejemplo.id, ejemplo);
      avisar('Ejemplo listo: puedes tocar, editar o eliminarlo');
      ir(`#/t/${ejemplo.id}`);
      break;
    }

    case 'sortear': {
      const orden = L.sorteo(borrador.numeros.length);
      borrador.numeros = orden.map((i) => borrador.numeros[i]);
      refrescarNumeros(true);
      avisar('¡Turnos sorteados!');
      break;
    }
    case 'compartir-lugar': {
      const i = Number(boton.closest('li').dataset.i);
      const num = borrador.numeros[i];
      if (num.socio) {
        if ((num.socio.nombre || num.socio.telefono) && !confirm(`¿Quitar a ${num.socio.nombre || 'la segunda persona'} del lugar ${i + 1}?`)) break;
        delete num.socio;
      } else {
        num.socio = { nombre: '', telefono: '' };
      }
      refrescarNumeros();
      const fila = document.querySelector(`#lista-numeros li[data-i="${i}"]`);
      (num.socio ? fila?.querySelector('[data-campo-socio="nombre"]') : fila?.querySelector('[data-accion="compartir-lugar"]'))?.focus();
      break;
    }
    case 'subir':
    case 'bajar': {
      const i = Number(boton.closest('li').dataset.i);
      const j = boton.dataset.accion === 'subir' ? i - 1 : i + 1;
      [borrador.numeros[i], borrador.numeros[j]] = [borrador.numeros[j], borrador.numeros[i]];
      refrescarNumeros();
      document.querySelector(`#lista-numeros li[data-i="${j}"] [data-accion="${boton.dataset.accion}"]`)?.focus();
      break;
    }

    case 'compartir': if (t) compartirImagen(t); break;
    case 'eliminar':
      if (t && confirm(`¿Eliminar la tanda «${t.nombre || 'sin nombre'}»? Se borrarán sus pagos.\n\nTip: guarda un respaldo antes.`)) {
        await almacen.borrar(t.id);
        tandas.delete(t.id);
        avisar('Tanda eliminada');
        ir('#/');
      }
      break;
    case 'pago':
      if (t) { await alternarPago(t, Number(boton.dataset.numero), L.leerTurno(boton.dataset.turno), leerParte(boton.dataset.parte)); mostrar(); }
      break;
    case 'entrega':
      if (t) { await alternarEntrega(t, L.leerTurno(boton.dataset.turno)); mostrar(); }
      break;
    case 'todos':
      if (t) {
        const turno = L.leerTurno(boton.dataset.turno);
        L.resumenTurno(t, turno).faltan.forEach(({ numero }) => { t.pagos[L.clavePago(numero, turno)] = { fecha: L.hoyTexto() }; });
        await almacen.guardar(t);
        mostrar();
        avisar('Turno completo ✓');
      }
      break;
    case 'mensaje-grupo':
      if (t) {
        const turno = L.leerTurno(boton.dataset.turno);
        const conNombres = await preguntarNombres('Mensaje para el grupo');
        if (conNombres !== null) compartirTexto(textoGrupo(t, turno, conNombres));
      }
      break;
  }
});

archivoRespaldo.addEventListener('change', () => {
  const archivo = archivoRespaldo.files[0];
  archivoRespaldo.value = '';
  if (archivo) restaurar(archivo);
});

window.addEventListener('hashchange', () => mostrar());

// ---------- Tema ----------

const btnTema = document.getElementById('btn-tema');
const TEMAS = ['auto', 'claro', 'oscuro'];
function aplicarTema(tema) {
  if (tema === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = tema === 'claro' ? 'light' : 'dark';
  btnTema.textContent = { auto: '◐', claro: '☀', oscuro: '☾' }[tema];
  btnTema.title = `Tema: ${tema === 'auto' ? 'automático' : tema}`;
}
let tema = 'auto';
try { tema = localStorage.getItem('tanda.tema') || 'auto'; } catch {}
aplicarTema(tema);
btnTema.addEventListener('click', () => {
  tema = TEMAS[(TEMAS.indexOf(tema) + 1) % TEMAS.length];
  try { localStorage.setItem('tanda.tema', tema); } catch {}
  aplicarTema(tema);
});

// ---------- Inicio ----------

(async function iniciar() {
  const persistente = await almacen.iniciar();
  for (const t of await almacen.todas()) tandas.set(t.id, t);
  mostrar();
  if (!persistente) avisar('Este navegador no deja guardar: usa «Guardar respaldo»');

  vigilarVersiones();
})();

// ---------- Versión nueva ----------

/**
 * Registra el service worker y avisa cuando hay una versión nueva publicada.
 * Revisa al abrir, al volver a la app y cada 30 minutos.
 */
function vigilarVersiones() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const avisoVersion = document.getElementById('aviso-version');
  const habiaControlador = Boolean(navigator.serviceWorker.controller);
  let recargando = false;

  // Cuando la versión nueva toma el control, se recarga para usarla
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaControlador || recargando) return;
    recargando = true;
    location.reload();
  });

  const ofrecer = (trabajador) => {
    avisoVersion.hidden = false;
    document.getElementById('btn-actualizar').onclick = () => {
      document.getElementById('btn-actualizar').disabled = true;
      trabajador.postMessage('ACTUALIZAR');
    };
  };

  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) ofrecer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nuevo = reg.installing;
      nuevo?.addEventListener('statechange', () => {
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) ofrecer(nuevo);
      });
    });
    const revisar = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revisar(); });
    setInterval(revisar, 30 * 60 * 1000);
  }).catch(() => {});

  document.getElementById('btn-despues').addEventListener('click', () => { avisoVersion.hidden = true; });
}
