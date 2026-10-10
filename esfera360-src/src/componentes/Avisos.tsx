import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Tipo = 'info' | 'exito' | 'error';
interface Aviso {
  id: number;
  texto: string;
  tipo: Tipo;
}

const Contexto = createContext<(texto: string, tipo?: Tipo) => void>(() => {});

export const useAvisar = () => useContext(Contexto);

const ESTILO: Record<Tipo, string> = {
  info: 'bg-slate-800 text-slate-50',
  exito: 'bg-emerald-800 text-emerald-50',
  error: 'bg-rose-800 text-rose-50',
};

let siguiente = 1;

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const avisar = useCallback((texto: string, tipo: Tipo = 'info') => {
    const id = siguiente++;
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === 'error' ? 8000 : 4500);
  }, []);

  return (
    <Contexto.Provider value={avisar}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {avisos.map((a) => (
          <p key={a.id} className={`max-w-md rounded-xl px-4 py-3 text-sm shadow-lg ${ESTILO[a.tipo]}`}>
            {a.texto}
          </p>
        ))}
      </div>
    </Contexto.Provider>
  );
}
