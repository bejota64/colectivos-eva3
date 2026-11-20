import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { POLITICA_CONTENIDO } from './politica-contenido';

/**
 * En produccion Caddy entrega /conductor/* y /panel/* con el index.html de
 * cada app (ver despliegue/Caddyfile). Este complemento hace lo mismo en
 * desarrollo y en `vite preview`, para que recargar /panel/reportes no
 * abra por error la app del pasajero.
 */
function rutasDeLasApps(): Plugin {
  const reescribir: Connect.NextHandleFunction = (peticion, _respuesta, siguiente) => {
    const ruta = (peticion.url ?? '').split('?')[0] ?? '';
    for (const app of ['conductor', 'panel']) {
      const esDeLaApp = ruta === `/${app}` || ruta.startsWith(`/${app}/`);
      const ultimoTramo = ruta.slice(ruta.lastIndexOf('/') + 1);
      if (esDeLaApp && !ultimoTramo.includes('.')) {
        peticion.url = `/${app}/index.html`;
      }
    }
    siguiente();
  };
  return {
    name: 'rutas-de-las-apps',
    configureServer(servidor) {
      servidor.middlewares.use(reescribir);
    },
    configurePreviewServer(servidor) {
      servidor.middlewares.use(reescribir);
    },
  };
}

/**
 * Tres apps en un mismo proyecto, cada una con su propia pagina de entrada:
 * el pasajero en "/", el conductor en "/conductor/" y el panel del
 * representante en "/panel/". Vite genera paquetes separados: la app del
 * pasajero no incluye el codigo del conductor ni el del panel.
 */
export default defineConfig({
  plugins: [react(), rutasDeLasApps()],
  build: {
    sourcemap: false,
    rollupOptions: {
      input: {
        pasajero: resolve(import.meta.dirname, 'index.html'),
        conductor: resolve(import.meta.dirname, 'conductor/index.html'),
        panel: resolve(import.meta.dirname, 'panel/index.html'),
      },
      output: {
        // Bibliotecas en archivos aparte: cambian poco y el navegador las
        // reutiliza entre versiones de la app. El mapa solo lo descargan el
        // pasajero y el panel; la app del conductor no lo usa.
        manualChunks(id) {
          if (/node_modules\/(leaflet|react-leaflet|@react-leaflet)\//.test(id)) return 'mapa';
          if (/node_modules\/(react|react-dom|react-router|scheduler)\//.test(id)) return 'react';
          // Codigo compartido por las tres apps, menos el mapa (que arrastra Leaflet).
          if (id.includes('/src/comun/') && !id.includes('/componentes/Mapa')) return 'comun';
          return undefined;
        },
      },
    },
  },
  // La misma politica de seguridad que Caddy: asi las pruebas en el
  // navegador fallan si algo de la web la rompe.
  preview: {
    headers: { 'Content-Security-Policy': POLITICA_CONTENIDO },
  },
  server: {
    // En desarrollo la API corre en el puerto 3000. Con este proxy el
    // navegador ve un solo origen, igual que detras de Caddy en produccion,
    // y la cookie de refresco funciona sin CORS.
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
