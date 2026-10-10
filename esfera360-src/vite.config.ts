import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Se publica en https://eddywong4.github.io/juegos/esfera360/
const BASE = '/juegos/esfera360/';

export default defineConfig(({ mode }) => ({
  base: BASE,
  build: {
    outDir: '../esfera360',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
  server: { port: 5225, strictPort: true },
  plugins: [
    // «npm run dev:telefono»: HTTPS en la red local para probar sensores en un teléfono
    mode === 'telefono' && basicSsl(),
    react(),
    tailwindcss(),
    VitePWA({
      // La actualización se aplica desde main.tsx cuando no hay una captura en curso
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['iconos/*.png'],
      manifest: {
        id: BASE,
        name: 'Esfera360',
        short_name: 'Esfera360',
        description: 'Captura, cose y comparte fotos esféricas 360° sin conexión.',
        lang: 'es',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'any',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
          { src: 'iconos/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'iconos/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'iconos/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
