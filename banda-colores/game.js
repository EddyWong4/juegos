/* =========================================================
   Banda de Colores — puzzle de banda transportadora (PWA)
   Todo el juego vive aquí: generador con semilla, motor de la banda
   y los pedidos, monedas, taller de mejoras, misiones diarias,
   regalo diario, dibujo en canvas, toques, sonido, tutorial,
   guardado y pantallas. Sin librerías: solo JavaScript del navegador.
   ========================================================= */
'use strict';

// ---------------------------------------------------------
// 1. Configuración general
// ---------------------------------------------------------
const NOMBRE_JUEGO = 'Banda de Colores';
const VERSION = 'v4';                       // mantener igual que VERSION_CACHE en sw.js
const PEDIDOS = 3;
const PEDIDOS_POR_NIVEL = 5;
const ARCOIRIS = -1;                        // "color" del bloque especial
const FILA_MAX = 3;                         // bloques que caben en fila en la entrada
const FECHA_RETO_1 = Date.UTC(2026, 0, 1);  // el reto #1 fue el 1 de enero de 2026

// Reglas base. El reto diario SIEMPRE usa estas (es igual para todos);
// el modo clásico las ajusta con las mejoras compradas en el taller.
const CONFIG_BASE = {
  espacios: 12,   // espacios de la banda
  espera: 3,      // espacios de la zona de espera
  freno: 0,       // niveles de freno (cada uno: banda 6 % más lenta)
  ventana: 4,     // segundos para encadenar pedidos (combo)
  arcoiris: 0,    // niveles de "más arcoíris"
  bono: 50,       // puntos extra por pedido completado
};

// Cada color tiene además un símbolo, para distinguirlos sin depender del color
const COLORES = [
  { nombre: 'rojos',     color: '#ff5d73', simbolo: 'circulo' },
  { nombre: 'amarillos', color: '#ffc145', simbolo: 'triangulo' },
  { nombre: 'verdes',    color: '#34e0a1', simbolo: 'estrella' },
  { nombre: 'azules',    color: '#4cb8ff', simbolo: 'cuadro' },
  { nombre: 'morados',   color: '#b986ff', simbolo: 'rombo' },  // aparece en el nivel 3
];

// Dificultad por nivel (con topes para que siga siendo jugable con el dedo)
// Todo el ritmo del juego se ajusta aquí. OJO: cambiarlo cambia también los retos diarios.
const DIFICULTAD = {
  velInicial: 0.85, velPorNivel: 0.06, velMax: 1.5,       // espacios por segundo
  entradaInicial: 1.6, entradaPorNivel: 0.08, entradaMin: 0.85, // segundos entre bloques
};
const velocidadBase = (nivel) => Math.min(DIFICULTAD.velInicial + DIFICULTAD.velPorNivel * (nivel - 1), DIFICULTAD.velMax);
const intervalo = (nivel) => Math.max(DIFICULTAD.entradaInicial - DIFICULTAD.entradaPorNivel * (nivel - 1), DIFICULTAD.entradaMin);
const coloresEnNivel = (nivel) => (nivel >= 3 ? 5 : 4);

// ---------------------------------------------------------
// 2. Taller: mejoras permanentes y objetos de un solo uso
//    Se pagan con monedas que se ganan jugando (no hay dinero real).
// ---------------------------------------------------------
const MEJORAS = [
  { id: 'freno',    icono: '🐢', nombre: 'Freno',                 efecto: 'La banda va 6 % más lenta',               costos: [60, 120, 220, 360, 550] },
  { id: 'bono',     icono: '💰', nombre: 'Bono de pedido',        efecto: '+10 pts por cada pedido completado',      costos: [50, 100, 180, 300, 450] },
  { id: 'combo',    icono: '⏱️', nombre: 'Combo paciente',        efecto: '+0.5 s para encadenar pedidos',           costos: [80, 160, 300, 480] },
  { id: 'iman',     icono: '🧲', nombre: 'Imán de monedas',       efecto: '+15 % monedas en cada partida',           costos: [100, 200, 350, 550, 800] },
  { id: 'arcoiris', icono: '🌈', nombre: 'Más arcoíris',          efecto: 'Los bloques arcoíris salen más seguido',  costos: [120, 260, 450] },
  { id: 'espera',   icono: '📦', nombre: 'Zona de espera grande', efecto: '+1 espacio en la zona de espera',         costos: [150, 400] },
  { id: 'banda',    icono: '➰', nombre: 'Banda más larga',       efecto: '+2 espacios en la banda',                 costos: [200, 500] },
];
const OBJETOS = [
  { id: 'congelar', icono: '❄️', nombre: 'Congelar',            efecto: 'Detiene la banda 5 segundos',                       costo: 40 },
  { id: 'barrer',   icono: '🧹', nombre: 'Barredora',           efecto: 'Quita de la banda los bloques que nadie pide',      costo: 60 },
  { id: 'revivir',  icono: '💖', nombre: 'Segunda oportunidad', efecto: 'Al perder, sigues jugando (1 vez por partida)',    costo: 90 },
];

// ---------------------------------------------------------
// 3. Misiones diarias (3 al día, iguales para todos)
// ---------------------------------------------------------
const MISIONES = [
  { id: 'pedidos',  tipo: 'suma', metas: [15, 25, 40],     premios: [40, 60, 90],  texto: (n) => `Completa ${n} pedidos` },
  { id: 'combo',    tipo: 'max',  metas: [2, 3, 4],        premios: [30, 60, 100], texto: (n) => `Haz un combo ×${n}` },
  { id: 'arcoiris', tipo: 'suma', metas: [2, 4],           premios: [40, 70],      texto: (n) => `Toca ${n} bloques arcoíris` },
  { id: 'nivel',    tipo: 'max',  metas: [3, 4, 5],        premios: [40, 70, 110], texto: (n) => `Llega al nivel ${n} en una partida` },
  { id: 'puntos',   tipo: 'max',  metas: [500, 1000, 1800], premios: [40, 70, 120], texto: (n) => `Haz ${fmt(n)} puntos en una partida` },
  { id: 'partidas', tipo: 'suma', metas: [2, 3, 5],        premios: [30, 45, 70],  texto: (n) => `Juega ${n} partidas` },
  { id: 'bloques',  tipo: 'suma', metas: [50, 100],        premios: [40, 70],      texto: (n) => `Entrega ${n} bloques` },
];

// ---------------------------------------------------------
// 4. Guardado (prefijo propio: el sitio tiene varios juegos)
// ---------------------------------------------------------
const Almacen = {
  leer(clave, porDefecto) {
    try {
      const v = localStorage.getItem('banda_' + clave);
      return v === null ? porDefecto : JSON.parse(v);
    } catch (e) { return porDefecto; }
  },
  escribir(clave, valor) {
    try { localStorage.setItem('banda_' + clave, JSON.stringify(valor)); } catch (e) { /* sin espacio */ }
  },
  borrar(clave) {
    try { localStorage.removeItem('banda_' + clave); } catch (e) { /* nada */ }
  },
};

// ---------------------------------------------------------
// 5. Generador pseudoaleatorio con semilla (mulberry32)
// ---------------------------------------------------------
function crearRng(estadoInicial) {
  let a = estadoInicial | 0;
  return {
    siguiente() {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    get estado() { return a; },
  };
}

// ---------------------------------------------------------
// 6. Fechas (semilla AAAAMMDD en hora local)
// ---------------------------------------------------------
function claveFecha(d = new Date()) {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
function fechaDeClave(clave) {
  return new Date(Math.floor(clave / 10000), Math.floor(clave / 100) % 100 - 1, clave % 100);
}
function claveAyer(clave) {
  const d = fechaDeClave(clave);
  d.setDate(d.getDate() - 1);
  return claveFecha(d);
}
function numeroReto(clave) {
  const d = fechaDeClave(clave);
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - FECHA_RETO_1) / 86400000) + 1;
}
function textoFecha(clave) {
  return fechaDeClave(clave).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
}
function msHastaMedianoche() {
  const a = new Date();
  return new Date(a.getFullYear(), a.getMonth(), a.getDate() + 1) - a;
}
function formatoReloj(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(Math.floor(s / 3600))}:${dos(Math.floor(s / 60) % 60)}:${dos(s % 60)}`;
}
const fmt = (n) => Number(n).toLocaleString('es-MX');

// ---------------------------------------------------------
// 7. Motor del juego (sin dibujo: fácil de probar)
//    Todo el estado es un objeto simple que se guarda como JSON.
//    Hay dos generadores separados: uno para los bloques y otro para
//    los pedidos, así la secuencia no depende de cuándo toca el jugador.
// ---------------------------------------------------------
const nivelDe = (j) => 1 + Math.floor(j.completados / PEDIDOS_POR_NIVEL);
const libres = (j) => j.banda.filter((b) => !b).length;
const velocidad = (j) => velocidadBase(nivelDe(j)) * (1 - 0.06 * j.cfg.freno);
// Distancia hasta el siguiente arcoíris (≈20 bloques; menos con la mejora)
const huecoArcoiris = (j, r) => Math.max(8, 17 - 3 * j.cfg.arcoiris) + Math.floor(r * 7);

function nuevoJuego(modo, semilla, extra = {}) {
  const cfg = { ...CONFIG_BASE, ...(extra.cfg || {}) };
  const rngB = crearRng(semilla | 0);
  const rngP = crearRng((semilla ^ 0x5bd1e995) | 0);
  const j = {
    modo,                                  // 'diario' o 'clasico'
    semilla: semilla >>> 0,
    fecha: extra.fecha || null,
    cfg,
    rngB: 0, rngP: rngP.estado,
    faltaArcoiris: 0,
    tiempo: 0,                             // segundos de juego
    fase: 0,                               // cuánto ha avanzado la banda (en espacios)
    banda: new Array(cfg.espacios).fill(null), // espacio i → bloque { id, c } o null
    espera: new Array(cfg.espera).fill(null),
    pedidos: [],
    siguiente: null,
    reloj: 0,                              // segundos para el próximo bloque
    cola: 0,                               // bloques que ya debían entrar y esperan un hueco en la entrada
    congelado: 0,                          // segundos que le quedan a "Congelar"
    sigId: 1,
    puntaje: 0,
    monedas: 0,                            // monedas por pedidos (las finales se calculan al terminar)
    completados: 0,
    combo: 0,
    mejorCombo: 0,
    ultimoCompleto: -99,
    revivido: false,
    terminado: false,
    causa: null,
    ev: [],                                // eventos para las animaciones (no se guardan)
  };
  j.faltaArcoiris = huecoArcoiris(j, rngB.siguiente());
  j.rngB = rngB.estado;
  for (let i = 0; i < PEDIDOS; i++) j.pedidos.push(crearPedido(j, null));
  // El juego arranca con un bloque ya en la entrada
  j.banda[0] = nuevoBloque(j);
  j.siguiente = nuevoBloque(j);
  j.reloj = intervalo(1);
  return j;
}

// Bloque nuevo: a veces favorece los colores de los pedidos activos
// (ponderado por lo que les falta) para que siempre haya jugadas.
function nuevoBloque(j) {
  const rng = crearRng(j.rngB);
  const r1 = rng.siguiente(), r2 = rng.siguiente(), r3 = rng.siguiente();
  let c;
  j.faltaArcoiris--;
  if (j.faltaArcoiris <= 0) {
    c = ARCOIRIS;
    j.faltaArcoiris = huecoArcoiris(j, r3);
  } else if (r1 < 0.3) {
    const faltan = j.pedidos.map((p) => Math.max(1, p.n - p.lleva));
    let x = r2 * faltan.reduce((s, f) => s + f, 0);
    let k = 0;
    while (k < faltan.length - 1 && x >= faltan[k]) { x -= faltan[k]; k++; }
    c = j.pedidos[k].c;
  } else {
    c = Math.floor(r2 * coloresEnNivel(nivelDe(j)));
  }
  j.rngB = rng.estado;
  return { id: j.sigId++, c };
}

// Pedido nuevo: nunca repite el color de otro pedido activo ni el que se acaba de completar
function crearPedido(j, excluirColor) {
  const rng = crearRng(j.rngP);
  const r1 = rng.siguiente(), r2 = rng.siguiente();
  const nivel = nivelDe(j);
  const usados = new Set(j.pedidos.filter(Boolean).map((p) => p.c));
  let opciones = [];
  for (let c = 0; c < coloresEnNivel(nivel); c++) if (!usados.has(c) && c !== excluirColor) opciones.push(c);
  if (!opciones.length) for (let c = 0; c < coloresEnNivel(nivel); c++) if (!usados.has(c)) opciones.push(c);
  j.rngP = rng.estado;
  return {
    c: opciones[Math.floor(r1 * opciones.length)],
    n: nivel >= 5 ? 4 + Math.floor(r2 * 2) : 3,   // desde el nivel 5: 4 o 5 bloques
    lleva: 0,
  };
}

// Avanza el juego dt segundos: mueve la banda y hace entrar bloques
function paso(j, dt) {
  if (j.terminado) return;
  j.tiempo += dt;
  if (j.congelado > 0) { j.congelado = Math.max(0, j.congelado - dt); return; } // banda detenida
  const n = j.cfg.espacios;
  const antes = j.fase;
  j.fase += velocidad(j) * dt;

  // ¿Toca que entre un bloque? El reloj de entrada NO se detiene: si la entrada
  // está ocupada, los bloques hacen fila. Así, si el jugador se atrasa, la banda
  // se llena de verdad (antes se "autorregulaba" y casi nunca se perdía).
  j.reloj -= dt;
  while (j.reloj <= 0) {
    if (libres(j) === 0) { perder(j, 'banda'); return; }
    j.cola++;
    j.reloj += intervalo(nivelDe(j));
    // Si la fila de la entrada se desborda, la entrada se atasca y se pierde
    if (j.cola > FILA_MAX) { perder(j, 'entrada'); return; }
  }

  // Cada vez que un espacio pasa por la entrada, puede recibir el primer bloque de la fila.
  // El espacio i está en la posición (i + fase) mod n; la entrada es la posición 0.
  for (let k = Math.floor(antes) + 1; k <= Math.floor(j.fase); k++) {
    const i = (((-k) % n) + n) % n;
    if (j.cola > 0 && !j.banda[i]) {
      j.banda[i] = j.siguiente;
      j.siguiente = nuevoBloque(j);
      j.cola--;
      j.ev.push({ t: 'entra', i, libres: libres(j) });
    }
  }
  // Evita que el número crezca sin fin (sin cambiar la posición de los espacios)
  if (j.fase >= n * 1000) j.fase -= n * 1000;
}

// El jugador toca el bloque del espacio i. Devuelve a dónde fue.
function tocarBloque(j, i) {
  const b = j.banda[i];
  if (!b || j.terminado) return null;
  j.banda[i] = null;
  let idx = -1;
  if (b.c === ARCOIRIS) {
    // Va al pedido más cerca de completarse (el que menos le falta)
    idx = 0;
    j.pedidos.forEach((p, k) => { if (p.n - p.lleva < j.pedidos[idx].n - j.pedidos[idx].lleva) idx = k; });
  } else {
    idx = j.pedidos.findIndex((p) => p.c === b.c);
  }
  if (idx >= 0) {
    const pedidoAntes = { ...j.pedidos[idx] };
    entregar(j, idx);
    return { destino: 'pedido', idx, bloque: b, pedido: pedidoAntes };
  }
  // Ningún pedido es de ese color: a la zona de espera (rompe el combo)
  const k = j.espera.indexOf(null);
  j.combo = 0;
  j.ultimoCompleto = -99;
  if (k < 0) { perder(j, 'espera'); return { destino: 'fuera', bloque: b }; }
  j.espera[k] = b;
  return { destino: 'espera', k, bloque: b };
}

function entregar(j, idx) {
  const p = j.pedidos[idx];
  p.lleva++;
  j.puntaje += 10;
  if (p.lleva >= p.n) completar(j, idx);
}

function completar(j, idx) {
  const viejo = j.pedidos[idx];
  const nivelAntes = nivelDe(j);
  j.completados++;
  j.combo = j.tiempo - j.ultimoCompleto < j.cfg.ventana ? j.combo + 1 : 1;
  j.ultimoCompleto = j.tiempo;
  j.mejorCombo = Math.max(j.mejorCombo, j.combo);
  const extra = j.cfg.bono * j.combo;
  j.puntaje += extra;
  j.monedas += j.combo; // 1 moneda por pedido, más con combo
  j.ev.push({ t: 'completo', idx, viejo: { ...viejo }, combo: j.combo, extra });
  if (nivelDe(j) > nivelAntes) j.ev.push({ t: 'nivel', nivel: nivelDe(j) });

  j.pedidos[idx] = null;
  j.pedidos[idx] = crearPedido(j, viejo.c);
  // Los bloques en espera de ese color pasan solos al pedido nuevo
  const nuevo = j.pedidos[idx];
  for (let k = 0; k < j.espera.length; k++) {
    const b = j.espera[k];
    if (b && b.c === nuevo.c && j.pedidos[idx] === nuevo && nuevo.lleva < nuevo.n) {
      j.espera[k] = null;
      j.ev.push({ t: 'traspaso', k, idx, bloque: b });
      entregar(j, idx); // puede completar otra vez (y así en cadena)
    }
  }
}

const TEXTO_CAUSA = {
  banda: 'La banda se llenó.',
  espera: 'La zona de espera se llenó.',
  entrada: 'Se atascó la entrada: había demasiados bloques en fila.',
};
const LETRERO_CAUSA = { banda: '¡La banda se llenó!', espera: '¡Zona de espera llena!', entrada: '¡Se atascó la entrada!' };

function perder(j, causa) {
  if (j.terminado) return;
  j.terminado = true;
  j.causa = causa;
  j.ev.push({ t: 'perdio', causa });
}

// --- Objetos (poderes) ---
function congelar(j, segundos = 5) { j.congelado = Math.max(j.congelado, segundos); }

// Quita los bloques cuyo color no pide ningún pedido (el arcoíris se queda)
function barrer(j) {
  const pedidos = new Set(j.pedidos.map((p) => p.c));
  const quitados = [];
  j.banda.forEach((b, i) => {
    if (b && b.c !== ARCOIRIS && !pedidos.has(b.c)) { quitados.push({ i, bloque: b }); j.banda[i] = null; }
  });
  return quitados;
}

// Segunda oportunidad: libera espacio y sigue la partida
function revivir(j) {
  if (j.causa === 'espera') {
    j.espera.fill(null);
  } else {
    // Deja al menos la mitad de la banda libre (primero quita lo que nadie pide)
    barrer(j);
    for (let i = 0; i < j.banda.length && libres(j) < j.banda.length / 2; i++) j.banda[i] = null;
  }
  j.terminado = false;
  j.causa = null;
  j.revivido = true;
  j.cola = 0;
  j.reloj = intervalo(nivelDe(j));
  j.congelado = 2; // un respiro para reaccionar
}

// Monedas que da la partida: por pedidos + por puntaje, con imán y bono del diario
function monedasDePartida(j, iman) {
  const base = j.monedas + Math.floor(j.puntaje / 40);
  return Math.round(base * (1 + 0.15 * iman) * (j.modo === 'diario' ? 2 : 1));
}

// ---------------------------------------------------------
// 8. Perfil del jugador: monedas, mejoras, objetos, misiones, regalo
// ---------------------------------------------------------
const PERFIL_INICIAL = {
  monedas: 0,
  mejoras: {},
  objetos: { congelar: 1, barrer: 1, revivir: 1 }, // de regalo para probarlos
  regalo: { ultima: 0, racha: 0 },
  misiones: null,
};
let perfil = { ...PERFIL_INICIAL, ...Almacen.leer('perfil', {}) };
perfil.objetos = { ...PERFIL_INICIAL.objetos, ...perfil.objetos };
const guardarPerfil = () => Almacen.escribir('perfil', perfil);

const nivelMejora = (id) => perfil.mejoras[id] || 0;
function costoMejora(m) {
  const n = nivelMejora(m.id);
  return n < m.costos.length ? m.costos[n] : null;
}
// Reglas del modo clásico según las mejoras compradas
function configClasico() {
  return {
    espacios: 12 + 2 * nivelMejora('banda'),
    espera: 3 + nivelMejora('espera'),
    freno: nivelMejora('freno'),
    ventana: 4 + 0.5 * nivelMejora('combo'),
    arcoiris: nivelMejora('arcoiris'),
    bono: 50 + 10 * nivelMejora('bono'),
  };
}
function hayAlgoQueComprar() {
  return MEJORAS.some((m) => { const c = costoMejora(m); return c != null && c <= perfil.monedas; });
}
// La mejora más barata que aún no está al máximo (para animar a seguir jugando)
function siguienteMejora() {
  let mejor = null;
  for (const m of MEJORAS) {
    const c = costoMejora(m);
    if (c != null && (!mejor || c < mejor.costo)) mejor = { m, costo: c };
  }
  return mejor;
}

function misionesDeHoy() {
  const hoy = claveFecha();
  if (!perfil.misiones || perfil.misiones.fecha !== hoy) {
    // Se eligen con la fecha como semilla: todos tienen las mismas misiones
    const rng = crearRng(hoy ^ 0x2545f491);
    const disponibles = MISIONES.slice();
    const lista = [];
    while (lista.length < 3) {
      const m = disponibles.splice(Math.floor(rng.siguiente() * disponibles.length), 1)[0];
      const d = Math.floor(rng.siguiente() * m.metas.length);
      lista.push({ id: m.id, meta: m.metas[d], premio: m.premios[d] });
    }
    perfil.misiones = { fecha: hoy, lista, progreso: {}, reclamada: [false, false, false] };
    guardarPerfil();
  }
  return perfil.misiones;
}
const textoMision = (mi) => MISIONES.find((m) => m.id === mi.id).texto(mi.meta);

// Suma progreso a las misiones de hoy; avisa cuando se cumple una
function registrar(id, valor) {
  const ms = misionesDeHoy();
  ms.lista.forEach((mi) => {
    if (mi.id !== id) return;
    const tipo = MISIONES.find((m) => m.id === id).tipo;
    const antes = ms.progreso[id] || 0;
    const ahora = tipo === 'suma' ? antes + valor : Math.max(antes, valor);
    ms.progreso[id] = ahora;
    if (antes < mi.meta && ahora >= mi.meta) {
      aviso(`✓ Misión cumplida: ${textoMision(mi)}`);
      Sonido.moneda();
    }
  });
  guardarPerfil();
}
function misionesPorReclamar() {
  const ms = misionesDeHoy();
  return ms.lista.filter((mi, k) => !ms.reclamada[k] && (ms.progreso[mi.id] || 0) >= mi.meta).length;
}

// Regalo diario: crece si se abre varios días seguidos
const regaloDisponible = () => perfil.regalo.ultima !== claveFecha();
function premioRegalo() {
  const hoy = claveFecha();
  const racha = perfil.regalo.ultima === claveAyer(hoy) ? perfil.regalo.racha + 1 : 1;
  return { racha, monedas: 20 + 10 * Math.min(racha - 1, 8) };
}

// ---------------------------------------------------------
// 9. Estado de la app y guardado de partidas
// ---------------------------------------------------------
let juego = null;
let pantalla = 'inicio';     // 'inicio' | 'juego' | 'resultado'
let pausa = false;
let tutorial = 0;            // 0 = sin tutorial; 1, 2, 3 = paso
let esperandoRevivir = false;
let ultimoResultado = null;

function guardarPartida() {
  if (!juego || juego.terminado) return;
  Almacen.escribir('partida_' + juego.modo, { ...juego, ev: [] });
}
function partidaGuardada(modo) {
  const j = Almacen.leer('partida_' + modo, null);
  if (!j || j.terminado || !Array.isArray(j.banda)) return null;
  if (modo === 'diario' && j.fecha !== claveFecha()) { Almacen.borrar('partida_diario'); return null; }
  // Partidas guardadas con la versión 1 (sin mejoras)
  j.cfg = { ...CONFIG_BASE, ...(j.cfg || {}), espacios: j.banda.length, espera: j.espera.length };
  j.monedas = j.monedas || 0;
  j.congelado = j.congelado || 0;
  if (j.cola == null) j.cola = j.pendiente ? 1 : 0;
  delete j.pendiente;
  j.ev = [];
  return j;
}
function resultadoDeHoy() {
  const r = Almacen.leer('resultado_diario', null);
  return r && r.fecha === claveFecha() ? r : null;
}
function leerRacha() { return Almacen.leer('racha', { ultima: 0, actual: 0, mejor: 0 }); }
function rachaVigente() {
  const r = leerRacha(), hoy = claveFecha();
  return r.ultima === hoy || r.ultima === claveAyer(hoy) ? r.actual : 0;
}
function registrarDiaJugado(clave) {
  const r = leerRacha();
  if (r.ultima !== clave) {
    r.actual = r.ultima === claveAyer(clave) ? r.actual + 1 : 1;
    r.ultima = clave;
    r.mejor = Math.max(r.mejor, r.actual);
    Almacen.escribir('racha', r);
  }
}

// ---------------------------------------------------------
// 10. Canvas: medidas, nitidez y geometría de la banda
// ---------------------------------------------------------
const $ = (id) => document.getElementById(id);
const lienzo = $('lienzo');
const ctx = lienzo.getContext('2d');
const FUENTE = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
let dpr = 1;
let L = null;
const sprites = new Map();
const espaciosActuales = () => (juego ? juego.cfg.espacios : CONFIG_BASE.espacios);

function recalcularLayout() {
  const zona = $('zona');
  const w = zona.clientWidth, h = zona.clientHeight;
  if (!w || !h) return;
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  lienzo.width = Math.round(w * dpr);
  lienzo.height = Math.round(h * dpr);
  lienzo.style.width = w + 'px';
  lienzo.style.height = h + 'px';

  const m = 12;
  const ancho = Math.min(w - m * 2, 456);   // todo cabe en máx. 480 px con márgenes
  const x0 = Math.round((w - ancho) / 2);
  let alto = Math.min(ancho * 0.62, h * 0.42);
  let G;
  // Se ajusta el alto de la banda hasta que todo quepa en la pantalla
  for (let intento = 0; intento < 12; intento++) {
    G = geometria(ancho, alto, espaciosActuales());
    const necesario = m + G.b * 1.3 + G.H + G.pista + 32 + G.be + 16 + 100 + m;
    if (necesario <= h) break;
    alto *= 0.9;
  }
  const yTope = m + G.b * 1.3;                             // espacio para la entrada
  const cx = x0 + ancho / 2;
  const cy = yTope + G.pista / 2 + G.R;
  const yEspera = cy + G.R + G.pista / 2 + 32 + G.be / 2;  // centro de la zona de espera
  const yPedidos = yEspera + G.be / 2 + 16;
  const altoPedidos = Math.min(170, h - m - yPedidos);
  const anchoPedido = (ancho - 20) / 3;
  L = { w, h, x0, ancho, cx, cy, ...G, yEspera, yPedidos, altoPedidos, anchoPedido };
  sprites.clear();
}

// Óvalo tipo estadio: dos rectas y dos semicírculos
function geometria(ancho, alto, espacios) {
  let b = 50;
  let W, Hc, R, S, P;
  for (let k = 0; k < 3; k++) {
    const pista = b * 1.3;
    W = ancho - pista;
    Hc = Math.max(40, alto - pista);
    R = Hc / 2;
    S = Math.max(0, W - 2 * R);
    P = 2 * S + 2 * Math.PI * R;
    b = Math.max(28, Math.min(62, (P / espacios) * 0.72));
  }
  // La zona de espera puede tener hasta 5 espacios: que quepan a lo ancho
  const be = Math.min(b * 1.05, ancho / 6.2);
  return { b, pista: b * 1.3, R, S, P, H: Hc, be };
}

// Punto de la banda para una posición 0..n (la entrada está arriba al centro)
function puntoBanda(pos) {
  const { P, S, R, cx, cy } = L;
  const n = espaciosActuales();
  let d = ((((pos % n) + n) % n) / n) * P;
  d = (d + S / 2) % P; // empezar en el centro de la recta de arriba
  if (d < S) return { x: cx - S / 2 + d, y: cy - R };
  d -= S;
  if (d < Math.PI * R) { const a = -Math.PI / 2 + d / R; return { x: cx + S / 2 + R * Math.cos(a), y: cy + R * Math.sin(a) }; }
  d -= Math.PI * R;
  if (d < S) return { x: cx + S / 2 - d, y: cy + R };
  d -= S;
  const a = Math.PI / 2 + d / R;
  return { x: cx - S / 2 + R * Math.cos(a), y: cy + R * Math.sin(a) };
}

function centroEspera(k) {
  const n = juego ? juego.espera.length : 3;
  return { x: L.cx + (k - (n - 1) / 2) * L.be * 1.3, y: L.yEspera };
}
function rectPedido(idx) {
  return { x: L.x0 + idx * (L.anchoPedido + 10), y: L.yPedidos, w: L.anchoPedido, h: L.altoPedidos };
}
function centroIconoPedido(idx) {
  const r = rectPedido(idx);
  return { x: r.x + r.w / 2, y: r.y + r.h * 0.32 };
}

function rutaRedondeada(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function pintarSimbolo(g, tipo, cx, cy, m) {
  g.beginPath();
  switch (tipo) {
    case 'circulo': g.arc(cx, cy, m * 0.8, 0, Math.PI * 2); break;
    case 'triangulo': g.moveTo(cx, cy - m * 0.9); g.lineTo(cx + m * 0.95, cy + m * 0.7); g.lineTo(cx - m * 0.95, cy + m * 0.7); g.closePath(); break;
    case 'cuadro': g.rect(cx - m * 0.72, cy - m * 0.72, m * 1.44, m * 1.44); break;
    case 'rombo': g.moveTo(cx, cy - m); g.lineTo(cx + m * 0.85, cy); g.lineTo(cx, cy + m); g.lineTo(cx - m * 0.85, cy); g.closePath(); break;
    case 'estrella':
      for (let k = 0; k < 10; k++) {
        const r = k % 2 ? m * 0.45 : m * 1.0;
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        k ? g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) : g.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
      g.closePath(); break;
    case 'destello': // estrella de 4 puntas para el arcoíris
      for (let k = 0; k < 8; k++) {
        const r = k % 2 ? m * 0.3 : m * 1.05;
        const a = -Math.PI / 2 + (k * Math.PI) / 4;
        k ? g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) : g.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
      g.closePath(); break;
  }
  g.fill();
}

// Cada color se pinta una vez en un canvas pequeño y luego se copia (rápido)
function sprite(c) {
  const px = Math.max(16, Math.round(Math.max(L.b, L.be) * dpr));
  const clave = c + '_' + px;
  if (sprites.has(clave)) return sprites.get(clave);
  const s = document.createElement('canvas');
  s.width = s.height = px;
  const g = s.getContext('2d');
  const sep = px * 0.04, t = px - sep * 2, r = t * 0.24;
  if (c === ARCOIRIS) {
    const gr = g.createLinearGradient(0, 0, px, px);
    COLORES.forEach((col, k) => gr.addColorStop(k / (COLORES.length - 1), col.color));
    g.fillStyle = '#6b4fa8';
    rutaRedondeada(g, sep, sep, t, t, r); g.fill();
    g.fillStyle = gr;
    rutaRedondeada(g, sep, sep, t, t * 0.88, r); g.fill();
  } else {
    g.fillStyle = mezclar(COLORES[c].color, 0.4);
    rutaRedondeada(g, sep, sep, t, t, r); g.fill();
    g.fillStyle = COLORES[c].color;
    rutaRedondeada(g, sep, sep, t, t * 0.88, r); g.fill();
  }
  // brillo superior
  const br = g.createLinearGradient(0, sep, 0, sep + t * 0.5);
  br.addColorStop(0, 'rgba(255,255,255,0.45)');
  br.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = br;
  rutaRedondeada(g, sep + t * 0.08, sep + t * 0.05, t * 0.84, t * 0.4, r * 0.7); g.fill();
  // símbolo
  if (c === ARCOIRIS) { g.fillStyle = '#ffffff'; pintarSimbolo(g, 'destello', px / 2, px * 0.47, t * 0.3); }
  else { g.fillStyle = 'rgba(20,18,43,0.78)'; pintarSimbolo(g, COLORES[c].simbolo, px / 2, px * 0.47, t * 0.24); }
  sprites.set(clave, s);
  return s;
}
function mezclar(hex, oscuro) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - oscuro))).join(',')})`;
}

// Dibuja un bloque centrado en (x, y) con tamaño s
function dibujarBloque(x, y, s, c, alfa = 1) {
  if (alfa <= 0 || s <= 0) return;
  ctx.globalAlpha = alfa;
  ctx.drawImage(sprite(c), x - s / 2, y - s / 2, s, s);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------
// 11. Animaciones y bucle principal
// ---------------------------------------------------------
let reloj = 0;            // ms de animación (se detiene en pausa)
let ultimoCuadro = 0;
let vuelos = [];          // bloques volando a su destino
let particulas = [];
let textos = [];
let tarjetas = [null, null, null];  // animación de pedido completado
let puntajeMostrado = 0;
let monedasMostradas = 0;

const facilSalida = (t) => 1 - Math.pow(1 - t, 3);
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));

function bucle(ahora) {
  // Tiempo real transcurrido: la banda va igual de rápido en cualquier teléfono
  const dt = Math.min(50, ahora - (ultimoCuadro || ahora));
  ultimoCuadro = ahora;
  if (juego && pantalla === 'juego' && !pausa && !esperandoRevivir) {
    reloj += dt;
    // El tutorial congela la banda; pero si en el paso 1 no hay ningún bloque
    // que tocar (p. ej. al reanudar una partida), la banda sigue hasta que entre uno
    const congelada = tutorial && !(tutorial === 1 && libres(juego) === juego.banda.length);
    if (!congelada && !juego.terminado) {
      paso(juego, dt / 1000);
      if (juego.tiempo % 2 < dt / 1000) guardarPartida(); // cada ~2 s
    }
    procesarEventos();
  }
  if (L) dibujar(ahora);
  if (juego) {
    if (puntajeMostrado !== juego.puntaje) {
      const dif = juego.puntaje - puntajeMostrado;
      puntajeMostrado += Math.sign(dif) * Math.max(1, Math.ceil(Math.abs(dif) * 0.15));
      if (Math.sign(juego.puntaje - puntajeMostrado) !== Math.sign(dif)) puntajeMostrado = juego.puntaje;
      $('hud-puntaje').textContent = fmt(puntajeMostrado);
    }
    const monedas = monedasDePartida(juego, juego.modo === 'diario' ? 0 : nivelMejora('iman'));
    if (monedas !== monedasMostradas) {
      monedasMostradas = monedas;
      $('hud-monedas').textContent = fmt(monedas);
    }
  }
  requestAnimationFrame(bucle);
}

// Convierte los eventos del motor en animaciones, sonidos, misiones y vibración
function procesarEventos() {
  const eventos = juego.ev.splice(0);
  for (const e of eventos) {
    if (e.t === 'entra') {
      if (e.libres <= 2 || juego.cola >= FILA_MAX - 1) Sonido.alerta();
    } else if (e.t === 'completo') {
      tarjetas[e.idx] = { t0: reloj + 200, viejo: e.viejo }; // tras el vuelo de 200 ms
      const c = centroIconoPedido(e.idx);
      const color = COLORES[e.viejo.c].color;
      setTimeoutJuego(() => {
        for (let k = 0; k < 26; k++) {
          const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 220;
          particulas.push({ x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, color, t0: reloj, vida: 600 + Math.random() * 300 });
        }
        // Monedas que saltan del pedido
        for (let k = 0; k < Math.min(6, 1 + e.combo); k++) {
          particulas.push({ x: c.x, y: c.y, vx: (Math.random() - 0.5) * 160, vy: -200 - Math.random() * 120, color: '#ffd23f', t0: reloj, vida: 700, moneda: true });
        }
        textos.push({ texto: `+${10 * e.viejo.n + e.extra}` + (e.combo >= 2 ? ` ×${e.combo}` : ''), x: c.x, y: c.y - L.b * 0.6, t0: reloj, dur: 900, color: e.combo >= 2 ? '#ffc145' : '#ffffff' });
        Sonido.completo(e.combo);
        vibrar(e.combo >= 2 ? [30, 40, 60] : 40);
      }, 200);
      registrar('pedidos', 1);
      registrar('combo', e.combo);
      registrar('puntos', juego.puntaje);
      actualizarHud(true);
    } else if (e.t === 'traspaso') {
      // De la zona de espera al pedido nuevo (después de su animación)
      const desde = centroEspera(e.k);
      vuelos.push({ c: e.bloque.c, x: desde.x, y: desde.y, s0: L.be, idx: e.idx, t0: reloj + 520, dur: 220 });
      registrar('bloques', 1);
    } else if (e.t === 'nivel') {
      const extra = e.nivel === 3 ? ' · nuevo color' : e.nivel === 5 ? ' · pedidos más grandes' : '';
      textos.push({ texto: `¡Nivel ${e.nivel}!${extra}`, x: L.cx, y: L.cy, t0: reloj + 300, dur: 1600, color: '#c6f432', grande: true });
      setTimeoutJuego(() => Sonido.nivel(), 300);
      registrar('nivel', e.nivel);
    } else if (e.t === 'perdio') {
      if (puedeRevivir()) ofrecerRevivir(); else terminar();
    }
  }
}

// Temporizador que respeta la pausa (usa el reloj de animación)
let pendientesReloj = [];
function setTimeoutJuego(fn, ms) { pendientesReloj.push({ fn, t: reloj + ms }); }
function correrTemporizadores() {
  const listos = pendientesReloj.filter((p) => reloj >= p.t);
  pendientesReloj = pendientesReloj.filter((p) => reloj < p.t);
  listos.forEach((p) => p.fn());
}

function dibujar(ahora) {
  correrTemporizadores();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, L.w, L.h);
  if (!juego) return;
  const j = juego;
  const { b, cx, cy, R, S } = L;
  const espaciado = L.P / j.banda.length;

  // --- Banda (pista) ---
  const peligro = (libres(j) <= 2 || j.cola >= FILA_MAX - 1) && !j.terminado;
  const helada = j.congelado > 0;
  const parpadeo = peligro ? 0.5 + 0.5 * Math.sin(reloj / 120) : 0;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - S / 2, cy - R);
  ctx.lineTo(cx + S / 2, cy - R);
  ctx.arc(cx + S / 2, cy, R, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(cx - S / 2, cy + R);
  ctx.arc(cx - S / 2, cy, R, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
  ctx.lineWidth = L.pista;
  ctx.strokeStyle = helada ? '#2b5f8f'
    : peligro ? `rgb(${Math.round(44 + 140 * parpadeo)},${Math.round(42 - 10 * parpadeo)},${Math.round(88 - 30 * parpadeo)})` : '#2c2a58';
  ctx.stroke();
  // Rayas que avanzan con la banda (se nota el movimiento)
  ctx.setLineDash([4, espaciado / 2 - 4]);
  ctx.lineDashOffset = -((j.fase * espaciado) % espaciado) - (L.S / 2) % espaciado;
  ctx.lineWidth = L.pista * 0.86;
  ctx.strokeStyle = helada ? 'rgba(200,235,255,0.25)' : peligro ? `rgba(255,120,130,${0.25 + 0.3 * parpadeo})` : 'rgba(255,255,255,0.07)';
  ctx.stroke();
  ctx.restore();

  // --- Entrada y siguiente bloque ---
  const ent = puntoBanda(0);
  ctx.fillStyle = '#29275a';
  rutaRedondeada(ctx, ent.x - b * 0.62, ent.y - L.pista / 2 - b * 1.18, b * 1.24, b * 1.12, 10);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `700 ${Math.round(Math.max(10, b * 0.2))}px ${FUENTE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (j.siguiente) {
    // Si hay bloques esperando lugar, la vista previa parpadea y muestra la fila
    const alfa = j.cola > 0 ? 0.55 + 0.45 * Math.sin(reloj / 90) : 1;
    dibujarBloque(ent.x, ent.y - L.pista / 2 - b * 0.62, b * 0.78, j.siguiente.c, alfa);
    if (j.cola >= 1) {
      const bx = ent.x + b * 0.62 + 4, by = ent.y - L.pista / 2 - b * 1.1;
      ctx.fillStyle = '#ff4d5e';
      rutaRedondeada(ctx, bx, by, b * 0.7, b * 0.42, b * 0.21); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `900 ${Math.round(Math.max(11, b * 0.26))}px ${FUENTE}`;
      ctx.fillText(`${j.cola}/${FILA_MAX}`, bx + b * 0.35, by + b * 0.21);
      ctx.font = `700 ${Math.round(Math.max(10, b * 0.2))}px ${FUENTE}`;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
    }
  }
  ctx.textAlign = 'right';
  ctx.fillText('SIGUIENTE', ent.x - b * 0.62 - 8, ent.y - L.pista / 2 - b * 0.62);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(198,244,50,0.85)';
  ctx.beginPath();
  ctx.moveTo(ent.x - 7, ent.y - L.pista / 2 - 6);
  ctx.lineTo(ent.x + 7, ent.y - L.pista / 2 - 6);
  ctx.lineTo(ent.x, ent.y - L.pista / 2 + 3);
  ctx.closePath();
  ctx.fill();

  // --- Bloques en la banda ---
  for (let i = 0; i < j.banda.length; i++) {
    const p = puntoBanda(i + j.fase);
    if (j.banda[i]) dibujarBloque(p.x, p.y, b, j.banda[i].c);
    else {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.arc(p.x, p.y, b * 0.12, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Texto central: espacios libres o banda congelada (al perder, ahí va el letrero de fin)
  if (!j.terminado) {
    ctx.font = `800 ${Math.round(b * 0.42)}px ${FUENTE}`;
    if (helada) {
      ctx.fillStyle = '#9fdcff';
      ctx.fillText(`❄ ${Math.ceil(j.congelado)} s`, cx, cy + b * 0.15);
    } else {
      ctx.fillStyle = peligro ? `rgba(255,${Math.round(110 + 80 * (1 - parpadeo))},120,1)` : 'rgba(255,255,255,0.35)';
      ctx.fillText(`${libres(j)} libres`, cx, cy + b * 0.15);
    }
  }

  // --- Zona de espera ---
  ctx.font = `700 ${Math.round(Math.max(11, b * 0.22))}px ${FUENTE}`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('ESPERA', cx, L.yEspera - L.be / 2 - 11);
  for (let k = 0; k < j.espera.length; k++) {
    const c = centroEspera(k);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    rutaRedondeada(ctx, c.x - L.be / 2, c.y - L.be / 2, L.be, L.be, 12);
    ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    // (si el bloque todavía va volando hacia aquí, se dibuja al aterrizar)
    const enEspera = j.espera[k];
    if (enEspera && !vuelos.some((v) => v.id === enEspera.id && v.k === k)) dibujarBloque(c.x, c.y, L.be * 0.9, enEspera.c);
  }

  // --- Pedidos ---
  for (let idx = 0; idx < PEDIDOS; idx++) dibujarPedido(idx);

  // --- Bloques volando (unos 200 ms) ---
  vuelos = vuelos.filter((v) => reloj - v.t0 < v.dur);
  for (const v of vuelos) {
    const t = limitar((reloj - v.t0) / v.dur, 0, 1);
    const destino = v.idx != null ? centroIconoPedido(v.idx) : centroEspera(v.k);
    const e = facilSalida(t);
    const x = v.x + (destino.x - v.x) * e;
    const y = v.y + (destino.y - v.y) * e - Math.sin(Math.PI * t) * 30; // pequeño arco
    dibujarBloque(x, y, v.s0 * (1 - 0.25 * e), v.c);
  }

  // --- Partículas (y monedas) ---
  particulas = particulas.filter((p) => reloj - p.t0 < p.vida);
  for (const p of particulas) {
    const t = (reloj - p.t0) / 1000;
    const x = p.x + p.vx * t, y = p.y + p.vy * t + (p.moneda ? 600 : 300) * t * t;
    ctx.globalAlpha = 1 - (reloj - p.t0) / p.vida;
    ctx.fillStyle = p.color;
    if (p.moneda) {
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b8860b';
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }
  }
  ctx.globalAlpha = 1;

  // --- Textos flotantes ---
  textos = textos.filter((tx) => reloj - tx.t0 < tx.dur);
  for (const tx of textos) {
    const k = (reloj - tx.t0) / tx.dur;
    if (k < 0) continue;
    ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    ctx.font = `900 ${Math.round(tx.grande ? b * 0.5 : b * 0.42)}px ${FUENTE}`;
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(12,11,30,0.9)';
    const y = tx.y - 30 * facilSalida(k);
    ctx.strokeText(tx.texto, tx.x, y);
    ctx.fillStyle = tx.color;
    ctx.fillText(tx.texto, tx.x, y);
    ctx.globalAlpha = 1;
  }

  // --- Tutorial: una mano que señala ---
  if (tutorial) dibujarMano(ahora);

  // --- Fin de partida ---
  if (j.terminado && j.finReloj != null) {
    const k = limitar((reloj - j.finReloj) / 500, 0, 1);
    ctx.fillStyle = `rgba(10,9,26,${0.55 * k})`;
    ctx.fillRect(0, 0, L.w, L.h);
    ctx.globalAlpha = k;
    ctx.font = `900 ${Math.round(b * 0.55)}px ${FUENTE}`;
    ctx.fillStyle = '#ff7b88';
    ctx.fillText(LETRERO_CAUSA[j.causa] || '', cx, cy);
    ctx.globalAlpha = 1;
  }
}

function dibujarPedido(idx) {
  const j = juego;
  const r = rectPedido(idx);
  const anim = tarjetas[idx];
  let p = j.pedidos[idx];
  let destello = 0, escala = 1;
  if (anim) {
    const e = reloj - anim.t0;
    if (e < 0) p = { ...anim.viejo, lleva: anim.viejo.n };          // aún llega el último bloque
    else if (e < 320) { p = { ...anim.viejo, lleva: anim.viejo.n }; destello = 1 - e / 320; }
    else if (e < 520) escala = 0.8 + 0.2 * facilSalida((e - 320) / 200);
    else tarjetas[idx] = null;
  }
  const col = COLORES[p.c];
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.scale(escala, escala);
  ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
  ctx.fillStyle = '#1e1c42';
  rutaRedondeada(ctx, r.x, r.y, r.w, r.h, 16); ctx.fill();
  ctx.strokeStyle = col.color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.6;
  ctx.stroke();
  ctx.globalAlpha = 1;
  const ic = centroIconoPedido(idx);
  const tamIcono = Math.min(r.w * 0.42, r.h * 0.38);
  dibujarBloque(ic.x, ic.y, tamIcono, p.c);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${Math.round(Math.min(26, r.h * 0.17))}px ${FUENTE}`;
  ctx.fillText(`${p.lleva} / ${p.n}`, r.x + r.w / 2, r.y + r.h * 0.64);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `700 ${Math.round(Math.min(14, r.h * 0.1))}px ${FUENTE}`;
  ctx.fillText(`${p.n} ${col.nombre}`, r.x + r.w / 2, r.y + r.h * 0.78);
  const tc = Math.min(12, (r.w - 20) / p.n - 4);
  const x0 = r.x + r.w / 2 - (p.n * (tc + 4) - 4) / 2;
  for (let k = 0; k < p.n; k++) {
    ctx.fillStyle = k < p.lleva ? col.color : 'rgba(255,255,255,0.12)';
    rutaRedondeada(ctx, x0 + k * (tc + 4), r.y + r.h * 0.88, tc, Math.max(5, tc * 0.5), 3);
    ctx.fill();
  }
  if (destello > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.7 * destello})`;
    rutaRedondeada(ctx, r.x, r.y, r.w, r.h, 16); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------
// 12. Controles: solo toques (Pointer Events; también ratón)
// ---------------------------------------------------------
function posicionLocal(e) {
  const rect = lienzo.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// Bloque de la banda más cercano al toque, dentro de un área generosa
function bloqueEn(x, y) {
  const radio = Math.max(L.b * 0.8, 30); // área sensible de al menos 60 px de diámetro
  let mejor = -1, dist = Infinity;
  for (let i = 0; i < juego.banda.length; i++) {
    if (!juego.banda[i]) continue;
    const p = puntoBanda(i + juego.fase);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < radio && d < dist) { dist = d; mejor = i; }
  }
  return mejor;
}

lienzo.addEventListener('pointerdown', (e) => {
  Sonido.preparar();
  if (!juego || !L || pantalla !== 'juego' || pausa || esperandoRevivir || juego.terminado) return;
  if (tutorial && tutorial !== 1) return; // en los pasos 2 y 3 se usa el botón
  e.preventDefault();
  const { x, y } = posicionLocal(e);
  const i = bloqueEn(x, y);
  if (i < 0) return;
  const desde = puntoBanda(i + juego.fase);
  const res = tocarBloque(juego, i); // sale de la banda en este instante
  if (!res) return;
  Sonido.tocar();
  if (res.bloque.c === ARCOIRIS) registrar('arcoiris', 1);
  if (res.destino === 'pedido') {
    vuelos.push({ c: res.bloque.c, x: desde.x, y: desde.y, s0: L.b, idx: res.idx, t0: reloj, dur: 200 });
    setTimeoutJuego(() => Sonido.entregar(res.pedido.lleva + 1, res.pedido.n), 190);
    registrar('bloques', 1);
  } else if (res.destino === 'espera') {
    vuelos.push({ c: res.bloque.c, id: res.bloque.id, x: desde.x, y: desde.y, s0: L.b, k: res.k, t0: reloj, dur: 200 });
    actualizarHud(false);
  }
  if (tutorial === 1) { ultimoDestinoTutorial = res; setTimeoutJuego(() => pasoTutorial(2), 350); }
  guardarPartida();
});
lienzo.addEventListener('contextmenu', (e) => e.preventDefault());

function vibrar(patron) {
  try { if (navigator.vibrate) navigator.vibrate(patron); } catch (e) { /* no soportado */ }
}

// ---------------------------------------------------------
// 13. Objetos durante la partida (solo en modo clásico)
//     Si no te quedan, el botón muestra el precio y lo compra al tocarlo.
// ---------------------------------------------------------
const objeto = (id) => OBJETOS.find((o) => o.id === id);

// Gasta uno del inventario o lo compra en ese momento. Devuelve true si se pudo.
function gastarObjeto(id) {
  if (perfil.objetos[id] > 0) { perfil.objetos[id]--; guardarPerfil(); return true; }
  const o = objeto(id);
  if (perfil.monedas >= o.costo) {
    perfil.monedas -= o.costo;
    guardarPerfil();
    Sonido.comprar();
    return true;
  }
  aviso(`Te faltan ${fmt(o.costo - perfil.monedas)} 🪙 para ${o.nombre}`);
  return false;
}

function usarCongelar() {
  if (!puedeUsarObjetos()) return;
  if (juego.congelado > 0) { aviso('La banda ya está congelada'); return; }
  if (!gastarObjeto('congelar')) return;
  congelar(juego, 5);
  Sonido.congelar();
  actualizarBotonesObjetos();
  guardarPartida();
}

function usarBarrer() {
  if (!puedeUsarObjetos()) return;
  const pedidos = new Set(juego.pedidos.map((p) => p.c));
  if (!juego.banda.some((b) => b && b.c !== ARCOIRIS && !pedidos.has(b.c))) {
    aviso('No hay bloques que sobren en la banda');
    return;
  }
  if (!gastarObjeto('barrer')) return;
  for (const { i, bloque } of barrer(juego)) {
    const p = puntoBanda(i + juego.fase);
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 140;
      particulas.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color: COLORES[bloque.c].color, t0: reloj, vida: 450 });
    }
  }
  Sonido.barrer();
  actualizarBotonesObjetos();
  guardarPartida();
}

const puedeUsarObjetos = () => juego && pantalla === 'juego' && !pausa && !juego.terminado && !tutorial && juego.modo === 'clasico';

function actualizarBotonesObjetos() {
  const enClasico = juego && juego.modo === 'clasico';
  for (const id of ['congelar', 'barrer']) {
    const btn = $('btn-' + id);
    btn.classList.toggle('oculto', !enClasico);
    const n = perfil.objetos[id] || 0;
    btn.querySelector('.cuenta-objeto').textContent = n > 0 ? `×${n}` : `${objeto(id).costo}🪙`;
    btn.classList.toggle('sin-objeto', n === 0);
  }
  $('aviso-diario-barra').classList.toggle('oculto', enClasico || !juego);
}

// --- Segunda oportunidad ---
let temporizadorRevivir = 0;
function puedeRevivir() {
  return juego.modo === 'clasico' && !juego.revivido &&
    ((perfil.objetos.revivir || 0) > 0 || perfil.monedas >= objeto('revivir').costo);
}
function ofrecerRevivir() {
  esperandoRevivir = true;
  const tiene = perfil.objetos.revivir || 0;
  $('revivir-causa').textContent = TEXTO_CAUSA[juego.causa] || '';
  $('btn-revivir').textContent = tiene > 0 ? `Usar 💖 (tienes ${tiene})` : `Comprar y usar · ${objeto('revivir').costo} 🪙`;
  mostrarCapa('pantalla-revivir');
  Sonido.alerta();
  let quedan = 5;
  $('revivir-cuenta').textContent = quedan;
  clearInterval(temporizadorRevivir);
  temporizadorRevivir = setInterval(() => {
    quedan--;
    $('revivir-cuenta').textContent = quedan;
    if (quedan <= 0) rechazarRevivir();
  }, 1000);
}
function aceptarRevivir() {
  clearInterval(temporizadorRevivir);
  if (!esperandoRevivir || !gastarObjeto('revivir')) return;
  revivir(juego);
  esperandoRevivir = false;
  ultimoCuadro = 0;
  mostrarCapa(null);
  Sonido.nivel();
  textos.push({ texto: '¡Segunda oportunidad!', x: L.cx, y: L.cy, t0: reloj, dur: 1400, color: '#ff8fb1', grande: true });
  actualizarBotonesObjetos();
  guardarPartida();
}
function rechazarRevivir() {
  clearInterval(temporizadorRevivir);
  if (!esperandoRevivir) return;
  esperandoRevivir = false;
  mostrarCapa(null);
  terminar();
}

// ---------------------------------------------------------
// 14. Tutorial de 3 pasos (solo la primera vez)
// ---------------------------------------------------------
let ultimoDestinoTutorial = null;
const TEXTOS_TUTORIAL = ['Toca un bloque', 'Va al pedido de su color', 'No dejes que la banda se llene'];

function pasoTutorial(n) {
  tutorial = n;
  $('tutorial').classList.remove('oculto');
  $('tutorial-paso').textContent = `Paso ${n} de 3`;
  $('tutorial-texto').textContent = n === 2 && ultimoDestinoTutorial && ultimoDestinoTutorial.destino === 'espera'
    ? 'Si ningún pedido es de su color, espera aquí'
    : TEXTOS_TUTORIAL[n - 1];
  const btn = $('btn-tutorial');
  btn.textContent = n === 3 ? '¡A jugar!' : 'Siguiente';
  btn.classList.toggle('oculto', n === 1); // en el paso 1 hay que tocar un bloque
  // En el paso 2 la mano señala los pedidos (abajo): la tarjeta se pasa arriba
  $('tutorial').classList.toggle('arriba', n === 2);
}
function avanzarTutorial() {
  if (tutorial === 2) pasoTutorial(3);
  else if (tutorial === 3) {
    tutorial = 0;
    Almacen.escribir('tutorial', true);
    $('tutorial').classList.add('oculto');
  }
}

function dibujarMano(ahora) {
  let objetivo;
  if (tutorial === 1) {
    const i = juego.banda.findIndex(Boolean);
    objetivo = i >= 0 ? puntoBanda(i + juego.fase) : puntoBanda(0);
  } else if (tutorial === 2) {
    const r = ultimoDestinoTutorial;
    objetivo = r && r.destino === 'espera' ? centroEspera(r.k) : centroIconoPedido(r && r.idx != null ? r.idx : 1);
  } else {
    objetivo = { x: L.cx, y: L.cy - L.R };
  }
  const bote = Math.sin(ahora / 180) * 8;
  // Mano dibujada con formas (no depende de que el teléfono tenga emojis):
  // dedo índice hacia arriba, puño y pulgar, con la punta del dedo bajo el objetivo
  const s = L.b * 0.9;
  const px = objetivo.x + s * 0.05, py = objetivo.y + L.b * 0.45 + bote;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#14122b';
  ctx.lineWidth = 2.5;
  const forma = (x, y, w, h, r) => { rutaRedondeada(ctx, px + x * s, py + y * s, w * s, h * s, r * s); ctx.fill(); ctx.stroke(); };
  forma(-0.36, 0.42, 0.78, 0.62, 0.2);   // puño
  forma(-0.5, 0.52, 0.26, 0.4, 0.12);    // pulgar
  forma(-0.12, 0, 0.26, 0.72, 0.13);     // dedo índice
  ctx.restore();
  ctx.strokeStyle = `rgba(198,244,50,${0.5 + 0.4 * Math.sin(ahora / 180)})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(objetivo.x, objetivo.y, L.b * 0.72, 0, Math.PI * 2);
  ctx.stroke();
}

// ---------------------------------------------------------
// 15. Fin de partida, resultado y compartir
// ---------------------------------------------------------
function terminar() {
  const j = juego;
  if (j.finReloj != null) return;
  j.finReloj = reloj;
  Sonido.fin();
  vibrar([60, 60, 120]);
  const record = Almacen.leer('record', 0);
  const nuevoRecord = j.puntaje > record && j.puntaje > 0;
  if (nuevoRecord) Almacen.escribir('record', j.puntaje);

  // Monedas ganadas (el reto diario no usa el imán: es igual para todos, pero paga doble)
  const ganadas = monedasDePartida(j, j.modo === 'diario' ? 0 : nivelMejora('iman'));
  perfil.monedas += ganadas;
  guardarPerfil();
  registrar('partidas', 1);
  registrar('puntos', j.puntaje);

  const r = {
    modo: j.modo,
    fecha: j.fecha,
    numero: j.fecha ? numeroReto(j.fecha) : null,
    puntaje: j.puntaje,
    pedidos: j.completados,
    mejorCombo: j.mejorCombo,
    nivel: nivelDe(j),
    causa: j.causa,
    nuevoRecord,
    recordAnterior: record,
    monedas: ganadas,
  };
  if (j.modo === 'diario') {
    Almacen.escribir('resultado_diario', r);
    registrarDiaJugado(j.fecha);
  }
  Almacen.borrar('partida_' + j.modo);
  ultimoResultado = r;
  setTimeoutJuego(() => { if (juego === j && pantalla === 'juego') mostrarResultado(r, true); }, 1500);
}

function mostrarResultado(r, recien) {
  ultimoResultado = r;
  pantalla = 'resultado';
  const esDiario = r.modo === 'diario';
  $('res-etiqueta').textContent = esDiario ? `Reto #${r.numero} · ${textoFecha(r.fecha)}` : 'Modo clásico';
  $('res-titulo').textContent = esDiario ? '¡Reto terminado!' : '¡Fin de la partida!';
  $('res-causa').textContent = TEXTO_CAUSA[r.causa] || '';
  $('res-puntaje').textContent = fmt(r.puntaje);
  $('res-insignia').classList.toggle('oculto', !r.nuevoRecord);
  // "¡Casi!": si quedó cerca del récord, se lo decimos (dan ganas de otra)
  const faltan = (r.recordAnterior || 0) - r.puntaje;
  const casi = !r.nuevoRecord && faltan > 0 && faltan <= Math.max(100, r.recordAnterior * 0.25);
  $('res-casi').classList.toggle('oculto', !casi);
  $('res-casi').textContent = casi ? `¡Casi! Te faltaron ${fmt(faltan)} pts para tu récord` : '';
  $('res-pedidos').textContent = fmt(r.pedidos);
  $('res-combo').textContent = r.mejorCombo >= 1 ? `×${r.mejorCombo}` : '—';
  $('res-nivel').textContent = r.nivel;
  if (esDiario) {
    const racha = rachaVigente();
    $('res-cuarto').textContent = racha;
    $('res-cuarto-txt').textContent = racha === 1 ? 'Día de racha' : 'Días de racha';
  } else {
    $('res-cuarto').textContent = fmt(Almacen.leer('record', 0));
    $('res-cuarto-txt').textContent = 'Récord';
  }
  // Monedas: cuenta animada desde 0 (solo al terminar la partida)
  const ganadas = r.monedas || 0;
  $('res-monedas-total').textContent = fmt(perfil.monedas);
  if (recien && ganadas > 0) {
    const t0 = performance.now();
    const contar = (ahora) => {
      const k = Math.min(1, (ahora - t0) / 900);
      $('res-monedas').textContent = `+${fmt(Math.round(ganadas * facilSalida(k)))}`;
      if (k < 1) requestAnimationFrame(contar); else Sonido.moneda();
    };
    requestAnimationFrame(contar);
  } else {
    $('res-monedas').textContent = `+${fmt(ganadas)}`;
  }
  $('res-monedas-nota').textContent = esDiario ? 'Reto diario: monedas ×2' : '';
  // Siguiente mejora: "ya puedes comprar…" o "te faltan…"
  // (toda la pista es un botón que abre el taller)
  const sig = siguienteMejora();
  const pista = $('btn-res-taller');
  if (sig) {
    $('res-mejora').textContent = sig.costo <= perfil.monedas
      ? `🛠 ¡Ya puedes comprar ${sig.m.icono} ${sig.m.nombre}! Toca para ir al taller`
      : `🛠 Te faltan ${fmt(sig.costo - perfil.monedas)} 🪙 para ${sig.m.icono} ${sig.m.nombre}`;
    pista.classList.toggle('lista', sig.costo <= perfil.monedas);
  }
  pista.classList.toggle('oculto', !sig);
  $('res-cuenta').classList.toggle('oculto', !esDiario);
  $('btn-otra').textContent = esDiario ? 'Jugar modo clásico' : 'Jugar otra vez';
  mostrarCapa('pantalla-resultado');
  actualizarRelojes();
}

function urlBase() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}
function textoCompartir(r) {
  const titulo = r.modo === 'diario' ? `${NOMBRE_JUEGO} #${r.numero}` : `${NOMBRE_JUEGO} · Clásico`;
  const pedidos = `${fmt(r.pedidos)} ${r.pedidos === 1 ? 'pedido' : 'pedidos'}`;
  return `${titulo} — ${fmt(r.puntaje)} pts · ${pedidos} · Combo ×${Math.max(1, r.mejorCombo)}\n${urlBase()}`;
}

async function compartir() {
  if (!ultimoResultado) return;
  const txt = textoCompartir(ultimoResultado);
  if (navigator.share) {
    try { await navigator.share({ text: txt }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(txt);
    aviso('Copiado al portapapeles');
  } catch (e) {
    const area = document.createElement('textarea');
    area.value = txt;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { /* nada */ }
    area.remove();
    aviso(ok ? 'Copiado al portapapeles' : 'No se pudo copiar');
  }
}

let temporizadorAviso = 0;
function aviso(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('visible');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => t.classList.remove('visible'), 2400);
}

// ---------------------------------------------------------
// 16. Taller, misiones y regalo (pantallas)
// ---------------------------------------------------------
function pintarMonedas() {
  for (const el of document.querySelectorAll('.saldo')) el.textContent = fmt(perfil.monedas);
  $('insignia-taller').classList.toggle('oculto', !hayAlgoQueComprar());
}

function mostrarTaller() {
  pintarTaller();
  mostrarCapa('pantalla-taller');
}

function pintarTaller() {
  pintarMonedas();
  const lista = $('lista-mejoras');
  lista.innerHTML = '';
  for (const m of MEJORAS) {
    const nivel = nivelMejora(m.id), max = m.costos.length, costo = costoMejora(m);
    const fila = document.createElement('div');
    fila.className = 'item';
    fila.innerHTML = `
      <span class="item-icono" aria-hidden="true">${m.icono}</span>
      <span class="item-info">
        <b>${m.nombre}</b>
        <span>${m.efecto}</span>
        <span class="niveles" aria-label="Nivel ${nivel} de ${max}">${'<i class="lleno"></i>'.repeat(nivel)}${'<i></i>'.repeat(max - nivel)}</span>
      </span>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-comprar';
    if (costo == null) { btn.textContent = 'Máximo'; btn.disabled = true; }
    else {
      btn.textContent = `${fmt(costo)} 🪙`;
      btn.disabled = costo > perfil.monedas;
      btn.addEventListener('click', () => comprarMejora(m.id));
    }
    fila.appendChild(btn);
    lista.appendChild(fila);
  }
  const objs = $('lista-objetos');
  objs.innerHTML = '';
  for (const o of OBJETOS) {
    const fila = document.createElement('div');
    fila.className = 'item';
    fila.innerHTML = `
      <span class="item-icono" aria-hidden="true">${o.icono}</span>
      <span class="item-info">
        <b>${o.nombre} <small>· tienes ${perfil.objetos[o.id] || 0}</small></b>
        <span>${o.efecto}</span>
      </span>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-comprar';
    btn.textContent = `${fmt(o.costo)} 🪙`;
    btn.disabled = o.costo > perfil.monedas;
    btn.addEventListener('click', () => comprarObjeto(o.id));
    fila.appendChild(btn);
    objs.appendChild(fila);
  }
}

function comprarMejora(id) {
  const m = MEJORAS.find((x) => x.id === id);
  const costo = costoMejora(m);
  if (costo == null || costo > perfil.monedas) return;
  perfil.monedas -= costo;
  perfil.mejoras[id] = nivelMejora(id) + 1;
  guardarPerfil();
  Sonido.comprar();
  vibrar(30);
  aviso(`${m.icono} ${m.nombre}: nivel ${perfil.mejoras[id]}`);
  pintarTaller();
}
function comprarObjeto(id) {
  const o = objeto(id);
  if (o.costo > perfil.monedas) return;
  perfil.monedas -= o.costo;
  perfil.objetos[id] = (perfil.objetos[id] || 0) + 1;
  guardarPerfil();
  Sonido.comprar();
  vibrar(30);
  pintarTaller();
}

function pintarMisiones() {
  const ms = misionesDeHoy();
  const porReclamar = misionesPorReclamar();
  $('insignia-misiones').textContent = porReclamar ? `${porReclamar} por reclamar` : '';
  $('insignia-misiones').classList.toggle('oculto', !porReclamar);
  const cont = $('lista-misiones');
  cont.innerHTML = '';
  ms.lista.forEach((mi, k) => {
    const prog = Math.min(ms.progreso[mi.id] || 0, mi.meta);
    const lista = prog >= mi.meta;
    const fila = document.createElement('div');
    fila.className = 'mision' + (ms.reclamada[k] ? ' hecha' : '');
    fila.innerHTML = `
      <span class="mision-info">
        <b>${textoMision(mi)}</b>
        <span class="barra-progreso"><span style="width:${(prog / mi.meta) * 100}%"></span></span>
        <span class="mision-num">${fmt(prog)} / ${fmt(mi.meta)}</span>
      </span>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-comprar' + (lista && !ms.reclamada[k] ? ' brilla' : '');
    btn.textContent = ms.reclamada[k] ? '✓' : `+${mi.premio} 🪙`;
    btn.disabled = ms.reclamada[k] || !lista;
    btn.setAttribute('aria-label', ms.reclamada[k] ? 'Premio reclamado' : `Reclamar ${mi.premio} monedas`);
    btn.addEventListener('click', () => reclamarMision(k));
    fila.appendChild(btn);
    cont.appendChild(fila);
  });
}
function reclamarMision(k) {
  const ms = misionesDeHoy();
  const mi = ms.lista[k];
  if (ms.reclamada[k] || (ms.progreso[mi.id] || 0) < mi.meta) return;
  ms.reclamada[k] = true;
  perfil.monedas += mi.premio;
  guardarPerfil();
  Sonido.moneda();
  vibrar(30);
  aviso(`+${mi.premio} 🪙`);
  pintarMisiones();
  pintarMonedas();
}

function pintarRegalo() {
  const disponible = regaloDisponible();
  const { racha, monedas } = premioRegalo();
  $('btn-regalo').disabled = !disponible;
  $('btn-regalo').textContent = disponible ? `🎁 Abrir regalo: +${monedas} 🪙` : '🎁 Regalo abierto · vuelve mañana';
  $('regalo-racha').textContent = disponible
    ? (racha > 1 ? `Día ${racha} seguido: ¡cada día vale más!` : 'Ábrelo cada día y el premio crece.')
    : `Mañana: +${20 + 10 * Math.min(perfil.regalo.racha, 8)} 🪙 si no faltas`;
}
function abrirRegalo() {
  if (!regaloDisponible()) return;
  const { racha, monedas } = premioRegalo();
  perfil.regalo = { ultima: claveFecha(), racha };
  perfil.monedas += monedas;
  guardarPerfil();
  Sonido.moneda();
  setTimeout(() => Sonido.moneda(), 120);
  vibrar([30, 40, 30]);
  aviso(`🎁 +${monedas} 🪙`);
  pintarRegalo();
  pintarMonedas();
}

// ---------------------------------------------------------
// 17. Pantallas, HUD y flujo
// ---------------------------------------------------------
function mostrarCapa(id) {
  for (const c of document.querySelectorAll('.capa')) c.classList.toggle('visible', c.id === id);
}

function actualizarHud(animarCombo) {
  if (!juego) return;
  $('hud-modo').textContent = juego.modo === 'diario' ? `Reto #${numeroReto(juego.fecha)}` : 'Clásico';
  $('hud-nivel').textContent = nivelDe(juego);
  $('hud-progreso').style.width = ((juego.completados % PEDIDOS_POR_NIVEL) / PEDIDOS_POR_NIVEL * 100) + '%';
  const combo = $('hud-combo');
  combo.textContent = `×${Math.max(1, juego.combo)}`;
  combo.classList.toggle('apagado', juego.combo < 2);
  if (animarCombo && juego.combo >= 2) {
    combo.classList.remove('pulso');
    void combo.offsetWidth;
    combo.classList.add('pulso');
  }
}

function iniciarJuego(j, reanudada) {
  juego = j;
  pantalla = 'juego';
  pausa = false;
  esperandoRevivir = false;
  vuelos = []; particulas = []; textos = []; pendientesReloj = [];
  tarjetas = [null, null, null];
  puntajeMostrado = j.puntaje;
  monedasMostradas = -1;
  $('hud-puntaje').textContent = fmt(j.puntaje);
  mostrarCapa(null);
  recalcularLayout();
  actualizarHud(false);
  actualizarBotonesObjetos();
  guardarPartida();
  $('tutorial').classList.add('oculto');
  tutorial = 0;
  if (!Almacen.leer('tutorial', false)) pasoTutorial(1);
  else if (reanudada) pausar(); // al volver a una partida, empieza en pausa
}

function jugarDiario() {
  const hecho = resultadoDeHoy();
  if (hecho) { juego = null; mostrarResultado(hecho, false); return; }
  const hoy = claveFecha();
  const guardada = partidaGuardada('diario');
  iniciarJuego(guardada || nuevoJuego('diario', hoy, { fecha: hoy }), !!guardada); // sin mejoras
}
function jugarClasico(nueva) {
  const guardada = !nueva && partidaGuardada('clasico');
  iniciarJuego(guardada || nuevoJuego('clasico', Math.floor(Math.random() * 4294967295), { cfg: configClasico() }), !!guardada);
}

function pausar() {
  if (pantalla !== 'juego' || pausa || !juego || juego.terminado || esperandoRevivir) return;
  pausa = true;
  guardarPartida();
  mostrarCapa('pantalla-pausa');
}
function continuar() {
  if (!pausa) return;
  pausa = false;
  ultimoCuadro = 0;
  mostrarCapa(null);
}

function mostrarInicio() {
  if (aplicarActualizacionPendiente()) return; // había una versión nueva esperando
  guardarPartida();
  pantalla = 'inicio';
  pausa = false;
  tutorial = 0;
  $('tutorial').classList.add('oculto');
  const hoy = claveFecha();
  $('inicio-reto').textContent = `Reto #${numeroReto(hoy)}`;
  $('inicio-fecha').textContent = textoFecha(hoy);
  const hecho = resultadoDeHoy();
  const enCurso = partidaGuardada('diario');
  $('inicio-estado').textContent = hecho
    ? `Hecho: ${fmt(hecho.puntaje)} pts · ${hecho.pedidos} ${hecho.pedidos === 1 ? 'pedido' : 'pedidos'}`
    : enCurso ? `En curso: ${fmt(enCurso.puntaje)} pts` : 'Igual para todos y sin mejoras. ¡Paga monedas ×2!';
  $('btn-diario').textContent = hecho ? 'Ver mi resultado' : enCurso ? 'Continuar reto de hoy' : 'Jugar reto de hoy';
  const clasico = partidaGuardada('clasico');
  $('btn-clasico').textContent = clasico ? `Continuar clásico (${fmt(clasico.puntaje)} pts)` : 'Modo clásico (con tus mejoras)';
  $('btn-clasico-nuevo').classList.toggle('oculto', !clasico);
  $('st-racha').textContent = rachaVigente();
  $('st-mejor-racha').textContent = leerRacha().mejor;
  $('st-record').textContent = fmt(Almacen.leer('record', 0));
  $('version').textContent = VERSION;
  pintarMisiones();
  pintarRegalo();
  pintarMonedas();
  mostrarCapa('pantalla-inicio');
  actualizarRelojes();
}

let diaMostrado = claveFecha();
function actualizarRelojes() {
  const txt = formatoReloj(msHastaMedianoche());
  for (const el of document.querySelectorAll('.cuenta-regresiva')) el.textContent = txt;
  const hoy = claveFecha();
  if (hoy !== diaMostrado) {
    diaMostrado = hoy;
    if (pantalla === 'inicio' || (pantalla === 'resultado' && ultimoResultado && ultimoResultado.modo === 'diario')) mostrarInicio();
  }
}
setInterval(actualizarRelojes, 1000);

// ---------------------------------------------------------
// 18. Sonido con Web Audio API (sin archivos)
// ---------------------------------------------------------
const Sonido = {
  ctx: null,
  activo: Almacen.leer('sonido', true),
  ultimaAlerta: 0,

  preparar() {
    if (!this.activo) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tono(frec, dur, { tipo = 'sine', vol = 0.15, retraso = 0, frecFin = null } = {}) {
    const ac = this.preparar();
    if (!ac) return;
    const t = ac.currentTime + retraso;
    const osc = ac.createOscillator();
    const gan = ac.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(frec, t);
    if (frecFin) osc.frequency.exponentialRampToValueAtTime(frecFin, t + dur);
    gan.gain.setValueAtTime(0.0001, t);
    gan.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    gan.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gan).connect(ac.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },
  tocar() { this.tono(700, 0.05, { tipo: 'square', vol: 0.05, frecFin: 1000 }); },
  // Tono que sube según cuánto lleva el pedido
  entregar(lleva, n) { this.tono(440 * Math.pow(2, (lleva / n) * 0.75), 0.1, { tipo: 'triangle', vol: 0.15 }); },
  // Acorde que sube con el combo
  completo(combo) {
    const base = 523.25 * Math.pow(2, Math.min(combo - 1, 10) * 2 / 12);
    [1, 1.26, 1.5, 2].forEach((m, k) => this.tono(base * m, 0.18, { tipo: 'triangle', vol: 0.12, retraso: k * 0.05 }));
  },
  alerta() {
    const ahora = performance.now();
    if (ahora - this.ultimaAlerta < 700) return;
    this.ultimaAlerta = ahora;
    this.tono(880, 0.08, { tipo: 'square', vol: 0.06 });
    this.tono(660, 0.1, { tipo: 'square', vol: 0.06, retraso: 0.1 });
  },
  moneda() {
    this.tono(1318.5, 0.07, { tipo: 'square', vol: 0.05 });
    this.tono(1975.5, 0.18, { tipo: 'square', vol: 0.05, retraso: 0.07 });
  },
  comprar() { [784, 988, 1175, 1568].forEach((f, k) => this.tono(f, 0.12, { tipo: 'triangle', vol: 0.12, retraso: k * 0.06 })); },
  congelar() { this.tono(1600, 0.4, { tipo: 'sine', vol: 0.1, frecFin: 400 }); },
  barrer() { this.tono(300, 0.3, { tipo: 'sawtooth', vol: 0.06, frecFin: 1200 }); },
  nivel() { [523.25, 659.25, 783.99, 1046.5].forEach((f, k) => this.tono(f, 0.2, { tipo: 'triangle', vol: 0.12, retraso: k * 0.09 })); },
  fin() { [440, 349.2, 293.7, 220].forEach((f, k) => this.tono(f, 0.3, { tipo: 'triangle', vol: 0.16, retraso: k * 0.17 })); },
};

const ICONO_SONIDO = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
const ICONO_MUDO = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 9l5 6M21 9l-5 6"/></svg>';
function pintarBotonSonido() {
  const b = $('btn-sonido');
  b.innerHTML = Sonido.activo ? ICONO_SONIDO : ICONO_MUDO;
  b.setAttribute('aria-label', Sonido.activo ? 'Silenciar sonido' : 'Activar sonido');
}

// ---------------------------------------------------------
// 19. Aviso de instalación en iPhone (una sola vez)
// ---------------------------------------------------------
function avisoIOS() {
  const ua = navigator.userAgent || '';
  const esIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instalada = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  if (!esIOS || instalada || Almacen.leer('aviso_ios', false)) return;
  Almacen.escribir('aviso_ios', true);
  $('aviso-ios').classList.remove('oculto');
}

// ---------------------------------------------------------
// 20. Arranque
// ---------------------------------------------------------
function iniciar() {
  pintarBotonSonido();
  recalcularLayout();
  new ResizeObserver(recalcularLayout).observe($('zona'));
  window.addEventListener('resize', recalcularLayout);

  $('btn-diario').addEventListener('click', jugarDiario);
  $('btn-clasico').addEventListener('click', () => jugarClasico(false));
  $('btn-clasico-nuevo').addEventListener('click', () => jugarClasico(true));
  $('btn-pausa').addEventListener('click', pausar);
  $('btn-continuar').addEventListener('click', continuar);
  $('btn-salir').addEventListener('click', mostrarInicio);
  $('btn-compartir').addEventListener('click', compartir);
  $('btn-inicio').addEventListener('click', mostrarInicio);
  $('btn-otra').addEventListener('click', () => jugarClasico(true));
  $('btn-res-taller').addEventListener('click', mostrarTaller);
  $('btn-taller').addEventListener('click', mostrarTaller);
  $('btn-taller-volver').addEventListener('click', () => (ultimoResultado && pantalla === 'resultado' ? mostrarResultado(ultimoResultado, false) : mostrarInicio()));
  $('btn-taller-jugar').addEventListener('click', () => jugarClasico(true));
  $('btn-regalo').addEventListener('click', abrirRegalo);
  $('btn-congelar').addEventListener('click', usarCongelar);
  $('btn-barrer').addEventListener('click', usarBarrer);
  $('btn-revivir').addEventListener('click', aceptarRevivir);
  $('btn-no-revivir').addEventListener('click', rechazarRevivir);
  $('btn-tutorial').addEventListener('click', avanzarTutorial);
  $('btn-ver-tutorial').addEventListener('click', () => { Almacen.borrar('tutorial'); jugarClasico(true); });
  $('btn-aviso-ok').addEventListener('click', () => $('aviso-ios').classList.add('oculto'));
  $('btn-sonido').addEventListener('click', () => {
    Sonido.activo = !Sonido.activo;
    Almacen.escribir('sonido', Sonido.activo);
    pintarBotonSonido();
    if (Sonido.activo) Sonido.tocar();
  });

  // Pausa automática si la app pasa a segundo plano
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    if (juego && juego.terminado && juego.finReloj == null && !esperandoRevivir) procesarEventos(); // registra la derrota
    pausar();
    guardarPartida();
  });
  window.addEventListener('pagehide', guardarPartida);
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  misionesDeHoy();
  mostrarInicio();
  avisoIOS();
  requestAnimationFrame(bucle);

  registrarActualizaciones();
}

// Funciones expuestas solo para pruebas desde la consola
window.BandaDeColores = {
  crearRng, nuevoJuego, nuevoBloque, crearPedido, paso, tocarBloque, nivelDe, libres,
  congelar, barrer, revivir, monedasDePartida, configClasico, CONFIG_BASE, ARCOIRIS,
  velocidad, intervalo, DIFICULTAD, MEJORAS, OBJETOS, MISIONES,
  get perfil() { return perfil; },
};

// ---------------------------------------------------------
// Actualización automática
// Cuando se publica una versión nueva, el service worker la descarga solo.
// Se busca al abrir, al volver a la app y cada 15 minutos. Si no estás en
// medio de una partida, la página se recarga de inmediato con la versión
// nueva; si estás jugando, se aplica al volver al inicio (no se corta nada).
// ---------------------------------------------------------
let actualizacionPendiente = false;
const enPartida = () => pantalla === 'juego' && juego && !juego.terminado;

function registrarActualizaciones() {
  if (!('serviceWorker' in navigator)) return;
  // En la primera visita aún no hay service worker: ahí no hace falta recargar
  const habiaVersion = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const buscar = () => reg.update().catch(() => { /* sin conexión */ });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) buscar(); });
    setInterval(buscar, 15 * 60 * 1000);
  }).catch(() => { /* sin soporte o file:// */ });
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaVersion || recargando) return;
    if (enPartida()) {
      actualizacionPendiente = true;
      aviso('Hay una versión nueva: se aplicará al volver al inicio');
      return;
    }
    recargando = true;
    location.reload();
  });
}

// Se llama al volver al inicio: si quedó una actualización pendiente, se aplica
function aplicarActualizacionPendiente() {
  if (!actualizacionPendiente) return false;
  actualizacionPendiente = false;
  location.reload();
  return true;
}

iniciar();
