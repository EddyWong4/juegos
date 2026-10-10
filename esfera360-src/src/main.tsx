import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

// Actualizaciones: se buscan al abrir, al volver a la app y cada 15 min. Se aplican
// (recargando) solo fuera de la pantalla de captura, para no cortar una foto a medias.
const enCaptura = () => location.hash.startsWith('#/capturar');
const actualizar = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (!enCaptura()) {
      void actualizar(true);
      return;
    }
    const alSalir = () => {
      if (enCaptura()) return;
      window.removeEventListener('hashchange', alSalir);
      void actualizar(true);
    };
    window.addEventListener('hashchange', alSalir);
  },
  onRegisteredSW(_url, registro) {
    if (!registro) return;
    setInterval(() => void registro.update(), 15 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registro.update();
    });
  },
});

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
