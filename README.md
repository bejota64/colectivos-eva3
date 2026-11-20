# Sistema Integral para Colectivos

Aplicación web para una asociación de taxis colectivos de ruta fija de Santiago. El conductor comparte su posición y sus asientos libres; el pasajero ve en el mapa cuándo llega el próximo colectivo y avisa que está esperando; el representante del trazado ve la demanda por hora y por tramo para decidir cuántos autos sacar.

Proyecto Integrado · Ingeniería en Informática · INACAP.

## Equipo

| Integrante | Rol | Qué sube al repositorio |
|---|---|---|
| Benjamín Muñoz | Seguridad, API y bases de datos, despliegue | `api/`, `bd/`, `herramientas/`, `despliegue/` y la base del repositorio |
| Martín García | Interfaz web y pruebas de usabilidad | `web/` |
| Benjamín Cuevas | Scrum Master | Revisa y aprueba todos los pull requests; lleva el tablero del sprint |

## Qué hace

| Perfil | Funciones |
|---|---|
| Pasajero | Elegir su línea cuando hay más de una en la app; ver los colectivos en servicio con sus asientos libres y minutos estimados; avisar «estoy esperando» (1 a 4 personas); marcar «me subí» y «ya bajé»; calificar el viaje, felicitar al conductor o reportar un problema; buscar qué colectivo le sirve entre los recorridos reales de la Región Metropolitana; editar su perfil o eliminar su cuenta |
| Conductor | Abrir y cerrar su jornada; enviar su posición GPS; ajustar los asientos libres solo con el auto detenido; ver cuánta gente espera más adelante |
| Representante | Ver la demanda por tramo de 500 m y por hora y el resumen por conductor; gestionar reportes, tarifas (con historial), vehículos y conductores; cerrar jornadas; exportar la demanda y los reportes en CSV. Solo de su trazado y sin datos personales de pasajeros |
| Administrador | Desde el panel: crea trazados a partir de una línea del registro oficial (con su recorrido real de ida y vuelta), crea cuentas de representante, cambia el representante de un trazado y activa o desactiva trazados y cuentas. Consulta la auditoría (solo lectura) |

Las cuentas, autos y viajes incluidos son ficticios (trazado de prueba 9001). El catálogo de recorridos sí es real: los 660 recorridos de taxis colectivos de la Región Metropolitana inscritos en el registro del Ministerio de Transportes (julio de 2026), 756 de sus sentidos dibujados sobre las calles de OpenStreetMap, sin ningún dato de personas. Ver [`docs/catalogo-recorridos.md`](docs/catalogo-recorridos.md).

## Las tres apps

Son tres aplicaciones web separadas, cada una instalable en la pantalla de inicio del teléfono o del computador (PWA). Cada una muestra solo las pantallas de su perfil, pero lo que protege los datos es la API: cada ruta exige sesión y rol, aunque alguien abra la dirección de otra app.

| App | Dirección | Para | Diseño |
|---|---|---|---|
| Pasajero | `/` | Pasajeros (se registran solos) | Celular: mapa a pantalla completa y hoja inferior con el próximo colectivo |
| Conductor | `/conductor/` | Conductores (la cuenta la crea el representante) | Celular, tema oscuro y botones grandes; el contador de asientos se bloquea con el auto en movimiento |
| Panel | `/panel/` | Representante del trazado y administrador | Escritorio; fuera de los buscadores |

## Tecnologías

| Parte | Tecnología |
|---|---|
| API | NestJS con TypeScript en modo estricto |
| Datos con integridad referencial | PostgreSQL 16 (15 tablas, 21 claves foráneas, más 3 tablas de solo lectura del catálogo de recorridos con búsqueda por trigramas), con el driver `pg` y consultas parametrizadas |
| Datos de alto volumen y vida corta | MongoDB 7: posiciones GPS, avisos de espera y auditoría, con caducidad automática |
| Seguridad | bcrypt, JWT de 15 minutos, token de refresco rotativo en cookie HttpOnly, helmet, límite de peticiones y cuentas de base con permisos mínimos para la API |
| Web | React 19 con Vite 7 y TypeScript estricto; mapa con Leaflet y OpenStreetMap; tres apps instalables (PWA) con política de seguridad de contenido sin excepciones para scripts |
| Pruebas | API: Jest y Supertest, y scripts de integridad para ambas bases. Web: Vitest y Playwright (celular y escritorio) |
| Entorno | Docker Compose; en producción, Caddy con HTTPS automático en una máquina virtual de Azure |

## Estructura

```
api/                 API en NestJS (src/, pruebas en test/ y *.spec.ts, demo/)
web/                 las tres apps web: src/pasajero, src/conductor, src/panel y src/comun; pruebas en test/ y e2e/
bd/postgres/         esquema, datos de prueba, cuenta de la API, catálogo de recorridos, integridad y scripts de administración
bd/mongo/            colecciones, validadores, índices y cuenta de la API
despliegue/          servidor de producción: Caddy (HTTPS y la web), API y bases en Docker
herramientas/        scripts en Python que generan el catálogo de recorridos (registro del MTT y OpenStreetMap)
docs/                guías de instalación, despliegue y catálogo de recorridos; diagramas UML en docs/uml
.github/             pruebas automáticas en cada pull request
docker-compose.yml   PostgreSQL 16 y MongoDB 7 para desarrollo
```

## Inicio rápido

Requisitos: Git, Node.js 24 y Docker Desktop. La guía completa, paso a paso y con solución de problemas, está en [`docs/instalacion.md`](docs/instalacion.md).

```bash
bash generar-env-desarrollo.sh     # crea .env y api/.env con contraseñas aleatorias
docker compose up -d               # PostgreSQL y MongoDB con datos de prueba
cd api
npm ci
npm run start:dev                  # API en http://localhost:3000/api
```

En otra terminal, la web:

```bash
cd web
npm ci
npm run dev                        # http://localhost:5173 (pasajero), /conductor/ y /panel/
```

Pruebas de la API (en `api/`):

```bash
npm test             # unitarias
npm run test:e2e     # integración contra las bases reales
npm run lint         # análisis estático
```

Pruebas de la web (en `web/`):

```bash
npm test             # unitarias (Vitest)
npx playwright install chromium   # solo la primera vez
npm run build && npm run test:e2e # las tres apps en un navegador real, con la API simulada
npm run lint         # análisis estático con reglas de React y accesibilidad
```

## Origen del código

| Etapa | Fecha | Qué aporta |
|---|---|---|
| Ingeniería de Software, Evaluación 3 | 20 de octubre de 2026 | La API base: autenticación, trazados, jornadas, tiempo real, abordajes, calificaciones y estadísticas, con sus pruebas |
| Ingeniería de Software, Evaluación 4 | 15 de noviembre de 2026 | Reportes y su gestión, tarifas con historial, gestión de flota, exportación CSV, cierre automático de jornadas, auditoría para el administrador, cuenta propia, cuentas de base con permisos mínimos, pruebas de requisitos y de seguridad, diagramas UML |
| Proyecto Integrado, Evaluación 3 | Desde el 11 de noviembre de 2026 | Repositorio con ramas protegidas y revisión obligatoria, corrección de dependencias, ruta de salud, imagen Docker y despliegue en Azure con HTTPS, pruebas del despliegue en cada cambio, interfaz web, catálogo de recorridos reales, administración de trazados y representantes desde el panel y pruebas de esta evaluación |

## Despliegue

El servidor de producción corre los mismos contenedores con Caddy delante, que entrega HTTPS con certificado automático. Los pasos para crearlo en Azure, publicar cambios y respaldar las bases están en [`docs/despliegue-azure.md`](docs/despliegue-azure.md).

## Cómo trabajamos

Nadie sube cambios directo a `main`: cada integrante trabaja en su rama y abre un pull request con su parte, que el Scrum Master revisa y aprueba y que las pruebas automáticas deben pasar. Las reglas están en [`CONTRIBUTING.md`](CONTRIBUTING.md).
