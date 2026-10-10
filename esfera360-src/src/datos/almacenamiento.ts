export interface EstadoEspacio {
  usado: number | null;
  cuota: number | null;
  persistente: boolean | null; // null = el navegador no lo informa
}

export async function estadoEspacio(): Promise<EstadoEspacio> {
  const s = navigator.storage;
  const [estimado, persistente] = await Promise.all([
    s?.estimate ? s.estimate().catch(() => null) : null,
    s?.persisted ? s.persisted().catch(() => null) : null,
  ]);
  return { usado: estimado?.usage ?? null, cuota: estimado?.quota ?? null, persistente };
}

/** Pide que el navegador no borre los datos. Devuelve si quedó concedido. */
export async function pedirPersistencia(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export function formatoBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const unidades = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < unidades.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString('es', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${unidades[i]}`;
}
