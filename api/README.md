# API

API en NestJS con TypeScript estricto. Atiende a las tres apps web en `/api/*`.

**Responsable:** Benjamín Muñoz (rama `benjamin-munoz/...`). Revisa: Benjamín Cuevas.

| Carpeta | Contenido |
|---|---|
| `src/modulos/` | Un módulo por tema (autenticación, usuarios, trazados, flota, tarifas, jornadas, tiempo real, abordajes, valoraciones con calificaciones y reportes, estadísticas, auditoría, catálogo y salud), cada uno con controlador, servicio y repositorio |
| `src/comun/` | Guardias de sesión y rol, conexión a PostgreSQL y MongoDB, cálculos geográficos |
| `test/` | Pruebas de integración contra las bases reales (`npm run test:e2e`) |
| `*.spec.ts` | Pruebas unitarias junto al código (`npm test`) |
| `demo/` | Script que recorre el flujo completo y los ataques bloqueados contra la API, para mostrar en la presentación |

Cómo instalarla y probarla: [`docs/instalacion.md`](../docs/instalacion.md).
