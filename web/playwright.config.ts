import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de las tres apps en un navegador real, sobre la version compilada
 * (vite preview). La API se simula en cada prueba (e2e/api-simulada.ts):
 * asi se prueban las pantallas sin depender de las bases de datos, y las
 * capturas quedan iguales en cada ejecucion. La API real se prueba aparte,
 * con Supertest y en el despliegue de produccion.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    geolocation: { latitude: -33.6012, longitude: -70.5774 },
    permissions: ['geolocation'],
  },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'] }, testMatch: /(pasajero|conductor)\.spec\.ts/ },
    { name: 'escritorio', use: { viewport: { width: 1366, height: 820 } }, testMatch: /panel\.spec\.ts/ },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
