import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variante = 'principal' | 'secundario' | 'peligro' | 'fantasma';

const ESTILOS: Record<Variante, string> = {
  principal: 'bg-cyan-400 text-slate-950 hover:bg-cyan-300',
  secundario: 'bg-slate-800 text-slate-100 hover:bg-slate-700 ring-1 ring-slate-600',
  peligro: 'bg-rose-600 text-white hover:bg-rose-500',
  fantasma: 'bg-slate-950/60 text-white hover:bg-slate-900/80 backdrop-blur',
};

export function Boton({
  variante = 'secundario',
  icono,
  children,
  className = '',
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; icono?: ReactNode }) {
  return (
    <button
      type="button"
      {...resto}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50 ${ESTILOS[variante]} ${className}`}
    >
      {icono}
      {children}
    </button>
  );
}
