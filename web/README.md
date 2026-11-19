# Web

Tres apps web instalables (PWA) en React 19, Vite 7 y TypeScript estricto, sobre la misma API:

| App | Dirección | Carpeta |
|---|---|---|
| Pasajero | `/` | `src/pasajero/` |
| Conductor | `/conductor/` | `src/conductor/` |
| Panel del representante | `/panel/` | `src/panel/` |

Lo compartido (cliente de la API, sesión, mapa, formatos, estilos) está en `src/comun/`. Las pruebas unitarias están en `test/` (Vitest) y las del navegador en `e2e/` (Playwright, con una API simulada).

**Responsable:** Martín García (rama `martin-garcia/...`). Revisa: Benjamín Cuevas.

```bash
npm ci
npm run lint
npm test
npm run build
npm run test:e2e
```
