/**
 * Politica de seguridad de contenido (CSP) de las tres apps: solo codigo,
 * estilos y fuentes del propio sitio, sin scripts en linea ni de terceros.
 * La unica excepcion son las teselas del mapa de OpenStreetMap.
 *
 * Caddy la envia en produccion (despliegue/Caddyfile) y `vite preview` en
 * las pruebas. test/csp.test.ts revisa que ambas sean iguales.
 */
export const POLITICA_CONTENIDO = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: https://tile.openstreetmap.org",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
