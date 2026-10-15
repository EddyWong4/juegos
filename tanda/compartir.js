/* =========================================================
   Tanda Fácil — imagen PNG del tablero, con aspecto de libreta,
   para mandarla por WhatsApp. Siempre en colores claros.
   ========================================================= */
import * as L from './logica.js';

const C = {
  tapa: '#9b5296',
  papel: '#fffdf6',
  renglon: '#d5e3f1',
  margen: '#f1a5a5',
  tinta: '#3b3346',
  suave: '#7b7189',
  titulo: '#ef8f8f',
  postit: '#fde3df',
  postitTexto: '#d9706f',
  cuadro: '#b78fb4',
  rojo: '#d64545',
  marcatextos: 'rgba(255, 226, 90, .38)',
};

const MANO = "'Caveat', 'Segoe Print', cursive";
const SERIF = "'DM Serif Display', Georgia, serif";

function rectRedondo(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function palomita(ctx, x, y, tam) {
  const s = tam / 24;
  ctx.save();
  ctx.translate(x - tam / 2, y - tam / 2);
  ctx.scale(s, s);
  ctx.strokeStyle = C.tinta;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(4, 13.5);
  ctx.bezierCurveTo(6, 15, 7.6, 16.8, 9, 19);
  ctx.bezierCurveTo(12, 12.5, 15.5, 8, 20, 5);
  ctx.stroke();
  ctx.restore();
}

function postit(ctx, x, y, etiqueta, valor) {
  ctx.font = `22px ${SERIF}`;
  ctx.fillStyle = C.titulo;
  ctx.textBaseline = 'middle';
  ctx.fillText(etiqueta, x, y);
  const xv = x + ctx.measureText(etiqueta).width + 10;
  const ancho = ctx.measureText(valor).width + 24;
  ctx.save();
  ctx.translate(xv + ancho / 2, y);
  ctx.rotate(-0.02);
  ctx.fillStyle = C.postit;
  rectRedondo(ctx, -ancho / 2, -19, ancho, 38, 5);
  ctx.fill();
  ctx.fillStyle = C.postitTexto;
  ctx.textAlign = 'center';
  ctx.fillText(valor, 0, 1);
  ctx.restore();
  return xv + ancho + 30;
}

/**
 * conNombres: false → cada renglón dice «Participante 1, 2…» y quien
 * organiza sale como «Organiza», para compartir sin datos personales.
 */
export async function imagenDeTablero(t, { conNombres = true } = {}) {
  try {
    await Promise.all([
      document.fonts.load(`700 24px 'Caveat'`),
      document.fonts.load(`24px 'DM Serif Display'`),
    ]);
  } catch {}

  const fechas = L.fechasTanda(t);
  const lista = L.turnos(t);            // columnas
  const m = lista.length;
  // Renglones: quien organiza (si hay número 0) y luego cada número
  const filas = [...(L.tieneCero(t) ? [L.CERO] : []), ...t.numeros.map((_, i) => i)];
  const hoy = L.hoyTexto();

  // Medidas
  const tapa = 26, espiral = 60, margenHoja = 40;
  const anchoNombre = 230, anchoCelda = 44, anchoFecha = 230, altoFila = 44;
  const anchoTabla = anchoNombre + anchoCelda * m + anchoFecha;
  const altoEncabezado = 200, altoCabeza = 90;
  const hojaX = tapa + espiral / 2, hojaY = tapa;
  const hojaW = Math.max(L.tieneCero(t) ? 900 : 820, margenHoja * 2 + anchoTabla + espiral / 2);
  const hojaH = altoEncabezado + altoCabeza + altoFila * filas.length + 70;
  const W = hojaX + hojaW + tapa;
  const H = hojaY + hojaH + tapa;

  const escala = 2;
  const lienzo = document.createElement('canvas');
  lienzo.width = W * escala;
  lienzo.height = H * escala;
  const ctx = lienzo.getContext('2d');
  ctx.scale(escala, escala);

  // Tapa
  ctx.fillStyle = C.tapa;
  rectRedondo(ctx, 0, 0, W, H, 30);
  ctx.fill();

  // Hoja rayada
  ctx.fillStyle = C.papel;
  rectRedondo(ctx, hojaX, hojaY, hojaW, hojaH, 12);
  ctx.fill();
  ctx.save();
  rectRedondo(ctx, hojaX, hojaY, hojaW, hojaH, 12);
  ctx.clip();
  ctx.strokeStyle = C.renglon;
  ctx.lineWidth = 1;
  for (let y = hojaY + 32; y < hojaY + hojaH; y += 32) {
    ctx.beginPath(); ctx.moveTo(hojaX, y + .5); ctx.lineTo(hojaX + hojaW, y + .5); ctx.stroke();
  }
  ctx.strokeStyle = C.margen;
  ctx.lineWidth = 2;
  const xMargen = hojaX + espiral / 2 + 26;
  ctx.beginPath(); ctx.moveTo(xMargen, hojaY); ctx.lineTo(xMargen, hojaY + hojaH); ctx.stroke();
  ctx.restore();

  // Espiral
  const aros = Math.max(6, Math.floor(hojaH / 56));
  for (let i = 0; i < aros; i++) {
    const y = hojaY + 30 + i * ((hojaH - 60) / (aros - 1));
    ctx.fillStyle = '#1c1a1f';
    ctx.beginPath(); ctx.arc(hojaX + 22, y, 9, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createLinearGradient(0, y - 5, 0, y + 5);
    g.addColorStop(0, '#5b5b5f'); g.addColorStop(.45, '#f3f3f3'); g.addColorStop(.75, '#a3a3a8'); g.addColorStop(1, '#6c6c70');
    ctx.fillStyle = g;
    rectRedondo(ctx, hojaX - 26, y - 5, 50, 10, 5);
    ctx.fill();
  }

  // Encabezado: título y post-its
  const x0 = xMargen + 24;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.titulo;
  ctx.font = `64px ${SERIF}`;
  ctx.fillText('Tanda Fácil', x0, hojaY + 78);
  const anchoTitulo = ctx.measureText('Tanda Fácil').width;
  ctx.fillStyle = C.tinta;
  ctx.font = `700 40px ${MANO}`;
  ctx.fillText(t.nombre || '', x0 + anchoTitulo + 24, hojaY + 74);

  let xp = x0;
  xp = postit(ctx, xp, hojaY + 126, 'Total a recibir:', L.pesos(L.totalARecibir(t)));
  xp = postit(ctx, xp, hojaY + 126, 'Cada número paga:', L.pesos(t.monto));
  if (L.tieneCero(t)) postit(ctx, xp, hojaY + 126, 'Número 0:', L.pesos(L.totalCero(t)));
  xp = postit(ctx, x0, hojaY + 172, 'El pago es:', L.FRECUENCIAS[t.frecuencia]);
  ctx.font = `20px ${SERIF}`;
  ctx.fillStyle = C.titulo;
  ctx.textAlign = 'left';
  ctx.fillText('*El día que recibe no se da dinero', xp, hojaY + 172);

  // Tabla
  const tx = x0 - 4;
  const ty = hojaY + altoEncabezado + 10;
  const xCeldas = tx + anchoNombre;
  const xFecha = xCeldas + anchoCelda * m;
  const actual = L.turnoActual(t, hoy);

  // Cabecera morada
  ctx.fillStyle = C.tapa;
  ctx.fillRect(tx, ty, anchoTabla, altoCabeza / 2);
  ctx.fillRect(tx, ty, anchoNombre, altoCabeza);
  ctx.fillRect(xFecha, ty, anchoFecha, altoCabeza);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `24px ${SERIF}`;
  ctx.fillText('Participantes', tx + anchoNombre / 2, ty + altoCabeza / 2);
  ctx.fillText('Números', xCeldas + (anchoCelda * m) / 2, ty + altoCabeza / 4);
  ctx.font = `21px ${SERIF}`;
  ctx.fillText('Fecha que', xFecha + anchoFecha / 2, ty + altoCabeza / 2 - 13);
  ctx.fillText('recibe la tanda', xFecha + anchoFecha / 2, ty + altoCabeza / 2 + 15);

  // Fila de números
  lista.forEach((turno, col) => {
    const x = xCeldas + col * anchoCelda;
    if (turno === actual) { ctx.fillStyle = C.marcatextos; ctx.fillRect(x, ty + altoCabeza / 2, anchoCelda, altoCabeza / 2); }
    ctx.fillStyle = turno === L.CERO ? C.tapa : C.titulo;
    ctx.font = `20px ${SERIF}`;
    ctx.fillText(L.etiquetaTurno(turno), x + anchoCelda / 2, ty + altoCabeza * .75);
  });

  // Filas
  const yFilas = ty + altoCabeza;
  filas.forEach((numero, fila) => {
    const y = yFilas + fila * altoFila;
    const esCero = numero === L.CERO;
    const nombre = esCero
      ? (conNombres ? L.nombreCero(t) + ' (organiza)' : 'Organiza')
      : (conNombres && t.numeros[numero].nombre.trim()) || `Participante ${numero + 1}`;
    ctx.fillStyle = C.tinta;
    ctx.textAlign = 'left';
    ctx.font = `700 27px ${MANO}`;
    let texto = nombre;
    while (ctx.measureText(texto).width > anchoNombre - 24 && texto.length > 3) texto = texto.slice(0, -2) + '…';
    ctx.fillText(texto, tx + 12, y + altoFila / 2 + 1);
    ctx.textAlign = 'center';
    ctx.fillText(L.fechaLarga(fechas[numero]), xFecha + anchoFecha / 2, y + altoFila / 2 + 1);

    lista.forEach((turno, col) => {
      const x = xCeldas + col * anchoCelda;
      if (turno === actual) { ctx.fillStyle = C.marcatextos; ctx.fillRect(x, y, anchoCelda, altoFila); }
      if (esCero) {
        // Quien organiza solo recibe el 0; en los demás turnos no paga (rayitas)
        if (turno === L.CERO) { ctx.fillStyle = C.tapa; ctx.fillRect(x, y, anchoCelda, altoFila); }
        else {
          ctx.save();
          ctx.beginPath(); ctx.rect(x, y, anchoCelda, altoFila); ctx.clip();
          ctx.strokeStyle = C.renglon; ctx.lineWidth = 2;
          for (let d = -altoFila; d < anchoCelda; d += 8) { ctx.beginPath(); ctx.moveTo(x + d, y + altoFila); ctx.lineTo(x + d + altoFila, y); ctx.stroke(); }
          ctx.restore();
        }
        return;
      }
      const estado = L.estadoCelda(t, numero, turno, fechas, hoy);
      if (estado === 'recibe') { ctx.fillStyle = C.tapa; ctx.fillRect(x, y, anchoCelda, altoFila); }
      else if (estado === 'pagado') palomita(ctx, x + anchoCelda / 2, y + altoFila / 2, 30);
      else if (estado === 'atrasado') {
        ctx.strokeStyle = C.rojo;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x + anchoCelda / 2, y + altoFila / 2, 13, 11, -0.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  });

  // Cuadrícula
  ctx.strokeStyle = C.cuadro;
  ctx.lineWidth = 1;
  const altoTabla = altoCabeza + altoFila * filas.length;
  ctx.strokeRect(tx + .5, ty + .5, anchoTabla, altoTabla);
  for (let fila = 0; fila <= filas.length; fila++) {
    const y = yFilas + fila * altoFila + .5;
    ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx + anchoTabla, y); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(xCeldas, ty + altoCabeza / 2 + .5); ctx.lineTo(xFecha, ty + altoCabeza / 2 + .5); ctx.stroke();
  for (let col = 0; col <= m; col++) {
    const x = xCeldas + col * anchoCelda + .5;
    ctx.beginPath(); ctx.moveTo(x, col === 0 || col === m ? ty : ty + altoCabeza / 2); ctx.lineTo(x, ty + altoTabla); ctx.stroke();
  }

  // Pie
  ctx.fillStyle = C.suave;
  ctx.textAlign = 'left';
  ctx.font = `22px ${MANO}`;
  ctx.fillText(`Actualizado el ${L.fechaLarga(hoy)}  ·  ✓ pagó   ◯ atrasado   ■ recibe`, tx, ty + altoTabla + 30);

  return new Promise((resolver) => lienzo.toBlob(resolver, 'image/png'));
}
