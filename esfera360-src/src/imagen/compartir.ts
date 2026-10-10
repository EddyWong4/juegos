export function puedeCompartirArchivos(): boolean {
  try {
    const prueba = new File([new Uint8Array(1)], 'prueba.jpg', { type: 'image/jpeg' });
    return typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [prueba] });
  } catch {
    return false;
  }
}

/** Abre la hoja de compartir del sistema. Devuelve false si el usuario la cerró. */
export async function compartirArchivo(archivo: File, titulo: string): Promise<boolean> {
  try {
    await navigator.share({ files: [archivo], title: titulo });
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return false;
    throw e;
  }
}

export function descargar(archivo: File) {
  const url = URL.createObjectURL(archivo);
  const a = document.createElement('a');
  a.href = url;
  a.download = archivo.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
