/* =========================================================
   Tanda — almacenamiento local (IndexedDB).
   Cada tanda se guarda completa como un solo registro.
   Si IndexedDB no está disponible (ventana privada), se
   trabaja en memoria y se avisa al usuario.
   ========================================================= */

const NOMBRE_BD = 'tanda';
const ALMACEN = 'tandas';

let bd = null;
let enMemoria = null; // Map usado si IndexedDB falla

function abrir() {
  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(NOMBRE_BD, 1);
    peticion.onupgradeneeded = () => {
      peticion.result.createObjectStore(ALMACEN, { keyPath: 'id' });
    };
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

function operacion(modo, hacer) {
  return new Promise((resolver, rechazar) => {
    const tx = bd.transaction(ALMACEN, modo);
    const resultado = hacer(tx.objectStore(ALMACEN));
    tx.oncomplete = () => resolver(resultado?.result);
    tx.onerror = () => rechazar(tx.error);
  });
}

/** Devuelve true si se guardará de verdad; false si solo en memoria. */
export async function iniciar() {
  try {
    bd = await abrir();
    return true;
  } catch {
    enMemoria = new Map();
    return false;
  }
}

export async function todas() {
  if (enMemoria) return [...enMemoria.values()];
  return operacion('readonly', (a) => a.getAll());
}

export async function guardar(tanda) {
  tanda.actualizada = Date.now();
  if (enMemoria) { enMemoria.set(tanda.id, structuredClone(tanda)); return; }
  await operacion('readwrite', (a) => a.put(tanda));
}

export async function borrar(id) {
  if (enMemoria) { enMemoria.delete(id); return; }
  await operacion('readwrite', (a) => a.delete(id));
}
