import { useEffect, useRef, type ReactNode } from 'react';

/** Diálogo modal nativo (<dialog>): foco atrapado, Escape para cerrar y fondo oscuro. */
export function Dialogo({
  abierto,
  titulo,
  alCerrar,
  children,
}: {
  abierto: boolean;
  titulo: string;
  alCerrar: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      onClose={alCerrar}
      aria-labelledby="dialogo-titulo"
      className="m-auto w-[min(92vw,28rem)] rounded-2xl bg-slate-900 p-0 text-slate-100 shadow-2xl"
    >
      {abierto && (
        <div className="flex flex-col gap-4 p-5">
          <h2 id="dialogo-titulo" className="text-lg font-semibold">
            {titulo}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
