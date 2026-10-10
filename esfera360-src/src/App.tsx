import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { ProveedorAvisos } from './componentes/Avisos';
import Biblioteca from './pantallas/Biblioteca';

// El visor (three.js + Photo Sphere Viewer) se descarga solo al abrir un panorama.
const Visor = lazy(() => import('./pantallas/Visor'));
const Captura = lazy(() => import('./pantallas/Captura'));

// HashRouter: GitHub Pages no reescribe rutas, así que se usan URL con «#/».
export default function App() {
  return (
    <ProveedorAvisos>
      <HashRouter>
        <Suspense fallback={<p className="p-6 text-slate-300">Cargando…</p>}>
          <Routes>
            <Route path="/" element={<Biblioteca />} />
            <Route path="/ver/:id" element={<Visor />} />
            <Route path="/capturar" element={<Captura />} />
            <Route path="/capturar/:id" element={<Captura />} />
            <Route path="*" element={<Biblioteca />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </ProveedorAvisos>
  );
}
