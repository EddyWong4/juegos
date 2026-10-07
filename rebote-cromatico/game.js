/* =========================================================
   Rebote Cromático — rompebloques con piezas de 3 cuadrados (PWA)
   Todo el juego vive aquí: muro de piezas, física de la pelota,
   tienda de poderes, dibujo en canvas, controles multitáctiles,
   sonido, tutorial, guardado y pantallas.
   Sin librerías: solo JavaScript del navegador.

   La física trabaja en "unidades de celda": el campo mide 10 × 16
   unidades sin importar el tamaño de la pantalla. Al dibujar se
   multiplica por el tamaño de celda en píxeles.
   ========================================================= */
'use strict';

// ---------------------------------------------------------
// 1. Configuración (fácil de ajustar)
// ---------------------------------------------------------
const VERSION = 'v7';                 // mantener igual que VERSION_CACHE en sw.js
const COLS = 10;                      // columnas del campo
const FILAS = 16;                     // alto del campo en celdas
const LIMITE = 13;                    // si una pieza llega a esta fila, se acaba la partida
const Y_BARRA = 14.6;                 // borde superior de la barra
const ALTO_BARRA = 0.3;
const ANCHO_BARRA = 2.2;
const RADIO = 0.22;                   // radio de la pelota
const Y_ESCUDO = 15.65;               // piso del poder "Escudo"
const VIDAS = 3;
const COMBO_MAX = 8;

// Tienda de poderes: precio inicial (monedas) y duración (segundos)
const PODERES = [
  { id: 'ancha',  tecla: '1', icono: '↔️', nombre: 'Barra ancha',     precio: 15, duracion: 10 },
  { id: 'multi',  tecla: '2', icono: '⚪', nombre: 'Multipelota',     precio: 25, duracion: 8 },
  { id: 'fuego',  tecla: '3', icono: '🔥', nombre: 'Pelota de fuego', precio: 40, duracion: 6 },
  { id: 'hielo',  tecla: '4', icono: '❄️', nombre: 'Congelar muro',   precio: 30, duracion: 10,
    enFiguras: { icono: '🐢', nombre: 'Cámara lenta' } },   // sin muro que congelar: la pelota va más lenta
  { id: 'escudo', tecla: '5', icono: '🛡️', nombre: 'Escudo',          precio: 35, duracion: 8 },
];
const AUMENTO_PRECIO = 0.2;           // cada compra en la misma partida sube el precio 20 %
const AVISO_PODER = 1.5;
const LENTITUD = 0.55;                // "Cámara lenta" (modo Figuras): la pelota va al 55 %              // segundos antes de terminar en que el botón parpadea

// Ritmo del juego
const DIFICULTAD = {
  velPelota: 8, velPorNivel: 0.45, velMax: 13,      // unidades de celda por segundo
  muroInicial: 9, muroPorNivel: 0.6, muroMin: 4,    // segundos entre filas nuevas
  filasPorNivel: 5,
  densidad: 0.72,                                   // qué tan llena entra cada fila (0–1)
  bonoVacio: { puntos: 500, monedas: 20, filas: 3 },
  // Modo Figuras
  figVel: 7.5, figVelPorFigura: 0.35, figVelMax: 12,
  bonoFigura: { puntos: 1000, monedas: 30 },
  // Con cuadros tan chicos, cada rebote golpea todos los cuadros en este radio
  // (en celdas) alrededor del choque: unos 12 cuadros, como una salpicadura
  figRadioGolpe: 0.6,
  // Línea de bloques que no se rompen debajo de cada figura, con compuertas
  // de bloques normales: hay que romper una compuerta para meter la pelota
  figEspacioLinea: 4,          // cuadros vacíos entre la figura y la línea
  figGrosorLinea: 2,           // filas de la línea
  figAnchoCompuerta: 8,        // cuadros de ancho de cada compuerta (la pelota cabe de sobra)
  figLetraCompuerta: 'B',      // las compuertas son blancas (1 golpe)
  figLimpiezaFinal: 0.03,      // si queda menos de este tanto de la figura, el resto se rompe solo
  figCompuertas: (fig) => (fig.golpes < 4000 ? 3 : 2), // 3 compuertas en las figuras fáciles, 2 en las difíciles
};

// Escala de resistencia: el color dice cuántos golpes le faltan (sin números)
const ESCALA = [
  null,
  { nombre: 'blanco',   color: '#f2f3f8' },  // 1
  { nombre: 'rosa',     color: '#ff8fc7' },  // 2
  { nombre: 'rojo',     color: '#f0413c' },  // 3
  { nombre: 'naranja',  color: '#ff9333' },  // 4
  { nombre: 'amarillo', color: '#ffd93d' },  // 5
  { nombre: 'verde',    color: '#2ecc71' },  // 6
  { nombre: 'celeste',  color: '#36c5f0' },  // 7
  { nombre: 'azul',     color: '#2f5bea' },  // 8
  { nombre: 'morado',   color: '#8b3fd9' },  // 9
  { nombre: 'negro',    color: '#101016' },  // 10 (con borde claro)
];

// Formas en que ENTRAN los cuadrados (de 3 en 3, con el mismo color inicial).
// Una vez en el campo, cada cuadrado es un objeto independiente: tiene su propia
// resistencia, recibe sus propios golpes y se destruye solo.
const FORMAS = [
  [[0, 0], [0, 1], [0, 2]],   // línea horizontal
  [[0, 0], [1, 0], [2, 0]],   // línea vertical
  [[0, 0], [1, 0], [1, 1]],   // L
  [[0, 0], [0, 1], [1, 0]],   // L
  [[0, 0], [0, 1], [1, 1]],   // L
  [[0, 1], [1, 0], [1, 1]],   // L
];

// Paleta: cada resistencia tiene 3 tonos (normal, claro y oscuro) que valen lo
// mismo. El TONO del color (rojo, naranja…) dice los golpes; lo claro u oscuro
// solo sirve para dibujar mejor. Al recibir un golpe el cuadro conserva su tono.
//            normal      claro       oscuro
const PALETA = [
  null,
  ['#f2f3f8', '#fff3d6', '#aeb3c6'],  // 1 blanco   · crema     · gris
  ['#ff8fc7', '#ffc9e4', '#d23f8c'],  // 2 rosa     · rosa pálido · fucsia
  ['#f0413c', '#ff8b7c', '#a11d2a'],  // 3 rojo     · coral     · vino
  ['#ff9333', '#ffc89e', '#8a4a1e'],  // 4 naranja  · piel      · café
  ['#ffd93d', '#fff2a1', '#c39312'],  // 5 amarillo · limón     · dorado
  ['#2ecc71', '#a2efbc', '#1b7a42'],  // 6 verde    · menta     · bosque
  ['#36c5f0', '#a8e8fb', '#1588ac'],  // 7 celeste  · cielo     · turquesa
  ['#2f5bea', '#86a2f7', '#1b2e8e'],  // 8 azul     · azul claro · marino
  ['#8b3fd9', '#c8a5f2', '#541f8e'],  // 9 morado   · lavanda   · uva
  ['#101016', '#3a3a4a', '#000000'],  // 10 negro   · carbón    · negro puro
];
const NOMBRES_TONO = ['normal', 'claro', 'oscuro'];
// Códigos de una letra para los dibujos: MAYÚSCULA = normal, minúscula = claro,
// número = oscuro (el número es la resistencia; 0 = 10).
//   B b 1 blanco · P p 2 rosa · R r 3 rojo · O o 4 naranja · Y y 5 amarillo
//   V v 6 verde · C c 7 celeste · A a 8 azul · M m 9 morado · N n 0 negro
const LETRAS = {};
'BPROYVCAMN'.split('').forEach((letra, i) => {
  const res = i + 1;
  LETRAS[letra] = { res, tono: 0 };
  LETRAS[letra.toLowerCase()] = { res, tono: 1 };
  LETRAS[String(res % 10)] = { res, tono: 2 };
});
// También se pueden usar nombres en las capas de las figuras
const NOMBRES_COLOR = {
  blanco: 'B', crema: 'b', gris: '1', rosa: 'P', 'rosa pálido': 'p', fucsia: '2',
  rojo: 'R', coral: 'r', vino: '3', naranja: 'O', piel: 'o', 'café': '4',
  amarillo: 'Y', 'limón': 'y', dorado: '5', verde: 'V', menta: 'v', bosque: '6',
  celeste: 'C', cielo: 'c', turquesa: '7', azul: 'A', 'azul claro': 'a', marino: '8',
  morado: 'M', lavanda: 'm', uva: '9', negro: 'N', 'carbón': 'n', 'negro puro': '0',
};
const codigoColor = (l) => NOMBRES_COLOR[l] || l;
const colorDe = (res, tono = 0) => PALETA[Math.max(1, Math.min(10, res))][tono || 0];
// ¿El color es oscuro? (para elegir el color de las marcas de daltonismo)
function esOscuro(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) < 110;
}
const TAM_FIGURAS = 1 / 6;     // los cuadros miden 1/6 de celda (60 columnas): dibujos definidos
const FILA_FIGURA = 6;         // fila (en cuadros) donde empieza el dibujo
// Modo Figuras: las figuras se describen con formas (círculos, elipses,
// polígonos…) sobre un lienzo de 60 × 48 cuadros, y se convierten en cuadros
// al cargar el juego. Cada capa pinta con una letra (= color = golpes):
// B blanco 1 · P rosa 2 · R rojo 3 · O naranja 4 · Y amarillo 5 · V verde 6
// C celeste 7 · A azul 8 · M morado 9 · N negro 10.
// Opciones de capa: yMin / yMax (recorta), sobre: 'X' (solo pinta encima de esa letra).
// "contorno" pone un borde de 1 cuadro alrededor de todo el dibujo.
const ANCHO_FIGURA = 60;
const ALTO_FIGURA = 48;
const estrellaPuntos = (cx, cy, R, r, n = 5) => Array.from({ length: n * 2 }, (_, k) => {
  const a = -Math.PI / 2 + (k * Math.PI) / n;
  const rad = k % 2 ? r : R;
  return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
});
const FIGURAS = [
  { nombre: 'Corazón', contorno: 'vino', capas: [
    { corazon: [30, 23, 17], l: 'P' },
    { elipse: [37, 30, 13, 11], l: 'fucsia', sobre: 'P' },
    { elipse: [21, 13, 4.5, 3], l: 'B', sobre: 'P' },
    { circulo: [15.5, 18.5, 1.6], l: 'B', sobre: 'P' },
  ] },
  { nombre: 'Estrella', contorno: 'O', capas: [
    { poligono: estrellaPuntos(30, 25, 23, 9.5), l: 'B' },
    { poligono: estrellaPuntos(30, 25, 13, 5.5), l: 'P' },
  ] },
  { nombre: 'Cohete', capas: [
    { poligono: [[23, 37], [37, 37], [30, 47]], l: 'O' },
    { poligono: [[26, 37], [34, 37], [30, 44]], l: 'Y' },
    { poligono: [[23, 25], [23, 38], [14, 41], [16, 31]], l: 'R' },
    { poligono: [[37, 25], [37, 38], [46, 41], [44, 31]], l: 'R' },
    { elipse: [30, 22, 8, 16], l: 'B' },
    { elipse: [30, 22, 8, 16], l: 'R', yMax: 11 },
    { elipse: [30, 22, 8, 16], l: 'R', yMin: 30, yMax: 32 },
    { circulo: [30, 20, 4.4], l: 'A' },
    { circulo: [30, 20, 2.9], l: 'C' },
  ] },
  { nombre: 'Hongo', capas: [
    { elipse: [30, 36, 10, 9.5], l: 'crema' },
    { rect: [19, 26, 41, 29], l: 'gris', sobre: 'crema' },
    { elipse: [30, 23, 25, 16], l: 'R', yMax: 27 },
    { elipse: [30, 23, 25, 16], l: 'vino', yMin: 23, yMax: 27 },
    { circulo: [18, 16, 4.2], l: 'B', sobre: 'R' },
    { circulo: [18, 16, 4.2], l: 'B', sobre: 'vino' },
    { circulo: [33, 12, 3.6], l: 'B', sobre: 'R' },
    { circulo: [43, 19, 4], l: 'B', sobre: 'R' },
    { circulo: [28, 22, 2.6], l: 'B', sobre: 'R' },
    { circulo: [10, 23, 2.6], l: 'B', sobre: 'R' },
    { circulo: [51, 25, 2], l: 'B', sobre: 'R' },
    { elipse: [25.5, 34.5, 1.7, 3], l: 'N' },
    { elipse: [34.5, 34.5, 1.7, 3], l: 'N' },
  ] },
  { nombre: 'Casa', capas: [
    { circulo: [8, 8, 6], l: 'Y' },
    { rect: [38, 5, 43, 16], l: 'café' },
    { poligono: [[9, 23], [30, 5], [51, 23]], l: 'R' },
    { poligono: [[30, 5], [51, 23], [30, 23]], l: 'vino', sobre: 'R' },
    { rect: [13, 23, 47, 43], l: 'B' },
    { rect: [26, 30, 34, 43], l: 'café' },
    { circulo: [32.5, 37, 0.9], l: 'Y' },
    { rect: [16, 26, 23, 33], l: 'C' },
    { rect: [37, 26, 44, 33], l: 'C' },
    { rect: [19, 26, 20, 33], l: 'B' }, { rect: [16, 29, 23, 30], l: 'B' },
    { rect: [40, 26, 41, 33], l: 'B' }, { rect: [37, 29, 44, 30], l: 'B' },
    { rect: [0, 43, 60, 47], l: 'V' },
    { rect: [0, 45.5, 60, 47], l: 'bosque' },
  ] },
  { nombre: 'Pez', capas: [
    { poligono: [[43, 24], [57, 12], [54, 24], [57, 36]], l: 'R' },
    { poligono: [[20, 14], [35, 7], [38, 15]], l: 'R' },
    { elipse: [28, 24, 18, 12], l: 'O' },
    { elipse: [26, 29.5, 11, 5], l: 'B', sobre: 'O' },
    { rect: [33, 11, 35, 37], l: 'Y', sobre: 'O' },
    { rect: [38.5, 12, 40.5, 36], l: 'Y', sobre: 'O' },
    { circulo: [17, 21, 3.6], l: 'B' },
    { circulo: [16.2, 21, 1.9], l: 'N' },
    { rect: [10, 25, 14, 26], l: 'R' },
    { circulo: [6, 11, 1.9], l: 'C' },
    { circulo: [9, 5, 1.4], l: 'C' },
  ] },
  { nombre: 'Gato', capas: [
    { poligono: [[9, 21], [13, 2], [27, 12]], l: 'O' },
    { poligono: [[51, 21], [47, 2], [33, 12]], l: 'O' },
    { poligono: [[14, 15], [15, 7], [22, 12]], l: 'P', sobre: 'O' },
    { poligono: [[46, 15], [45, 7], [38, 12]], l: 'P', sobre: 'O' },
    { elipse: [30, 28, 21, 18], l: 'O' },
    { elipse: [30, 38, 15, 8], l: 'piel', sobre: 'O' },
    { rect: [29, 10, 31, 17], l: 'café', sobre: 'O' },
    { rect: [25, 11, 27, 16], l: 'café', sobre: 'O' },
    { rect: [33, 11, 35, 16], l: 'café', sobre: 'O' },
    { elipse: [21, 25, 4.6, 5], l: 'V' },
    { elipse: [39, 25, 4.6, 5], l: 'V' },
    { elipse: [21, 25, 1.3, 4], l: 'N' },
    { elipse: [39, 25, 1.3, 4], l: 'N' },
    { circulo: [22.6, 23, 0.9], l: 'B' },
    { circulo: [40.6, 23, 0.9], l: 'B' },
    { elipse: [26, 36, 5, 4], l: 'B' },
    { elipse: [34, 36, 5, 4], l: 'B' },
    { poligono: [[27, 31], [33, 31], [30, 34.5]], l: 'P' },
    { capsula: [3, 33, 17, 35, 0.6], l: 'B' },
    { capsula: [3, 39, 17, 37.5, 0.6], l: 'B' },
    { capsula: [57, 33, 43, 35, 0.6], l: 'B' },
    { capsula: [57, 39, 43, 37.5, 0.6], l: 'B' },
  ] },
  { nombre: 'Flor', capas: [
    { capsula: [30, 28, 30, 47, 1.3], l: 'V' },
    { elipseRot: [22.5, 40, 7, 3, -0.5], l: 'V' },
    { elipseRot: [37.5, 37, 7, 3, 0.5], l: 'V' },
    ...Array.from({ length: 8 }, (_, k) => ({ circulo: [30 + 11.5 * Math.cos(k * Math.PI / 4), 17 + 11.5 * Math.sin(k * Math.PI / 4), 6.2], l: 'M' })),
    ...Array.from({ length: 8 }, (_, k) => ({ circulo: [30 + 11.5 * Math.cos(k * Math.PI / 4), 17 + 11.5 * Math.sin(k * Math.PI / 4), 4.7], l: 'P' })),
    { circulo: [30, 17, 6.5], l: 'Y' },
    { circulo: [30, 17, 3], l: 'O' },
  ] },
  { nombre: 'Corona', contorno: 'O', capas: [
    { poligono: [[8, 40], [8, 14], [19, 27], [30, 9], [41, 27], [52, 14], [52, 40]], l: 'Y' },
    { circulo: [8, 12, 3.2], l: 'Y' },
    { circulo: [30, 7, 3.2], l: 'Y' },
    { circulo: [52, 12, 3.2], l: 'Y' },
    { rect: [8, 32, 52, 40], l: 'M' },
    { circulo: [18, 36, 2.6], l: 'R' },
    { circulo: [30, 36, 2.9], l: 'C' },
    { circulo: [42, 36, 2.6], l: 'V' },
    { circulo: [30, 23, 3.2], l: 'R' },
  ] },
  { nombre: 'Robot', capas: [
    { capsula: [30, 4, 30, 10, 0.8], l: 'A' },
    { circulo: [30, 3, 2.3], l: 'Y' },
    { rect: [17, 10, 43, 26], l: 'A' },
    { rect: [19, 12, 41, 24], l: 'C' },
    { circulo: [25, 17, 3.1], l: 'N' },
    { circulo: [35, 17, 3.1], l: 'N' },
    { circulo: [26, 16, 0.9], l: 'B' },
    { circulo: [36, 16, 0.9], l: 'B' },
    { rect: [24, 21, 36, 23], l: 'R' },
    { rect: [27, 26, 33, 28], l: 'A' },
    { rect: [15, 28, 45, 44], l: 'A' },
    { rect: [18, 30, 42, 42], l: 'C' },
    { circulo: [23, 35, 2], l: 'Y' },
    { circulo: [30, 35, 2], l: 'R' },
    { circulo: [37, 35, 2], l: 'V' },
    { capsula: [11, 30, 8, 41, 1.9], l: 'A' },
    { capsula: [49, 30, 52, 41, 1.9], l: 'A' },
    { circulo: [8, 43, 2.5], l: 'O' },
    { circulo: [52, 43, 2.5], l: 'O' },
    { rect: [20, 44, 26, 48], l: 'A' },
    { rect: [34, 44, 40, 48], l: 'A' },
  ] },

  { nombre: 'Oso', capas: [
    { circulo: [15, 10, 7], l: 'café' },
    { circulo: [45, 10, 7], l: 'café' },
    { circulo: [15, 10, 4], l: 'piel' },
    { circulo: [45, 10, 4], l: 'piel' },
    { elipse: [30, 26, 20, 18], l: 'café' },
    { elipse: [30, 33, 9.5, 7], l: 'piel' },
    { elipse: [30, 29.5, 3.6, 2.4], l: 'N' },
    { capsula: [30, 31, 30, 34.5, 0.5], l: 'N' },
    { capsula: [30, 34.5, 26.5, 36.5, 0.5], l: 'N' },
    { capsula: [30, 34.5, 33.5, 36.5, 0.5], l: 'N' },
    { circulo: [22, 22, 2.5], l: 'N' },
    { circulo: [38, 22, 2.5], l: 'N' },
    { circulo: [22.8, 21.2, 0.8], l: 'B' },
    { circulo: [38.8, 21.2, 0.8], l: 'B' },
    { circulo: [17, 30, 2.7], l: 'rosa pálido' },
    { circulo: [43, 30, 2.7], l: 'rosa pálido' },
  ] },
  { nombre: 'Árbol', capas: [
    { elipse: [30, 46, 28, 3], l: 'bosque' },
    { poligono: [[26, 46], [34, 46], [33, 29], [27, 29]], l: 'café' },
    { capsula: [29.5, 33, 29.5, 43, 0.5], l: 'piel' },
    { circulo: [30, 17, 13], l: 'bosque' },
    { circulo: [18, 23, 9.5], l: 'bosque' },
    { circulo: [42, 23, 9.5], l: 'bosque' },
    { circulo: [24, 12, 8.5], l: 'V' },
    { circulo: [37, 13, 8.5], l: 'V' },
    { circulo: [30, 21, 10], l: 'V' },
    { circulo: [18, 21, 6], l: 'V' },
    { circulo: [24, 10, 5], l: 'menta' },
    { circulo: [15, 19, 3], l: 'menta' },
    { circulo: [22, 20, 1.9], l: 'R' }, { circulo: [35, 11, 1.9], l: 'R' }, { circulo: [40, 24, 1.9], l: 'R' },
    { circulo: [28, 27, 1.9], l: 'R' }, { circulo: [17, 26, 1.9], l: 'R' }, { circulo: [31, 16, 1.9], l: 'R' },
    { circulo: [44, 18, 1.9], l: 'R' },
  ] },

  // ----- Halloween 🎃 -----
  { nombre: 'Fantasma', grupo: 'halloween', capas: [
    { circulo: [30, 17, 14], l: 'B' },
    { rect: [16, 17, 44, 36], l: 'B' },
    { circulo: [19.5, 36, 3.6], l: 'B' }, { circulo: [26.5, 37, 3.6], l: 'B' },
    { circulo: [33.5, 36, 3.6], l: 'B' }, { circulo: [40.5, 37, 3.6], l: 'B' },
    { elipseRot: [13, 25, 5.5, 2.4, 0.6], l: 'B' },
    { elipseRot: [47, 25, 5.5, 2.4, -0.6], l: 'B' },
    { elipse: [24, 17, 2.6, 4], l: 'N' },
    { elipse: [36, 17, 2.6, 4], l: 'N' },
    { elipse: [30, 26.5, 3, 4], l: 'N' },
    { circulo: [20, 23, 2], l: 'P' },
    { circulo: [40, 23, 2], l: 'P' },
  ] },
  { nombre: 'Calavera', grupo: 'halloween', capas: [
    { circulo: [30, 19, 15], l: 'B' },
    { elipse: [30, 34, 10.5, 7], l: 'B' },
    { elipse: [24, 21, 4.6, 5], l: 'N' },
    { elipse: [36, 21, 4.6, 5], l: 'N' },
    { circulo: [24, 22, 1.4], l: 'R' },
    { circulo: [36, 22, 1.4], l: 'R' },
    { poligono: [[27.5, 31], [32.5, 31], [30, 26.5]], l: 'N' },
    { rect: [21, 36, 39, 37], l: 'N', sobre: 'B' },
    { rect: [25, 34, 26, 40], l: 'N', sobre: 'B' },
    { rect: [29.5, 34, 30.5, 41], l: 'N', sobre: 'B' },
    { rect: [34, 34, 35, 40], l: 'N', sobre: 'B' },
  ] },
  { nombre: 'Araña', grupo: 'halloween', capas: [
    // telaraña: 8 hilos que salen del centro y 3 anillos
    ...Array.from({ length: 8 }, (_, k) => ({ capsula: [30, 22, 30 + 26 * Math.cos(k * Math.PI / 4), 22 + 21 * Math.sin(k * Math.PI / 4), 0.55], l: 'B' })),
    ...[8, 15, 21].flatMap((r) => Array.from({ length: 8 }, (_, k) => ({ capsula: [
      30 + r * 1.2 * Math.cos(k * Math.PI / 4), 22 + r * Math.sin(k * Math.PI / 4),
      30 + r * 1.2 * Math.cos((k + 1) * Math.PI / 4), 22 + r * Math.sin((k + 1) * Math.PI / 4), 0.55], l: 'B' }))),
    // araña
    ...[1, -1].flatMap((lado) => [
      { capsula: [30 + 3 * lado, 20, 30 + 11 * lado, 13, 0.85], l: 'N' },
      { capsula: [30 + 3 * lado, 22, 30 + 13 * lado, 20, 0.85], l: 'N' },
      { capsula: [30 + 3 * lado, 24, 30 + 12 * lado, 29, 0.85], l: 'N' },
      { capsula: [30 + 3 * lado, 26, 30 + 9 * lado, 34, 0.85], l: 'N' },
    ]),
    { elipse: [30, 25, 4.6, 5.6], l: 'N' },
    { circulo: [30, 18.5, 3.2], l: 'N' },
    { circulo: [28.8, 18, 0.8], l: 'R' },
    { circulo: [31.2, 18, 0.8], l: 'R' },
    { elipse: [30, 26, 1.6, 2.4], l: 'R' },
  ] },
  { nombre: 'Calabaza', grupo: 'halloween', capas: [
    { capsula: [31, 5, 33, 12, 2], l: 'bosque' },
    { elipseRot: [39, 8, 5, 2, -0.4], l: 'V' },
    { elipse: [30, 29, 25, 17], l: 'O' },
    // gajos: dos anillos rojos sobre la calabaza
    { elipse: [30, 29, 10.5, 17], l: 'café', sobre: 'O' },
    { elipse: [30, 29, 9, 16.5], l: 'O', sobre: 'café' },
    { elipse: [30, 29, 19.5, 17], l: 'café', sobre: 'O' },
    { elipse: [30, 29, 18, 16.5], l: 'O', sobre: 'café' },
    // cara encendida
    { poligono: [[15, 23], [25, 23], [20, 15]], l: 'Y' },
    { poligono: [[35, 23], [45, 23], [40, 15]], l: 'Y' },
    { poligono: [[27.5, 29], [32.5, 29], [30, 25]], l: 'Y' },
    { poligono: [[12, 32], [48, 32], [44, 41], [39, 37.5], [35, 42], [30, 38], [25, 42], [21, 37.5], [16, 41]], l: 'Y' },
  ] },
  { nombre: 'Sombrero de bruja', grupo: 'halloween', capas: [
    { poligono: estrellaPuntos(8, 9, 3.5, 1.5), l: 'Y' },
    { poligono: estrellaPuntos(53, 14, 3, 1.3), l: 'Y' },
    { poligono: [[17, 38], [43, 38], [37, 23], [45, 7], [32, 15], [24, 25]], l: 'M' },
    { elipse: [30, 39, 27, 5], l: 'M' },
    { rect: [18, 32, 42, 36], l: 'O', sobre: 'M' },
    { rect: [26.5, 31, 33.5, 37], l: 'Y' },
    { rect: [28.5, 32.5, 31.5, 35.5], l: 'M' },
  ] },
  { nombre: 'Murciélago', grupo: 'halloween', capas: [
    { circulo: [30, 23, 20], l: 'Y' },
    { circulo: [17, 13, 3], l: 'dorado', sobre: 'Y' },
    { circulo: [44, 33, 4], l: 'dorado', sobre: 'Y' },
    { circulo: [41, 9, 2], l: 'limón', sobre: 'Y' },
    { poligono: [[30, 21], [22, 15], [14, 13], [6, 17], [2, 25], [8, 23], [12, 27], [16, 24], [20, 29], [24, 25], [30, 31],
      [36, 25], [40, 29], [44, 24], [48, 27], [52, 23], [58, 25], [54, 17], [46, 13], [38, 15]], l: 'N' },
    { elipse: [30, 25, 4, 6], l: 'N' },
    { circulo: [30, 18, 3.6], l: 'N' },
    { poligono: [[27, 16], [27.5, 10.5], [29.6, 15]], l: 'N' },
    { poligono: [[33, 16], [32.5, 10.5], [30.4, 15]], l: 'N' },
    { circulo: [28.6, 18, 0.9], l: 'R' },
    { circulo: [31.4, 18, 0.9], l: 'R' },
  ] },
];

// ¿El punto (x, y) está dentro de la forma de la capa?
function dentroDeCapa(capa, x, y) {
  if (capa.yMin != null && y < capa.yMin) return false;
  if (capa.yMax != null && y > capa.yMax) return false;
  if (capa.circulo) { const [cx, cy, r] = capa.circulo; return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; }
  if (capa.elipse) { const [cx, cy, rx, ry] = capa.elipse; return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1; }
  if (capa.elipseRot) {
    const [cx, cy, rx, ry, a] = capa.elipseRot;
    const dx = x - cx, dy = y - cy, u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a);
    return (u / rx) ** 2 + (v / ry) ** 2 <= 1;
  }
  if (capa.rect) { const [x0, y0, x1, y1] = capa.rect; return x >= x0 && x <= x1 && y >= y0 && y <= y1; }
  if (capa.capsula) {
    const [x0, y0, x1, y1, r] = capa.capsula;
    const vx = x1 - x0, vy = y1 - y0, t = Math.max(0, Math.min(1, ((x - x0) * vx + (y - y0) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(x - (x0 + t * vx), y - (y0 + t * vy)) <= r;
  }
  if (capa.corazon) {
    // (X² + Y² − 1)³ − X²·Y³ ≤ 0 : la curva clásica del corazón
    const [cx, cy, tam] = capa.corazon;
    const X = (x - cx) / tam, Y = -(y - cy) / tam;
    return (X * X + Y * Y - 1) ** 3 - X * X * Y ** 3 <= 0;
  }
  if (capa.poligono) {
    let dentro = false;
    const p = capa.poligono;
    for (let i = 0, k = p.length - 1; i < p.length; k = i++) {
      if ((p[i][1] > y) !== (p[k][1] > y) && x < ((p[k][0] - p[i][0]) * (y - p[i][1])) / (p[k][1] - p[i][1]) + p[i][0]) dentro = !dentro;
    }
    return dentro;
  }
  return false;
}

// Convierte una figura de formas en filas de letras (como un dibujo de cuadros)
function rasterizar(fig) {
  const m = Array.from({ length: ALTO_FIGURA }, () => new Array(ANCHO_FIGURA).fill('.'));
  for (const capa of fig.capas) {
    for (let f = 0; f < ALTO_FIGURA; f++) {
      for (let c = 0; c < ANCHO_FIGURA; c++) {
        if (capa.sobre && m[f][c] !== codigoColor(capa.sobre)) continue;
        if (dentroDeCapa(capa, c + 0.5, f + 0.5)) m[f][c] = codigoColor(capa.l);
      }
    }
  }
  if (fig.contorno) {
    const vacio = (f, c) => f < 0 || c < 0 || f >= ALTO_FIGURA || c >= ANCHO_FIGURA || m[f][c] === '.';
    const borde = [];
    for (let f = 0; f < ALTO_FIGURA; f++) {
      for (let c = 0; c < ANCHO_FIGURA; c++) {
        if (m[f][c] !== '.' && (vacio(f - 1, c) || vacio(f + 1, c) || vacio(f, c - 1) || vacio(f, c + 1))) borde.push([f, c]);
      }
    }
    for (const [f, c] of borde) m[f][c] = codigoColor(fig.contorno);
  }
  // Quita filas vacías de arriba y abajo
  let filas = m.map((fila) => fila.join(''));
  while (filas.length && !/[^.]/.test(filas[0])) filas.shift();
  while (filas.length && !/[^.]/.test(filas[filas.length - 1])) filas.pop();
  return filas;
}

// Grupos de figuras (en el selector salen en este orden)
const GRUPOS_FIGURAS = [
  { id: 'clasicas', nombre: 'Clásicas' },
  { id: 'halloween', nombre: 'Halloween 🎃' },
];
// Se convierten en cuadros una sola vez y se cuentan sus golpes totales
for (const fig of FIGURAS) {
  fig.grupo = fig.grupo || 'clasicas';
  fig.dibujo = rasterizar(fig);
  fig.golpes = fig.dibujo.reduce((n, fila) => n + [...fila].reduce((m, l) => m + (LETRAS[l] ? LETRAS[l].res : 0), 0), 0);
}
// Orden de juego: por grupo y, dentro de cada grupo, de menos a más golpes
FIGURAS.sort((a, b) => GRUPOS_FIGURAS.findIndex((g) => g.id === a.grupo) - GRUPOS_FIGURAS.findIndex((g) => g.id === b.grupo) || a.golpes - b.golpes);
const figurasDelGrupo = (grupo) => FIGURAS.map((f, i) => i).filter((i) => FIGURAS[i].grupo === grupo);
// La que sigue después de completar una figura: la próxima de su mismo grupo
function siguienteFigura(indice) {
  const lista = figurasDelGrupo(FIGURAS[indice].grupo);
  return lista[(lista.indexOf(indice) + 1) % lista.length];
}
// Dificultad en estrellas (1 a 5) según los golpes totales
const estrellasFigura = (fig) => (fig.golpes < 1500 ? 1 : fig.golpes < 2500 ? 2 : fig.golpes < 4000 ? 3 : fig.golpes < 6000 ? 4 : 5);

// ---------------------------------------------------------
// 2. Guardado (prefijo propio: el sitio tiene varios juegos)
// ---------------------------------------------------------
const Almacen = {
  leer(clave, porDefecto) {
    try {
      const v = localStorage.getItem('rebote_' + clave);
      return v === null ? porDefecto : JSON.parse(v);
    } catch (e) { return porDefecto; }
  },
  escribir(clave, valor) {
    try { localStorage.setItem('rebote_' + clave, JSON.stringify(valor)); } catch (e) { /* sin espacio */ }
  },
};

const fmt = (n) => Number(n).toLocaleString('es-MX');
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------
// 3. Motor del juego (sin dibujo: fácil de probar)
// ---------------------------------------------------------
const velPelota = (j) => j.modo === 'figuras'
  ? Math.min(DIFICULTAD.figVel + DIFICULTAD.figVelPorFigura * j.figurasCompletas, DIFICULTAD.figVelMax)
  : Math.min(DIFICULTAD.velPelota + DIFICULTAD.velPorNivel * (j.nivel - 1), DIFICULTAD.velMax);
// Nombre e ícono de un poder según el modo
const infoPoder = (p, modo) => (modo === 'figuras' && p.enFiguras ? { ...p, ...p.enFiguras } : p);
const intervaloMuro = (nivel) => Math.max(DIFICULTAD.muroInicial - DIFICULTAD.muroPorNivel * (nivel - 1), DIFICULTAD.muroMin);
const anchoBarra = (j) => ANCHO_BARRA * (j.poderes.ancha > 0 ? 2 : 1);
// Cada "pieza" del campo es un solo cuadrado: { id, r, c, res, resOriginal }
const celdasDe = (p) => [[p.r, p.c]];
const precioPoder = (j, id) => Math.round(PODERES.find((p) => p.id === id).precio * Math.pow(1 + AUMENTO_PRECIO, j.compras[id]));

function nuevoJuego(modo = 'muro', azar = Math.random) {
  const j = {
    modo,                     // 'muro' (baja) o 'figuras' (dibujos fijos)
    tam: modo === 'figuras' ? TAM_FIGURAS : 1,   // tamaño de cada cuadro, en celdas
    columnas: modo === 'figuras' ? Math.round(COLS / TAM_FIGURAS) : COLS,
    versionPiezas: 0,         // cambia cada vez que cambia algún cuadro (para redibujar)
    restoPuntos: 0,           // fracciones de puntos y monedas (cuadros chicos dan fracciones)
    restoMonedas: 0,
    figura: 0,                // índice de la figura actual
    figurasCompletas: 0,
    figuraNombre: '',
    totalFigura: 0,
    azar,                     // generador de números (se puede fijar en las pruebas)
    piezas: [],
    sigId: 1,
    grid: new Map(),          // celda visible (fila*COLS+col) → pieza
    pelotas: [],
    barra: { x: COLS / 2 },
    vidas: VIDAS,
    puntaje: 0,
    monedas: 0,
    gastadas: 0,
    filas: 0,                 // filas resistidas
    nivel: 1,
    relojMuro: 0,
    animMuro: -1,
    poderes: {},              // segundos que le quedan a cada poder
    compras: {},              // veces que se compró cada poder en esta partida
    golpesSeguidos: 0,
    mejorCombo: 1,
    tiempo: 0,
    terminado: false,
    causa: null,
    ev: [],                   // eventos para animaciones y sonidos
  };
  PODERES.forEach((p) => { j.poderes[p.id] = 0; j.compras[p.id] = 0; });
  if (modo === 'figuras') cargarFigura(j, 0);
  else {
    // Llena las 3 filas ocultas de arriba y luego deja 5 filas visibles
    for (let k = 0; k < 8; k++) entrarFila(j, false);
    j.relojMuro = intervaloMuro(1);
  }
  nuevaPelotaPegada(j);
  return j;
}

function reconstruirGrid(j) {
  j.grid.clear();
  for (const p of j.piezas) {
    for (const [f, c] of celdasDe(p)) if (f >= 0 && f * j.tam < FILAS) j.grid.set(f * j.columnas + c, p);
  }
}

// Modo Figuras: arma el dibujo centrado, cuadro por cuadro
function cargarFigura(j, indice) {
  const fig = FIGURAS[indice];
  const ancho = Math.max(...fig.dibujo.map((f) => f.length));
  const inicioCol = Math.floor((j.columnas - ancho) / 2);
  j.piezas = [];
  fig.dibujo.forEach((fila, k) => {
    [...fila].forEach((letra, i) => {
      const info = LETRAS[letra];
      if (!info) return;
      const res = info.res, tono = info.tono;
      if (!res) return;
      j.piezas.push({ id: j.sigId++, r: FILA_FIGURA + k, c: inicioCol + i, res, resOriginal: res, tono, destello: -1 });
    });
  });
  // Línea irrompible a todo lo ancho, con compuertas repartidas
  const filaLinea = FILA_FIGURA + fig.dibujo.length + DIFICULTAD.figEspacioLinea;
  const nComp = DIFICULTAD.figCompuertas(fig);
  const anchoComp = DIFICULTAD.figAnchoCompuerta;
  const enCompuerta = (c) => {
    for (let k = 0; k < nComp; k++) {
      const inicio = Math.round(((k + 0.5) * j.columnas) / nComp - anchoComp / 2);
      if (c >= inicio && c < inicio + anchoComp) return true;
    }
    return false;
  };
  const resComp = LETRAS[codigoColor(DIFICULTAD.figLetraCompuerta)].res;
  for (let f = filaLinea; f < filaLinea + DIFICULTAD.figGrosorLinea; f++) {
    for (let c = 0; c < j.columnas; c++) {
      if (enCompuerta(c)) j.piezas.push({ id: j.sigId++, r: f, c, res: resComp, resOriginal: resComp, destello: -1, compuerta: true });
      else j.piezas.push({ id: j.sigId++, r: f, c, res: 1, resOriginal: 1, destello: -1, irrompible: true });
    }
  }
  j.figura = indice;
  j.figuraNombre = fig.nombre;
  j.totalFigura = j.piezas.filter((p) => !p.irrompible && !p.compuerta).length;
  j.versionPiezas++;
  j.nivel = j.figurasCompletas + 1;
  reconstruirGrid(j);
}

// Cuántos cuadros que sí se rompen quedan (la línea metálica no cuenta)
const rompibles = (j) => j.piezas.reduce((n, p) => n + (p.irrompible ? 0 : 1), 0);

// ¿Se terminó la figura? Si quedan poquitos cuadros sueltos (sin contar la
// línea y sus compuertas), se rompen solos: buscar los últimos es aburrido.
function revisarFinFigura(j) {
  const quedan = j.piezas.filter((p) => !p.irrompible && !p.compuerta);
  if (quedan.length && quedan.length > Math.max(3, Math.floor(j.totalFigura * DIFICULTAD.figLimpiezaFinal))) return;
  if (quedan.length) {
    const k = valorCuadro(j);
    for (const p of quedan) sumarPremio(j, 50 * k, p.resOriginal * k);
    j.ev.push({ t: 'limpieza', piezas: quedan });
  }
  figuraCompleta(j);
}

// Se rompió el último cuadro de la figura: bono y sigue la próxima
function figuraCompleta(j) {
  j.puntaje += DIFICULTAD.bonoFigura.puntos;
  j.monedas += DIFICULTAD.bonoFigura.monedas;
  j.ev.push({ t: 'figura', nombre: j.figuraNombre });
  j.figurasCompletas++;
  cargarFigura(j, siguienteFigura(j.figura));
  // La pelota vuelve a la barra para empezar la figura nueva
  j.pelotas = [];
  nuevaPelotaPegada(j);
}

// Genera cuadrados en la fila oculta -3 (las formas pueden bajar hasta la -1).
// Entran en grupos de 3 (línea o "L") sin encimarse; pueden quedar huecos.
// Cada cuadrado del grupo queda como objeto independiente.
function generarFila(j) {
  const R = -3;
  const ocupado = new Set();
  for (const p of j.piezas) for (const [f, c] of celdasDe(p)) ocupado.add(f * COLS + c);
  const columnas = [...Array(COLS).keys()].sort(() => j.azar() - 0.5);
  const maxRes = Math.min(10, 2 + j.nivel);  // nivel 1: de 1 a 3 golpes
  for (const c of columnas) {
    if (ocupado.has(R * COLS + c) || j.azar() > DIFICULTAD.densidad) continue;
    for (let intento = 0; intento < 4; intento++) {
      const f = Math.floor(j.azar() * FORMAS.length);
      const arriba = FORMAS[f].filter(([df]) => df === 0);
      const [, dcArriba] = arriba[Math.floor(j.azar() * arriba.length)];
      const base = c - dcArriba;
      const celdas = FORMAS[f].map(([df, dc]) => [R + df, base + dc]);
      if (celdas.some(([ff, cc]) => cc < 0 || cc >= COLS || ff > -1 || ocupado.has(ff * COLS + cc))) continue;
      const res = 1 + Math.floor(Math.pow(j.azar(), 1.35) * maxRes); // más fáciles que difíciles
      for (const [ff, cc] of celdas) {
        j.piezas.push({ id: j.sigId++, r: ff, c: cc, res, resOriginal: res, destello: -1 });
      }
      celdas.forEach(([ff, cc]) => ocupado.add(ff * COLS + cc));
      break;
    }
  }
}

// Todo el muro baja una celda y entra una fila nueva por arriba
function entrarFila(j, contar) {
  for (const p of j.piezas) p.r++;
  generarFila(j);
  reconstruirGrid(j);
  j.animMuro = j.tiempo;
  if (contar) {
    j.filas++;
    const nivel = 1 + Math.floor(j.filas / DIFICULTAD.filasPorNivel);
    if (nivel > j.nivel) {
      j.nivel = nivel;
      const v = velPelota(j);
      for (const b of j.pelotas) { // la pelota acelera un poco
        const actual = Math.hypot(b.vx, b.vy);
        if (actual > 0) { b.vx *= v / actual; b.vy *= v / actual; }
      }
      j.ev.push({ t: 'nivel', nivel });
    }
    j.ev.push({ t: 'fila' });
  }
  // ¿Alguna pieza llegó a la línea límite?
  for (const clave of j.grid.keys()) {
    if (Math.floor(clave / COLS) >= LIMITE) { perder(j, 'muro'); return; }
  }
}

function nuevaPelotaPegada(j) {
  j.pelotas.push({ x: j.barra.x, y: Y_BARRA - RADIO, vx: 0, vy: 0, pegada: true, extra: false, dentro: [] });
}

function lanzar(j) {
  if (j.terminado) return false;
  let lanzo = false;
  const v = velPelota(j);
  for (const b of j.pelotas) {
    if (!b.pegada) continue;
    const ang = 0.28; // un poco hacia la derecha
    b.vx = v * Math.sin(ang);
    b.vy = -v * Math.cos(ang);
    b.pegada = false;
    lanzo = true;
  }
  if (lanzo) j.ev.push({ t: 'lanzar' });
  return lanzo;
}

function moverBarra(j, x) {
  const w = anchoBarra(j);
  j.barra.x = limitar(x, w / 2, COLS - w / 2);
}

// Avanza el juego dt segundos. opciones.muro = false congela el muro (tutorial).
function paso(j, dt, opciones = {}) {
  if (j.terminado) return;
  j.tiempo += dt;

  // --- Poderes: cuenta regresiva, aviso y fin ---
  for (const p of PODERES) {
    const antes = j.poderes[p.id];
    if (antes <= 0) continue;
    const ahora = Math.max(0, antes - dt);
    j.poderes[p.id] = ahora;
    if (antes > AVISO_PODER && ahora <= AVISO_PODER) j.ev.push({ t: 'aviso', id: p.id });
    if (ahora === 0) terminarPoder(j, p.id);
  }

  // --- Muro que baja (se detiene con "Congelar muro") ---
  if (j.modo === 'muro' && opciones.muro !== false && j.poderes.hielo <= 0) {
    j.relojMuro -= dt;
    if (j.relojMuro <= 0) {
      entrarFila(j, true);
      j.relojMuro += intervaloMuro(j.nivel);
      if (j.terminado) return;
    }
  }

  // --- Pelotas: en pasos pequeños para no atravesar piezas a alta velocidad ---
  const dtPelota = j.modo === 'figuras' && j.poderes.hielo > 0 ? dt * LENTITUD : dt; // cámara lenta
  const figuraAntes = j.figurasCompletas;
  for (const b of j.pelotas) {
    if (b.pegada) { b.x = j.barra.x; b.y = Y_BARRA - RADIO; continue; }
    const distancia = Math.hypot(b.vx, b.vy) * dtPelota;
    const pasos = Math.max(1, Math.ceil(distancia / 0.06));
    for (let k = 0; k < pasos && !b.fuera && !j.terminado; k++) {
      moverPelota(j, b, dtPelota / pasos);
      if (j.figurasCompletas !== figuraAntes) return; // figura nueva: la pelota ya volvió a la barra
    }
  }
  if (j.terminado) return;
  j.pelotas = j.pelotas.filter((b) => !b.fuera);
  if (!j.pelotas.length) perderVida(j);
}

function moverPelota(j, b, h) {
  b.x += b.vx * h;
  b.y += b.vy * h;
  // Paredes y techo
  if (b.x < RADIO) { b.x = RADIO; b.vx = Math.abs(b.vx); }
  if (b.x > COLS - RADIO) { b.x = COLS - RADIO; b.vx = -Math.abs(b.vx); }
  if (b.y < RADIO) { b.y = RADIO; b.vy = Math.abs(b.vy); }

  // Barra: el ángulo depende de dónde pega (centro = recto, orillas = hasta 60°)
  const w = anchoBarra(j);
  if (b.vy > 0 && b.y + RADIO >= Y_BARRA && b.y - RADIO <= Y_BARRA + ALTO_BARRA &&
      b.x >= j.barra.x - w / 2 - RADIO && b.x <= j.barra.x + w / 2 + RADIO) {
    const desvio = limitar((b.x - j.barra.x) / (w / 2), -1, 1);
    const ang = desvio * (Math.PI / 3);
    const v = Math.hypot(b.vx, b.vy);
    b.vx = v * Math.sin(ang);
    b.vy = -v * Math.cos(ang);
    b.y = Y_BARRA - RADIO;
    j.golpesSeguidos = 0; // el combo vuelve a ×1
    j.ev.push({ t: 'barra' });
  }

  // Escudo: un piso que devuelve la pelota
  if (j.poderes.escudo > 0 && b.vy > 0 && b.y + RADIO >= Y_ESCUDO) {
    b.y = Y_ESCUDO - RADIO;
    b.vy = -Math.abs(b.vy);
    j.ev.push({ t: 'escudo', x: b.x });
  }

  if (b.y - RADIO > FILAS) { b.fuera = true; return; }
  colisionPiezas(j, b);
}

// Choque contra el contorno real de las piezas: cada cuadrado por separado.
// Se juntan todos los cuadrados que toca la pelota y se rebota con la normal
// combinada (en el rincón de una "L" rebota en diagonal, como debe ser).
function colisionPiezas(j, b) {
  const contactos = [];
  const t = j.tam; // tamaño del cuadro (1 en Muro, 0.5 en Figuras)
  for (let f = Math.floor((b.y - RADIO) / t); f <= Math.floor((b.y + RADIO) / t); f++) {
    for (let c = Math.floor((b.x - RADIO) / t); c <= Math.floor((b.x + RADIO) / t); c++) {
      if (f < 0 || c < 0 || c >= j.columnas) continue;
      const p = j.grid.get(f * j.columnas + c);
      if (!p) continue;
      const x0 = c * t, y0 = f * t;
      const cx = limitar(b.x, x0, x0 + t), cy = limitar(b.y, y0, y0 + t);
      const dx = b.x - cx, dy = b.y - cy;
      const d = Math.hypot(dx, dy);
      if (d >= RADIO) continue;
      let nx, ny, pen;
      if (d > 1e-9) { nx = dx / d; ny = dy / d; pen = RADIO - d; }
      else {
        // El centro quedó dentro del cuadrado: sale por el lado más cercano
        const lados = [[b.x - x0, -1, 0], [x0 + t - b.x, 1, 0], [b.y - y0, 0, -1], [y0 + t - b.y, 0, 1]];
        lados.sort((a, z) => a[0] - z[0]);
        [, nx, ny] = lados[0];
        pen = RADIO + lados[0][0];
      }
      contactos.push({ p, nx, ny, pen });
    }
  }
  if (!contactos.length) { b.dentro = []; return; }

  // Pelota de fuego: atraviesa y quita 3 golpes a cada pieza al entrar en ella
  // (pero la línea metálica no se atraviesa: ahí rebota)
  let choques = contactos;
  if (j.poderes.fuego > 0) {
    const ids = [...new Set(contactos.filter((k) => !k.p.irrompible).map((k) => k.p))];
    for (const p of ids) if (!b.dentro.includes(p.id)) golpear(j, p, 3, b);
    b.dentro = ids.map((p) => p.id);
    choques = contactos.filter((k) => k.p.irrompible);
    if (!choques.length) return;
  }

  let nx = 0, ny = 0, maxPen = 0, principal = choques[0];
  for (const k of choques) {
    nx += k.nx * k.pen;
    ny += k.ny * k.pen;
    if (k.pen > maxPen) { maxPen = k.pen; principal = k; }
  }
  let largo = Math.hypot(nx, ny);
  if (largo < 1e-9) { nx = principal.nx; ny = principal.ny; largo = 1; }
  nx /= largo; ny /= largo;
  b.x += nx * maxPen;
  b.y += ny * maxPen;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= 2 * vn * nx;
    b.vy -= 2 * vn * ny;
    asegurarAngulo(b);
    if (principal.p.irrompible) j.ev.push({ t: 'metal' });           // la línea no se rompe
    else if (j.poderes.fuego > 0) { /* el fuego ya hizo su daño */ }
    else if (j.modo === 'figuras') golpeArea(j, b.x - nx * RADIO, b.y - ny * RADIO); // salpicadura
    else golpear(j, principal.p, 1, b); // un golpe por choque, a la pieza más metida
  }
}

// Evita rebotes casi horizontales (la pelota se quedaría dando vueltas)
function asegurarAngulo(b) {
  const v = Math.hypot(b.vx, b.vy);
  if (Math.abs(b.vy) < 0.3 * v) {
    b.vy = (Math.sign(b.vy) || -1) * 0.3 * v;
    b.vx = (Math.sign(b.vx) || 1) * Math.sqrt(v * v - b.vy * b.vy);
  }
}

// Cuánto vale cada cuadro: 1 en Muro; en Figuras, proporcional a su área
const valorCuadro = (j) => (j.modo === 'figuras' ? (j.tam / 0.5) ** 2 : 1);
// Suma puntos y monedas guardando las fracciones para después
function sumarPremio(j, puntos, monedas) {
  j.restoPuntos = (j.restoPuntos || 0) + puntos;
  j.restoMonedas = (j.restoMonedas || 0) + monedas;
  const p = Math.floor(j.restoPuntos + 1e-9), m = Math.floor(j.restoMonedas + 1e-9);
  j.puntaje += p; j.restoPuntos -= p;
  j.monedas += m; j.restoMonedas -= m;
}

// Modo Figuras: un rebote golpea todos los cuadros cerca del punto de choque
function golpeArea(j, x, y) {
  const t = j.tam, radio = DIFICULTAD.figRadioGolpe;
  const afectados = [];
  for (let f = Math.floor((y - radio) / t); f <= Math.floor((y + radio) / t); f++) {
    for (let c = Math.floor((x - radio) / t); c <= Math.floor((x + radio) / t); c++) {
      if (f < 0 || c < 0 || c >= j.columnas) continue;
      const p = j.grid.get(f * j.columnas + c);
      if (p && !p.irrompible && Math.hypot((c + 0.5) * t - x, (f + 0.5) * t - y) <= radio) afectados.push(p);
    }
  }
  if (!afectados.length) return;
  j.golpesSeguidos++;
  const mult = Math.min(COMBO_MAX, j.golpesSeguidos);
  j.mejorCombo = Math.max(j.mejorCombo, mult);
  const k = valorCuadro(j);
  const monedasAntes = j.monedas;
  const destruidos = [];
  for (const p of afectados) {
    p.res -= 1;
    p.destello = j.tiempo;
    sumarPremio(j, 10 * mult * k, k);
    if (p.res <= 0) { destruidos.push(p); sumarPremio(j, 50 * mult * k, p.resOriginal * k); }
  }
  if (destruidos.length) {
    const fuera = new Set(destruidos);
    j.piezas = j.piezas.filter((q) => !fuera.has(q));
    reconstruirGrid(j);
  }
  j.versionPiezas++;
  const vivos = afectados.filter((p) => p.res > 0);
  j.ev.push({ t: 'area', x, y, destruidos, monedas: j.monedas - monedasAntes,
    res: vivos.length ? Math.min(...vivos.map((p) => p.res)) : 1 });
  revisarFinFigura(j);
}

// Un golpe a una pieza: cambia al color siguiente; en blanco, se destruye
function golpear(j, p, dano, b) {
  j.golpesSeguidos++;
  const mult = Math.min(COMBO_MAX, j.golpesSeguidos);
  j.mejorCombo = Math.max(j.mejorCombo, mult);
  const k = valorCuadro(j);
  sumarPremio(j, 10 * mult * k, k);
  p.res -= dano;
  p.destello = j.tiempo;
  j.versionPiezas = (j.versionPiezas || 0) + 1;
  if (p.res > 0) {
    j.ev.push({ t: 'golpe', p, res: p.res });
    return;
  }
  // Destruida
  j.piezas = j.piezas.filter((q) => q !== p);
  reconstruirGrid(j);
  sumarPremio(j, 50 * mult * k, p.resOriginal * k);
  j.ev.push({ t: 'destruida', p, monedas: Math.round((1 + p.resOriginal) * k) });
  // Modo Figuras: ¿se terminó el dibujo?
  if (j.modo === 'figuras') {
    revisarFinFigura(j);
    return;
  }
  // ¿Campo vacío? Bono y entran 3 filas
  if (j.grid.size === 0) {
    j.puntaje += DIFICULTAD.bonoVacio.puntos;
    j.monedas += DIFICULTAD.bonoVacio.monedas;
    j.ev.push({ t: 'vacio' });
    for (let k = 0; k < DIFICULTAD.bonoVacio.filas && !j.terminado; k++) entrarFila(j, true);
  }
}

function perderVida(j) {
  j.vidas--;
  j.golpesSeguidos = 0;
  j.ev.push({ t: 'vida', vidas: j.vidas });
  if (j.vidas <= 0) perder(j, 'vidas');
  else nuevaPelotaPegada(j);
}

function perder(j, causa) {
  if (j.terminado) return;
  j.terminado = true;
  j.causa = causa;
  j.ev.push({ t: 'fin', causa });
}

// --- Tienda ---
// Devuelve { ok, motivo }. No se puede comprar sin monedas ni si ya está activo.
function comprar(j, id) {
  const poder = PODERES.find((p) => p.id === id);
  if (!poder || j.terminado) return { ok: false, motivo: 'fin' };
  if (j.poderes[id] > 0) return { ok: false, motivo: 'activo' };
  const precio = precioPoder(j, id);
  if (j.monedas < precio) return { ok: false, motivo: 'monedas', falta: precio - j.monedas };
  j.monedas -= precio;
  j.gastadas += precio;
  j.compras[id]++;
  j.poderes[id] = poder.duracion;
  if (id === 'multi') crearPelotasExtra(j);
  if (id === 'ancha') moverBarra(j, j.barra.x);
  j.ev.push({ t: 'compra', id, precio });
  return { ok: true };
}

function crearPelotasExtra(j) {
  const v = velPelota(j);
  const origen = j.pelotas.find((b) => !b.pegada) || j.pelotas[0];
  const base = origen && !origen.pegada ? Math.atan2(origen.vx, -origen.vy) : 0;
  const x = origen ? origen.x : j.barra.x, y = origen ? origen.y : Y_BARRA - RADIO;
  for (const giro of [-0.5, 0.5]) {
    const a = base + giro;
    j.pelotas.push({ x, y, vx: v * Math.sin(a), vy: -v * Math.cos(a), pegada: false, extra: true, dentro: [] });
  }
}

function terminarPoder(j, id) {
  if (id === 'multi') {
    // Las pelotas extra desaparecen; si eran las únicas, se queda una
    const normales = j.pelotas.filter((b) => !b.extra);
    if (normales.length) j.pelotas = normales;
    else if (j.pelotas.length) { j.pelotas = [j.pelotas[0]]; j.pelotas[0].extra = false; }
  }
  if (id === 'ancha') moverBarra(j, j.barra.x);
  j.ev.push({ t: 'finPoder', id });
}

// ---------------------------------------------------------
// 4. Estado de la app
// ---------------------------------------------------------
let juego = null;
let pantalla = 'inicio';
let pausa = false;
let tutorial = 0;
let marcas = Almacen.leer('marcas', false); // marcas de resistencia (daltonismo)

// ---------------------------------------------------------
// 5. Canvas: medidas y dibujo
// ---------------------------------------------------------
const $ = (id) => document.getElementById(id);
const lienzo = $('lienzo');
const ctx = lienzo.getContext('2d');
const FUENTE = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
let dpr = 1;
let L = null;

function recalcularLayout() {
  const zona = $('zona');
  const w = zona.clientWidth, h = zona.clientHeight;
  if (!w || !h) return;
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  lienzo.width = Math.round(w * dpr);
  lienzo.height = Math.round(h * dpr);
  lienzo.style.width = w + 'px';
  lienzo.style.height = h + 'px';
  // El campo usa el ancho disponible (máx. 480 px) y siempre mide 10 × 16 celdas
  const s = Math.max(12, Math.floor(Math.min((Math.min(w, 480) - 8) / COLS, (h - 6) / FILAS)));
  L = { w, h, s, x: Math.round((w - s * COLS) / 2), y: Math.round((h - s * FILAS) / 2) };
}

const aPx = (u) => u * L.s;
function oscurecer(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - k))).join(',')})`;
}

let particulas = [];
let textos = [];

function dibujar(ahora) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, L.w, L.h);
  if (!juego) return;
  const j = juego, s = L.s;
  const ox = L.x, oy = L.y;

  // --- Fondo del campo (azul marino) con cuadrícula tenue ---
  ctx.fillStyle = '#0c1636';
  ctx.fillRect(ox, oy, s * COLS, s * FILAS);
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const altoRejilla = j.modo === 'muro' ? LIMITE : Y_BARRA;
  for (let c = 1; c < COLS; c++) { ctx.moveTo(ox + c * s + 0.5, oy); ctx.lineTo(ox + c * s + 0.5, oy + s * altoRejilla); }
  for (let f = 1; f < altoRejilla; f++) { ctx.moveTo(ox, oy + f * s + 0.5); ctx.lineTo(ox + s * COLS, oy + f * s + 0.5); }
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, s * COLS, s * FILAS);
  ctx.clip();

  // --- Piezas (con una bajada suave cuando entra una fila) ---
  const kMuro = j.modo === 'muro' && j.animMuro >= 0 ? limitar((j.tiempo - j.animMuro) / 0.16, 0, 1) : 1;
  const bajada = -(1 - kMuro) * s;
  if (j.modo === 'figuras') dibujarFigura(j, ox, oy, s);
  else for (const p of j.piezas) dibujarPieza(p, ox, oy + bajada, s * j.tam);

  // --- Línea límite (solo en el modo Muro) ---
  let filaMax = -1;
  if (j.modo === 'muro') {
  for (const k of j.grid.keys()) filaMax = Math.max(filaMax, Math.floor(k / COLS));
  const peligro = filaMax >= LIMITE - 2;
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = peligro ? `rgba(255,70,90,${0.5 + 0.5 * Math.sin(ahora / 110)})` : 'rgba(255,79,216,0.45)';
  ctx.beginPath();
  ctx.moveTo(ox, oy + LIMITE * s);
  ctx.lineTo(ox + COLS * s, oy + LIMITE * s);
  ctx.stroke();
  ctx.setLineDash([]);
  }

  // --- Escudo ---
  if (j.poderes.escudo > 0) {
    const brillo = j.poderes.escudo <= AVISO_PODER ? 0.4 + 0.6 * Math.abs(Math.sin(ahora / 90)) : 1;
    ctx.fillStyle = `rgba(80,220,255,${0.85 * brillo})`;
    ctx.shadowColor = '#50dcff';
    ctx.shadowBlur = 12;
    ctx.fillRect(ox, oy + Y_ESCUDO * s, COLS * s, Math.max(3, s * 0.08));
    ctx.shadowBlur = 0;
  }

  // --- Barra ---
  const wB = anchoBarra(j) * s;
  const xB = ox + j.barra.x * s - wB / 2, yB = oy + Y_BARRA * s;
  const grad = ctx.createLinearGradient(0, yB, 0, yB + ALTO_BARRA * s);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#aab3e6');
  ctx.fillStyle = grad;
  if (j.poderes.ancha > 0) { ctx.shadowColor = '#ff4fd8'; ctx.shadowBlur = 14; }
  rutaRedondeada(ctx, xB, yB, wB, ALTO_BARRA * s, ALTO_BARRA * s / 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // --- Pelotas ---
  const fuego = j.poderes.fuego > 0;
  for (const b of j.pelotas) {
    const x = ox + b.x * s, y = oy + b.y * s;
    if (fuego) {
      // estela de fuego
      if (!b.pegada && Math.random() < 0.7) {
        particulas.push({ x, y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, color: Math.random() < 0.5 ? '#ff7a1a' : '#ffd23f', t0: ahora, vida: 260, tam: 3 });
      }
      ctx.shadowColor = '#ff7a1a';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#ffb14a';
    } else {
      ctx.shadowColor = b.extra ? '#ff4fd8' : '#9fb4ff';
      ctx.shadowBlur = 10;
      ctx.fillStyle = b.extra ? '#ffc8f3' : '#ffffff';
    }
    ctx.beginPath();
    ctx.arc(x, y, RADIO * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();

  // --- Barra de tiempo del muro (arriba del campo) ---
  // (en Figuras: cuánto falta de la figura, y su nombre)
  const hielo = j.poderes.hielo > 0;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(ox, oy, COLS * s, 4);
  if (j.modo === 'muro') {
    const fraccion = hielo ? 1 : 1 - limitar(j.relojMuro / intervaloMuro(j.nivel), 0, 1);
    ctx.fillStyle = hielo ? '#7fd8ff' : fraccion > 0.8 ? '#ff5470' : '#ff4fd8';
    ctx.fillRect(ox, oy, COLS * s * fraccion, 4);
  } else {
    const avance = 1 - j.piezas.filter((p) => !p.irrompible && !p.compuerta).length / Math.max(1, j.totalFigura);
    ctx.fillStyle = '#7dffb0';
    ctx.fillRect(ox, oy, COLS * s * avance, 4);
    ctx.font = `700 ${Math.round(s * 0.34)}px ${FUENTE}`;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const grupo = figurasDelGrupo(FIGURAS[j.figura].grupo);
    const vuelta = Math.floor(j.figurasCompletas / grupo.length);
    ctx.fillText(`Figura ${grupo.indexOf(j.figura) + 1}/${grupo.length}${vuelta ? ` · vuelta ${vuelta + 1}` : ''} · ${j.figuraNombre}`, ox + COLS * s / 2, oy + s * 0.55);
  }

  // --- Indicación para lanzar ---
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (j.pelotas.some((b) => b.pegada) && !j.terminado && !tutorial) {
    ctx.globalAlpha = 0.55 + 0.35 * Math.sin(ahora / 260);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.round(s * 0.42)}px ${FUENTE}`;
    ctx.fillText('Desliza y suelta para lanzar', ox + COLS * s / 2, oy + (LIMITE + 0.8) * s);
    ctx.globalAlpha = 1;
  }

  // --- Partículas ---
  particulas = particulas.filter((p) => ahora - p.t0 < p.vida);
  for (const p of particulas) {
    const t = (ahora - p.t0) / 1000;
    ctx.globalAlpha = 1 - (ahora - p.t0) / p.vida;
    ctx.fillStyle = p.color;
    const tam = p.tam || 5;
    ctx.fillRect(p.x + p.vx * t - tam / 2, p.y + p.vy * t + 380 * t * t - tam / 2, tam, tam);
  }
  ctx.globalAlpha = 1;

  // --- Textos flotantes ("+monedas", avisos) ---
  textos = textos.filter((tx) => ahora - tx.t0 < tx.dur);
  for (const tx of textos) {
    const k = (ahora - tx.t0) / tx.dur;
    ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    ctx.font = `900 ${Math.round(s * (tx.grande ? 0.62 : 0.45))}px ${FUENTE}`;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(5,8,25,0.9)';
    const y = tx.y - 26 * k;
    ctx.strokeText(tx.texto, tx.x, y);
    ctx.fillStyle = tx.color;
    ctx.fillText(tx.texto, tx.x, y);
    if (tx.moneda) { // monedita dibujada (no depende de emojis)
      const ancho = ctx.measureText(tx.texto).width;
      const cx = tx.x + ancho / 2 + s * 0.28;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(cx, y, s * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b8860b';
      ctx.beginPath(); ctx.arc(cx, y, s * 0.08, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // --- Fin de partida ---
  if (j.terminado && j.finT0 != null) {
    const k = limitar((ahora - j.finT0) / 500, 0, 1);
    ctx.fillStyle = `rgba(5,8,25,${0.6 * k})`;
    ctx.fillRect(ox, oy, COLS * s, FILAS * s);
    ctx.globalAlpha = k;
    ctx.font = `900 ${Math.round(s * 0.7)}px ${FUENTE}`;
    ctx.fillStyle = '#ff7b93';
    ctx.fillText(j.causa === 'muro' ? '¡El muro llegó al límite!' : 'Sin vidas', ox + COLS * s / 2, oy + FILAS * s * 0.45);
    ctx.globalAlpha = 1;
  }
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

// Modo Figuras: más de 1,000 cuadros chicos. Se pintan en una imagen aparte
// que solo se rehace cuando algún cuadro cambia; luego se copia de un golpe.
let capaFigura = null;
function dibujarFigura(j, ox, oy, s) {
  const clave = `${j.versionPiezas}|${s}|${dpr}|${marcas}`;
  if (!capaFigura || capaFigura.clave !== clave) {
    const lienzoCapa = capaFigura ? capaFigura.lienzo : document.createElement('canvas');
    lienzoCapa.width = Math.round(COLS * s * dpr);
    lienzoCapa.height = Math.round(FILAS * s * dpr);
    const g = lienzoCapa.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, COLS * s, FILAS * s);
    const q = j.tam * s;              // lado del cuadro en píxeles
    const sep = q > 7 ? 1 : 0.6;      // separación entre cuadros
    for (const p of j.piezas) {
      const x = p.c * q, y = p.r * q;
      if (p.irrompible) { // metal: gris acero (no está en la escala de colores)
        g.fillStyle = '#5b6386';
        g.fillRect(x, y, q, q);
        g.fillStyle = '#a3abd0';
        g.fillRect(x, y, q, Math.max(1, q * 0.22));
        g.fillStyle = '#2f3552';
        g.fillRect(x, y + q - Math.max(1, q * 0.22), q, Math.max(1, q * 0.22));
        continue;
      }
      const color = colorDe(p.res, p.tono);
      g.fillStyle = color;
      g.fillRect(x + sep / 2, y + sep / 2, q - sep, q - sep);
      if (p.res >= 10) { // el negro lleva borde claro
        g.strokeStyle = '#cfd6ff';
        g.lineWidth = Math.max(0.8, q * 0.14);
        g.strokeRect(x + sep / 2 + g.lineWidth / 2, y + sep / 2 + g.lineWidth / 2, q - sep - g.lineWidth, q - sep - g.lineWidth);
      } else {
        g.fillStyle = 'rgba(0,0,0,0.18)';           // sombra abajo: da volumen
        g.fillRect(x + sep / 2, y + q - sep / 2 - Math.max(1, q * 0.18), q - sep, Math.max(1, q * 0.18));
      }
      // Marcas para daltonismo: en cuadros tan chicos, un punto que crece con la resistencia
      if (marcas) {
        g.fillStyle = esOscuro(color) ? 'rgba(255,255,255,0.9)' : 'rgba(10,12,30,0.75)';
        g.beginPath();
        g.arc(x + q / 2, y + q / 2, Math.max(0.6, q * (0.06 + 0.03 * p.res)), 0, Math.PI * 2);
        g.fill();
      }
    }
    capaFigura = { clave, lienzo: lienzoCapa };
  }
  ctx.drawImage(capaFigura.lienzo, ox, oy, COLS * s, FILAS * s);
  // Destello de los cuadros recién golpeados
  const q = j.tam * s;
  for (const p of j.piezas) {
    const t = j.tiempo - p.destello;
    if (p.irrompible || p.destello < 0 || t >= 0.14) continue;
    ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - t / 0.14)})`;
    ctx.fillRect(ox + p.c * q, oy + p.r * q, q, q);
  }
}

// Dibuja una pieza: sus 3 cuadrados unidos con un contorno común.
// El contorno se traza sobre el borde exterior y se recorta a la pieza, así
// las esquinas de las "L" quedan limpias y entre piezas queda una separación.
function dibujarPieza(p, ox, oy, s) {
  const celdas = celdasDe(p);
  const clave = new Set(celdas.map(([f, c]) => f * COLS + c));
  const negra = p.res >= 10;
  const color = ESCALA[Math.max(1, p.res)].color;
  const rutaCeldas = () => {
    ctx.beginPath();
    for (const [f, c] of celdas) ctx.rect(ox + c * s, oy + f * s, s, s);
  };
  const rutaBorde = () => {
    ctx.beginPath();
    for (const [f, c] of celdas) {
      const x = ox + c * s, y = oy + f * s;
      if (!clave.has((f - 1) * COLS + c)) { ctx.moveTo(x, y); ctx.lineTo(x + s, y); }
      if (!clave.has((f + 1) * COLS + c)) { ctx.moveTo(x, y + s); ctx.lineTo(x + s, y + s); }
      if (!clave.has(f * COLS + c - 1)) { ctx.moveTo(x, y); ctx.lineTo(x, y + s); }
      if (!clave.has(f * COLS + c + 1)) { ctx.moveTo(x + s, y); ctx.lineTo(x + s, y + s); }
    }
  };
  ctx.save();
  rutaCeldas();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.clip();
  // Brillo suave arriba
  const g = ctx.createLinearGradient(0, oy + p.r * s, 0, oy + (p.r + 2) * s);
  g.addColorStop(0, negra ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  rutaCeldas();
  ctx.fill();
  // Uniones internas muy tenues (se ve que son 3 cuadrados)
  ctx.strokeStyle = negra ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [f, c] of celdas) {
    if (clave.has(f * COLS + c + 1)) { ctx.moveTo(ox + (c + 1) * s, oy + f * s); ctx.lineTo(ox + (c + 1) * s, oy + (f + 1) * s); }
    if (clave.has((f + 1) * COLS + c)) { ctx.moveTo(ox + c * s, oy + (f + 1) * s); ctx.lineTo(ox + (c + 1) * s, oy + (f + 1) * s); }
  }
  ctx.stroke();
  // Contorno de la pieza (la negra lleva borde claro)
  ctx.lineCap = 'square';
  rutaBorde();
  ctx.strokeStyle = negra ? '#cfd6ff' : oscurecer(color, 0.38);
  ctx.lineWidth = s * 0.24;
  ctx.stroke();
  // Separación con las piezas vecinas (color del fondo)
  rutaBorde();
  ctx.strokeStyle = '#0c1636';
  ctx.lineWidth = s * 0.09;
  ctx.stroke();
  // Destello al recibir un golpe
  const t = juego.tiempo - p.destello;
  if (p.destello >= 0 && t < 0.14) {
    ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - t / 0.14)})`;
    rutaCeldas();
    ctx.fill();
  }
  ctx.restore();
  // Marcas de resistencia (opción para daltonismo): un punto por golpe que falta,
  // en filas de hasta 4 dentro del cuadrado (caben los 10)
  if (marcas) {
    ctx.fillStyle = esOscuro(color) ? 'rgba(255,255,255,0.85)' : 'rgba(10,12,30,0.7)';
    const [f, c] = celdas[0];
    const filasPuntos = Math.ceil(p.res / 4);
    for (let k = 0; k < p.res; k++) {
      const fila = Math.floor(k / 4), col = k % 4;
      const enFila = Math.min(4, p.res - fila * 4);
      ctx.beginPath();
      ctx.arc(ox + (c + (col + 1) / (enFila + 1)) * s, oy + (f + (fila + 1) / (filasPuntos + 1)) * s, Math.max(1.3, s * 0.065), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------
// 6. Bucle principal y efectos
// ---------------------------------------------------------
let ultimoCuadro = 0;
const teclas = { izq: false, der: false };

function bucle(ahora) {
  const dt = Math.min(0.05, (ahora - (ultimoCuadro || ahora)) / 1000);
  ultimoCuadro = ahora;
  if (juego && pantalla === 'juego' && !pausa) {
    if (teclas.izq || teclas.der) moverBarra(juego, juego.barra.x + (teclas.der - teclas.izq) * 14 * dt);
    if (!juego.terminado) paso(juego, dt, { muro: !tutorial });
    procesarEventos(ahora);
  }
  if (L) dibujar(ahora);
  if (juego) { actualizarHud(); actualizarTienda(); }
  requestAnimationFrame(bucle);
}

const centroPieza = (p) => {
  const c = celdasDe(p);
  const f = c.reduce((s, x) => s + x[0], 0) / c.length + 0.5, k = c.reduce((s, x) => s + x[1], 0) / c.length + 0.5;
  const t = juego ? juego.tam : 1;
  return { x: L.x + k * t * L.s, y: L.y + f * t * L.s };
};

function procesarEventos(ahora) {
  for (const e of juego.ev.splice(0)) {
    switch (e.t) {
      case 'golpe': Sonido.golpe(e.res); break;
      case 'area': {
        const q = juego.tam * L.s;
        for (const p of e.destruidos.slice(0, 40)) {
          const color = colorDe(p.resOriginal, p.tono);
          for (let k = 0; k < 2; k++) {
            const a = Math.random() * Math.PI * 2, v = 50 + Math.random() * 140;
            particulas.push({ x: L.x + (p.c + 0.5) * q, y: L.y + (p.r + 0.5) * q, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, color: color === '#101016' ? '#cfd6ff' : color, t0: ahora, vida: 400 + Math.random() * 250, tam: 3 });
          }
        }
        if (e.monedas > 0) textos.push({ texto: `+${e.monedas}`, x: L.x + e.x * L.s, y: L.y + e.y * L.s, t0: ahora, dur: 700, color: '#ffd23f', moneda: true });
        if (e.destruidos.length) { Sonido.destruir(e.destruidos[0].resOriginal); vibrar(12); }
        else Sonido.golpe(e.res);
        break;
      }
      case 'destruida': {
        if (juego.modo === 'figuras') { // pelota de fuego en Figuras: efecto ligero
          const q = juego.tam * L.s;
          particulas.push({ x: L.x + (e.p.c + 0.5) * q, y: L.y + (e.p.r + 0.5) * q, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 80, color: colorDe(e.p.resOriginal, e.p.tono), t0: ahora, vida: 400, tam: 3 });
          Sonido.destruir(e.p.resOriginal);
          break;
        }
        const color = colorDe(e.p.resOriginal, e.p.tono);
        for (const [f, c] of celdasDe(e.p)) {
          for (let k = 0; k < 7; k++) {
            const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 160;
            particulas.push({ x: L.x + (c + 0.5) * juego.tam * L.s, y: L.y + (f + 0.5) * juego.tam * L.s, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, color: color === '#101016' ? '#cfd6ff' : color, t0: ahora, vida: 500 + Math.random() * 250 });
          }
        }
        const cp = centroPieza(e.p);
        textos.push({ texto: `+${e.monedas}`, x: cp.x, y: cp.y, t0: ahora, dur: 800, color: '#ffd23f', moneda: true });
        Sonido.destruir(e.p.resOriginal);
        vibrar(18);
        break;
      }
      case 'barra': Sonido.barra(); break;
      case 'metal': Sonido.metal(); break;
      case 'escudo': Sonido.barra(); break;
      case 'lanzar': Sonido.lanzar(); break;
      case 'compra': Sonido.comprar(); vibrar(12); break;
      case 'aviso': Sonido.porTerminar(); break;
      case 'finPoder': {
        const p = infoPoder(PODERES.find((x) => x.id === e.id), juego.modo);
        textos.push({ texto: `${p.nombre}: terminó`, x: L.x + COLS * L.s / 2, y: L.y + LIMITE * L.s * 0.55, t0: ahora, dur: 1100, color: '#a5acd6' });
        Sonido.finPoder();
        break;
      }
      case 'nivel':
        textos.push({ texto: `¡Nivel ${e.nivel}!`, x: L.x + COLS * L.s / 2, y: L.y + LIMITE * L.s * 0.45, t0: ahora, dur: 1500, color: '#ff4fd8', grande: true });
        Sonido.nivel();
        break;
      case 'vacio':
        textos.push({ texto: `¡Campo limpio! +${DIFICULTAD.bonoVacio.puntos}`, x: L.x + COLS * L.s / 2, y: L.y + LIMITE * L.s * 0.5, t0: ahora, dur: 1800, color: '#7dffb0', grande: true });
        Sonido.nivel();
        break;
      case 'limpieza': {
        const q = juego.tam * L.s;
        for (const p of e.piezas) {
          particulas.push({ x: L.x + (p.c + 0.5) * q, y: L.y + (p.r + 0.5) * q, vx: (Math.random() - 0.5) * 160, vy: -120 - Math.random() * 120, color: colorDe(p.resOriginal, p.tono), t0: ahora, vida: 700, tam: 4 });
        }
        break;
      }
      case 'figura': {
        const hechas = new Set(Almacen.leer('figurasHechas', []));
        hechas.add(e.nombre);
        Almacen.escribir('figurasHechas', [...hechas]);
      }
        textos.push({ texto: `¡${e.nombre} completo!`, x: L.x + COLS * L.s / 2, y: L.y + FILAS * L.s * 0.45, t0: ahora, dur: 1800, color: '#7dffb0', grande: true });
        textos.push({ texto: `+${DIFICULTAD.bonoFigura.monedas}`, x: L.x + COLS * L.s / 2, y: L.y + FILAS * L.s * 0.53, t0: ahora + 150, dur: 1600, color: '#ffd23f', moneda: true });
        Sonido.nivel();
        vibrar([30, 40, 30]);
        break;
      case 'vida':
        Sonido.perderVida();
        vibrar([60, 40, 60]);
        if (e.vidas > 0) aviso(`Te quedan ${e.vidas} ${e.vidas === 1 ? 'vida' : 'vidas'}`);
        break;
      case 'fin': terminarPartida(ahora); break;
    }
  }
}

function vibrar(patron) {
  try { if (navigator.vibrate) navigator.vibrate(patron); } catch (e) { /* no soportado */ }
}

// ---------------------------------------------------------
// 7. HUD y tienda
// ---------------------------------------------------------
const cacheHud = {};
function ponerTexto(id, texto) {
  if (cacheHud[id] === texto) return;
  cacheHud[id] = texto;
  $(id).textContent = texto;
}

function actualizarHud() {
  const j = juego;
  ponerTexto('hud-puntaje', fmt(j.puntaje));
  ponerTexto('hud-monedas', fmt(j.monedas));
  const mult = Math.max(1, Math.min(COMBO_MAX, j.golpesSeguidos));
  ponerTexto('hud-combo', `×${mult}`);
  $('hud-combo').classList.toggle('apagado', mult < 2);
  ponerTexto('hud-vidas', '❤'.repeat(Math.max(0, j.vidas)) + '♡'.repeat(Math.max(0, VIDAS - j.vidas)));
  $('hud-vidas').setAttribute('aria-label', `${j.vidas} vidas`);
}

function crearTienda() {
  const tienda = $('tienda');
  tienda.innerHTML = '';
  PODERES.forEach((p) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'poder';
    btn.id = 'poder-' + p.id;
    btn.title = `${p.nombre} (${p.duracion} s) · tecla ${p.tecla}`;
    btn.innerHTML = `<span class="anillo" aria-hidden="true"></span><span class="icono" aria-hidden="true">${p.icono}</span><span class="precio"></span>`;
    // pointerdown: responde al instante aunque otro dedo esté moviendo la barra
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); comprarDesdeUI(p.id); ultimoToqueTienda = performance.now(); });
    btn.addEventListener('click', () => { if (performance.now() - ultimoToqueTienda > 500) comprarDesdeUI(p.id); }); // teclado
    tienda.appendChild(btn);
  });
}
let ultimoToqueTienda = 0;

// Ícono y nombre de cada botón según el modo de juego
function rotularTienda(modo) {
  for (const base of PODERES) {
    const p = infoPoder(base, modo);
    const btn = $('poder-' + p.id);
    btn.querySelector('.icono').textContent = p.icono;
    btn.title = `${p.nombre} (${p.duracion} s) · tecla ${p.tecla}`;
  }
}

function actualizarTienda() {
  for (const base of PODERES) {
    const p = infoPoder(base, juego.modo);
    const btn = $('poder-' + p.id);
    const resto = juego.poderes[p.id];
    const precio = precioPoder(juego, p.id);
    const activo = resto > 0;
    btn.classList.toggle('activo', activo);
    btn.classList.toggle('por-terminar', activo && resto <= AVISO_PODER);
    btn.classList.toggle('sin-monedas', !activo && juego.monedas < precio);
    btn.style.setProperty('--resto', activo ? (resto / p.duracion).toFixed(3) : 0);
    const texto = activo ? `${Math.ceil(resto)} s` : `${precio}`;
    const el = btn.querySelector('.precio');
    if (el.textContent !== texto) el.textContent = texto;
    btn.setAttribute('aria-label', activo ? `${p.nombre}: activo, ${Math.ceil(resto)} segundos` : `Comprar ${p.nombre} por ${precio} monedas`);
    btn.disabled = false; // nunca disabled: así sigue respondiendo y explica por qué no se puede
  }
}

function comprarDesdeUI(id) {
  Sonido.preparar();
  if (!juego || pantalla !== 'juego' || pausa || tutorial) return;
  const r = comprar(juego, id);
  if (!r.ok) {
    if (r.motivo === 'monedas') { aviso(`Te faltan ${r.falta} monedas`); Sonido.no(); }
    else if (r.motivo === 'activo') aviso('Ese poder ya está activo');
  }
}

let temporizadorAviso = 0;
function aviso(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('visible');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => t.classList.remove('visible'), 1600);
}

// ---------------------------------------------------------
// 8. Controles: Pointer Events multitáctil, ratón y teclado
// ---------------------------------------------------------
let dedoBarra = null;          // id del dedo que mueve la barra
let recorridoTutorial = 0;

function xEnCampo(e) {
  const rect = lienzo.getBoundingClientRect();
  return (e.clientX - rect.left - L.x) / L.s;
}
function seguirDedo(e) {
  const antes = juego.barra.x;
  moverBarra(juego, xEnCampo(e));
  if (tutorial === 1) {
    recorridoTutorial += Math.abs(juego.barra.x - antes);
    if (recorridoTutorial > 2.5) pasoTutorial(2);
  }
}

lienzo.addEventListener('pointerdown', (e) => {
  Sonido.preparar();
  if (!juego || !L || pantalla !== 'juego' || pausa || dedoBarra !== null) return;
  e.preventDefault();
  dedoBarra = e.pointerId;
  try { lienzo.setPointerCapture(e.pointerId); } catch (err) { /* nada */ }
  seguirDedo(e);
});
lienzo.addEventListener('pointermove', (e) => {
  if (e.pointerId !== dedoBarra || !juego) return;
  e.preventDefault();
  seguirDedo(e);
});
lienzo.addEventListener('pointerup', (e) => {
  if (e.pointerId !== dedoBarra) return;
  dedoBarra = null;
  if (juego && !tutorial && !pausa) lanzar(juego); // soltar el dedo lanza la pelota
});
lienzo.addEventListener('pointercancel', (e) => { if (e.pointerId === dedoBarra) dedoBarra = null; });
lienzo.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
  if (pantalla !== 'juego' || !juego) return;
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { e.preventDefault(); pausa ? continuar() : pausar(); return; }
  if (pausa) return;
  if (e.key === 'ArrowLeft') { teclas.izq = true; e.preventDefault(); }
  else if (e.key === 'ArrowRight') { teclas.der = true; e.preventDefault(); }
  else if (e.key === ' ') { e.preventDefault(); if (!tutorial) lanzar(juego); }
  else {
    const p = PODERES.find((x) => x.tecla === e.key);
    if (p) { e.preventDefault(); comprarDesdeUI(p.id); }
  }
});
document.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft') teclas.izq = false;
  if (e.key === 'ArrowRight') teclas.der = false;
});

// ---------------------------------------------------------
// 9. Tutorial de 3 pasos (solo la primera vez)
// ---------------------------------------------------------
function pasoTutorial(n) {
  tutorial = n;
  const caja = $('tutorial');
  caja.classList.remove('oculto');
  caja.classList.toggle('abajo', n === 3);
  $('tutorial-paso').textContent = `Paso ${n} de 3`;
  const textos = ['Mueve la barra', 'El color dice cuántos golpes faltan', 'Compra poderes con tus monedas'];
  $('tutorial-texto').textContent = textos[n - 1];
  const extra = $('tutorial-extra');
  if (n === 1) extra.innerHTML = '<p class="estado">Desliza el dedo a los lados por el campo.</p>';
  else if (n === 2) extra.innerHTML = '<div class="leyenda"></div><p class="estado">Cada golpe la pasa al color siguiente. En blanco, el próximo golpe la rompe.</p>';
  else extra.innerHTML = '<p class="estado">Cada golpe da 1 moneda. Toca un botón de abajo para comprar ese poder. ↓</p>';
  if (n === 2) pintarLeyendas();
  $('btn-tutorial').textContent = n === 3 ? '¡A jugar!' : 'Siguiente';
}
function avanzarTutorial() {
  if (tutorial < 3) pasoTutorial(tutorial + 1);
  else {
    tutorial = 0;
    Almacen.escribir('tutorial', true);
    $('tutorial').classList.add('oculto');
  }
}

// ---------------------------------------------------------
// 10. Pantallas y flujo
// ---------------------------------------------------------
function mostrarCapa(id) {
  for (const c of document.querySelectorAll('.capa')) c.classList.toggle('visible', c.id === id);
}

// Leyenda de la escala de colores (de 10 a 1)
function pintarLeyendas() {
  for (const el of document.querySelectorAll('.leyenda')) {
    el.innerHTML = '';
    for (let r = 10; r >= 1; r--) {
      const m = document.createElement('span');
      m.className = 'muestra';
      // tres tonos (claro, normal, oscuro) que valen lo mismo
      m.innerHTML = [1, 0, 2].map((t) => `<i class="tono ${r === 10 ? 'negro' : ''}" style="background:${PALETA[r][t]}" title="${ESCALA[r].nombre} ${NOMBRES_TONO[t]}: ${r} ${r === 1 ? 'golpe' : 'golpes'}"></i>`).join('') + `<span>${r}</span>`;
      el.appendChild(m);
    }
  }
  for (const chk of document.querySelectorAll('.chk-marcas')) chk.checked = marcas;
}

// Selector: miniatura de cada figura, su dificultad y si ya la completaste
function miniatura(fig) {
  const t = 3; // píxeles por cuadro
  const ancho = ANCHO_FIGURA, alto = fig.dibujo.length;
  const c = document.createElement('canvas');
  c.width = ancho * t;
  c.height = alto * t;
  const g = c.getContext('2d');
  fig.dibujo.forEach((fila, f) => {
    [...fila].forEach((l, k) => {
      if (!LETRAS[l]) return;
      g.fillStyle = colorDe(LETRAS[l].res, LETRAS[l].tono);
      g.fillRect(k * t, f * t, t, t);
    });
  });
  return c;
}

function mostrarSelector() {
  const hechas = new Set(Almacen.leer('figurasHechas', []));
  const cont = $('lista-figuras');
  cont.innerHTML = '';
  for (const grupo of GRUPOS_FIGURAS) {
    const titulo = document.createElement('h3');
    titulo.className = 'grupo-figuras';
    titulo.textContent = grupo.nombre;
    cont.appendChild(titulo);
    const rejilla = document.createElement('div');
    rejilla.className = 'rejilla-figuras';
    for (const i of figurasDelGrupo(grupo.id)) {
      const fig = FIGURAS[i];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tarjeta-figura' + (hechas.has(fig.nombre) ? ' hecha' : '');
      const est = estrellasFigura(fig);
      btn.setAttribute('aria-label', `${fig.nombre}, dificultad ${est} de 5${hechas.has(fig.nombre) ? ', completada' : ''}`);
      btn.appendChild(miniatura(fig));
      const info = document.createElement('span');
      info.className = 'info-figura';
      info.innerHTML = `<b>${fig.nombre}</b><span class="estrellas">${'★'.repeat(est)}${'☆'.repeat(5 - est)}</span>`;
      btn.appendChild(info);
      if (hechas.has(fig.nombre)) {
        const ok = document.createElement('span');
        ok.className = 'palomita';
        ok.textContent = '✓';
        btn.appendChild(ok);
      }
      btn.addEventListener('click', () => iniciarJuego('figuras', i));
      rejilla.appendChild(btn);
    }
    cont.appendChild(rejilla);
  }
  pantalla = 'selector';
  mostrarCapa('pantalla-figuras');
}

let ultimoModo = 'muro';
const claveRecord = (modo) => (modo === 'figuras' ? 'record_figuras' : 'record');

let ultimaFigura = 0;   // figura con la que se empezó (para "Jugar otra vez")

function iniciarJuego(modo = ultimoModo, figura = ultimaFigura) {
  ultimoModo = modo;
  juego = nuevoJuego(modo);
  if (modo === 'figuras') { ultimaFigura = figura; cargarFigura(juego, figura); }
  rotularTienda(modo);
  pantalla = 'juego';
  pausa = false;
  particulas = []; textos = [];
  dedoBarra = null;
  recorridoTutorial = 0;
  mostrarCapa(null);
  recalcularLayout();
  $('tutorial').classList.add('oculto');
  tutorial = 0;
  if (!Almacen.leer('tutorial', false)) pasoTutorial(1);
}

function pausar() {
  if (pantalla !== 'juego' || pausa || !juego || juego.terminado) return;
  pausa = true;
  pintarLeyendas();
  mostrarCapa('pantalla-pausa');
}
function continuar() {
  if (!pausa) return;
  pausa = false;
  ultimoCuadro = 0;
  mostrarCapa(null);
}

function terminarPartida(ahora) {
  const j = juego;
  j.finT0 = ahora;
  Sonido.fin();
  vibrar([80, 60, 160]);
  const record = Almacen.leer(claveRecord(j.modo), 0);
  const nuevoRecord = j.puntaje > record && j.puntaje > 0;
  if (nuevoRecord) Almacen.escribir(claveRecord(j.modo), j.puntaje);
  guardarMejores(j);
  setTimeout(() => { if (juego === j) mostrarResultado(j, nuevoRecord, record); }, 1300);
}

function guardarMejores(j) {
  if (j.modo === 'muro' && j.filas > Almacen.leer('mejorFilas', 0)) Almacen.escribir('mejorFilas', j.filas);
  if (j.modo === 'figuras' && j.figurasCompletas > Almacen.leer('mejorFiguras', 0)) Almacen.escribir('mejorFiguras', j.figurasCompletas);
}

function mostrarResultado(j, nuevoRecord, recordAnterior) {
  pantalla = 'resultado';
  $('res-causa').textContent = j.causa === 'muro' ? 'El muro llegó a la línea límite.' : j.causa === 'vidas' ? 'Te quedaste sin vidas.' : 'Terminaste la partida.';
  $('res-puntaje').textContent = fmt(j.puntaje);
  $('res-insignia').classList.toggle('oculto', !nuevoRecord);
  const figuras = j.modo === 'figuras';
  $('res-modo').textContent = figuras ? 'Modo Figuras' : 'Modo Muro';
  $('res-filas').textContent = fmt(figuras ? j.figurasCompletas : j.filas);
  $('res-filas-txt').textContent = figuras ? 'Figuras completas' : 'Filas resistidas';
  $('res-nivel').textContent = j.nivel;
  $('res-combo').textContent = `×${j.mejorCombo}`;
  $('res-gastadas').textContent = fmt(j.gastadas);
  $('res-record').textContent = nuevoRecord ? '' : `Récord: ${fmt(recordAnterior)}`;
  mostrarCapa('pantalla-resultado');
}

function salirDePartida() {
  if (juego && !juego.terminado) {
    perder(juego, 'salir');
    juego.ev = [];
    const record = Almacen.leer(claveRecord(juego.modo), 0);
    if (juego.puntaje > record) Almacen.escribir(claveRecord(juego.modo), juego.puntaje);
    guardarMejores(juego);
  }
  mostrarInicio();
}

function mostrarInicio() {
  pantalla = 'inicio';
  pausa = false;
  tutorial = 0;
  $('tutorial').classList.add('oculto');
  $('st-record').textContent = fmt(Almacen.leer('record', 0));
  $('st-filas').textContent = fmt(Almacen.leer('mejorFilas', 0));
  $('st-record-fig').textContent = fmt(Almacen.leer('record_figuras', 0));
  $('st-figuras').textContent = fmt(Almacen.leer('mejorFiguras', 0));
  $('version').textContent = VERSION;
  pintarLeyendas();
  mostrarCapa('pantalla-inicio');
}

// ---------------------------------------------------------
// 11. Sonido con Web Audio API (sin archivos)
// ---------------------------------------------------------
const Sonido = {
  ctx: null,
  activo: Almacen.leer('sonido', true),
  ultimo: 0,
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
  limitar(nombre, ms) {
    const ahora = performance.now();
    this.ultimos = this.ultimos || {};
    if (ahora - (this.ultimos[nombre] || 0) < ms) return false;
    this.ultimos[nombre] = ahora;
    return true;
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
    gan.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    gan.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gan).connect(ac.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },
  // Más agudo mientras menos resistencia le queda a la pieza
  golpe(res) { if (!this.limitar('golpe', 35)) return; this.tono(330 + (10 - res) * 70, 0.06, { tipo: 'square', vol: 0.06 }); },
  destruir(res) {
    if (!this.limitar('destruir', 45)) return;
    this.tono(520 + res * 40, 0.09, { tipo: 'triangle', vol: 0.14 });
    this.tono(1040 + res * 60, 0.12, { tipo: 'triangle', vol: 0.08, retraso: 0.05 });
  },
  metal() { if (!this.limitar('metal', 60)) return; this.tono(1500, 0.05, { tipo: 'square', vol: 0.035 }); this.tono(2300, 0.04, { tipo: 'sine', vol: 0.03, retraso: 0.01 }); },
  barra() { this.tono(220, 0.05, { tipo: 'triangle', vol: 0.12 }); },
  lanzar() { this.tono(400, 0.1, { tipo: 'triangle', vol: 0.1, frecFin: 800 }); },
  comprar() { [784, 1175, 1568].forEach((f, k) => this.tono(f, 0.1, { tipo: 'triangle', vol: 0.11, retraso: k * 0.05 })); },
  no() { this.tono(180, 0.12, { tipo: 'sawtooth', vol: 0.05 }); },
  porTerminar() { [880, 880].forEach((f, k) => this.tono(f, 0.06, { tipo: 'square', vol: 0.05, retraso: k * 0.14 })); },
  finPoder() { this.tono(700, 0.25, { tipo: 'sine', vol: 0.1, frecFin: 260 }); },
  nivel() { [523.25, 659.25, 783.99, 1046.5].forEach((f, k) => this.tono(f, 0.18, { tipo: 'triangle', vol: 0.12, retraso: k * 0.08 })); },
  perderVida() { this.tono(300, 0.4, { tipo: 'sawtooth', vol: 0.08, frecFin: 90 }); },
  fin() { [440, 349.2, 293.7, 220].forEach((f, k) => this.tono(f, 0.3, { tipo: 'triangle', vol: 0.15, retraso: k * 0.17 })); },
};

const ICONO_SONIDO = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg><span>Sonido</span>';
const ICONO_MUDO = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 9l5 6M21 9l-5 6"/></svg><span>Silencio</span>';
function pintarBotonSonido() {
  const b = $('btn-sonido');
  b.innerHTML = Sonido.activo ? ICONO_SONIDO : ICONO_MUDO;
  b.setAttribute('aria-label', Sonido.activo ? 'Silenciar sonido' : 'Activar sonido');
}

// ---------------------------------------------------------
// 12. Aviso de instalación en iPhone (una sola vez)
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
// 13. Arranque
// ---------------------------------------------------------
function iniciar() {
  pintarBotonSonido();
  crearTienda();
  recalcularLayout();
  new ResizeObserver(recalcularLayout).observe($('zona'));
  window.addEventListener('resize', recalcularLayout);

  $('btn-jugar').addEventListener('click', () => iniciarJuego('muro'));
  $('btn-figuras').addEventListener('click', mostrarSelector);
  $('btn-figuras-volver').addEventListener('click', mostrarInicio);
  $('btn-otra').addEventListener('click', () => iniciarJuego(ultimoModo));
  $('btn-inicio').addEventListener('click', mostrarInicio);
  $('btn-pausa').addEventListener('click', pausar);
  $('btn-continuar').addEventListener('click', continuar);
  $('btn-salir').addEventListener('click', salirDePartida);
  $('btn-tutorial').addEventListener('click', avanzarTutorial);
  $('btn-ver-tutorial').addEventListener('click', () => { Almacen.escribir('tutorial', false); iniciarJuego(ultimoModo); });
  $('btn-aviso-ok').addEventListener('click', () => $('aviso-ios').classList.add('oculto'));
  $('btn-sonido').addEventListener('click', () => {
    Sonido.activo = !Sonido.activo;
    Almacen.escribir('sonido', Sonido.activo);
    pintarBotonSonido();
    if (Sonido.activo) Sonido.barra();
  });
  for (const chk of document.querySelectorAll('.chk-marcas')) {
    chk.addEventListener('change', () => {
      marcas = chk.checked;
      Almacen.escribir('marcas', marcas);
      pintarLeyendas();
    });
  }

  // Pausa automática si la app pasa a segundo plano
  document.addEventListener('visibilitychange', () => { if (document.hidden) pausar(); });
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  mostrarInicio();
  avisoIOS();
  requestAnimationFrame(bucle);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin soporte o file:// */ });
  }
}

// Funciones expuestas solo para pruebas desde la consola
window.ReboteCromatico = {
  nuevoJuego, paso, comprar, lanzar, moverBarra, entrarFila, reconstruirGrid, golpear, celdasDe,
  precioPoder, colisionPiezas, cargarFigura, golpeArea, rasterizar, rompibles, siguienteFigura, figurasDelGrupo, mostrarSelector, FIGURAS, LETRAS, PALETA, NOMBRES_COLOR, colorDe, PODERES, DIFICULTAD, ESCALA, FORMAS, COLS, FILAS, LIMITE, RADIO, Y_BARRA,
};

iniciar();
