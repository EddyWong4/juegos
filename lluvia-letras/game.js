/* =========================================================
   Lluvia de Letras — puzzle de letras que caen (PWA)
   Todo el juego vive aquí: generador de letras con semilla,
   diccionario, motor de palabras y cadenas, dibujo en canvas,
   controles táctiles y de teclado, sonido, guardado y pantallas.
   Sin librerías: solo JavaScript del navegador.
   ========================================================= */
'use strict';

// ---------------------------------------------------------
// 1. Configuración general
// ---------------------------------------------------------
const NOMBRE_JUEGO = 'Lluvia de Letras';
const VERSION = 'v3';                       // mantener igual que VERSION_CACHE en sw.js
const COLS = 6;
const FILAS = 9;
const COLUMNA_INICIAL = 2;                  // por dónde aparece cada letra
const PALABRAS_POR_NIVEL = 10;
const VEL_SOLTAR = 28;                      // filas/segundo al soltar de golpe
const FECHA_RETO_1 = Date.UTC(2026, 0, 1);  // el reto #1 fue el 1 de enero de 2026

// Velocidad de caída por nivel (filas por segundo), con tope jugable
function velocidad(nivel) {
  return Math.min(0.9 + 0.28 * (nivel - 1), 4);
}

// ---------------------------------------------------------
// 2. Guardado en localStorage (prefijo propio: en GitHub Pages
//    varios juegos comparten el mismo dominio)
// ---------------------------------------------------------
const Almacen = {
  leer(clave, porDefecto) {
    try {
      const v = localStorage.getItem('lluvia_' + clave);
      return v === null ? porDefecto : JSON.parse(v);
    } catch (e) { return porDefecto; }
  },
  escribir(clave, valor) {
    try { localStorage.setItem('lluvia_' + clave, JSON.stringify(valor)); } catch (e) { /* sin espacio */ }
  },
  borrar(clave) {
    try { localStorage.removeItem('lluvia_' + clave); } catch (e) { /* nada */ }
  },
};

// ---------------------------------------------------------
// 3. Generador pseudoaleatorio con semilla (mulberry32)
//    Su estado es un solo entero: se guarda y se reanuda exacto.
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
// 4. Fechas (semilla AAAAMMDD en hora local)
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
// 5. Letras: frecuencia en español, valor en puntos y reglas
// ---------------------------------------------------------
const COMODIN = '★';
// Frecuencia aproximada (%) en textos en español. La Q sale siempre como "QU".
const FRECUENCIAS = {
  A: 12.5, B: 1.4, C: 4.7, D: 5.9, E: 13.7, F: 0.7, G: 1.0, H: 0.7, I: 6.3, J: 0.45,
  K: 0.05, L: 5.0, M: 3.2, N: 6.7, 'Ñ': 0.3, O: 8.7, P: 2.5, QU: 0.9, R: 6.9, S: 8.0,
  T: 4.6, U: 3.9, V: 0.9, W: 0.05, X: 0.25, Y: 0.9, Z: 0.5,
};
// Comunes 1 · medias 2 a 4 · raras 8 · comodín 0
const VALORES = {
  A: 1, E: 1, O: 1, S: 1, R: 1, N: 1, I: 1, L: 1, D: 1, T: 1, U: 1, C: 1,
  M: 2, P: 2, B: 2, G: 2,
  V: 3, F: 3, H: 3, Y: 3,
  QU: 4,
  J: 8, 'Ñ': 8, X: 8, Z: 8, K: 8, W: 8,
  [COMODIN]: 0,
};
const VOCALES = ['A', 'E', 'I', 'O', 'U'];
const CONSONANTES = Object.keys(FRECUENCIAS).filter((l) => !VOCALES.includes(l));
const TODAS = Object.keys(FRECUENCIAS);

function elegirPonderado(lista, r) {
  const total = lista.reduce((s, l) => s + FRECUENCIAS[l], 0);
  let x = r * total;
  for (const l of lista) {
    x -= FRECUENCIAS[l];
    if (x < 0) return l;
  }
  return lista[lista.length - 1];
}

// Estado del generador de letras (serializable): rng + rachas + distancia al comodín
function crearGenerador(semilla) {
  const rng = crearRng(semilla | 0);
  const falta = 12 + Math.floor(rng.siguiente() * 5);  // primer comodín entre la ficha 13 y la 17
  return { a: rng.estado, cons: 0, voc: 0, falta };
}

// Devuelve la siguiente letra y avanza el generador.
// Nunca más de 3 consonantes ni 3 vocales seguidas; comodín cada ~15 fichas.
function siguienteLetra(gen) {
  const rng = crearRng(gen.a);
  let letra;
  if (gen.falta <= 0) {
    letra = COMODIN;
    gen.falta = 12 + Math.floor(rng.siguiente() * 5); // el próximo, en 13 a 17 fichas
  } else {
    gen.falta--;
    const lista = gen.cons >= 3 ? VOCALES : gen.voc >= 3 ? CONSONANTES : TODAS;
    letra = elegirPonderado(lista, rng.siguiente());
    if (VOCALES.includes(letra)) { gen.voc++; gen.cons = 0; } else { gen.cons++; gen.voc = 0; }
  }
  gen.a = rng.estado;
  return letra;
}

// ---------------------------------------------------------
// 6. Diccionario: palabras.txt → Set de palabras normalizadas
// ---------------------------------------------------------
// Mayúsculas, sin acentos (Á→A, Ü→U) y conservando la Ñ
function normalizar(texto) {
  return texto.toUpperCase()
    .replace(/Ñ/g, '\u0001')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\u0001/g, 'Ñ');
}

const Diccionario = {
  palabras: new Set(),
  porLargo: new Map(),   // largo → lista (para buscar patrones con comodín)
  cache: new Map(),
  maxLargo: 6,
  listo: false,

  async cargar() {
    const resp = await fetch('palabras.txt');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    this.desdeTexto(await resp.text());
  },

  desdeTexto(texto) {
    this.palabras = new Set();
    this.porLargo = new Map();
    this.cache = new Map();
    const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    const capitalizada = (w) => w[0] !== w[0].toLowerCase() && w !== w.toUpperCase();
    // Si la lista viene en minúsculas, las que empiezan con mayúscula ("Madrid")
    // se toman como nombres propios. Si casi todas vienen capitalizadas, no se filtra.
    const filtrarPropios = lineas.filter(capitalizada).length < lineas.length / 2;
    for (const w of lineas) {
      if (filtrarPropios && capitalizada(w)) continue;
      const n = normalizar(w);
      if (!/^[A-ZÑ]{3,6}$/.test(n)) continue; // solo letras, de 3 a 6 (descarta abreviaturas)
      if (this.palabras.has(n)) continue;
      this.palabras.add(n);
      if (!this.porLargo.has(n.length)) this.porLargo.set(n.length, []);
      this.porLargo.get(n.length).push(n);
    }
    this.listo = this.palabras.size > 0;
  },

  // patron: letras con "?" donde hay comodín. Devuelve la palabra o null.
  coincide(patron) {
    if (!patron.includes('?')) return this.palabras.has(patron) ? patron : null;
    if (this.cache.has(patron)) return this.cache.get(patron);
    let encontrada = null;
    for (const w of this.porLargo.get(patron.length) || []) {
      let ok = true;
      for (let i = 0; i < w.length && ok; i++) if (patron[i] !== '?' && patron[i] !== w[i]) ok = false;
      if (ok) { encontrada = w; break; }
    }
    this.cache.set(patron, encontrada);
    return encontrada;
  },
};

// ---------------------------------------------------------
// 7. Motor del tablero (funciones puras, fáciles de probar)
//    tablero[fila][col]: null o ficha { id, l, v }. Fila 0 = arriba.
//    Las fichas siempre están apiladas abajo en cada columna.
// ---------------------------------------------------------
function crearTablero() {
  return Array.from({ length: FILAS }, () => new Array(COLS).fill(null));
}

// Fila donde aterrizaría una ficha en la columna c (-1 si está llena)
function filaLibre(t, c) {
  let r = FILAS - 1;
  while (r >= 0 && t[r][c]) r--;
  return r;
}

// Busca palabras en filas (izq→der) y columnas (arriba→abajo).
// Si varias se traslapan, gana la más larga (luego la de más puntos).
function buscarPalabras(t) {
  const candidatas = [];
  const probar = (celdas, dir) => {
    const fichas = celdas.map(([r, c]) => t[r][c]);
    const patron = fichas.map((f) => (f.l === COMODIN ? '?' : f.l)).join('');
    if (patron.length < 3 || patron.length > Diccionario.maxLargo) return;
    const palabra = Diccionario.coincide(patron);
    if (!palabra) return;
    candidatas.push({
      palabra, dir, celdas: celdas.slice(),
      letras: palabra.length,
      base: fichas.reduce((s, f) => s + f.v, 0),
    });
  };
  // Horizontales: cada tramo de fichas contiguas en una fila
  for (let r = 0; r < FILAS; r++) {
    for (let c0 = 0; c0 < COLS; c0++) {
      const celdas = [];
      let letras = 0;
      for (let c = c0; c < COLS && t[r][c]; c++) {
        celdas.push([r, c]);
        letras += t[r][c].l === COMODIN ? 1 : t[r][c].l.length;
        if (letras > Diccionario.maxLargo) break;
        probar(celdas, 'h');
      }
    }
  }
  // Verticales: de arriba hacia abajo
  for (let c = 0; c < COLS; c++) {
    for (let r0 = 0; r0 < FILAS; r0++) {
      const celdas = [];
      let letras = 0;
      for (let r = r0; r < FILAS && t[r][c]; r++) {
        celdas.push([r, c]);
        letras += t[r][c].l === COMODIN ? 1 : t[r][c].l.length;
        if (letras > Diccionario.maxLargo) break;
        probar(celdas, 'v');
      }
    }
  }
  candidatas.sort((a, b) => b.letras - a.letras || b.base - a.base ||
    (a.dir === b.dir ? 0 : a.dir === 'h' ? -1 : 1) ||
    a.celdas[0][0] - b.celdas[0][0] || a.celdas[0][1] - b.celdas[0][1]);
  const usadas = new Set();
  const elegidas = [];
  for (const cand of candidatas) {
    const claves = cand.celdas.map(([r, c]) => r * COLS + c);
    if (claves.some((k) => usadas.has(k))) continue;
    claves.forEach((k) => usadas.add(k));
    elegidas.push(cand);
  }
  return elegidas;
}

// Resuelve todo lo que provoca un aterrizaje: palabras → quitar → caer → revisar
// otra vez (cadena). Modifica el tablero y devuelve los pasos para animarlos.
// Puntos = suma de valores × largo × posición en la cadena (×1, ×2, ×3…).
function resolverCascada(t) {
  const pasos = [];
  let cadena = 0;
  for (;;) {
    const palabras = buscarPalabras(t);
    if (!palabras.length) break;
    const quitar = new Set();
    for (const p of palabras) {
      cadena++;
      p.mult = cadena;
      p.puntos = p.base * p.letras * cadena;
      p.ids = p.celdas.map(([r, c]) => t[r][c].id);
      p.ids.forEach((id) => quitar.add(id));
    }
    for (let r = 0; r < FILAS; r++) {
      for (let c = 0; c < COLS; c++) if (t[r][c] && quitar.has(t[r][c].id)) t[r][c] = null;
    }
    // Gravedad: las fichas de arriba bajan
    const caidas = [];
    for (let c = 0; c < COLS; c++) {
      let destino = FILAS - 1;
      for (let r = FILAS - 1; r >= 0; r--) {
        if (!t[r][c]) continue;
        if (r !== destino) {
          t[destino][c] = t[r][c];
          t[r][c] = null;
          caidas.push({ id: t[destino][c].id, c, desde: r, hasta: destino });
        }
        destino--;
      }
    }
    pasos.push({ palabras, quitar: [...quitar], caidas });
  }
  return pasos;
}

const columnaLlena = (t) => t[0].some(Boolean);

// ---------------------------------------------------------
// 8. Estado de la partida
// ---------------------------------------------------------
let juego = null;
let pantalla = 'inicio';     // 'inicio' | 'juego' | 'resultado'
let estado = 'cayendo';      // 'cayendo' | 'soltando' | 'resolviendo' | 'fin'
let pausa = false;
let reloj = 0;               // ms de juego (se detiene en pausa)
let ultimoResultado = null;

function nuevaFicha(j) {
  const l = siguienteLetra(j.gen);
  return { id: j.sigId++, l, v: VALORES[l] };
}

function nuevoJuego(modo, semilla, extra = {}) {
  const j = {
    modo,                         // 'diario' o 'clasico'
    semilla: semilla >>> 0,
    fecha: extra.fecha || null,
    gen: crearGenerador(semilla),
    tablero: crearTablero(),
    sigId: 1,
    actual: null,
    siguiente: null,
    puntaje: 0,
    palabras: [],                 // { p: palabra, pts }
    terminado: false,
  };
  j.actual = { f: nuevaFicha(j), c: COLUMNA_INICIAL, y: -1 };
  j.siguiente = nuevaFicha(j);
  return j;
}

const nivelDe = (j) => 1 + Math.floor(j.palabras.length / PALABRAS_POR_NIVEL);

function guardarPartida() {
  if (!juego || juego.terminado) return;
  Almacen.escribir('partida_' + juego.modo, juego);
}

function partidaGuardada(modo) {
  const j = Almacen.leer('partida_' + modo, null);
  if (!j || j.terminado || !Array.isArray(j.tablero) || !j.actual) return null;
  if (modo === 'diario' && j.fecha !== claveFecha()) { Almacen.borrar('partida_diario'); return null; }
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
// 9. Canvas: tamaño, nitidez y dibujo
// ---------------------------------------------------------
const $ = (id) => document.getElementById(id);
const lienzo = $('lienzo');
const ctx = lienzo.getContext('2d');
let dpr = 1;
let L = null;
const FUENTE = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function recalcularLayout() {
  const zona = $('zona');
  const w = zona.clientWidth, h = zona.clientHeight;
  if (!w || !h) return;
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  lienzo.width = Math.round(w * dpr);
  lienzo.height = Math.round(h * dpr);
  lienzo.style.width = w + 'px';
  lienzo.style.height = h + 'px';
  const margen = 10, filasExtra = 1.1;  // espacio arriba para la ficha que aparece
  const ancho = Math.min(w - margen * 2, 480);
  const celda = Math.max(20, Math.floor(Math.min(ancho / COLS, (h - margen * 2) / (FILAS + filasExtra))));
  const altoTotal = celda * (FILAS + filasExtra);
  const x = Math.round((w - celda * COLS) / 2);
  const y = Math.round(Math.max(margen, (h - altoTotal) / 2) + celda * filasExtra);
  L = { w, h, celda, x, y, ancho: celda * COLS, alto: celda * FILAS };
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

const colorValor = (v) => (v >= 8 ? '#d9452b' : v >= 2 ? '#2f6fc4' : '#6d6a8f');

// Dibuja una ficha. op: { alfa, escala, resaltar (0–1), brillo (aura), fantasma }
function dibujarFicha(x, y, s, f, op = {}) {
  const { alfa = 1, escala = 1, resaltar = 0, brillo = false } = op;
  if (alfa <= 0 || escala <= 0) return;
  const sep = s * 0.06;
  const t = (s - sep * 2) * escala;
  const x0 = x + (s - t) / 2, y0 = y + (s - t) / 2;
  const r = t * 0.2;
  const comodin = f.l === COMODIN;
  ctx.save();
  ctx.globalAlpha = alfa;
  if (brillo) { ctx.shadowColor = 'rgba(127,212,255,0.9)'; ctx.shadowBlur = s * 0.35; }
  // canto inferior (da volumen)
  ctx.fillStyle = comodin ? '#b9852a' : resaltar ? '#3fb98d' : '#d6c7a3';
  rutaRedondeada(ctx, x0, y0, t, t, r); ctx.fill();
  ctx.shadowBlur = 0;
  // cara
  if (comodin) {
    const g = ctx.createLinearGradient(x0, y0, x0 + t, y0 + t);
    g.addColorStop(0, '#ffe08a'); g.addColorStop(1, '#f2b43c');
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = resaltar ? '#8ff0c8' : '#fbf3e2';
  }
  rutaRedondeada(ctx, x0, y0, t, t * 0.9, r); ctx.fill();
  // destello blanco al formar palabra
  if (resaltar > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.6 * resaltar})`;
    rutaRedondeada(ctx, x0, y0, t, t * 0.9, r); ctx.fill();
  }
  // letra grande en negrita
  ctx.fillStyle = '#1c1b3a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tam = f.l.length > 1 ? t * 0.46 : t * 0.62;
  ctx.font = `900 ${tam}px ${FUENTE}`;
  ctx.fillText(f.l, x0 + t * (f.l.length > 1 ? 0.47 : 0.48), y0 + t * 0.45);
  // valor en pequeño
  if (!comodin) {
    ctx.font = `800 ${t * 0.2}px ${FUENTE}`;
    ctx.fillStyle = colorValor(f.v);
    ctx.fillText(String(f.v), x0 + t * 0.83, y0 + t * 0.74);
  }
  ctx.restore();
}

// ---------------------------------------------------------
// 10. Animaciones y bucle principal (requestAnimationFrame)
// ---------------------------------------------------------
let anim = null;        // reproducción de la cascada de un aterrizaje
let textos = [];        // palabras grandes y avisos flotantes
let xVisual = COLUMNA_INICIAL;  // posición horizontal suave de la ficha que cae
let puntajeMostrado = 0;
let ultimoCuadro = 0;

const facilSalida = (t) => 1 - Math.pow(1 - t, 3);
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
const GRAVEDAD = 0.00018; // filas/ms²: caída de las fichas tras una palabra (1 fila ≈ 0.1 s)

function bucle(ahora) {
  const dt = Math.min(50, ahora - (ultimoCuadro || ahora));
  ultimoCuadro = ahora;
  if (juego && pantalla === 'juego' && !pausa) {
    reloj += dt;
    actualizar(dt);
  }
  if (L) dibujar();
  // El puntaje "cuenta" hasta el valor real
  if (juego && puntajeMostrado !== juego.puntaje) {
    const dif = juego.puntaje - puntajeMostrado;
    puntajeMostrado += Math.sign(dif) * Math.max(1, Math.ceil(Math.abs(dif) * 0.15));
    if (Math.sign(juego.puntaje - puntajeMostrado) !== Math.sign(dif)) puntajeMostrado = juego.puntaje;
    $('hud-puntaje').textContent = fmt(puntajeMostrado);
  }
  requestAnimationFrame(bucle);
}

function actualizar(dt) {
  textos = textos.filter((t) => reloj - t.t0 < t.dur);
  const a = juego.actual;
  if (a) xVisual += (a.c - xVisual) * Math.min(1, dt * 0.025);

  if ((estado === 'cayendo' || estado === 'soltando') && a) {
    const vel = estado === 'soltando' ? VEL_SOLTAR : velocidad(nivelDe(juego));
    a.y += (vel * dt) / 1000;
    const destino = filaLibre(juego.tablero, a.c);
    if (a.y >= destino) { a.y = destino; aterrizar(); }
  } else if (estado === 'resolviendo') {
    avanzarAnimacion();
  }
}

// Coloca la ficha, resuelve TODA la cascada en la lógica (para guardar el
// resultado al instante) y prepara la animación paso a paso.
function aterrizar() {
  const t = juego.tablero;
  const a = juego.actual;
  const fila = filaLibre(t, a.c);
  if (fila < 0) { terminar(); return; }
  t[fila][a.c] = a.f;

  // Foto del tablero antes de resolver: la animación parte de aquí
  const vista = new Map();
  for (let r = 0; r < FILAS; r++) for (let c = 0; c < COLS; c++) {
    if (t[r][c]) vista.set(t[r][c].id, { f: t[r][c], c, y: r, y0: r, hasta: r });
  }

  const nivelAntes = nivelDe(juego);
  const pasos = resolverCascada(t);
  for (const paso of pasos) {
    for (const p of paso.palabras) {
      juego.puntaje += p.puntos;
      juego.palabras.push({ p: p.palabra, pts: p.puntos });
    }
  }
  const subio = nivelDe(juego) > nivelAntes;
  const lleno = columnaLlena(t);

  juego.actual = null;
  if (!lleno) {
    juego.actual = { f: juego.siguiente, c: COLUMNA_INICIAL, y: -1 };
    juego.siguiente = nuevaFicha(juego);
  }

  anim = { vista, pasos, i: 0, fase: 'aterrizaje', t0: reloj, idAterrizada: a.f.id, subio, lleno };
  estado = 'resolviendo';
  Sonido.aterrizar();

  if (lleno) terminar();
  else guardarPartida();
}

// Fases: aterrizaje → (resaltar → quitar → caer) por cada paso de la cadena
function avanzarAnimacion() {
  const e = reloj - anim.t0;
  const paso = anim.pasos[anim.i];
  switch (anim.fase) {
    case 'aterrizaje':
      if (e < 110) return;
      if (paso) iniciarResaltado(); else finAnimacion();
      return;
    case 'resaltar':
      if (e >= 460) { anim.fase = 'quitar'; anim.t0 = reloj; }
      return;
    case 'quitar':
      if (e < 200) return;
      for (const id of paso.quitar) anim.vista.delete(id);
      for (const cd of paso.caidas) {
        const v = anim.vista.get(cd.id);
        if (v) { v.y0 = cd.desde; v.hasta = cd.hasta; }
      }
      anim.fase = 'caer'; anim.t0 = reloj;
      return;
    case 'caer': {
      let todasAbajo = true;
      for (const v of anim.vista.values()) {
        if (v.y0 === v.hasta) continue;
        v.y = Math.min(v.hasta, v.y0 + 0.5 * GRAVEDAD * e * e);
        if (v.y < v.hasta) todasAbajo = false;
      }
      if (!todasAbajo) return;
      for (const v of anim.vista.values()) { v.y = v.y0 = v.hasta; }
      anim.i++;
      if (anim.pasos[anim.i]) { Sonido.aterrizar(0.5); iniciarResaltado(); } else finAnimacion();
    }
  }
}

function iniciarResaltado() {
  const paso = anim.pasos[anim.i];
  anim.fase = 'resaltar';
  anim.t0 = reloj;
  const ids = new Set(paso.quitar);
  anim.resaltadas = ids;
  // Palabras en grande, con sus puntos (y la cadena si aplica)
  paso.palabras.forEach((p, k) => {
    textos.push({ tipo: 'palabra', p, t0: reloj + k * 160, dur: 1100, fila: k });
  });
  const maxMult = Math.max(...paso.palabras.map((p) => p.mult));
  if (maxMult >= 2) Sonido.cadena(maxMult); else Sonido.palabra();
  vibrar(maxMult >= 2 ? [30, 40, 60] : 40);
}

function finAnimacion() {
  anim.resaltadas = null;
  if (anim.subio) {
    textos.push({ tipo: 'aviso', texto: `¡Nivel ${nivelDe(juego)}!`, t0: reloj, dur: 1200 });
    Sonido.nivel();
  }
  actualizarHud();
  if (anim.lleno) {
    estado = 'fin';
    juego.finT0 = reloj;
    setTimeout(() => { if (pantalla === 'juego' && ultimoResultado) mostrarResultado(ultimoResultado); }, 1300);
  } else {
    estado = 'cayendo';
    xVisual = juego.actual.c;
  }
  anim.terminada = true;
}

function dibujar() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, L.w, L.h);
  if (!juego) return;
  const { celda: s, x: bx, y: by, ancho, alto } = L;
  const t = juego.tablero;
  const a = juego.actual;
  const cayendo = (estado === 'cayendo' || estado === 'soltando') && a;

  // --- Fondo del tablero y carriles ---
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  rutaRedondeada(ctx, bx - 6, by - 6, ancho + 12, alto + 12, 16); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();
  for (let c = 0; c < COLS; c++) {
    const altura = FILAS - 1 - filaLibre(t, c);
    // Columna peligrosa (casi llena) en tono coral; la activa en celeste
    if (altura >= FILAS - 2) ctx.fillStyle = 'rgba(255,138,107,0.10)';
    else if (cayendo && c === a.c) ctx.fillStyle = 'rgba(127,212,255,0.10)';
    else ctx.fillStyle = c % 2 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(bx + c * s, by, s, alto);
  }
  if (cayendo) {
    // Carril activo también por encima del tablero, hasta la ficha
    ctx.fillStyle = 'rgba(127,212,255,0.06)';
    ctx.fillRect(bx + a.c * s, by - s * 1.1, s, s * 1.1);
  }

  // --- Fichas del tablero ---
  if (estado === 'resolviendo' || (anim && !anim.terminada)) {
    const e = reloj - anim.t0;
    for (const [id, v] of anim.vista) {
      let op = {};
      if (anim.fase === 'aterrizaje' && id === anim.idAterrizada) {
        op.escala = 1 + 0.08 * Math.sin(Math.PI * limitar(e / 110, 0, 1));
      }
      if (anim.resaltadas && anim.resaltadas.has(id)) {
        if (anim.fase === 'resaltar') {
          op.resaltar = 0.5 + 0.5 * Math.sin(e / 55);
          op.escala = 1 + 0.06 * Math.sin(e / 80);
        } else if (anim.fase === 'quitar') {
          const k = limitar(e / 200, 0, 1);
          op.resaltar = 1;
          op.escala = 1 - 0.7 * facilSalida(k);
          op.alfa = 1 - k;
        }
      }
      dibujarFicha(bx + v.c * s, by + v.y * s, s, v.f, op);
    }
  } else {
    for (let r = 0; r < FILAS; r++) for (let c = 0; c < COLS; c++) {
      if (t[r][c]) dibujarFicha(bx + c * s, by + r * s, s, t[r][c]);
    }
  }

  // --- Sombra de aterrizaje y ficha que cae ---
  if (cayendo) {
    const destino = filaLibre(t, a.c);
    if (destino >= 0 && destino - a.y > 0.6) {
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(127,212,255,0.75)';
      ctx.lineWidth = 2;
      rutaRedondeada(ctx, bx + a.c * s + s * 0.08, by + destino * s + s * 0.08, s * 0.84, s * 0.84, s * 0.18);
      ctx.stroke();
      ctx.restore();
    }
    dibujarFicha(bx + xVisual * s, by + a.y * s, s, a.f, { brillo: true });
  }

  // --- Palabras en grande y avisos ---
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const tx of textos) {
    const k = (reloj - tx.t0) / tx.dur;
    if (k < 0 || k >= 1) continue;
    const alfa = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    const entrada = k < 0.12 ? 0.6 + (k / 0.12) * 0.4 : 1;
    const cx = bx + ancho / 2;
    ctx.save();
    ctx.globalAlpha = alfa;
    ctx.lineJoin = 'round';
    if (tx.tipo === 'palabra') {
      const cy = by + alto * 0.3 + tx.fila * s * 1.6 - 18 * facilSalida(k);
      ctx.font = `900 ${Math.round(s * 0.95 * entrada)}px ${FUENTE}`;
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(12,11,32,0.9)';
      ctx.strokeText(tx.p.palabra, cx, cy);
      ctx.fillStyle = '#8ff0c8';
      ctx.fillText(tx.p.palabra, cx, cy);
      const sub = `+${fmt(tx.p.puntos)}` + (tx.p.mult >= 2 ? `  ·  Cadena ×${tx.p.mult}` : '');
      ctx.font = `800 ${Math.round(s * 0.42)}px ${FUENTE}`;
      ctx.lineWidth = 5;
      ctx.strokeText(sub, cx, cy + s * 0.68);
      ctx.fillStyle = tx.p.mult >= 2 ? '#ffd166' : '#ffffff';
      ctx.fillText(sub, cx, cy + s * 0.68);
    } else {
      const cy = by + alto * 0.62;
      ctx.font = `900 ${Math.round(s * 0.7 * entrada)}px ${FUENTE}`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(12,11,32,0.9)';
      ctx.strokeText(tx.texto, cx, cy);
      ctx.fillStyle = '#7fd4ff';
      ctx.fillText(tx.texto, cx, cy);
    }
    ctx.restore();
  }

  // --- Fin de partida ---
  if (estado === 'fin' && juego.finT0 != null) {
    const k = limitar((reloj - juego.finT0) / 500, 0, 1);
    ctx.fillStyle = `rgba(10,9,28,${0.6 * k})`;
    rutaRedondeada(ctx, bx - 6, by - 6, ancho + 12, alto + 12, 16); ctx.fill();
    ctx.globalAlpha = k;
    ctx.font = `900 ${Math.round(s * 0.6)}px ${FUENTE}`;
    ctx.fillStyle = '#f5f3ff';
    ctx.fillText('¡Columna llena!', bx + ancho / 2, by + alto / 2);
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------
// 11. Controles: Pointer Events (dedo y ratón) y teclado
// ---------------------------------------------------------
const puedeMover = () => pantalla === 'juego' && !pausa && estado === 'cayendo' && juego && juego.actual;

// Mueve la ficha columna por columna hacia el objetivo; se detiene si
// una columna está tan alta que la ficha ya no cabe ahí.
function moverHacia(objetivo) {
  if (!puedeMover()) return;
  const a = juego.actual;
  objetivo = limitar(objetivo, 0, COLS - 1);
  let movio = false;
  while (a.c !== objetivo) {
    const siguiente = a.c + Math.sign(objetivo - a.c);
    if (filaLibre(juego.tablero, siguiente) < Math.ceil(a.y - 0.001)) break;
    a.c = siguiente;
    movio = true;
  }
  if (movio) Sonido.mover();
}

function soltarYa() {
  if (!puedeMover()) return;
  estado = 'soltando';
}

function columnaEn(x) {
  return limitar(Math.floor((x - L.x) / L.celda), 0, COLS - 1);
}
function posicionLocal(e) {
  const rect = lienzo.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

let toque = null;
let ultimoTap = { t: 0, c: -1 };

lienzo.addEventListener('pointerdown', (e) => {
  Sonido.preparar();
  if (toque || !L) return;
  e.preventDefault();
  try { lienzo.setPointerCapture(e.pointerId); } catch (err) { /* nada */ }
  const { x, y } = posicionLocal(e);
  toque = { id: e.pointerId, x0: x, y0: y, t0: performance.now(), solto: false, lejos: false };
  moverHacia(columnaEn(x)); // tocar una columna: la ficha va ahí
});

lienzo.addEventListener('pointermove', (e) => {
  if (!toque || e.pointerId !== toque.id || toque.solto) return;
  e.preventDefault();
  const { x, y } = posicionLocal(e);
  const dx = x - toque.x0, dy = y - toque.y0;
  if (Math.hypot(dx, dy) > 12) toque.lejos = true;
  // Deslizar hacia abajo rápido: soltar
  if (dy > L.celda * 1.1 && dy > Math.abs(dx) * 1.6 && performance.now() - toque.t0 < 350) {
    toque.solto = true;
    soltarYa();
    return;
  }
  moverHacia(columnaEn(x)); // la ficha sigue al dedo
});

function finToque(e) {
  if (!toque || e.pointerId !== toque.id) return;
  const ahora = performance.now();
  const { x, y } = posicionLocal(e);
  const dx = x - toque.x0, dy = y - toque.y0;
  if (!toque.solto) {
    if (dy > L.celda * 0.8 && dy > Math.abs(dx) * 1.6 && ahora - toque.t0 < 300) {
      soltarYa(); // deslizamiento corto pero rápido hacia abajo
    } else if (!toque.lejos && ahora - toque.t0 < 300) {
      // Doble toque en la misma columna: soltar
      const c = columnaEn(x);
      if (ahora - ultimoTap.t < 320 && c === ultimoTap.c) { soltarYa(); ultimoTap = { t: 0, c: -1 }; }
      else ultimoTap = { t: ahora, c };
    }
  }
  toque = null;
}
lienzo.addEventListener('pointerup', finToque);
lienzo.addEventListener('pointercancel', (e) => { if (toque && e.pointerId === toque.id) toque = null; });
lienzo.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
  if (pantalla !== 'juego') return;
  const tecla = e.key;
  if (tecla === 'p' || tecla === 'P' || tecla === 'Escape') { e.preventDefault(); pausa ? continuar() : pausar(); return; }
  if (pausa || !juego || !juego.actual) return;
  if (tecla === 'ArrowLeft') { e.preventDefault(); moverHacia(juego.actual.c - 1); }
  else if (tecla === 'ArrowRight') { e.preventDefault(); moverHacia(juego.actual.c + 1); }
  else if (tecla === 'ArrowDown' || tecla === ' ') { e.preventDefault(); soltarYa(); }
});

function vibrar(patron) {
  try { if (navigator.vibrate) navigator.vibrate(patron); } catch (e) { /* no soportado */ }
}

// ---------------------------------------------------------
// 12. Fin de partida, resultado y compartir
// ---------------------------------------------------------
function resumenPalabras(lista) {
  let larga = null, mejor = null;
  for (const w of lista) {
    if (!larga || w.p.length > larga.length) larga = w.p;
    if (!mejor || w.pts > mejor.pts) mejor = w;
  }
  return { larga, mejor };
}

function terminar() {
  if (juego.terminado) return;
  juego.terminado = true;
  setTimeout(() => Sonido.fin(), 400);
  const { larga, mejor } = resumenPalabras(juego.palabras);

  const record = Almacen.leer('record', 0);
  const nuevoRecord = juego.puntaje > record && juego.puntaje > 0;
  if (nuevoRecord) Almacen.escribir('record', juego.puntaje);
  const largaHist = Almacen.leer('larga', '');
  if (larga && larga.length > largaHist.length) Almacen.escribir('larga', larga);

  const r = {
    modo: juego.modo,
    fecha: juego.fecha,
    numero: juego.fecha ? numeroReto(juego.fecha) : null,
    puntaje: juego.puntaje,
    palabras: juego.palabras.length,
    larga,
    mejor,
    nuevoRecord,
  };
  if (juego.modo === 'diario') {
    Almacen.escribir('resultado_diario', r);
    registrarDiaJugado(juego.fecha);
  }
  Almacen.borrar('partida_' + juego.modo);
  ultimoResultado = r;
}

function mostrarResultado(r) {
  ultimoResultado = r;
  pantalla = 'resultado';
  const esDiario = r.modo === 'diario';
  $('res-etiqueta').textContent = esDiario ? `Reto #${r.numero} · ${textoFecha(r.fecha)}` : 'Modo clásico';
  $('res-titulo').textContent = esDiario ? '¡Reto completado!' : '¡Fin de la partida!';
  $('res-puntaje').textContent = fmt(r.puntaje);
  $('res-insignia').classList.toggle('oculto', !r.nuevoRecord);
  $('res-palabras').textContent = fmt(r.palabras);
  $('res-larga').textContent = r.larga || '—';
  $('res-mejor').textContent = r.mejor ? r.mejor.p : '—';
  $('res-mejor-txt').textContent = r.mejor ? `Mejor palabra (${fmt(r.mejor.pts)} pts)` : 'Mejor palabra';
  const racha = rachaVigente();
  $('res-racha').textContent = `Racha: ${racha} ${racha === 1 ? 'día' : 'días'} seguidos`;
  $('res-racha').classList.toggle('oculto', !esDiario);
  $('res-cuenta').classList.toggle('oculto', !esDiario);
  $('btn-otra').textContent = esDiario ? 'Jugar modo clásico' : 'Jugar otra vez';
  mostrarCapa('pantalla-resultado');
  actualizarRelojes();
}

function urlBase() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

function textoCompartir(r) {
  const n = `${fmt(r.palabras)} ${r.palabras === 1 ? 'palabra' : 'palabras'}`;
  const mejor = r.mejor ? r.mejor.p : '—';
  const titulo = r.modo === 'diario' ? `${NOMBRE_JUEGO} #${r.numero}` : `${NOMBRE_JUEGO} · Clásico`;
  return `${titulo} — ${fmt(r.puntaje)} pts · ${n} · Mejor: ${mejor}\n${urlBase()}`;
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
  temporizadorAviso = setTimeout(() => t.classList.remove('visible'), 2000);
}

// ---------------------------------------------------------
// 13. Pantallas, HUD y flujo
// ---------------------------------------------------------
function mostrarCapa(id) {
  for (const c of document.querySelectorAll('.capa')) c.classList.toggle('visible', c.id === id);
}

function pintarMini(el, f) {
  el.classList.toggle('comodin', f.l === COMODIN);
  const b = el.querySelector('b');
  b.textContent = f.l;
  b.classList.toggle('qu', f.l.length > 1);
  el.querySelector('i').textContent = f.l === COMODIN ? '' : f.v;
  el.setAttribute('aria-label', 'Siguiente letra: ' + (f.l === COMODIN ? 'comodín' : f.l));
}

function actualizarHud() {
  if (!juego) return;
  $('hud-modo').textContent = juego.modo === 'diario' ? `Reto #${numeroReto(juego.fecha)}` : 'Clásico';
  $('hud-nivel').textContent = nivelDe(juego);
  $('hud-progreso').style.width = ((juego.palabras.length % PALABRAS_POR_NIVEL) / PALABRAS_POR_NIVEL * 100) + '%';
  if (juego.siguiente) pintarMini($('hud-siguiente'), juego.siguiente);
}

function iniciarJuego(j) {
  juego = j;
  pantalla = 'juego';
  estado = 'cayendo';
  pausa = false;
  anim = null;
  textos = [];
  toque = null;
  juego.actual.y = -1;           // al reanudar, la ficha vuelve a aparecer arriba
  xVisual = juego.actual.c;
  puntajeMostrado = juego.puntaje;
  $('hud-puntaje').textContent = fmt(juego.puntaje);
  mostrarCapa(null);
  recalcularLayout();
  actualizarHud();
  guardarPartida();
}

function jugarDiario() {
  const hecho = resultadoDeHoy();
  if (hecho) { juego = null; mostrarResultado(hecho); return; }
  const hoy = claveFecha();
  iniciarJuego(partidaGuardada('diario') || nuevoJuego('diario', hoy, { fecha: hoy }));
}

function jugarClasico(nueva) {
  const guardada = !nueva && partidaGuardada('clasico');
  iniciarJuego(guardada || nuevoJuego('clasico', Math.floor(Math.random() * 4294967295)));
}

function pausar() {
  if (pantalla !== 'juego' || pausa || estado === 'fin') return;
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
  const hoy = claveFecha();
  $('inicio-reto').textContent = `Reto #${numeroReto(hoy)}`;
  $('inicio-fecha').textContent = textoFecha(hoy);
  const hecho = resultadoDeHoy();
  const enCurso = partidaGuardada('diario');
  $('inicio-estado').textContent = hecho
    ? `Hecho: ${fmt(hecho.puntaje)} pts · ${hecho.palabras} ${hecho.palabras === 1 ? 'palabra' : 'palabras'}`
    : enCurso ? `En curso: ${fmt(enCurso.puntaje)} pts` : 'Las mismas letras para todos. Solo cuenta un intento.';
  $('btn-diario').textContent = hecho ? 'Ver mi resultado' : enCurso ? 'Continuar reto de hoy' : 'Jugar reto de hoy';
  const clasico = partidaGuardada('clasico');
  $('btn-clasico').textContent = clasico ? `Continuar clásico (${fmt(clasico.puntaje)} pts)` : 'Modo clásico';
  $('btn-clasico-nuevo').classList.toggle('oculto', !clasico);
  $('st-racha').textContent = rachaVigente();
  $('st-record').textContent = fmt(Almacen.leer('record', 0));
  $('st-larga').textContent = Almacen.leer('larga', '') || '—';
  $('version').textContent = VERSION;
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
// 14. Sonido con Web Audio API (sin archivos)
// ---------------------------------------------------------
const Sonido = {
  ctx: null,
  activo: Almacen.leer('sonido', true),

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

  mover() { this.tono(820, 0.025, { tipo: 'square', vol: 0.025 }); },
  aterrizar(vol = 1) { this.tono(170, 0.1, { tipo: 'triangle', vol: 0.22 * vol, frecFin: 90 }); },
  palabra() {
    [659.25, 987.77].forEach((f, k) => this.tono(f, 0.22, { tipo: 'triangle', vol: 0.14, retraso: k * 0.08 }));
  },
  cadena(nivel) {
    const base = 523.25 * Math.pow(2, Math.min(nivel, 10) * 2 / 12);
    [1, 1.25, 1.5, 2].forEach((m, k) => this.tono(base * m, 0.15, { tipo: 'square', vol: 0.06, retraso: k * 0.055 }));
    this.tono(base * 2, 0.35, { tipo: 'sine', vol: 0.1, retraso: 0.22 });
  },
  nivel() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, k) => this.tono(f, 0.2, { tipo: 'triangle', vol: 0.13, retraso: k * 0.09 }));
  },
  fin() {
    [440, 349.2, 293.7, 220].forEach((f, k) => this.tono(f, 0.3, { tipo: 'triangle', vol: 0.16, retraso: k * 0.17 }));
  },
};

const ICONO_SONIDO = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg><span>Sonido</span>';
const ICONO_MUDO = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 9l5 6M21 9l-5 6"/></svg><span>Silencio</span>';

function pintarBotonSonido() {
  const b = $('btn-sonido');
  b.innerHTML = Sonido.activo ? ICONO_SONIDO : ICONO_MUDO;
  b.setAttribute('aria-label', Sonido.activo ? 'Silenciar sonido' : 'Activar sonido');
}

// ---------------------------------------------------------
// 15. Aviso de instalación en iPhone (una sola vez)
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
// 16. Arranque
// ---------------------------------------------------------
async function iniciar() {
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
  $('btn-aviso-ok').addEventListener('click', () => $('aviso-ios').classList.add('oculto'));
  $('btn-sonido').addEventListener('click', () => {
    Sonido.activo = !Sonido.activo;
    Almacen.escribir('sonido', Sonido.activo);
    pintarBotonSonido();
    if (Sonido.activo) Sonido.palabra();
  });

  // Pausa automática si la app pasa a segundo plano
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pausar(); guardarPartida(); } });
  window.addEventListener('pagehide', guardarPartida);
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  mostrarInicio();
  avisoIOS();
  requestAnimationFrame(bucle);

  registrarActualizaciones();

  // Carga del diccionario
  try {
    await Diccionario.cargar();
    $('cargando').classList.add('oculto');
    $('btn-diario').disabled = false;
    $('btn-clasico').disabled = false;
    $('total-palabras').textContent = `${fmt(Diccionario.palabras.size)} palabras`;
  } catch (e) {
    const el = $('cargando');
    el.textContent = 'No se pudo cargar el diccionario. Conéctate a internet y recarga la página.';
    el.classList.add('error');
  }
}

// Funciones expuestas solo para pruebas desde la consola
window.LluviaDeLetras = {
  crearRng, crearGenerador, siguienteLetra, normalizar, Diccionario, crearTablero,
  filaLibre, buscarPalabras, resolverCascada, nuevoJuego, VALORES, COMODIN, COLS, FILAS,
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
