/* =========================================================
   QR Studio — lógica de la aplicación
   Todo se procesa en el navegador con la librería
   qr-code-styling (MIT). No hay servidor ni envío de datos.
   ========================================================= */
'use strict';

const VERSION = '1.0.0';

/* ---------- Utilidades generales ---------- */
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));
const clonar = (obj) => JSON.parse(JSON.stringify(obj));
const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

/** Lee un valor anidado con una ruta tipo "modulos.grad.c1". */
function leerRuta(obj, ruta) {
  return ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
/** Escribe un valor anidado con una ruta tipo "modulos.grad.c1". */
function fijarRuta(obj, ruta, valor) {
  const partes = ruta.split('.');
  const ultima = partes.pop();
  const destino = partes.reduce((o, k) => (o[k] ??= {}), obj);
  destino[ultima] = valor;
}
/** Mezcla profunda: completa "parcial" con lo que falte de "base". */
function fusionar(base, parcial) {
  const res = clonar(base);
  if (!parcial || typeof parcial !== 'object') return res;
  for (const [k, v] of Object.entries(parcial)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && res[k] && typeof res[k] === 'object') {
      res[k] = fusionar(res[k], v);
    } else if (v !== undefined) {
      res[k] = v;
    }
  }
  return res;
}
/** Escapa texto para insertarlo en HTML o XML. */
function escaparXML(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
/**
 * La librería convierte cada carácter a un solo byte (Latin-1), así que
 * acentos, ñ y emojis saldrían mal. Pasamos el texto a UTF-8 y lo
 * representamos como una cadena "binaria" (un carácter por byte).
 */
function aUtf8Binario(texto) {
  const bytes = new TextEncoder().encode(texto);
  let res = '';
  for (const b of bytes) res += String.fromCharCode(b);
  return res;
}

/* ---------- Almacenamiento local (con protección de errores) ---------- */
const CLAVES = {
  actual: 'qrstudio.actual',
  disenos: 'qrstudio.disenos',
  historial: 'qrstudio.historial',
  historialActivo: 'qrstudio.historialActivo',
  tema: 'qrstudio.tema',
};
const almacen = {
  leer(clave, defecto) {
    try {
      const v = localStorage.getItem(clave);
      return v == null ? defecto : JSON.parse(v);
    } catch {
      return defecto;
    }
  },
  guardar(clave, valor) {
    try {
      localStorage.setItem(clave, JSON.stringify(valor));
      return true;
    } catch {
      return false; // cuota llena o almacenamiento bloqueado
    }
  },
  borrar(clave) {
    try { localStorage.removeItem(clave); } catch { /* sin acceso: no pasa nada */ }
  },
};

/* ---------- Tipos de contenido ---------- */
const TIPOS = [
  { id: 'url', nombre: 'URL', icono: '🔗' },
  { id: 'texto', nombre: 'Texto', icono: '📝' },
  { id: 'whatsapp', nombre: 'WhatsApp', icono: '💬' },
  { id: 'telefono', nombre: 'Llamada', icono: '📞' },
  { id: 'sms', nombre: 'SMS', icono: '✉️' },
  { id: 'correo', nombre: 'Correo', icono: '📧' },
  { id: 'wifi', nombre: 'WiFi', icono: '📶' },
  { id: 'vcard', nombre: 'Contacto', icono: '👤' },
  { id: 'ubicacion', nombre: 'Ubicación', icono: '📍' },
  { id: 'evento', nombre: 'Evento', icono: '📅' },
];
const nombreTipo = (id) => TIPOS.find((t) => t.id === id)?.nombre ?? id;

/* ---------- Diseño por defecto ---------- */
const DISENO_BASE = {
  modulos: { forma: 'square', relleno: 'solido', color: '#111111', grad: { tipo: 'linear', c1: '#4f46e5', c2: '#9333ea', angulo: 45 } },
  fondo: { relleno: 'solido', color: '#ffffff', grad: { tipo: 'linear', c1: '#ffffff', c2: '#e0e7ff', angulo: 90 } },
  esquinaMarco: { forma: 'square', color: '#111111', igual: true },
  esquinaPunto: { forma: 'square', color: '#111111', igual: true },
  logo: { src: null, tamano: 0.3, margen: 4, ocultar: true },
  marco: { activo: false, texto: 'Escanéame', posicion: 'abajo', fuente: 'sans', colorMarco: '#111111', colorTexto: '#ffffff', escala: 1, redondeado: true },
  tamano: 1024,
  margen: 4, // porcentaje del tamaño
  ecc: 'M',
};

/* Familias tipográficas disponibles para el texto del marco */
const FUENTES = {
  sans: { familia: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' },
  serif: { familia: 'Georgia, "Times New Roman", Times, serif' },
  mono: { familia: '"Courier New", Courier, monospace' },
  redonda: { familia: '"Arial Rounded MT Bold", "Varela Round", Nunito, "Trebuchet MS", sans-serif' },
  condensada: { familia: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif', estiramiento: 'condensed' },
};

/* ---------- Plantillas predefinidas ---------- */
const PLANTILLAS = [
  { nombre: 'Clásico', diseno: {} },
  {
    nombre: 'Índigo',
    diseno: {
      modulos: { forma: 'rounded', relleno: 'degradado', grad: { tipo: 'linear', c1: '#4f46e5', c2: '#9333ea', angulo: 45 } },
      esquinaMarco: { forma: 'extra-rounded', igual: true },
      esquinaPunto: { forma: 'dot', igual: true },
    },
  },
  {
    nombre: 'Atardecer',
    diseno: {
      modulos: { forma: 'dots', relleno: 'degradado', grad: { tipo: 'linear', c1: '#ea580c', c2: '#db2777', angulo: 90 } },
      fondo: { relleno: 'solido', color: '#fff7ed' },
      esquinaMarco: { forma: 'extra-rounded', color: '#c2410c', igual: false },
      esquinaPunto: { forma: 'dot', color: '#be185d', igual: false },
    },
  },
  {
    nombre: 'Océano',
    diseno: {
      modulos: { forma: 'classy-rounded', relleno: 'degradado', grad: { tipo: 'radial', c1: '#0369a1', c2: '#1e3a8a', angulo: 0 } },
      fondo: { relleno: 'solido', color: '#f0f9ff' },
      esquinaMarco: { forma: 'extra-rounded', color: '#1e3a8a', igual: false },
      esquinaPunto: { forma: 'dot', color: '#0284c7', igual: false },
    },
  },
  {
    nombre: 'Bosque',
    diseno: {
      modulos: { forma: 'extra-rounded', relleno: 'solido', color: '#166534' },
      fondo: { relleno: 'degradado', grad: { tipo: 'linear', c1: '#f0fdf4', c2: '#dcfce7', angulo: 135 } },
      esquinaMarco: { forma: 'dot', color: '#14532d', igual: false },
      esquinaPunto: { forma: 'dot', color: '#14532d', igual: false },
    },
  },
  {
    nombre: 'Elegante',
    diseno: {
      modulos: { forma: 'classy', relleno: 'solido', color: '#1f2937' },
      fondo: { relleno: 'solido', color: '#fdf8f0' },
      esquinaMarco: { forma: 'square', color: '#92400e', igual: false },
      esquinaPunto: { forma: 'square', color: '#92400e', igual: false },
    },
  },
  {
    nombre: 'Rosa y morado',
    diseno: {
      modulos: { forma: 'rounded', relleno: 'degradado', grad: { tipo: 'linear', c1: '#3b055d', c2: '#e0267f', angulo: 135 } },
      esquinaMarco: { forma: 'extra-rounded', color: '#3b055d', igual: false },
      esquinaPunto: { forma: 'dot', color: '#e0267f', igual: false },
    },
  },
  {
    nombre: 'Transparente',
    diseno: {
      modulos: { forma: 'square', relleno: 'solido', color: '#000000' },
      fondo: { relleno: 'transparente' },
    },
  },
  {
    nombre: 'Escanéame',
    diseno: {
      modulos: { forma: 'rounded', relleno: 'solido', color: '#111111' },
      esquinaMarco: { forma: 'extra-rounded', igual: true },
      esquinaPunto: { forma: 'dot', igual: true },
      marco: { activo: true, posicion: 'abajo', fuente: 'sans', colorMarco: '#111111', colorTexto: '#ffffff', escala: 1, redondeado: true },
    },
  },
];

/* ---------- Estado de la aplicación ---------- */
const guardado = almacen.leer(CLAVES.actual, null);
const estado = {
  tipo: TIPOS.some((t) => t.id === guardado?.tipo) ? guardado.tipo : 'url',
  campos: guardado?.campos && typeof guardado.campos === 'object' ? guardado.campos : {},
  diseno: fusionar(DISENO_BASE, guardado?.diseno),
};
const tocados = new Set(); // campos que el usuario ya editó (para mostrar errores)
let ultimoResultado = null; // último contenido válido generado

/* =========================================================
   CONSTRUCCIÓN DEL CONTENIDO (con validación por tipo)
   Cada función recibe los campos del formulario y regresa
   { datos, resumen, errores: { campo: mensaje } }.
   ========================================================= */

/** Limpia un teléfono: deja + inicial y dígitos. Regresa null si trae letras. */
function limpiarTelefono(valor) {
  const v = String(valor ?? '').trim();
  if (!v) return '';
  if (!/^\+?[\d\s().-]+$/.test(v)) return null;
  return (v.startsWith('+') ? '+' : '') + v.replace(/\D/g, '');
}
function validarTelefono(valor, errores, campo, obligatorio = true) {
  const tel = limpiarTelefono(valor);
  if (tel === '') {
    if (obligatorio) errores[campo] = 'Escribe un número.';
    return '';
  }
  if (tel === null) {
    errores[campo] = 'Usa solo números, espacios, guiones o +.';
    return '';
  }
  const digitos = tel.replace('+', '').length;
  if (digitos < 3 || digitos > 15) errores[campo] = 'El número debe tener entre 3 y 15 dígitos.';
  return tel;
}
const correoValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

/** Agrega https:// si falta y valida que sea una dirección web razonable. */
function normalizarURL(valor) {
  let v = String(valor ?? '').trim();
  if (!v) return { error: 'Escribe una dirección web.' };
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(v)) v = 'https://' + v;
  try {
    const u = new URL(v);
    if (!['http:', 'https:', 'ftp:'].includes(u.protocol)) return { error: 'Usa una dirección que empiece con http:// o https://.' };
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return { error: 'La dirección no parece válida (ejemplo: miweb.com).' };
    if (/\s/.test(v)) return { error: 'La dirección no puede tener espacios.' };
  } catch {
    return { error: 'La dirección no parece válida.' };
  }
  return { url: v };
}

/* Escapes de cada formato */
const escWifi = (s) => String(s).replace(/([\\;,:"])/g, '\\$1');
const escVcard = (s) => String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
const escIcs = escVcard;

/** Convierte "2026-10-08T15:30" en "20261008T153000" (hora local). */
function fechaIcs(valor, soloFecha) {
  const [f, h = '00:00'] = valor.split('T');
  const fecha = f.replace(/-/g, '');
  return soloFecha ? fecha : `${fecha}T${h.replace(':', '').slice(0, 4)}00`;
}
/** Suma días a una fecha "AAAA-MM-DD". */
function sumarDias(fechaTexto, dias) {
  const [a, m, d] = fechaTexto.split('-').map(Number);
  const f = new Date(a, m - 1, d + dias);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

const CONSTRUCTORES = {
  url(c) {
    const errores = {};
    const r = normalizarURL(c.url);
    if (r.error) errores.url = r.error;
    return { datos: r.url, resumen: r.url, errores };
  },

  texto(c) {
    const errores = {};
    const t = String(c.texto ?? '');
    if (!t.trim()) errores.texto = 'Escribe algún texto.';
    return { datos: t, resumen: t.length > 80 ? t.slice(0, 80) + '…' : t, errores };
  },

  whatsapp(c) {
    const errores = {};
    const lada = String(c.lada ?? '').replace(/\D/g, '');
    const numeroTxt = String(c.numero ?? '').trim();
    if (!lada || lada.length > 4) errores.lada = 'De 1 a 4 dígitos (México: 52).';
    if (!numeroTxt) errores.numero = 'Escribe el número.';
    else if (!/^[\d\s().-]+$/.test(numeroTxt)) errores.numero = 'Usa solo números (sin +, va en el código de país).';
    let numero = numeroTxt.replace(/\D/g, '');
    let completo = lada + numero;
    if (lada === '52') {
      // México: se quitan prefijos viejos (044/045, o un 1 al inicio) y se arma
      // con o sin el 1, según la opción elegida.
      numero = numero.replace(/^(044|045)(\d{10})$/, '$2').replace(/^1(\d{10})$/, '$1');
      if (!errores.numero && numero.length !== 10) errores.numero = 'Los números de México tienen 10 dígitos.';
      completo = (c.mx === '52' ? '52' : '521') + numero;
    } else if (!errores.numero && (numero.length < 6 || numero.length > 14)) {
      errores.numero = 'El número debe tener entre 6 y 14 dígitos.';
    }
    const mensaje = String(c.mensaje ?? '');
    let datos = `https://wa.me/${completo}`;
    if (mensaje.trim()) datos += `?text=${encodeURIComponent(mensaje)}`;
    return { datos, resumen: `WhatsApp +${completo}`, errores };
  },

  telefono(c) {
    const errores = {};
    const tel = validarTelefono(c.numero, errores, 'numero');
    return { datos: `tel:${tel}`, resumen: `Llamar a ${tel}`, errores };
  },

  sms(c) {
    const errores = {};
    const tel = validarTelefono(c.numero, errores, 'numero');
    const msg = String(c.mensaje ?? '');
    return { datos: `SMSTO:${tel}:${msg}`, resumen: `SMS a ${tel}`, errores };
  },

  correo(c) {
    const errores = {};
    const para = String(c.para ?? '').trim();
    if (!para) errores.para = 'Escribe el correo del destinatario.';
    else if (!correoValido(para)) errores.para = 'El correo no parece válido.';
    const params = [];
    if (String(c.asunto ?? '').trim()) params.push('subject=' + encodeURIComponent(c.asunto));
    if (String(c.cuerpo ?? '').trim()) params.push('body=' + encodeURIComponent(c.cuerpo));
    const datos = `mailto:${para}${params.length ? '?' + params.join('&') : ''}`;
    return { datos, resumen: `Correo a ${para}`, errores };
  },

  wifi(c) {
    const errores = {};
    const red = String(c.red ?? '');
    const cifrado = ['WPA', 'WEP', 'nopass'].includes(c.cifrado) ? c.cifrado : 'WPA';
    const clave = String(c.clave ?? '');
    if (!red.trim()) errores.red = 'Escribe el nombre de la red.';
    if (cifrado === 'WPA') {
      const hex64 = /^[0-9a-f]{64}$/i.test(clave);
      if (!clave) errores.clave = 'Escribe la contraseña.';
      else if (!hex64 && (clave.length < 8 || clave.length > 63)) errores.clave = 'Las contraseñas WPA tienen de 8 a 63 caracteres.';
    } else if (cifrado === 'WEP') {
      const valida = [5, 13].includes(clave.length) || (/^[0-9a-f]+$/i.test(clave) && [10, 26].includes(clave.length));
      if (!clave) errores.clave = 'Escribe la contraseña.';
      else if (!valida) errores.clave = 'Las claves WEP tienen 5 o 13 caracteres (o 10 o 26 hexadecimales).';
    }
    let datos = `WIFI:T:${cifrado};S:${escWifi(red)};`;
    if (cifrado !== 'nopass') datos += `P:${escWifi(clave)};`;
    if (c.oculta) datos += 'H:true;';
    datos += ';';
    return { datos, resumen: `WiFi «${red}»${cifrado === 'nopass' ? ' (abierta)' : ''}`, errores };
  },

  vcard(c) {
    const errores = {};
    const v = (k) => String(c[k] ?? '').trim();
    if (!v('nombre') && !v('apellidos') && !v('empresa')) errores.nombre = 'Escribe al menos el nombre o la empresa.';
    if (v('correo') && !correoValido(v('correo'))) errores.correo = 'El correo no parece válido.';
    let web = '';
    if (v('web')) {
      const r = normalizarURL(v('web'));
      if (r.error) errores.web = r.error;
      else web = r.url;
    }
    const movil = validarTelefono(v('movil'), errores, 'movil', false);
    const trabajo = validarTelefono(v('trabajo'), errores, 'trabajo', false);
    const completo = [v('nombre'), v('apellidos')].filter(Boolean).join(' ') || v('empresa');
    const lineas = ['BEGIN:VCARD', 'VERSION:3.0', `N:${escVcard(v('apellidos'))};${escVcard(v('nombre'))};;;`, `FN:${escVcard(completo)}`];
    if (v('empresa')) lineas.push(`ORG:${escVcard(v('empresa'))}`);
    if (v('cargo')) lineas.push(`TITLE:${escVcard(v('cargo'))}`);
    if (movil) lineas.push(`TEL;TYPE=CELL:${movil}`);
    if (trabajo) lineas.push(`TEL;TYPE=WORK,VOICE:${trabajo}`);
    if (v('correo')) lineas.push(`EMAIL:${v('correo')}`);
    if (web) lineas.push(`URL:${web}`);
    if (v('calle') || v('ciudad') || v('estado') || v('cp') || v('pais')) {
      lineas.push(`ADR:;;${escVcard(v('calle'))};${escVcard(v('ciudad'))};${escVcard(v('estado'))};${escVcard(v('cp'))};${escVcard(v('pais'))}`);
    }
    if (v('nota')) lineas.push(`NOTE:${escVcard(v('nota'))}`);
    lineas.push('END:VCARD');
    return { datos: lineas.join('\n'), resumen: `Contacto: ${completo}`, errores };
  },

  ubicacion(c) {
    const errores = {};
    const num = (t) => {
      const s = String(t ?? '').trim().replace(',', '.');
      return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
    };
    const lat = num(c.lat);
    const lng = num(c.lng);
    if (!String(c.lat ?? '').trim()) errores.lat = 'Escribe la latitud.';
    else if (Number.isNaN(lat) || lat < -90 || lat > 90) errores.lat = 'La latitud va de -90 a 90.';
    if (!String(c.lng ?? '').trim()) errores.lng = 'Escribe la longitud.';
    else if (Number.isNaN(lng) || lng < -180 || lng > 180) errores.lng = 'La longitud va de -180 a 180.';
    const datos = c.formato === 'maps' ? `https://www.google.com/maps?q=${lat},${lng}` : `geo:${lat},${lng}`;
    return { datos, resumen: `Ubicación ${lat}, ${lng}`, errores };
  },

  evento(c) {
    const errores = {};
    const titulo = String(c.titulo ?? '').trim();
    const todoDia = !!c.todoDia;
    const inicio = String(c.inicio ?? '');
    const fin = String(c.fin ?? '');
    if (!titulo) errores.titulo = 'Escribe el título del evento.';
    if (!inicio) errores.inicio = 'Elige cuándo empieza.';
    if (!fin) errores.fin = 'Elige cuándo termina.';
    if (inicio && fin && fin < inicio) errores.fin = 'El fin debe ser después del inicio.';
    const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `SUMMARY:${escIcs(titulo)}`];
    if (inicio && fin) {
      if (todoDia) {
        lineas.push(`DTSTART;VALUE=DATE:${fechaIcs(inicio.slice(0, 10), true)}`);
        lineas.push(`DTEND;VALUE=DATE:${fechaIcs(sumarDias(fin.slice(0, 10), 1), true)}`);
      } else {
        lineas.push(`DTSTART:${fechaIcs(inicio)}`, `DTEND:${fechaIcs(fin)}`);
      }
    }
    if (String(c.lugar ?? '').trim()) lineas.push(`LOCATION:${escIcs(c.lugar.trim())}`);
    if (String(c.descripcion ?? '').trim()) lineas.push(`DESCRIPTION:${escIcs(c.descripcion.trim())}`);
    lineas.push('END:VEVENT', 'END:VCALENDAR');
    return { datos: lineas.join('\n'), resumen: `Evento: ${titulo}`, errores };
  },
};

/** Arma el contenido del tipo actual. */
function construirContenido() {
  const campos = estado.campos[estado.tipo] || {};
  const r = CONSTRUCTORES[estado.tipo](campos);
  r.ok = Object.keys(r.errores).length === 0;
  return r;
}

/* =========================================================
   GENERACIÓN DEL QR (vista previa y archivos)
   ========================================================= */

/** Convierte una opción de color del diseño al formato de la librería. */
function aGradiente(g) {
  return {
    type: g.tipo === 'radial' ? 'radial' : 'linear',
    rotation: (Number(g.angulo) || 0) * Math.PI / 180,
    colorStops: [{ offset: 0, color: g.c1 }, { offset: 1, color: g.c2 }],
  };
}
const rellenoLibreria = (r) => (r.relleno === 'degradado' ? { gradient: aGradiente(r.grad) } : { color: r.color });

/** Nivel de corrección efectivo: con logo siempre H. */
const eccEfectivo = (d) => (d.logo.src ? 'H' : d.ecc);

/** Opciones completas para qr-code-styling. */
function opcionesLibreria(datos, d, S, tipoDibujo) {
  const esquina = (e) => ({ type: e.forma, ...(e.igual ? rellenoLibreria(d.modulos) : { color: e.color }) });
  return {
    type: tipoDibujo,
    width: S,
    height: S,
    data: aUtf8Binario(datos),
    margin: Math.round(S * d.margen / 100),
    image: d.logo.src || undefined,
    qrOptions: { errorCorrectionLevel: eccEfectivo(d) },
    imageOptions: {
      hideBackgroundDots: !!d.logo.ocultar,
      imageSize: Number(d.logo.tamano),
      margin: Math.round(Number(d.logo.margen) * S / 400),
      saveAsBlob: true,
    },
    dotsOptions: { type: d.modulos.forma, ...rellenoLibreria(d.modulos) },
    backgroundOptions: d.fondo.relleno === 'transparente' ? { color: 'rgba(0,0,0,0)' } : rellenoLibreria(d.fondo),
    cornersSquareOptions: esquina(d.esquinaMarco),
    cornersDotOptions: esquina(d.esquinaPunto),
  };
}

/** Medidas del lienzo final, con o sin marco de texto. "ancho" es el ancho total. */
function medidas(d, ancho) {
  if (!d.marco.activo) return { W: ancho, H: ancho, S: ancho, x: 0, y: 0 };
  const borde = 0.045;
  const b = Math.round(ancho * borde / (1 + 2 * borde));
  const S = ancho - 2 * b; // así el ancho final es exacto
  const banda = Math.round(S * 0.17);
  const W = S + 2 * b;
  const H = S + 2 * b + banda;
  const arriba = d.marco.posicion === 'arriba';
  const y = arriba ? b + banda : b;
  // Centro vertical del texto dentro de la franja
  const textoY = arriba ? (b + banda) / 2 : S + b + (banda + b) / 2;
  const radio = d.marco.redondeado ? b * 2.2 : 0;
  return { W, H, S, x: b, y, b, banda, textoY, radio };
}

/** Calcula el tamaño de letra del marco para que el texto quepa. */
let lienzoMedidor = null;
function fuenteMarco(d, m) {
  const f = FUENTES[d.marco.fuente] || FUENTES.sans;
  lienzoMedidor ??= document.createElement('canvas').getContext('2d');
  let tam = m.banda * 0.55 * Number(d.marco.escala || 1);
  const maximo = m.W - m.b * 4;
  lienzoMedidor.font = `700 ${tam}px ${f.familia}`;
  if ('fontStretch' in lienzoMedidor) lienzoMedidor.fontStretch = f.estiramiento || 'normal';
  const medido = lienzoMedidor.measureText(d.marco.texto || '').width;
  if (medido > maximo) tam *= maximo / medido;
  return { tam: Math.max(4, Math.floor(tam)), familia: f.familia, estiramiento: f.estiramiento || 'normal' };
}

/** Ruta de rectángulo redondeado para canvas. */
function trazarRectRedondeado(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
/** La misma figura como trazo SVG. */
function rutaRectRedondeado(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  if (!r) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

/** Crea la instancia de la librería y atrapa el error de "demasiados datos". */
function crearQR(datos, d, S, tipoDibujo) {
  try {
    return new QRCodeStyling(opcionesLibreria(datos, d, S, tipoDibujo));
  } catch (e) {
    throw new Error(String(e).includes('overflow') ? 'DEMASIADO' : String(e));
  }
}

/** Carga un Blob de imagen como algo dibujable en canvas. */
function cargarImagen(blob) {
  if (window.createImageBitmap) return createImageBitmap(blob);
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

/** Genera un canvas con el QR completo (marco incluido). */
async function componerCanvas(datos, d, ancho, formato = 'png') {
  const m = medidas(d, ancho);
  const qr = crearQR(datos, d, m.S, 'canvas');
  const blob = await qr.getRawData('png');
  const img = await cargarImagen(blob);
  const lienzo = document.createElement('canvas');
  lienzo.width = m.W;
  lienzo.height = m.H;
  const ctx = lienzo.getContext('2d');
  // JPG no admite transparencia: se pone fondo blanco
  if (formato === 'jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, m.W, m.H);
  }
  if (d.marco.activo) {
    // Marco con un hueco donde va el código (regla par-impar)
    ctx.fillStyle = d.marco.colorMarco;
    ctx.beginPath();
    trazarRectRedondeado(ctx, 0, 0, m.W, m.H, m.radio);
    trazarRectRedondeado(ctx, m.x, m.y, m.S, m.S, m.radio * 0.4);
    ctx.fill('evenodd');
    // Texto
    const f = fuenteMarco(d, m);
    ctx.font = `700 ${f.tam}px ${f.familia}`;
    if ('fontStretch' in ctx) ctx.fontStretch = f.estiramiento;
    ctx.fillStyle = d.marco.colorTexto;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.marco.texto || '', m.W / 2, m.textoY);
  }
  ctx.drawImage(img, m.x, m.y, m.S, m.S);
  if (img.close) img.close();
  return lienzo;
}

/** Genera el SVG completo (marco incluido) como texto. */
async function componerSVG(datos, d, ancho) {
  const m = medidas(d, ancho);
  const qr = crearQR(datos, d, m.S, 'svg');
  const blob = await qr.getRawData('svg');
  const texto = await blob.text();
  if (!d.marco.activo) return texto;
  const doc = new DOMParser().parseFromString(texto, 'image/svg+xml');
  const raiz = doc.documentElement;
  if (!raiz.getAttribute('viewBox')) raiz.setAttribute('viewBox', `0 0 ${m.S} ${m.S}`);
  raiz.setAttribute('x', m.x);
  raiz.setAttribute('y', m.y);
  raiz.setAttribute('width', m.S);
  raiz.setAttribute('height', m.S);
  const interior = new XMLSerializer().serializeToString(raiz);
  const f = fuenteMarco(d, m);
  const ruta = rutaRectRedondeado(0, 0, m.W, m.H, m.radio) + rutaRectRedondeado(m.x, m.y, m.S, m.S, m.radio * 0.4);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${m.W}" height="${m.H}" viewBox="0 0 ${m.W} ${m.H}">` +
    `<path fill="${escaparXML(d.marco.colorMarco)}" fill-rule="evenodd" d="${ruta}"/>` +
    `<text x="${m.W / 2}" y="${m.textoY}" fill="${escaparXML(d.marco.colorTexto)}" font-family="${escaparXML(f.familia)}" font-weight="700" font-size="${f.tam}" font-stretch="${f.estiramiento}" text-anchor="middle" dominant-baseline="central">${escaparXML(d.marco.texto || '')}</text>` +
    interior + '</svg>';
}

/** Promesa de canvas.toBlob. */
const lienzoABlob = (lienzo, tipo, calidad) => new Promise((ok, mal) => {
  lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo crear la imagen'))), tipo, calidad);
});

const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };
const EXTENSION = { png: 'png', jpeg: 'jpg', webp: 'webp', svg: 'svg' };

/** Genera el archivo final en el formato y ancho pedidos. */
async function generarArchivo(formato, ancho) {
  const d = estado.diseno;
  const datos = ultimoResultado.datos;
  if (formato === 'svg') {
    const svg = await componerSVG(datos, d, ancho);
    return { blob: new Blob([svg], { type: MIME.svg }), formato };
  }
  const lienzo = await componerCanvas(datos, d, ancho, formato);
  const blob = await lienzoABlob(lienzo, MIME[formato], 0.95);
  // Algunos navegadores (Safari antiguo) no crean WebP y regresan PNG
  if (formato === 'webp' && blob.type !== MIME.webp) return { blob, formato: 'png', aviso: 'Tu navegador no puede crear WebP; se generó PNG.' };
  return { blob, formato };
}

/* =========================================================
   VISTA PREVIA
   ========================================================= */
const lienzoVista = $('#lienzo');
const envoltura = $('#lienzo-envoltura');
const mensajeVista = $('#lienzo-mensaje');
const ANCHO_VISTA = 720;
let turnoRender = 0;
let temporizadorRender = null;

function programarRender(inmediato = false) {
  clearTimeout(temporizadorRender);
  temporizadorRender = setTimeout(renderizar, inmediato ? 0 : 120);
  programarGuardado();
}

function mostrarInvalido(mensaje) {
  envoltura.classList.add('invalido');
  mensajeVista.textContent = mensaje;
  mensajeVista.hidden = false;
  lienzoVista.setAttribute('aria-label', 'Vista previa no disponible: ' + mensaje);
  ultimoResultado = null;
  $$('#btn-descargar, #btn-copiar, #btn-compartir').forEach((b) => (b.disabled = true));
}

async function renderizar() {
  const turno = ++turnoRender;
  const r = construirContenido();
  mostrarErrores(r.errores);
  actualizarAvisos();
  $('#resumen').textContent = r.ok ? r.resumen : '';
  // Enlace para probar el código antes de imprimirlo (solo direcciones web)
  const probable = r.ok && /^https?:///i.test(r.datos);
  $('#probar').hidden = !probable;
  if (probable) $('#probar-enlace').href = r.datos;
  if (!r.ok) {
    const primero = Object.values(r.errores)[0];
    mostrarInvalido('Completa los datos: ' + primero);
    return;
  }
  try {
    const lienzo = await componerCanvas(r.datos, estado.diseno, ANCHO_VISTA);
    if (turno !== turnoRender) return; // llegó un cambio más reciente
    lienzoVista.width = lienzo.width;
    lienzoVista.height = lienzo.height;
    const ctx = lienzoVista.getContext('2d');
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(lienzo, 0, 0);
    envoltura.classList.remove('invalido');
    mensajeVista.hidden = true;
    lienzoVista.setAttribute('aria-label', 'Vista previa del código QR: ' + r.resumen);
    ultimoResultado = r;
    $$('#btn-descargar, #btn-copiar, #btn-compartir').forEach((b) => (b.disabled = false));
    prepararCompartir();
  } catch (e) {
    if (turno !== turnoRender) return;
    mostrarInvalido(e.message === 'DEMASIADO'
      ? 'Demasiado contenido para este código. Acorta el texto o baja la corrección de errores (sin logo).'
      : 'No se pudo generar el código: ' + e.message);
  }
}

/* ---------- Avisos de contraste y legibilidad ---------- */
function hexARgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminancia(hex) {
  const [r, g, b] = hexARgb(hex).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a, b) {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
const coloresDe = (r) => (r.relleno === 'degradado' ? [r.grad.c1, r.grad.c2] : [r.color]);

function actualizarAvisos() {
  const d = estado.diseno;
  const avisos = [];
  const mods = coloresDe(d.modulos);
  if (!d.esquinaMarco.igual) mods.push(d.esquinaMarco.color);
  if (!d.esquinaPunto.igual) mods.push(d.esquinaPunto.color);

  if (d.fondo.relleno === 'transparente') {
    const claros = mods.some((c) => luminancia(c) > 0.4);
    avisos.push(claros
      ? '⚠️ Fondo transparente con módulos claros: el código solo se leerá sobre superficies oscuras y muchos lectores fallarán.'
      : 'ℹ️ Fondo transparente: colócalo sobre una superficie clara para que se pueda leer.');
  } else {
    const fondos = coloresDe(d.fondo);
    let minimo = Infinity;
    for (const a of mods) for (const b of fondos) minimo = Math.min(minimo, contraste(a, b));
    if (minimo < 2) avisos.push(`⛔ Contraste muy bajo (${minimo.toFixed(1)}:1) entre módulos y fondo. Es muy probable que no se pueda escanear.`);
    else if (minimo < 3.5) avisos.push(`⚠️ Contraste bajo (${minimo.toFixed(1)}:1) entre módulos y fondo. Puede costar trabajo escanearlo; usa colores más distintos.`);
    const promedio = (lista) => lista.reduce((s, c) => s + luminancia(c), 0) / lista.length;
    if (promedio(mods) > promedio(fondos)) avisos.push('⚠️ Los módulos son más claros que el fondo (código invertido). Algunos lectores no lo reconocen.');
  }
  if (d.marco.activo && contraste(d.marco.colorTexto, d.marco.colorMarco) < 3) avisos.push('⚠️ El texto del marco casi no se distingue del color del marco.');
  if (d.logo.src && d.logo.tamano > 0.4) avisos.push('⚠️ El logo es grande: prueba escanear el código antes de imprimirlo.');
  if (Number(d.margen) === 0 && !d.marco.activo) avisos.push('ℹ️ Sin margen, algunos lectores no encuentran el código. Deja al menos un 2 %.');

  $('#avisos').innerHTML = avisos.map((a) => `<p class="aviso-contraste">${escaparXML(a)}</p>`).join('');
}

/* =========================================================
   INTERFAZ: CONTENIDO
   ========================================================= */
const formContenido = $('#form-contenido');

function pintarTipos() {
  $('#tipos').innerHTML = TIPOS.map((t) => `
    <label class="chip">
      <input type="radio" name="tipo" value="${t.id}" ${t.id === estado.tipo ? 'checked' : ''}>
      <span><span aria-hidden="true">${t.icono}</span> ${t.nombre}</span>
    </label>`).join('');
}

/** Lee todos los campos de un formulario de tipo. */
function leerCampos(tipo) {
  const contenedor = $(`.formulario[data-tipo="${tipo}"]`);
  const campos = {};
  $$('input[name], select[name], textarea[name]', contenedor).forEach((el) => {
    campos[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  });
  return campos;
}
/** Pone en el formulario los valores guardados. */
function escribirCampos(tipo) {
  const contenedor = $(`.formulario[data-tipo="${tipo}"]`);
  const campos = estado.campos[tipo];
  if (!campos) return;
  // Las fechas de "todo el día" solo caben en campos tipo date
  if (tipo === 'evento') ajustarTipoFecha(!!campos.todoDia);
  $$('input[name], select[name], textarea[name]', contenedor).forEach((el) => {
    if (!(el.name in campos)) return;
    if (el.type === 'checkbox') el.checked = !!campos[el.name];
    else el.value = campos[el.name];
  });
}

function mostrarFormulario(tipo) {
  $$('.formulario').forEach((f) => (f.hidden = f.dataset.tipo !== tipo));
  if (tipo === 'evento') prepararEvento();
  if (tipo === 'wifi') ajustarWifi();
  if (tipo === 'whatsapp') ajustarWhatsapp();
  actualizarContadores();
}

function cambiarTipo(tipo) {
  estado.tipo = tipo;
  mostrarFormulario(tipo);
  estado.campos[tipo] = leerCampos(tipo);
  programarRender(true);
}

/** Muestra los errores de validación solo en campos ya editados. */
function mostrarErrores(errores) {
  const contenedor = $(`.formulario[data-tipo="${estado.tipo}"]`);
  $$('input[name], select[name], textarea[name]', contenedor).forEach((el) => {
    const msg = tocados.has(el.id) ? errores[el.name] : null;
    const idError = el.id + '-error';
    let p = document.getElementById(idError);
    const ayudas = $$('.ayuda[id]', el.closest('.campo') || contenedor).map((a) => a.id);
    if (msg) {
      if (!p) {
        p = document.createElement('p');
        p.className = 'error';
        p.id = idError;
        (el.closest('.campo') || el.parentElement).appendChild(p);
      }
      p.textContent = msg;
      el.setAttribute('aria-invalid', 'true');
      el.setAttribute('aria-describedby', [idError, ...ayudas].join(' '));
    } else {
      if (p) p.remove();
      el.removeAttribute('aria-invalid');
      if (ayudas.length) el.setAttribute('aria-describedby', ayudas.join(' '));
      else el.removeAttribute('aria-describedby');
    }
  });
}

function actualizarContadores() {
  $$('[data-contador]').forEach((s) => {
    const el = document.getElementById(s.dataset.contador);
    if (el) s.textContent = el.value.length;
  });
}

/* WiFi: sin contraseña oculta el campo de clave */
function ajustarWifi() {
  const sinClave = $('#wifi-cifrado').value === 'nopass';
  $('[data-si-cifrado]').hidden = sinClave;
}

/* WhatsApp: la opción del 1 solo aplica a México (código 52) */
function ajustarWhatsapp() {
  $('#wa-campo-mx').hidden = $('#wa-lada').value.replace(/D/g, '') !== '52';
}

/* Evento: valores iniciales y cambio entre "todo el día" y con hora */
const dosDigitos = (n) => String(n).padStart(2, '0');
const aLocal = (f) => `${f.getFullYear()}-${dosDigitos(f.getMonth() + 1)}-${dosDigitos(f.getDate())}T${dosDigitos(f.getHours())}:${dosDigitos(f.getMinutes())}`;
function prepararEvento() {
  const ini = $('#ev-inicio');
  const fin = $('#ev-fin');
  const todoDia = $('#ev-todo-dia').checked;
  ajustarTipoFecha(todoDia);
  if (!ini.value) {
    const f = new Date();
    f.setMinutes(0, 0, 0);
    f.setHours(f.getHours() + 1);
    const f2 = new Date(f.getTime() + 3600000);
    ini.value = todoDia ? aLocal(f).slice(0, 10) : aLocal(f);
    fin.value = todoDia ? aLocal(f2).slice(0, 10) : aLocal(f2);
  }
}
function ajustarTipoFecha(todoDia) {
  for (const el of [$('#ev-inicio'), $('#ev-fin')]) {
    const valor = el.value;
    const nuevoTipo = todoDia ? 'date' : 'datetime-local';
    if (el.type === nuevoTipo) continue;
    el.type = nuevoTipo;
    if (valor) el.value = todoDia ? valor.slice(0, 10) : `${valor.slice(0, 10)}T09:00`;
  }
}

function iniciarContenido() {
  pintarTipos();
  TIPOS.forEach((t) => escribirCampos(t.id));
  // Guarda los valores iniciales de todos los formularios
  TIPOS.forEach((t) => (estado.campos[t.id] = { ...leerCampos(t.id), ...(estado.campos[t.id] || {}) }));
  mostrarFormulario(estado.tipo);

  $('#tipos').addEventListener('change', (e) => {
    if (e.target.name === 'tipo') cambiarTipo(e.target.value);
  });

  formContenido.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.name) return;
    // Si pegan "lat, lng" en la latitud, se reparte en los dos campos
    if (el.id === 'geo-lat') {
      const par = el.value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (par) { el.value = par[1]; $('#geo-lng').value = par[2]; tocados.add('geo-lng'); }
    }
    if (el.id === 'ev-todo-dia') ajustarTipoFecha(el.checked);
    if (el.id === 'wifi-cifrado') ajustarWifi();
    if (el.id === 'wa-lada') ajustarWhatsapp();
    tocados.add(el.id);
    estado.campos[estado.tipo] = leerCampos(estado.tipo);
    actualizarContadores();
    programarRender();
  });
  formContenido.addEventListener('change', (e) => {
    if (!e.target.name) return;
    tocados.add(e.target.id);
    estado.campos[estado.tipo] = leerCampos(estado.tipo);
    programarRender();
  });
  formContenido.addEventListener('focusout', (e) => {
    if (e.target.name && !tocados.has(e.target.id)) {
      tocados.add(e.target.id);
      programarRender(true);
    }
  });
  formContenido.addEventListener('submit', (e) => e.preventDefault());

  // Mostrar u ocultar contraseña
  $$('[data-ver-clave]').forEach((b) => b.addEventListener('click', () => {
    const campo = document.getElementById(b.dataset.verClave);
    const ver = campo.type === 'password';
    campo.type = ver ? 'text' : 'password';
    b.textContent = ver ? 'Ocultar' : 'Mostrar';
    b.setAttribute('aria-pressed', String(ver));
  }));

  // Ubicación actual (solo se usa en el dispositivo)
  $('#btn-mi-ubicacion').addEventListener('click', () => {
    if (!navigator.geolocation) return avisar('Tu navegador no permite obtener la ubicación.');
    avisar('Obteniendo tu ubicación…');
    navigator.geolocation.getCurrentPosition((pos) => {
      $('#geo-lat').value = pos.coords.latitude.toFixed(6);
      $('#geo-lng').value = pos.coords.longitude.toFixed(6);
      tocados.add('geo-lat'); tocados.add('geo-lng');
      estado.campos.ubicacion = leerCampos('ubicacion');
      programarRender(true);
      avisar('Ubicación lista.');
    }, (err) => {
      avisar(err.code === 1 ? 'No diste permiso para usar tu ubicación.' : 'No se pudo obtener la ubicación.');
    }, { enableHighAccuracy: true, timeout: 15000 });
  });
}

/* =========================================================
   INTERFAZ: DISEÑO
   ========================================================= */
const formDiseno = $('#form-diseno');

/** Construye los controles de color (sólido / degradado / transparente). */
function construirGruposColor() {
  $$('.grupo-color').forEach((g) => {
    const p = g.dataset.grupo;
    const titulo = p === 'modulos' ? 'de los módulos' : 'del fondo';
    const conTransparente = g.hasAttribute('data-transparente');
    const opcion = (valor, texto) => `
      <label class="chip"><input type="radio" name="${p}.relleno" value="${valor}"><span>${texto}</span></label>`;
    g.innerHTML = `
      <fieldset>
        <legend class="oculto-visual">Tipo de color ${titulo}</legend>
        <div class="opciones-relleno">
          ${opcion('solido', 'Sólido')}${opcion('degradado', 'Degradado')}${conTransparente ? opcion('transparente', 'Transparente') : ''}
        </div>
      </fieldset>
      <div data-relleno="solido">
        <div class="campo">
          <label for="d-${p}-color">Color ${titulo}</label>
          <input id="d-${p}-color" name="${p}.color" type="color">
        </div>
      </div>
      <div data-relleno="degradado">
        <div class="fila">
          <div class="campo"><label for="d-${p}-c1">Color inicial</label><input id="d-${p}-c1" name="${p}.grad.c1" type="color"></div>
          <div class="campo"><label for="d-${p}-c2">Color final</label><input id="d-${p}-c2" name="${p}.grad.c2" type="color"></div>
        </div>
        <div class="campo">
          <label for="d-${p}-gtipo">Tipo de degradado</label>
          <select id="d-${p}-gtipo" name="${p}.grad.tipo">
            <option value="linear">Lineal</option>
            <option value="radial">Radial (desde el centro)</option>
          </select>
        </div>
        <div class="campo" data-solo-lineal>
          <label for="d-${p}-angulo">Ángulo: <output for="d-${p}-angulo" data-salida="${p}.grad.angulo"></output></label>
          <input id="d-${p}-angulo" name="${p}.grad.angulo" type="range" min="0" max="360" step="5">
        </div>
      </div>`;
  });
}

/** Pone en los controles los valores del diseño actual. */
function escribirDiseno() {
  const d = estado.diseno;
  $$('[name]', formDiseno).forEach((el) => {
    const v = leerRuta(d, el.name);
    if (v === undefined) return;
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.type === 'radio') el.checked = el.value === v;
    else el.value = v;
  });
  refrescarDiseno();
}

/** Ajusta lo que se ve u oculta según el diseño, y los textos de los deslizadores. */
function refrescarDiseno() {
  const d = estado.diseno;
  $$('.grupo-color').forEach((g) => {
    const relleno = leerRuta(d, g.dataset.grupo + '.relleno');
    $$('[data-relleno]', g).forEach((b) => (b.hidden = b.dataset.relleno !== relleno));
    const radial = leerRuta(d, g.dataset.grupo + '.grad.tipo') === 'radial';
    $('[data-solo-lineal]', g).hidden = radial;
  });
  $('#d-marco-color').disabled = d.esquinaMarco.igual;
  $('#d-punto-color').disabled = d.esquinaPunto.igual;

  // Logo: corrección H forzada
  const conLogo = !!d.logo.src;
  const ecc = $('#d-ecc');
  ecc.disabled = conLogo;
  ecc.value = eccEfectivo(d);
  $('#aviso-ecc').hidden = !conLogo;
  $('#btn-quitar-logo').hidden = !conLogo;
  $('#logo-miniatura').style.backgroundImage = conLogo ? `url("${d.logo.src}")` : '';
  $$('#d-logo-tamano, #d-logo-margen').forEach((el) => (el.disabled = !conLogo));
  $('[name="logo.ocultar"]').disabled = !conLogo;

  // Marco con texto
  $$('[name^="marco."]:not([name="marco.activo"])').forEach((el) => (el.disabled = !d.marco.activo));

  // Textos de los deslizadores
  const formatos = {
    'logo.tamano': (v) => `${Math.round(v * 100)} %`,
    'logo.margen': (v) => String(v),
    'marco.escala': (v) => `${Math.round(v * 100)} %`,
    margen: (v) => `${v} % (≈ ${Math.round(d.tamano * v / 100)} px)`,
    'modulos.grad.angulo': (v) => `${v}°`,
    'fondo.grad.angulo': (v) => `${v}°`,
  };
  $$('output[data-salida]').forEach((o) => {
    const f = formatos[o.dataset.salida];
    o.textContent = f ? f(leerRuta(d, o.dataset.salida)) : leerRuta(d, o.dataset.salida);
  });
  actualizarResoluciones();
}

/** Lee un control del diseño y guarda su valor. */
function leerControlDiseno(el) {
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.type === 'radio') { if (!el.checked) return; v = el.value; }
  else if (el.type === 'range' || el.type === 'number') v = Number(el.value);
  else v = el.value;
  fijarRuta(estado.diseno, el.name, v);
}

/** Reduce el logo a un máximo de 512 px y lo convierte en data URL PNG. */
function procesarLogo(archivo) {
  return new Promise((ok, mal) => {
    if (!archivo.type.startsWith('image/')) return mal(new Error('El archivo no es una imagen.'));
    const lector = new FileReader();
    lector.onerror = () => mal(new Error('No se pudo leer el archivo.'));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => mal(new Error('No se pudo abrir la imagen.'));
      img.onload = () => {
        const max = 512;
        let w = img.naturalWidth || 512;
        let h = img.naturalHeight || 512;
        const escala = Math.min(1, max / Math.max(w, h));
        w = Math.max(1, Math.round(w * escala));
        h = Math.max(1, Math.round(h * escala));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        ok(c.toDataURL('image/png'));
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

/** Aplica una plantilla conservando logo, tamaño y el texto del marco. */
function disenoDePlantilla(p, actual) {
  const nuevo = fusionar(DISENO_BASE, p.diseno);
  nuevo.logo = clonar(actual.logo);
  nuevo.tamano = actual.tamano;
  nuevo.ecc = actual.ecc;
  nuevo.marco = p.diseno.marco ? { ...nuevo.marco, texto: actual.marco.texto } : clonar(actual.marco);
  return nuevo;
}

async function pintarPlantillas() {
  const cont = $('#plantillas');
  cont.innerHTML = PLANTILLAS.map((p, i) => `
    <button type="button" class="plantilla" data-plantilla="${i}">
      <span class="hueco" aria-hidden="true"></span>
      <span>${escaparXML(p.nombre)}</span>
    </button>`).join('');
  // Miniaturas generadas una por una para no trabar la interfaz
  for (const [i, p] of PLANTILLAS.entries()) {
    try {
      const d = fusionar(DISENO_BASE, p.diseno);
      const lienzo = await componerCanvas('https://ejemplo.com', d, 144);
      const img = document.createElement('img');
      img.alt = '';
      img.src = lienzo.toDataURL('image/png');
      img.width = 72;
      img.height = 72;
      img.style.objectFit = 'contain';
      $(`[data-plantilla="${i}"] .hueco`, cont)?.replaceWith(img);
    } catch { /* si falla la miniatura, queda el recuadro vacío */ }
  }
}

function iniciarDiseno() {
  construirGruposColor();
  escribirDiseno();
  pintarPlantillas();

  formDiseno.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.name || el.type === 'number') return; // el tamaño se aplica al terminar de escribir
    leerControlDiseno(el);
    refrescarDiseno();
    programarRender();
  });
  formDiseno.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.name) return;
    if (el.name === 'tamano') {
      const v = limitar(Math.round(Number(el.value) || DISENO_BASE.tamano), 128, 4096);
      el.value = v;
    }
    leerControlDiseno(el);
    refrescarDiseno();
    programarRender();
  });
  formDiseno.addEventListener('submit', (e) => e.preventDefault());

  $('#plantillas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-plantilla]');
    if (!b) return;
    const p = PLANTILLAS[Number(b.dataset.plantilla)];
    estado.diseno = disenoDePlantilla(p, estado.diseno);
    escribirDiseno();
    programarRender(true);
    avisar(`Plantilla «${p.nombre}» aplicada.`);
  });

  $('#btn-restablecer').addEventListener('click', () => {
    estado.diseno = clonar(DISENO_BASE);
    escribirDiseno();
    programarRender(true);
    avisar('Diseño restablecido.');
  });

  $('#d-logo-archivo').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (!archivo) return;
    try {
      estado.diseno.logo.src = await procesarLogo(archivo);
      refrescarDiseno();
      programarRender(true);
      avisar('Logo agregado. La corrección de errores cambió a H.');
    } catch (err) {
      avisar(err.message);
    }
  });
  $('#btn-quitar-logo').addEventListener('click', () => {
    estado.diseno.logo.src = null;
    refrescarDiseno();
    programarRender(true);
    $('#d-logo-archivo').focus();
    avisar('Logo quitado.');
  });
}

/* =========================================================
   DESCARGAR, COPIAR Y COMPARTIR
   ========================================================= */
const selResolucion = $('#resolucion');
const RESOLUCIONES = [256, 512, 1024, 2048, 4096];

function actualizarResoluciones() {
  const elegido = selResolucion.value || 'diseno';
  selResolucion.innerHTML = `<option value="diseno">Tamaño del diseño (${estado.diseno.tamano} px)</option>` +
    RESOLUCIONES.map((r) => `<option value="${r}">${r} × ${r} px</option>`).join('');
  selResolucion.value = elegido;
}
const anchoElegido = () => (selResolucion.value === 'diseno' ? estado.diseno.tamano : Number(selResolucion.value));

function nombreArchivo(formato) {
  const f = new Date();
  const sello = `${f.getFullYear()}${dosDigitos(f.getMonth() + 1)}${dosDigitos(f.getDate())}-${dosDigitos(f.getHours())}${dosDigitos(f.getMinutes())}${dosDigitos(f.getSeconds())}`;
  return `qr-${estado.tipo}-${sello}.${EXTENSION[formato]}`;
}

function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function descargar() {
  if (!ultimoResultado) return;
  const boton = $('#btn-descargar');
  boton.disabled = true;
  try {
    const r = await generarArchivo($('#formato').value, anchoElegido());
    descargarBlob(r.blob, nombreArchivo(r.formato));
    avisar(r.aviso || `Descargado en ${EXTENSION[r.formato].toUpperCase()}.`);
    agregarHistorial();
  } catch (e) {
    avisar('No se pudo descargar: ' + (e.message === 'DEMASIADO' ? 'demasiado contenido.' : e.message));
  } finally {
    boton.disabled = !ultimoResultado;
  }
}

async function copiar() {
  if (!ultimoResultado) return;
  if (!navigator.clipboard?.write || !window.ClipboardItem) {
    return avisar('Tu navegador no permite copiar imágenes. Usa Descargar.');
  }
  try {
    // Se pasa la promesa directo para que Safari no pierda el permiso del clic
    const promesa = generarArchivo('png', anchoElegido()).then((r) => r.blob);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': promesa })]);
    avisar('Imagen copiada al portapapeles.');
    agregarHistorial();
  } catch {
    avisar('No se pudo copiar la imagen. Usa Descargar.');
  }
}

/* El archivo para compartir se prepara por adelantado: algunos navegadores
   exigen que navigator.share se llame justo al tocar el botón. */
let paraCompartir = { clave: '', archivo: null };
let temporizadorCompartir = null;
const claveCompartir = () => JSON.stringify([ultimoResultado?.datos, estado.diseno, anchoElegido()]);
function prepararCompartir() {
  clearTimeout(temporizadorCompartir);
  temporizadorCompartir = setTimeout(async () => {
    if (!ultimoResultado || !navigator.canShare) return;
    const clave = claveCompartir();
    try {
      const { blob } = await generarArchivo('png', Math.min(anchoElegido(), 2048));
      paraCompartir = { clave, archivo: new File([blob], nombreArchivo('png'), { type: 'image/png' }) };
    } catch { /* se intentará al tocar el botón */ }
  }, 700);
}

async function compartir() {
  if (!ultimoResultado) return;
  try {
    let archivo = paraCompartir.clave === claveCompartir() ? paraCompartir.archivo : null;
    if (!archivo && navigator.canShare) {
      const { blob } = await generarArchivo('png', Math.min(anchoElegido(), 2048));
      archivo = new File([blob], nombreArchivo('png'), { type: 'image/png' });
    }
    if (archivo && navigator.canShare?.({ files: [archivo] })) {
      await navigator.share({ files: [archivo], title: 'Código QR', text: ultimoResultado.resumen });
      agregarHistorial();
    } else if (navigator.share) {
      await navigator.share({ title: 'Código QR', text: ultimoResultado.datos });
      agregarHistorial();
    } else {
      avisar('Tu navegador no permite compartir. Usa Descargar o Copiar imagen.');
    }
  } catch (e) {
    if (e.name !== 'AbortError') avisar('No se pudo compartir. Toca el botón otra vez o usa Descargar.');
  }
}

/* =========================================================
   GUARDADOS: DISEÑOS E HISTORIAL
   ========================================================= */
const MAX_HISTORIAL = 30;
const fechaCorta = (t) => new Date(t).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

async function miniatura(datos, d) {
  try {
    const lienzo = await componerCanvas(datos, d, 112);
    return lienzo.toDataURL('image/png');
  } catch {
    return '';
  }
}

function pintarDisenos() {
  const lista = almacen.leer(CLAVES.disenos, []);
  const ul = $('#lista-disenos');
  $('#btn-borrar-disenos').hidden = lista.length === 0;
  if (!lista.length) {
    ul.innerHTML = '<li class="vacia">Todavía no guardas diseños.</li>';
    return;
  }
  ul.innerHTML = lista.map((x) => `
    <li>
      ${x.miniatura ? `<img src="${x.miniatura}" alt="">` : ''}
      <div class="info"><strong>${escaparXML(x.nombre)}</strong><small>${fechaCorta(x.fecha)}</small></div>
      <div class="acciones">
        <button type="button" class="btn btn-sec btn-chico" data-aplicar-diseno="${x.id}" aria-label="Aplicar diseño ${escaparXML(x.nombre)}">Aplicar</button>
        <button type="button" class="btn btn-peligro btn-chico" data-borrar-diseno="${x.id}" aria-label="Borrar diseño ${escaparXML(x.nombre)}">Borrar</button>
      </div>
    </li>`).join('');
}

async function guardarDiseno(nombre) {
  const lista = almacen.leer(CLAVES.disenos, []);
  const datos = ultimoResultado?.datos || 'https://ejemplo.com';
  const item = { id: nuevoId(), nombre, fecha: Date.now(), diseno: clonar(estado.diseno), miniatura: await miniatura(datos, estado.diseno) };
  lista.unshift(item);
  if (almacen.guardar(CLAVES.disenos, lista)) {
    avisar(`Diseño «${nombre}» guardado.`);
  } else if (item.diseno.logo.src) {
    // Sin espacio: se intenta guardar sin el logo
    item.diseno.logo.src = null;
    if (almacen.guardar(CLAVES.disenos, lista)) avisar('Diseño guardado sin el logo: no hay espacio suficiente en el navegador.');
    else avisar('No hay espacio para guardar más diseños. Borra algunos.');
  } else {
    avisar('No hay espacio para guardar más diseños. Borra algunos.');
  }
  pintarDisenos();
}

function pintarHistorial() {
  const lista = almacen.leer(CLAVES.historial, []);
  const ul = $('#lista-historial');
  $('#btn-borrar-historial').hidden = lista.length === 0;
  if (!lista.length) {
    ul.innerHTML = '<li class="vacia">El historial está vacío.</li>';
    return;
  }
  ul.innerHTML = lista.map((x) => `
    <li>
      ${x.miniatura ? `<img src="${x.miniatura}" alt="">` : ''}
      <div class="info"><strong>${escaparXML(x.resumen)}</strong><small>${escaparXML(nombreTipo(x.tipo))} · ${fechaCorta(x.fecha)}</small></div>
      <div class="acciones">
        <button type="button" class="btn btn-sec btn-chico" data-restaurar="${x.id}" aria-label="Abrir ${escaparXML(x.resumen)}">Abrir</button>
        <button type="button" class="btn btn-peligro btn-chico" data-borrar-hist="${x.id}" aria-label="Borrar del historial ${escaparXML(x.resumen)}">Borrar</button>
      </div>
    </li>`).join('');
}

async function agregarHistorial() {
  if (!almacen.leer(CLAVES.historialActivo, true) || !ultimoResultado) return;
  const r = ultimoResultado;
  const lista = almacen.leer(CLAVES.historial, []).filter((x) => !(x.tipo === estado.tipo && x.datos === r.datos));
  // El logo no se guarda en el historial para ahorrar espacio
  const diseno = clonar(estado.diseno);
  const teniaLogo = !!diseno.logo.src;
  diseno.logo.src = null;
  lista.unshift({
    id: nuevoId(), fecha: Date.now(), tipo: estado.tipo, datos: r.datos, resumen: r.resumen,
    campos: clonar(estado.campos[estado.tipo] || {}), diseno, teniaLogo,
    miniatura: await miniatura(r.datos, estado.diseno),
  });
  lista.length = Math.min(lista.length, MAX_HISTORIAL);
  // Si no cabe, se van quitando los más viejos
  while (lista.length && !almacen.guardar(CLAVES.historial, lista)) lista.pop();
  pintarHistorial();
}

/** Recarga los controles después de cambiar el estado completo. */
function recargarTodo() {
  pintarTipos();
  TIPOS.forEach((t) => escribirCampos(t.id));
  mostrarFormulario(estado.tipo);
  tocados.clear();
  escribirDiseno();
  programarRender(true);
}

function iniciarGuardados() {
  const casilla = $('#historial-activo');
  casilla.checked = almacen.leer(CLAVES.historialActivo, true);
  casilla.addEventListener('change', () => {
    almacen.guardar(CLAVES.historialActivo, casilla.checked);
    avisar(casilla.checked ? 'El historial está activado.' : 'El historial está desactivado.');
  });

  pintarDisenos();
  pintarHistorial();

  $('#lista-disenos').addEventListener('click', (e) => {
    const aplicar = e.target.closest('[data-aplicar-diseno]');
    const borrar = e.target.closest('[data-borrar-diseno]');
    const lista = almacen.leer(CLAVES.disenos, []);
    if (aplicar) {
      const x = lista.find((i) => i.id === aplicar.dataset.aplicarDiseno);
      if (!x) return;
      estado.diseno = fusionar(DISENO_BASE, x.diseno);
      escribirDiseno();
      programarRender(true);
      avisar(`Diseño «${x.nombre}» aplicado.`);
    } else if (borrar) {
      const x = lista.find((i) => i.id === borrar.dataset.borrarDiseno);
      if (!x || !confirm(`¿Borrar el diseño «${x.nombre}»?`)) return;
      almacen.guardar(CLAVES.disenos, lista.filter((i) => i.id !== x.id));
      pintarDisenos();
      avisar('Diseño borrado.');
    }
  });

  $('#lista-historial').addEventListener('click', (e) => {
    const abrir = e.target.closest('[data-restaurar]');
    const borrar = e.target.closest('[data-borrar-hist]');
    const lista = almacen.leer(CLAVES.historial, []);
    if (abrir) {
      const x = lista.find((i) => i.id === abrir.dataset.restaurar);
      if (!x) return;
      const logoActual = estado.diseno.logo.src;
      estado.tipo = x.tipo;
      estado.campos[x.tipo] = { ...estado.campos[x.tipo], ...x.campos };
      estado.diseno = fusionar(DISENO_BASE, x.diseno);
      // Si tenía logo, se reutiliza el logo cargado ahora (si hay)
      if (x.teniaLogo) estado.diseno.logo.src = logoActual;
      recargarTodo();
      activarPestana($('#tab-contenido'));
      avisar(x.teniaLogo && !logoActual ? 'QR abierto. El logo no se guarda en el historial: vuelve a subirlo.' : 'QR abierto desde el historial.');
    } else if (borrar) {
      almacen.guardar(CLAVES.historial, lista.filter((i) => i.id !== borrar.dataset.borrarHist));
      pintarHistorial();
      avisar('Elemento borrado del historial.');
    }
  });

  $('#btn-borrar-disenos').addEventListener('click', () => {
    if (!confirm('¿Borrar todos los diseños guardados? No se puede deshacer.')) return;
    almacen.borrar(CLAVES.disenos);
    pintarDisenos();
    avisar('Se borraron todos los diseños.');
  });
  $('#btn-borrar-historial').addEventListener('click', () => {
    if (!confirm('¿Borrar todo el historial? No se puede deshacer.')) return;
    almacen.borrar(CLAVES.historial);
    pintarHistorial();
    avisar('Historial borrado.');
  });

  // Diálogo para nombrar el diseño
  const dialogo = $('#dialogo-guardar');
  $('#btn-guardar').addEventListener('click', () => {
    const n = almacen.leer(CLAVES.disenos, []).length + 1;
    $('#dg-nombre').value = `Mi diseño ${n}`;
    if (dialogo.showModal) {
      dialogo.showModal();
      $('#dg-nombre').select();
    } else {
      const nombre = prompt('Nombre del diseño', $('#dg-nombre').value);
      if (nombre && nombre.trim()) guardarDiseno(nombre.trim());
    }
  });
  $('#dg-cancelar').addEventListener('click', () => dialogo.close());
  $('#form-guardar').addEventListener('submit', (e) => {
    const nombre = $('#dg-nombre').value.trim();
    if (!nombre) { e.preventDefault(); $('#dg-nombre').focus(); return; }
    guardarDiseno(nombre);
  });
}

/* =========================================================
   PESTAÑAS (accesibles con teclado)
   ========================================================= */
const pestanas = $$('[role="tab"]');
function activarPestana(tab, enfocar = false) {
  pestanas.forEach((t) => {
    const activa = t === tab;
    t.setAttribute('aria-selected', String(activa));
    t.tabIndex = activa ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !activa;
  });
  if (enfocar) tab.focus();
}
function iniciarPestanas() {
  pestanas.forEach((t, i) => {
    t.addEventListener('click', () => activarPestana(t));
    t.addEventListener('keydown', (e) => {
      const mapa = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: pestanas.length - 1 };
      if (!(e.key in mapa)) return;
      e.preventDefault();
      activarPestana(pestanas[(mapa[e.key] + pestanas.length) % pestanas.length], true);
    });
  });
}

/* =========================================================
   TEMA, AVISOS, INSTALACIÓN Y SERVICE WORKER
   ========================================================= */
const TEMAS = {
  auto: { icono: '◐', texto: 'automático' },
  claro: { icono: '☀️', texto: 'claro' },
  oscuro: { icono: '🌙', texto: 'oscuro' },
};
function aplicarTema(tema) {
  const raiz = document.documentElement;
  if (tema === 'claro') raiz.dataset.theme = 'light';
  else if (tema === 'oscuro') raiz.dataset.theme = 'dark';
  else delete raiz.dataset.theme;
  $('#icono-tema').textContent = TEMAS[tema].icono;
  const b = $('#btn-tema');
  b.setAttribute('aria-label', `Cambiar tema (ahora: ${TEMAS[tema].texto})`);
  b.title = `Tema: ${TEMAS[tema].texto}`;
}
function iniciarTema() {
  let tema = almacen.leer(CLAVES.tema, 'auto');
  if (!TEMAS[tema]) tema = 'auto';
  aplicarTema(tema);
  $('#btn-tema').addEventListener('click', () => {
    const orden = ['auto', 'claro', 'oscuro'];
    tema = orden[(orden.indexOf(tema) + 1) % orden.length];
    almacen.guardar(CLAVES.tema, tema);
    aplicarTema(tema);
    avisar(`Tema ${TEMAS[tema].texto}.`);
  });
}

/* Aviso breve en la parte de abajo (también lo leen los lectores de pantalla) */
let temporizadorAviso = null;
function avisar(texto, opciones = {}) {
  const caja = $('#aviso');
  caja.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = texto;
  caja.appendChild(span);
  if (opciones.boton) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = opciones.boton;
    b.addEventListener('click', () => { caja.classList.remove('visible'); opciones.accion(); });
    caja.appendChild(b);
  }
  caja.classList.add('visible');
  clearTimeout(temporizadorAviso);
  const duracion = opciones.duracion ?? 3200;
  if (duracion > 0) temporizadorAviso = setTimeout(() => caja.classList.remove('visible'), duracion);
}

/* Guardar el trabajo actual para la próxima visita */
let temporizadorGuardado = null;
function programarGuardado() {
  clearTimeout(temporizadorGuardado);
  temporizadorGuardado = setTimeout(() => {
    const datos = { version: VERSION, tipo: estado.tipo, campos: estado.campos, diseno: estado.diseno };
    if (!almacen.guardar(CLAVES.actual, datos)) {
      // Sin espacio para el logo: se guarda lo demás
      almacen.guardar(CLAVES.actual, { ...datos, diseno: { ...estado.diseno, logo: { ...estado.diseno.logo, src: null } } });
    }
  }, 400);
}

/* Botón "Instalar" cuando el navegador lo permite */
function iniciarInstalacion() {
  let evento = null;
  const boton = $('#btn-instalar');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    evento = e;
    boton.hidden = false;
  });
  boton.addEventListener('click', async () => {
    if (!evento) return;
    evento.prompt();
    await evento.userChoice;
    evento = null;
    boton.hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    boton.hidden = true;
    avisar('QR Studio quedó instalada.');
  });
}

/* Service worker: funciona sin internet y avisa cuando hay versión nueva */
function iniciarServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const habiaControlador = !!navigator.serviceWorker.controller;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaControlador || recargando) return;
    recargando = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const ofrecer = (trabajador) => avisar('Hay una versión nueva de QR Studio.', {
      boton: 'Actualizar', duracion: 0, accion: () => trabajador.postMessage('ACTUALIZAR'),
    });
    if (reg.waiting && navigator.serviceWorker.controller) ofrecer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nuevo = reg.installing;
      nuevo?.addEventListener('statechange', () => {
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) ofrecer(nuevo);
      });
    });
    // Busca actualizaciones al volver a la app
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => { /* sin service worker la app sigue funcionando en línea */ });
}

/* =========================================================
   ARRANQUE
   ========================================================= */
function iniciar() {
  if (typeof QRCodeStyling === 'undefined') {
    mostrarInvalido('No se pudo cargar el generador de QR. Recarga la página.');
    return;
  }
  iniciarTema();
  iniciarPestanas();
  iniciarContenido();
  iniciarDiseno();
  iniciarGuardados();
  iniciarInstalacion();
  iniciarServiceWorker();

  $('#btn-descargar').addEventListener('click', descargar);
  $('#btn-copiar').addEventListener('click', copiar);
  $('#btn-compartir').addEventListener('click', compartir);
  selResolucion.addEventListener('change', prepararCompartir);

  programarRender(true);
}

iniciar();
