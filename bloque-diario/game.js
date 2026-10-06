/* =========================================================
   Bloque Diario — juego de puzzle de bloques (PWA)
   Todo el juego vive aquí: piezas, generador con semilla, reglas,
   dibujo en canvas, controles táctiles, sonido, guardado y pantallas.
   Sin librerías: solo JavaScript del navegador.
   ========================================================= */
'use strict';

// ---------------------------------------------------------
// 1. Configuración general
// ---------------------------------------------------------
const NOMBRE_JUEGO = 'Bloque Diario';
const VERSION = 'v2';                  // mantener igual que VERSION_CACHE en sw.js
const TAM = 8;                         // el tablero es de 8×8
const DESPLAZAMIENTO_DEDO = 60;        // px que la pieza flota por encima del dedo
const ESCALA_BANDEJA = 0.5;            // tamaño de las piezas en la bandeja (respecto al tablero)
const FECHA_RETO_1 = Date.UTC(2026, 0, 1); // el reto #1 fue el 1 de enero de 2026

// ---------------------------------------------------------
// 2. Guardado en localStorage (con try/catch: en modo privado puede fallar)
// ---------------------------------------------------------
const Almacen = {
  leer(clave, porDefecto) {
    try {
      const v = localStorage.getItem('bd_' + clave);
      return v === null ? porDefecto : JSON.parse(v);
    } catch (e) { return porDefecto; }
  },
  escribir(clave, valor) {
    try { localStorage.setItem('bd_' + clave, JSON.stringify(valor)); } catch (e) { /* sin espacio o bloqueado */ }
  },
  borrar(clave) {
    try { localStorage.removeItem('bd_' + clave); } catch (e) { /* nada */ }
  },
};

// ---------------------------------------------------------
// 3. Generador pseudoaleatorio con semilla (mulberry32)
//    Todo su estado es un solo entero de 32 bits, así que se puede
//    guardar y reanudar la secuencia exactamente donde iba.
// ---------------------------------------------------------
function crearRng(estadoInicial) {
  let a = estadoInicial | 0;
  return {
    siguiente() {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // número entre 0 y 1
    },
    get estado() { return a; },
  };
}

// ---------------------------------------------------------
// 4. Fechas: semilla AAAAMMDD en hora local
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
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc - FECHA_RETO_1) / 86400000) + 1;
}
function textoFecha(clave) {
  return fechaDeClave(clave).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
}
function msHastaMedianoche() {
  const ahora = new Date();
  const manana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1);
  return manana - ahora;
}
function formatoReloj(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(Math.floor(s / 3600))}:${dos(Math.floor(s / 60) % 60)}:${dos(s % 60)}`;
}
const fmt = (n) => Number(n).toLocaleString('es-MX'); // 4280 → "4,280"

// ---------------------------------------------------------
// 5. Piezas: cada familia tiene su color, su marca (dibujo
//    interior para distinguirla sin depender del color) y su peso
//    (qué tan seguido sale). 'X' = celda ocupada.
// ---------------------------------------------------------
const FAMILIAS = [
  { nombre: 'Punto',      color: '#ffd166', marca: 'circulo',    peso: 6,  formas: [['X']] },
  { nombre: 'Línea 2',    color: '#3ddc84', marca: 'raya',       peso: 10, formas: [['XX'], ['X', 'X']] },
  { nombre: 'Línea 3',    color: '#4cc9f0', marca: 'dosRayas',   peso: 10, formas: [['XXX'], ['X', 'X', 'X']] },
  { nombre: 'Línea 4',    color: '#4f7cff', marca: 'tresPuntos', peso: 7,  formas: [['XXXX'], ['X', 'X', 'X', 'X']] },
  { nombre: 'Línea 5',    color: '#9d7bff', marca: 'anillo',     peso: 4,  formas: [['XXXXX'], ['X', 'X', 'X', 'X', 'X']] },
  { nombre: 'Cuadro 2×2', color: '#ff6fb5', marca: 'rombo',      peso: 9,  formas: [['XX', 'XX']] },
  { nombre: 'Cuadro 3×3', color: '#ff5a5f', marca: 'cuadrito',   peso: 3,  formas: [['XXX', 'XXX', 'XXX']] },
  { nombre: 'Esquina',    color: '#ff9f40', marca: 'triangulo',  peso: 10, formas: [
    ['XX', 'X.'], ['XX', '.X'], ['X.', 'XX'], ['.X', 'XX']] },
  { nombre: 'Ele',        color: '#b5e550', marca: 'esquina',    peso: 12, formas: [
    ['X.', 'X.', 'XX'], ['XXX', 'X..'], ['XX', '.X', '.X'], ['..X', 'XXX'],   // ele
    ['.X', '.X', 'XX'], ['X..', 'XXX'], ['XX', 'X.', 'X.'], ['XXX', '..X']] }, // ele espejo
  { nombre: 'Ele grande', color: '#2ec4b6', marca: 'diamante',   peso: 5,  formas: [
    ['XXX', 'X..', 'X..'], ['XXX', '..X', '..X'], ['X..', 'X..', 'XXX'], ['..X', '..X', 'XXX']] },
  { nombre: 'Te',         color: '#d27bff', marca: 'cruz',       peso: 8,  formas: [
    ['XXX', '.X.'], ['.X.', 'XXX'], ['X.', 'XX', 'X.'], ['.X', 'XX', '.X']] },
  { nombre: 'Ese',        color: '#dfe3f0', marca: 'zigzag',     peso: 8,  formas: [
    ['.XX', 'XX.'], ['XX.', '.XX'], ['X.', 'XX', '.X'], ['.X', 'XX', 'X.']] },
];

// Convierte los dibujos de texto en listas de celdas y calcula colores derivados
for (const fam of FAMILIAS) {
  fam.piezas = fam.formas.map((filas) => {
    const celdas = [];
    filas.forEach((fila, r) => [...fila].forEach((ch, c) => { if (ch === 'X') celdas.push([r, c]); }));
    return { celdas, al: filas.length, an: Math.max(...filas.map((f) => f.length)) };
  });
  fam.oscuro = mezclarColor(fam.color, '#000000', 0.38);
  fam.marcaClara = luminancia(fam.color) < 0.45; // marca clara sobre colores oscuros
}
const PESO_TOTAL = FAMILIAS.reduce((s, f) => s + f.peso, 0);

function hexARgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mezclarColor(a, b, t) {
  const A = hexARgb(a), B = hexARgb(b);
  return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')';
}
function luminancia(hex) {
  const [r, g, b] = hexARgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// Una pieza es { f: familia, o: orientación }
function sacarPieza(rng) {
  let x = rng.siguiente() * PESO_TOTAL;
  let f = 0;
  while (f < FAMILIAS.length - 1 && x >= FAMILIAS[f].peso) { x -= FAMILIAS[f].peso; f++; }
  const o = Math.floor(rng.siguiente() * FAMILIAS[f].piezas.length);
  return { f, o };
}
const forma = (p) => FAMILIAS[p.f].piezas[p.o];

// Saca la siguiente tanda de 3 piezas y avanza el estado del generador del juego.
// La secuencia depende SOLO de la semilla, no de cómo juegue cada persona.
function sacarTanda(j) {
  const rng = crearRng(j.rngEstado);
  const tanda = [sacarPieza(rng), sacarPieza(rng), sacarPieza(rng)];
  j.rngEstado = rng.estado;
  return tanda;
}

// ---------------------------------------------------------
// 6. Reglas del tablero (funciones puras, fáciles de probar)
//    El tablero es un arreglo de 64 números: -1 vacío, o la familia.
// ---------------------------------------------------------
function cabe(tablero, p, fila, col) {
  for (const [r, c] of forma(p).celdas) {
    const rr = fila + r, cc = col + c;
    if (rr < 0 || rr >= TAM || cc < 0 || cc >= TAM) return false;
    if (tablero[rr * TAM + cc] !== -1) return false;
  }
  return true;
}

// ¿Cabe la pieza en alguna posición del tablero?
function cabeEnAlgunLado(tablero, p) {
  const fm = forma(p);
  for (let r = 0; r <= TAM - fm.al; r++) {
    for (let c = 0; c <= TAM - fm.an; c++) {
      if (cabe(tablero, p, r, c)) return true;
    }
  }
  return false;
}

// La partida sigue mientras al menos una pieza disponible quepa
function hayJugada(tablero, bandeja) {
  return bandeja.some((p) => p && cabeEnAlgunLado(tablero, p));
}

// Filas y columnas llenas
function lineasLlenas(tablero) {
  const filas = [], cols = [];
  for (let i = 0; i < TAM; i++) {
    let filaLlena = true, colLlena = true;
    for (let k = 0; k < TAM; k++) {
      if (tablero[i * TAM + k] === -1) filaLlena = false;
      if (tablero[k * TAM + i] === -1) colLlena = false;
    }
    if (filaLlena) filas.push(i);
    if (colLlena) cols.push(i);
  }
  return { filas, cols };
}

// Coloca la pieza, limpia líneas y devuelve qué se limpió
function colocarEnTablero(tablero, p, fila, col) {
  for (const [r, c] of forma(p).celdas) tablero[(fila + r) * TAM + col + c] = p.f;
  const { filas, cols } = lineasLlenas(tablero);
  const limpiar = new Set();
  for (const r of filas) for (let c = 0; c < TAM; c++) limpiar.add(r * TAM + c);
  for (const c of cols) for (let r = 0; r < TAM; r++) limpiar.add(r * TAM + c);
  const celdas = [];
  for (const i of limpiar) {
    celdas.push({ r: Math.floor(i / TAM), c: i % TAM, f: tablero[i] });
    tablero[i] = -1;
  }
  return { filas, cols, celdas, n: filas.length + cols.length };
}

// Puntaje de una jugada: 1 por celda + 10 × líneas × líneas × combo
function puntosJugada(celdas, lineas, combo) {
  return celdas + (lineas > 0 ? 10 * lineas * lineas * combo : 0);
}

// Resumen en emojis: la partida se divide en hasta 8 tramos y cada
// cuadro indica cuántas líneas se limpiaron en ese tramo.
function resumenEmoji(jugadas) {
  const n = jugadas.length;
  if (!n) return '⬛';
  const tramos = Math.min(8, n);
  let texto = '';
  for (let i = 0; i < tramos; i++) {
    const parte = jugadas.slice(Math.floor(i * n / tramos), Math.floor((i + 1) * n / tramos));
    const prom = parte.reduce((s, v) => s + v, 0) / parte.length;
    texto += prom === 0 ? '⬛' : prom < 0.34 ? '🟨' : prom < 0.67 ? '🟩' : '🟦';
  }
  return texto;
}

// ---------------------------------------------------------
// 7. Estado de la partida
// ---------------------------------------------------------
let juego = null;    // partida actual
let pantalla = 'inicio';
let ultimoResultado = null;

function nuevoJuego(modo, semilla, extra = {}) {
  const j = {
    modo,                                   // 'diario' o 'practica'
    semilla: semilla >>> 0,
    fecha: extra.fecha || null,             // AAAAMMDD (solo diario)
    objetivo: extra.objetivo ?? null,       // puntaje a vencer (enlace de reto)
    tablero: new Array(TAM * TAM).fill(-1),
    bandeja: [null, null, null],
    rngEstado: semilla | 0,
    puntaje: 0,
    lineas: 0,
    combo: 0,
    mejorCombo: 0,
    jugadas: [],                            // líneas limpiadas en cada jugada
    terminado: false,
  };
  j.bandeja = sacarTanda(j);
  return j;
}

function guardarPartida() {
  if (!juego || juego.terminado) return;
  Almacen.escribir('partida_' + juego.modo, juego);
}

// Devuelve la partida guardada si sigue siendo válida
function partidaGuardada(modo) {
  const j = Almacen.leer('partida_' + modo, null);
  if (!j || j.terminado || !Array.isArray(j.tablero) || j.tablero.length !== TAM * TAM) return null;
  if (modo === 'diario' && j.fecha !== claveFecha()) {
    Almacen.borrar('partida_diario'); // era de otro día
    return null;
  }
  return j;
}

function resultadoDeHoy() {
  const r = Almacen.leer('resultado_diario', null);
  return r && r.fecha === claveFecha() ? r : null;
}

function leerRacha() {
  return Almacen.leer('racha', { ultima: 0, actual: 0, mejor: 0 });
}
// Racha que se muestra: vale si el último reto fue hoy o ayer
function rachaVigente() {
  const r = leerRacha();
  const hoy = claveFecha();
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
  return r;
}

// ---------------------------------------------------------
// 8. Canvas: tamaño, nitidez (devicePixelRatio) y distribución
// ---------------------------------------------------------
const $ = (id) => document.getElementById(id);
const lienzo = $('lienzo');
const ctx = lienzo.getContext('2d');
let dpr = 1;
let L = null;            // medidas calculadas (layout)
let sucio = true;        // hay que redibujar
const sprites = new Map();

function recalcularLayout() {
  const zona = $('zona');
  const w = zona.clientWidth, h = zona.clientHeight;
  if (!w || !h) return;
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  lienzo.width = Math.round(w * dpr);
  lienzo.height = Math.round(h * dpr);
  lienzo.style.width = w + 'px';
  lienzo.style.height = h + 'px';

  const margen = 12, marco = 6;
  const altoBandejaCeldas = 3.2, huecoCeldas = 0.5;
  // El tablero usa el ancho disponible (máx. 480 px) sin pasarse del alto
  const anchoTablero = Math.min(w - margen * 2, 480);
  let celda = Math.floor((anchoTablero - marco * 2) / TAM);
  celda = Math.min(celda, Math.floor((h - margen * 2 - marco * 2) / (TAM + huecoCeldas + altoBandejaCeldas)));
  celda = Math.max(celda, 14);

  const lado = celda * TAM;
  const altoTotal = lado + marco * 2 + celda * (huecoCeldas + altoBandejaCeldas);
  const x = Math.round((w - lado) / 2);
  const y = Math.round(Math.max(margen, (h - altoTotal) / 2) + marco);
  L = {
    w, h, celda, x, y, lado, marco,
    bandejaY: y + lado + marco + celda * huecoCeldas,
    bandejaAlto: celda * altoBandejaCeldas,
    ranura: lado / 3,
  };
  sprites.clear();
  sucio = true;
}

// Rectángulo con esquinas redondeadas (compatible con navegadores viejos)
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

// Cada familia se pinta una vez en un canvas pequeño (sprite) y luego se copia:
// así el dibujo por cuadro es rápido aunque haya muchas celdas.
function sprite(f) {
  const px = Math.max(8, Math.round(L.celda * dpr));
  const clave = f + '_' + px;
  let s = sprites.get(clave);
  if (s) return s;
  s = document.createElement('canvas');
  s.width = s.height = px;
  pintarBloque(s.getContext('2d'), px, FAMILIAS[f]);
  sprites.set(clave, s);
  return s;
}

function pintarBloque(g, t, fam) {
  const sep = Math.max(1, t * 0.05);
  const a = t - sep * 2;
  const r = a * 0.22;
  // Borde inferior oscuro (da volumen)
  g.fillStyle = fam.oscuro;
  rutaRedondeada(g, sep, sep, a, a, r); g.fill();
  // Cara principal
  g.fillStyle = fam.color;
  rutaRedondeada(g, sep, sep, a, a * 0.88, r); g.fill();
  // Brillo superior
  const brillo = g.createLinearGradient(0, sep, 0, sep + a * 0.5);
  brillo.addColorStop(0, 'rgba(255,255,255,0.45)');
  brillo.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = brillo;
  rutaRedondeada(g, sep + a * 0.08, sep + a * 0.06, a * 0.84, a * 0.42, r * 0.7); g.fill();
  // Marca interior propia de cada familia
  pintarMarca(g, fam.marca, t / 2, sep + a * 0.45, a * 0.19,
    fam.marcaClara ? 'rgba(255,255,255,0.75)' : 'rgba(15,16,40,0.45)');
}

function pintarMarca(g, tipo, cx, cy, m, color) {
  g.save();
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineWidth = Math.max(1, m * 0.34);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  const rombo = () => { g.moveTo(cx, cy - m); g.lineTo(cx + m, cy); g.lineTo(cx, cy + m); g.lineTo(cx - m, cy); g.closePath(); };
  switch (tipo) {
    case 'circulo': g.arc(cx, cy, m * 0.75, 0, Math.PI * 2); g.fill(); break;
    case 'raya': g.moveTo(cx - m, cy); g.lineTo(cx + m, cy); g.stroke(); break;
    case 'dosRayas':
      g.moveTo(cx - m * 0.45, cy - m * 0.8); g.lineTo(cx - m * 0.45, cy + m * 0.8);
      g.moveTo(cx + m * 0.45, cy - m * 0.8); g.lineTo(cx + m * 0.45, cy + m * 0.8);
      g.stroke(); break;
    case 'tresPuntos':
      for (const k of [-1, 0, 1]) {
        g.moveTo(cx + k * m * 0.8 + m * 0.28, cy - k * m * 0.8);
        g.arc(cx + k * m * 0.8, cy - k * m * 0.8, m * 0.28, 0, Math.PI * 2);
      }
      g.fill(); break;
    case 'anillo': g.arc(cx, cy, m * 0.75, 0, Math.PI * 2); g.stroke(); break;
    case 'rombo': rombo(); g.fill(); break;
    case 'diamante': rombo(); g.stroke(); break;
    case 'cuadrito': g.rect(cx - m * 0.7, cy - m * 0.7, m * 1.4, m * 1.4); g.stroke(); break;
    case 'triangulo':
      g.moveTo(cx, cy - m * 0.85); g.lineTo(cx + m * 0.9, cy + m * 0.7); g.lineTo(cx - m * 0.9, cy + m * 0.7);
      g.closePath(); g.fill(); break;
    case 'esquina':
      g.moveTo(cx - m * 0.7, cy - m * 0.85); g.lineTo(cx - m * 0.7, cy + m * 0.7); g.lineTo(cx + m * 0.85, cy + m * 0.7);
      g.stroke(); break;
    case 'cruz':
      g.moveTo(cx - m, cy); g.lineTo(cx + m, cy); g.moveTo(cx, cy - m); g.lineTo(cx, cy + m);
      g.stroke(); break;
    case 'zigzag':
      g.moveTo(cx - m, cy + m * 0.4); g.lineTo(cx - m * 0.33, cy - m * 0.4);
      g.lineTo(cx + m * 0.33, cy + m * 0.4); g.lineTo(cx + m, cy - m * 0.4);
      g.stroke(); break;
  }
  g.restore();
}

// Dibuja un bloque en (x, y) de tamaño s, con transparencia y escala opcionales
function dibujarBloque(x, y, s, f, alfa = 1, escala = 1) {
  if (alfa <= 0 || escala <= 0) return;
  const t = s * escala;
  ctx.globalAlpha = alfa;
  ctx.drawImage(sprite(f), x + (s - t) / 2, y + (s - t) / 2, t, t);
  ctx.globalAlpha = 1;
}

// Dibuja una pieza completa centrada en (cx, cy) con celdas de tamaño s
function dibujarPieza(p, cx, cy, s, alfa = 1) {
  const fm = forma(p);
  const x0 = cx - (fm.an * s) / 2, y0 = cy - (fm.al * s) / 2;
  for (const [r, c] of fm.celdas) dibujarBloque(x0 + c * s, y0 + r * s, s, p.f, alfa);
}

// ---------------------------------------------------------
// 9. Animaciones (todas con requestAnimationFrame)
// ---------------------------------------------------------
let animaciones = [];          // destellos, aparición de piezas, textos flotantes
let arrastre = null;           // pieza que se está arrastrando
let regreso = null;            // pieza volviendo a la bandeja
let aparicionBandeja = [0, 0, 0]; // momento en que apareció cada pieza de la bandeja
let cabenEnBandeja = [true, true, true];
let puntajeMostrado = 0;

const facilSalida = (t) => 1 - Math.pow(1 - t, 3);
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));

function centroRanura(i) {
  return { x: L.x + L.ranura * (i + 0.5), y: L.bandejaY + L.bandejaAlto / 2 };
}

function dibujar(ahora) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, L.w, L.h);
  if (!juego) return;
  const { celda: s, x: bx, y: by, lado, marco } = L;

  // --- Marco y celdas vacías ---
  ctx.fillStyle = '#161936';
  rutaRedondeada(ctx, bx - marco, by - marco, lado + marco * 2, lado + marco * 2, 14); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#23274b';
  const sep = Math.max(1, s * 0.05);
  for (let r = 0; r < TAM; r++) {
    for (let c = 0; c < TAM; c++) {
      if (juego.tablero[r * TAM + c] !== -1) continue;
      rutaRedondeada(ctx, bx + c * s + sep, by + r * s + sep, s - sep * 2, s - sep * 2, s * 0.18);
      ctx.fill();
    }
  }

  // --- Escala de "rebote" para las celdas recién colocadas ---
  const escalas = new Map();
  for (const a of animaciones) {
    if (a.tipo !== 'pop') continue;
    const t = (ahora - a.t0) / a.dur;
    if (t >= 1) continue;
    const e = 1 + 0.2 * Math.sin(Math.PI * limitar(t, 0, 1));
    for (const [r, c] of a.celdas) escalas.set(r * TAM + c, e);
  }

  // --- Líneas que se completarían con la pieza que se arrastra ---
  const sombra = arrastre && arrastre.sombra;
  const vista = new Set(sombra && sombra.valida ? sombra.completas : []);

  // --- Bloques colocados ---
  for (let i = 0; i < TAM * TAM; i++) {
    const f = juego.tablero[i];
    if (f === -1) continue;
    const r = Math.floor(i / TAM), c = i % TAM;
    // Si la línea se va a limpiar, se pinta del color de la pieza que llega
    dibujarBloque(bx + c * s, by + r * s, s, vista.has(i) ? arrastre.p.f : f, 1, escalas.get(i) || 1);
  }

  // --- Sombra de dónde caería la pieza ---
  if (sombra) {
    for (const [r, c] of forma(arrastre.p).celdas) {
      const rr = sombra.fila + r, cc = sombra.col + c;
      if (rr < 0 || rr >= TAM || cc < 0 || cc >= TAM) continue;
      const x = bx + cc * s, y = by + rr * s;
      if (sombra.valida) {
        dibujarBloque(x, y, s, arrastre.p.f, vista.has(rr * TAM + cc) ? 0.9 : 0.38);
      } else {
        // No cabe: sombra roja
        ctx.fillStyle = 'rgba(255,90,110,0.30)';
        ctx.strokeStyle = 'rgba(255,110,125,0.85)';
        ctx.lineWidth = 2;
        rutaRedondeada(ctx, x + sep + 1, y + sep + 1, s - sep * 2 - 2, s - sep * 2 - 2, s * 0.18);
        ctx.fill(); ctx.stroke();
      }
    }
  }

  // --- Destello y desvanecido de las líneas limpiadas ---
  for (const a of animaciones) {
    if (a.tipo !== 'limpiar') continue;
    for (const cel of a.celdas) {
      const t = (ahora - a.t0 - cel.retraso) / a.dur;
      const x = bx + cel.c * s, y = by + cel.r * s;
      if (t < 0) { dibujarBloque(x, y, s, cel.f); continue; }
      if (t >= 1) continue;
      if (t < 0.3) {
        dibujarBloque(x, y, s, cel.f);
        ctx.fillStyle = `rgba(255,255,255,${(t / 0.3) * 0.85})`;
      } else {
        const k = (t - 0.3) / 0.7;
        dibujarBloque(x, y, s, cel.f, 1 - k, 1 - 0.6 * facilSalida(k));
        ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - k)})`;
      }
      const e = t < 0.3 ? 1 : 1 - 0.6 * facilSalida((t - 0.3) / 0.7);
      const tt = (s - sep * 2) * e;
      rutaRedondeada(ctx, x + (s - tt) / 2, y + (s - tt) / 2, tt, tt, s * 0.18 * e);
      ctx.fill();
    }
  }

  // --- Bandeja con las 3 piezas ---
  for (let i = 0; i < 3; i++) {
    const p = juego.bandeja[i];
    if (!p) continue;
    if (arrastre && arrastre.i === i) continue;
    if (regreso && regreso.i === i) continue;
    const { x, y } = centroRanura(i);
    const ta = limitar((ahora - aparicionBandeja[i]) / 220, 0, 1);
    const esc = ESCALA_BANDEJA * (0.4 + 0.6 * facilSalida(ta));
    const alfa = (cabenEnBandeja[i] ? 1 : 0.28) * ta;
    dibujarPieza(p, x, y, s * esc, alfa);
  }

  // --- Pieza regresando a la bandeja ---
  if (regreso) {
    const t = facilSalida(limitar((ahora - regreso.t0) / regreso.dur, 0, 1));
    const destino = centroRanura(regreso.i);
    const tam = s * (regreso.escala + (ESCALA_BANDEJA - regreso.escala) * t);
    dibujarPieza(regreso.p, regreso.x + (destino.x - regreso.x) * t, regreso.y + (destino.y - regreso.y) * t, tam);
  }

  // --- Pieza arrastrada (flota sobre el dedo) ---
  if (arrastre) {
    const c = centroArrastre();
    dibujarPieza(arrastre.p, c.x, c.y, s * escalaArrastre(ahora), 0.97);
  }

  // --- Textos flotantes (+puntos, combo) ---
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const a of animaciones) {
    if (a.tipo !== 'texto') continue;
    const t = (ahora - a.t0) / a.dur;
    if (t < 0 || t >= 1) continue;
    const alfa = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    const y = a.y - 40 * facilSalida(t);
    const tam = a.tam * (t < 0.15 ? 0.7 + 2 * t : 1);
    ctx.font = `800 ${tam}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.globalAlpha = alfa;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(10,11,30,0.85)';
    ctx.strokeText(a.texto, a.x, y);
    ctx.fillStyle = a.color;
    ctx.fillText(a.texto, a.x, y);
    ctx.globalAlpha = 1;
  }

  // --- Fin de partida: oscurece el tablero ---
  if (juego.terminado && juego.finT0) {
    const t = limitar((ahora - juego.finT0) / 500, 0, 1);
    ctx.fillStyle = `rgba(8,9,24,${0.6 * t})`;
    rutaRedondeada(ctx, bx - marco, by - marco, lado + marco * 2, lado + marco * 2, 14); ctx.fill();
    ctx.globalAlpha = t;
    ctx.font = `800 ${Math.round(s * 0.6)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = '#f3f4ff';
    ctx.fillText('Sin espacio', bx + lado / 2, by + lado / 2);
    ctx.globalAlpha = 1;
  }
}

// Bucle principal a 60 fps: solo redibuja cuando algo cambia o se anima
function bucle() {
  const ahora = performance.now();
  animaciones = animaciones.filter((a) => ahora - a.t0 < a.dur + (a.extra || 0));
  if (regreso && ahora - regreso.t0 >= regreso.dur) { regreso = null; sucio = true; }

  const animandoBandeja = aparicionBandeja.some((t) => ahora - t < 240);
  const animandoFin = juego && juego.terminado && juego.finT0 && ahora - juego.finT0 < 520;
  if (L && (sucio || animaciones.length || arrastre || regreso || animandoBandeja || animandoFin)) {
    dibujar(ahora);
    sucio = false;
  }

  // Puntaje del HUD que "cuenta" hasta el valor real
  if (juego && puntajeMostrado !== juego.puntaje) {
    const dif = juego.puntaje - puntajeMostrado;
    puntajeMostrado += Math.sign(dif) * Math.max(1, Math.ceil(Math.abs(dif) * 0.18));
    if (Math.sign(juego.puntaje - puntajeMostrado) !== Math.sign(dif)) puntajeMostrado = juego.puntaje;
    $('hud-puntaje').textContent = fmt(puntajeMostrado);
  }
  requestAnimationFrame(bucle);
}

// ---------------------------------------------------------
// 10. Controles con Pointer Events (un solo dedo)
// ---------------------------------------------------------
function posicionLocal(e) {
  const rect = lienzo.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// ¿Qué ranura de la bandeja se tocó? (zona generosa para dedos)
function ranuraEn(x, y) {
  if (y < L.bandejaY - L.celda * 0.4) return -1;
  if (x < L.x - L.celda * 0.6 || x > L.x + L.lado + L.celda * 0.6) return -1;
  return limitar(Math.floor((x - L.x) / L.ranura), 0, 2);
}

function escalaArrastre(ahora) {
  const t = facilSalida(limitar((ahora - arrastre.t0) / 120, 0, 1));
  return ESCALA_BANDEJA + (1 - ESCALA_BANDEJA) * t;
}

// La pieza se dibuja ~60 px por encima del dedo para que no la tape
function centroArrastre() {
  const fm = forma(arrastre.p);
  return { x: arrastre.x, y: arrastre.y - DESPLAZAMIENTO_DEDO - (fm.al * L.celda) / 2 };
}

// Calcula dónde caería la pieza y si cabe
function actualizarSombra() {
  const fm = forma(arrastre.p);
  const c = centroArrastre();
  const col = Math.round((c.x - (fm.an * L.celda) / 2 - L.x) / L.celda);
  const fila = Math.round((c.y - (fm.al * L.celda) / 2 - L.y) / L.celda);
  const previa = arrastre.sombra;
  if (previa && previa.fila === fila && previa.col === col) return;

  // Solo hay sombra si alguna celda de la pieza queda sobre el tablero
  const tocaTablero = fm.celdas.some(([r, cc]) =>
    fila + r >= 0 && fila + r < TAM && col + cc >= 0 && col + cc < TAM);
  if (!tocaTablero) { arrastre.sombra = null; return; }

  const valida = cabe(juego.tablero, arrastre.p, fila, col);
  let completas = [];
  if (valida) {
    // Simula la jugada para resaltar las líneas que se limpiarían
    const prueba = juego.tablero.slice();
    for (const [r, cc] of fm.celdas) prueba[(fila + r) * TAM + col + cc] = arrastre.p.f;
    const { filas, cols } = lineasLlenas(prueba);
    for (const r of filas) for (let k = 0; k < TAM; k++) completas.push(r * TAM + k);
    for (const k of cols) for (let r = 0; r < TAM; r++) completas.push(r * TAM + k);
  }
  arrastre.sombra = { fila, col, valida, completas };
}

lienzo.addEventListener('pointerdown', (e) => {
  Sonido.preparar(); // el audio solo se puede activar tras un toque
  if (!juego || juego.terminado || arrastre || pantalla !== 'juego' || !L) return;
  const { x, y } = posicionLocal(e);
  const i = ranuraEn(x, y);
  if (i < 0 || !juego.bandeja[i] || (regreso && regreso.i === i)) return;
  e.preventDefault();
  try { lienzo.setPointerCapture(e.pointerId); } catch (err) { /* nada */ }
  arrastre = { i, p: juego.bandeja[i], x, y, id: e.pointerId, t0: performance.now(), sombra: null };
  actualizarSombra();
});

lienzo.addEventListener('pointermove', (e) => {
  if (!arrastre || e.pointerId !== arrastre.id) return;
  e.preventDefault();
  const { x, y } = posicionLocal(e);
  arrastre.x = x;
  arrastre.y = y;
  actualizarSombra();
});

function soltar(e, cancelado) {
  if (!arrastre || e.pointerId !== arrastre.id) return;
  const a = arrastre;
  arrastre = null;
  if (!cancelado && a.sombra && a.sombra.valida) {
    jugar(a.i, a.sombra.fila, a.sombra.col);
  } else {
    // Lugar inválido: la pieza regresa a la bandeja con animación
    const ahora = performance.now();
    const fm = forma(a.p);
    regreso = {
      i: a.i, p: a.p, t0: ahora, dur: 220,
      x: a.x, y: a.y - DESPLAZAMIENTO_DEDO - (fm.al * L.celda) / 2,
      escala: ESCALA_BANDEJA + (1 - ESCALA_BANDEJA) * facilSalida(limitar((ahora - a.t0) / 120, 0, 1)),
    };
    if (a.sombra) Sonido.error();
  }
  sucio = true;
}
lienzo.addEventListener('pointerup', (e) => soltar(e, false));
lienzo.addEventListener('pointercancel', (e) => soltar(e, true));
lienzo.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------
// 11. Una jugada
// ---------------------------------------------------------
function jugar(i, fila, col) {
  const p = juego.bandeja[i];
  const fm = forma(p);
  const ahora = performance.now();
  const res = colocarEnTablero(juego.tablero, p, fila, col);
  juego.bandeja[i] = null;

  // Puntaje y combo
  if (res.n > 0) {
    juego.combo += 1;
    juego.lineas += res.n;
    juego.mejorCombo = Math.max(juego.mejorCombo, juego.combo);
  } else {
    juego.combo = 0;
  }
  const pts = puntosJugada(fm.celdas.length, res.n, juego.combo);
  juego.puntaje += pts;
  juego.jugadas.push(res.n);

  // Animación de "rebote" de la pieza colocada
  animaciones.push({ tipo: 'pop', t0: ahora, dur: 160, celdas: fm.celdas.map(([r, c]) => [fila + r, col + c]) });

  // Centro de la pieza (para los textos y el orden del destello)
  const cr = fila + fm.al / 2, cc = col + fm.an / 2;
  const tx = L.x + cc * L.celda, ty = L.y + cr * L.celda;

  if (res.n > 0) {
    // El destello avanza desde la pieza hacia afuera
    const celdas = res.celdas.map((cel) => ({
      ...cel, retraso: Math.hypot(cel.r + 0.5 - cr, cel.c + 0.5 - cc) * 22,
    }));
    animaciones.push({ tipo: 'limpiar', t0: ahora, dur: 380, extra: 260, celdas });
    texto(`+${fmt(pts)}`, tx, ty, '#ffffff', L.celda * 0.75);
    const palabras = ['', '', '¡Doble!', '¡Triple!', '¡Increíble!'];
    if (res.n >= 2) texto(palabras[Math.min(res.n, 4)], L.x + L.lado / 2, L.y + L.lado * 0.38, '#6ef2c4', L.celda * 0.8, 120);
    if (juego.combo >= 2) {
      texto(`Combo ×${juego.combo}`, L.x + L.lado / 2, L.y + L.lado * 0.55, '#ffd166', L.celda * 0.7, 200);
      Sonido.combo(juego.combo);
    } else {
      Sonido.limpiar(res.n);
    }
    vibrar(res.n >= 2 || juego.combo >= 2 ? [30, 40, 50] : 35);
  } else {
    Sonido.colocar();
  }

  // Si se usaron las 3, llegan 3 nuevas
  if (juego.bandeja.every((x) => !x)) {
    juego.bandeja = sacarTanda(juego);
    aparicionBandeja = [ahora + 60, ahora + 120, ahora + 180];
  }

  actualizarCaben();
  actualizarHud(true);
  sucio = true;

  if (!hayJugada(juego.tablero, juego.bandeja)) {
    terminar();
  } else {
    guardarPartida();
  }
}

function texto(t, x, y, color, tam, retraso = 0) {
  animaciones.push({ tipo: 'texto', texto: t, x, y, color, tam: Math.round(tam), t0: performance.now() + retraso, dur: 900 });
}

function actualizarCaben() {
  cabenEnBandeja = juego.bandeja.map((p) => !p || cabeEnAlgunLado(juego.tablero, p));
}

function vibrar(patron) {
  try { if (navigator.vibrate) navigator.vibrate(patron); } catch (e) { /* no soportado */ }
}

// ---------------------------------------------------------
// 12. Fin de partida y resultados
// ---------------------------------------------------------
function terminar() {
  if (juego.terminado) return;
  juego.terminado = true;
  juego.finT0 = performance.now() + 450; // deja ver primero el destello
  setTimeout(() => Sonido.fin(), 450);

  const record = Almacen.leer('record', 0);
  const nuevoRecord = juego.puntaje > record;
  if (nuevoRecord) Almacen.escribir('record', juego.puntaje);

  const r = {
    modo: juego.modo,
    fecha: juego.fecha,
    numero: juego.fecha ? numeroReto(juego.fecha) : null,
    puntaje: juego.puntaje,
    lineas: juego.lineas,
    mejorCombo: juego.mejorCombo,
    emojis: resumenEmoji(juego.jugadas),
    semilla: juego.semilla,
    objetivo: juego.objetivo,
    nuevoRecord,
  };

  if (juego.modo === 'diario') {
    Almacen.escribir('resultado_diario', r);
    registrarDiaJugado(juego.fecha);
    Almacen.borrar('partida_diario');
  } else {
    Almacen.borrar('partida_practica');
  }

  const modoAlTerminar = juego;
  setTimeout(() => {
    if (juego === modoAlTerminar && pantalla === 'juego') mostrarResultado(r);
  }, 1500);
}

function mostrarResultado(r) {
  ultimoResultado = r;
  pantalla = 'resultado';
  const esDiario = r.modo === 'diario';
  $('res-etiqueta').textContent = esDiario ? `Reto #${r.numero} · ${textoFecha(r.fecha)}`
    : r.objetivo != null ? 'Reto de un amigo' : 'Práctica';
  $('res-titulo').textContent = esDiario ? '¡Reto completado!' : '¡Fin de la partida!';
  $('res-puntaje').textContent = fmt(r.puntaje);
  $('res-insignia').classList.toggle('oculto', !r.nuevoRecord);
  $('res-emojis').textContent = r.emojis;
  $('res-lineas').textContent = fmt(r.lineas);
  $('res-combo').textContent = r.mejorCombo >= 2 ? `×${r.mejorCombo}` : r.mejorCombo === 1 ? '×1' : '—';

  if (esDiario) {
    const racha = rachaVigente();
    $('res-tercero').textContent = racha;
    $('res-tercero-txt').textContent = racha === 1 ? 'Día de racha' : 'Días de racha';
  } else {
    $('res-tercero').textContent = fmt(Almacen.leer('record', 0));
    $('res-tercero-txt').textContent = 'Récord';
  }

  const obj = $('res-objetivo');
  obj.classList.toggle('oculto', r.objetivo == null);
  if (r.objetivo != null) {
    const gano = r.puntaje > r.objetivo;
    obj.className = 'objetivo ' + (gano ? 'gano' : 'perdio');
    obj.textContent = gano ? `¡Venciste el reto de ${fmt(r.objetivo)} pts!`
      : r.puntaje === r.objetivo ? `Empate con ${fmt(r.objetivo)} pts` : `Te faltaron ${fmt(r.objetivo - r.puntaje)} pts para ${fmt(r.objetivo)}`;
  }

  $('res-cuenta').classList.toggle('oculto', !esDiario);
  $('btn-otra').textContent = esDiario ? 'Jugar práctica' : r.objetivo != null ? 'Intentar el reto otra vez' : 'Jugar otra vez';
  mostrarCapa('pantalla-resultado');
  actualizarRelojes();
}

function textoCompartir(r) {
  const base = urlBase();
  if (r.modo === 'diario') {
    const racha = rachaVigente();
    return `${NOMBRE_JUEGO} #${r.numero} — ${fmt(r.puntaje)} pts ${r.emojis} Racha: ${racha} ${racha === 1 ? 'día' : 'días'}\n${base}`;
  }
  // En práctica se comparte un enlace de reto con la misma semilla
  return `${NOMBRE_JUEGO} · Práctica — ${fmt(r.puntaje)} pts ${r.emojis} ¿Me superas?\n${base}?seed=${r.semilla}&score=${r.puntaje}`;
}

function urlBase() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

async function compartir() {
  if (!ultimoResultado) return;
  const txt = textoCompartir(ultimoResultado);
  if (navigator.share) {
    try {
      await navigator.share({ text: txt });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; // el jugador cerró el menú
    }
  }
  // Respaldo: copiar al portapapeles
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

function actualizarHud(animarCombo) {
  if (!juego) return;
  $('hud-modo').textContent = juego.modo === 'diario' ? `Reto diario #${numeroReto(juego.fecha)}`
    : juego.objetivo != null ? 'Reto de un amigo' : 'Práctica';
  const sub = $('hud-sub');
  if (juego.objetivo != null) {
    const superado = juego.puntaje > juego.objetivo;
    sub.textContent = superado ? `¡Superaste ${fmt(juego.objetivo)}!` : `Puntaje a vencer: ${fmt(juego.objetivo)}`;
    sub.classList.toggle('superado', superado);
  } else {
    sub.textContent = `Récord: ${fmt(Math.max(Almacen.leer('record', 0), juego.puntaje))}`;
    sub.classList.remove('superado');
  }
  const combo = $('hud-combo');
  combo.classList.toggle('oculto', juego.combo < 2);
  combo.textContent = `Combo ×${juego.combo}`;
  if (animarCombo && juego.combo >= 2) {
    combo.classList.remove('pulso');
    void combo.offsetWidth; // reinicia la animación CSS
    combo.classList.add('pulso');
  }
}

function iniciarJuego(j) {
  juego = j;
  pantalla = 'juego';
  animaciones = [];
  arrastre = null;
  regreso = null;
  const ahora = performance.now();
  aparicionBandeja = [ahora, ahora + 60, ahora + 120];
  puntajeMostrado = juego.puntaje;
  $('hud-puntaje').textContent = fmt(juego.puntaje);
  mostrarCapa(null);
  recalcularLayout();
  actualizarCaben();
  actualizarHud(false);
  guardarPartida();
  sucio = true;
  // Una partida reanudada podría ya no tener jugadas
  if (!hayJugada(juego.tablero, juego.bandeja)) terminar();
}

function jugarDiario() {
  const hecho = resultadoDeHoy();
  if (hecho) { juego = null; sucio = true; mostrarResultado(hecho); return; }
  const hoy = claveFecha();
  iniciarJuego(partidaGuardada('diario') || nuevoJuego('diario', hoy, { fecha: hoy }));
}

function semillaAleatoria() {
  return Math.floor(Math.random() * 4294967295) >>> 0;
}

function jugarPractica(nueva) {
  const guardada = !nueva && partidaGuardada('practica');
  iniciarJuego(guardada || nuevoJuego('practica', semillaAleatoria()));
}

function mostrarInicio() {
  guardarPartida();
  pantalla = 'inicio';
  arrastre = null;
  const hoy = claveFecha();
  $('inicio-reto').textContent = `Reto #${numeroReto(hoy)}`;
  $('inicio-fecha').textContent = textoFecha(hoy);

  const hecho = resultadoDeHoy();
  const enCurso = partidaGuardada('diario');
  $('inicio-estado').textContent = hecho ? `Hecho: ${fmt(hecho.puntaje)} pts ${hecho.emojis}`
    : enCurso ? `En curso: ${fmt(enCurso.puntaje)} pts` : 'Todavía no lo juegas. Solo cuenta un intento.';
  $('btn-diario').textContent = hecho ? 'Ver mi resultado' : enCurso ? 'Continuar reto de hoy' : 'Jugar reto de hoy';

  const practica = partidaGuardada('practica');
  $('btn-practica').textContent = practica ? `Continuar práctica (${fmt(practica.puntaje)} pts)` : 'Práctica libre';
  $('btn-practica-nueva').classList.toggle('oculto', !practica);

  const r = leerRacha();
  $('st-racha').textContent = rachaVigente();
  $('st-mejor-racha').textContent = r.mejor;
  $('st-record').textContent = fmt(Almacen.leer('record', 0));
  $('version').textContent = VERSION;
  mostrarCapa('pantalla-inicio');
  actualizarRelojes();
}

// Cuenta regresiva al siguiente reto (y refresca el inicio si cambia el día)
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

  // Un tono con envolvente rápida
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

  colocar() {
    this.tono(210, 0.09, { tipo: 'triangle', vol: 0.22, frecFin: 120 });
    this.tono(900, 0.03, { tipo: 'square', vol: 0.03 });
  },
  error() {
    this.tono(160, 0.12, { tipo: 'sawtooth', vol: 0.05, frecFin: 110 });
  },
  limpiar(n) {
    const notas = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    for (let k = 0; k < Math.min(n + 1, notas.length); k++) {
      this.tono(notas[k], 0.18, { tipo: 'triangle', vol: 0.14, retraso: k * 0.06 });
    }
  },
  combo(nivel) {
    const base = 523.25 * Math.pow(2, Math.min(nivel - 1, 12) / 12); // sube medio tono por nivel
    [1, 1.26, 1.5, 2].forEach((m, k) => this.tono(base * m, 0.16, { tipo: 'square', vol: 0.06, retraso: k * 0.055 }));
    this.tono(base * 2, 0.35, { tipo: 'sine', vol: 0.1, retraso: 0.22 });
  },
  fin() {
    [392, 329.6, 261.6, 196].forEach((f, k) => this.tono(f, 0.28, { tipo: 'triangle', vol: 0.16, retraso: k * 0.16 }));
  },
};

const ICONO_SONIDO = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
const ICONO_MUDO = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 9l5 6M21 9l-5 6"/></svg>';

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
function leerEnlaceDeReto() {
  const q = new URLSearchParams(location.search);
  const seed = q.get('seed'), score = q.get('score');
  if (!seed || !/^\d{1,10}$/.test(seed) || Number(seed) > 4294967295) return null;
  const objetivo = score && /^\d{1,7}$/.test(score) ? Number(score) : null;
  return { semilla: Number(seed), objetivo };
}

function iniciar() {
  pintarBotonSonido();
  recalcularLayout();
  new ResizeObserver(recalcularLayout).observe($('zona'));
  window.addEventListener('resize', recalcularLayout);

  // Botones
  $('btn-menu').addEventListener('click', mostrarInicio);
  $('btn-sonido').addEventListener('click', () => {
    Sonido.activo = !Sonido.activo;
    Almacen.escribir('sonido', Sonido.activo);
    pintarBotonSonido();
    if (Sonido.activo) Sonido.colocar();
  });
  $('btn-diario').addEventListener('click', jugarDiario);
  $('btn-practica').addEventListener('click', () => jugarPractica(false));
  $('btn-practica-nueva').addEventListener('click', () => jugarPractica(true));
  $('btn-compartir').addEventListener('click', compartir);
  $('btn-inicio').addEventListener('click', mostrarInicio);
  $('btn-otra').addEventListener('click', () => {
    const r = ultimoResultado;
    if (r && r.modo === 'practica' && r.objetivo != null) {
      iniciarJuego(nuevoJuego('practica', r.semilla, { objetivo: r.objetivo }));
    } else {
      jugarPractica(true);
    }
  });
  $('btn-aviso-ok').addEventListener('click', () => $('aviso-ios').classList.add('oculto'));

  // Guarda la partida si la app se cierra o pasa a segundo plano
  document.addEventListener('visibilitychange', () => { if (document.hidden) guardarPartida(); });
  window.addEventListener('pagehide', guardarPartida);
  // Evita el pellizco para hacer zoom en Safari
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // ¿Viene de un enlace de reto? (?seed=XXXX&score=YYYY)
  const reto = leerEnlaceDeReto();
  if (reto) {
    history.replaceState(null, '', urlBase()); // limpia la URL para no reiniciar al recargar
    iniciarJuego(nuevoJuego('practica', reto.semilla, { objetivo: reto.objetivo }));
  } else {
    mostrarInicio();
  }
  avisoIOS();
  requestAnimationFrame(bucle);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin soporte o file:// */ });
  }
}

// Funciones expuestas solo para pruebas desde la consola
window.BloqueDiario = {
  crearRng, sacarPieza, nuevoJuego, sacarTanda, cabe, cabeEnAlgunLado, hayJugada,
  colocarEnTablero, puntosJugada, resumenEmoji, claveFecha, numeroReto, FAMILIAS, forma,
};

iniciar();
