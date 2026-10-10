import { useState } from 'react';
import { Boton } from './Boton';
import { Dialogo } from './Dialogo';

export function DialogoRenombrar({
  titulo,
  alGuardar,
  alCerrar,
}: {
  titulo: string | null; // null = cerrado
  alGuardar: (nuevo: string) => void;
  alCerrar: () => void;
}) {
  const [valor, setValor] = useState('');
  const [anterior, setAnterior] = useState<string | null>(null);
  if (titulo !== anterior) {
    setAnterior(titulo);
    setValor(titulo ?? '');
  }
  return (
    <Dialogo abierto={titulo !== null} titulo="Renombrar" alCerrar={alCerrar}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valor.trim()) alGuardar(valor.trim());
        }}
      >
        <label className="flex flex-col gap-2 text-sm">
          Nombre
          <input
            autoFocus
            value={valor}
            maxLength={120}
            onChange={(e) => setValor(e.target.value)}
            className="min-h-11 rounded-lg bg-slate-800 px-3 text-base text-slate-50 ring-1 ring-slate-600 focus:ring-2 focus:ring-cyan-300 focus:outline-none"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Boton onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" variante="principal" disabled={!valor.trim()}>
            Guardar
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}

export function DialogoBorrar({
  titulo,
  alBorrar,
  alCerrar,
}: {
  titulo: string | null;
  alBorrar: () => void;
  alCerrar: () => void;
}) {
  return (
    <Dialogo abierto={titulo !== null} titulo="¿Borrar este panorama?" alCerrar={alCerrar}>
      <p className="text-sm text-slate-300">
        Se borrará «{titulo}» de este dispositivo. No se puede deshacer; si quieres conservarlo, expórtalo antes.
      </p>
      <div className="flex justify-end gap-2">
        <Boton onClick={alCerrar}>Cancelar</Boton>
        <Boton variante="peligro" onClick={alBorrar}>
          Borrar
        </Boton>
      </div>
    </Dialogo>
  );
}
