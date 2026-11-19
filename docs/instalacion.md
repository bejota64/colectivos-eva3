# Guía de instalación del entorno de desarrollo

Esta guía deja funcionando las dos bases de datos y la API en un computador con Windows 10 u 11. En macOS o Linux los pasos son los mismos, salvo la instalación de Docker.

Tiempo estimado: 30 a 45 minutos la primera vez.

## 1. Requisitos

| Programa | Versión | Para qué |
|---|---|---|
| Git para Windows | La más reciente | Clonar el repositorio. Incluye **Git Bash**, la terminal que usamos en esta guía |
| Node.js | **24 LTS** | Ejecutar la API y sus pruebas |
| Docker Desktop | La más reciente | Levantar PostgreSQL 16 y MongoDB 7 sin instalarlos |

Para comprobar las versiones, abrir Git Bash y ejecutar:

```bash
git --version
node --version     # debe decir v24.x.x
npm --version
docker --version
```

## 2. Instalar y activar Docker Desktop

1. Abrir **PowerShell como administrador** y ejecutar `wsl --install`. Reiniciar el computador cuando lo pida. Docker Desktop usa WSL 2 para correr los contenedores.
2. Descargar e instalar Docker Desktop desde docker.com. En el instalador, dejar marcada la opción **Use WSL 2 instead of Hyper-V**.
3. Abrir Docker Desktop y esperar a que abajo a la izquierda diga **Engine running**.
4. En Git Bash, comprobar que funciona:
   ```bash
   docker run --rm hello-world
   ```
   Debe mostrar «Hello from Docker!».

## 3. Clonar el repositorio

```bash
cd ~/Documents
git clone https://github.com/bejota64/colectivos-eva3.git
cd colectivos-eva3
```

## 4. Crear la configuración y levantar las bases de datos

Cada base tiene **dos cuentas**: la dueña, que solo usan los scripts de inicio y las pruebas para limpiar datos, y la de la **API**, con permisos mínimos (no puede borrar tablas, cambiar la estructura ni borrar la auditoría). Por eso la configuración lleva cuatro contraseñas, y tienen que ser las mismas en `.env` (Docker) y en `api/.env` (la API).

1. Crear los dos archivos con contraseñas y secreto aleatorios, ya iguales en ambos:
   ```bash
   bash generar-env-desarrollo.sh
   ```
   Si ya existían, el script no los toca. Para crearlos de nuevo: `bash generar-env-desarrollo.sh --reemplazar` (los anteriores quedan como `.env.anterior`), y después recrear las bases con `docker compose down -v`, porque guardan las contraseñas con que se crearon.
2. Levantar PostgreSQL y MongoDB:
   ```bash
   docker compose up -d
   ```
   La primera vez descarga las imágenes (unos 700 MB) y ejecuta los scripts de `bd/*/inicio`, que crean las tablas, las colecciones, los datos de prueba y las cuentas de la API.
3. Esperar a que las dos digan `healthy`:
   ```bash
   docker compose ps
   ```

Las bases solo escuchan en `127.0.0.1`: no quedan accesibles desde la red.

Para hacerlo a mano en vez de usar el script: copiar `.env.ejemplo` como `.env` y `api/.env.ejemplo` como `api/.env`, reemplazar en los dos los mismos cuatro textos `cambiar-por-…` por cuatro contraseñas de solo letras y números, y `SECRETO_JWT` por un valor aleatorio de al menos 32 caracteres.

## 5. Ejecutar la API

1. Instalar las dependencias exactas del proyecto y arrancar la API:
   ```bash
   cd api
   npm ci
   npm run start:dev
   ```
   En `api/.env`, `URL_POSTGRES` y `URL_MONGO` usan las cuentas de la API. `URL_POSTGRES_ADMIN` y `URL_MONGO_ADMIN` usan las cuentas dueñas y solo las ocupan las pruebas de integración para preparar y borrar sus datos.
2. En otra ventana de Git Bash, comprobar que responde:
   ```bash
   curl -i http://localhost:3000/api/usuarios/yo
   ```
   Debe responder **401**: la API está arriba y exige iniciar sesión. Y `curl http://localhost:3000/api/salud` debe responder `{"estado":"ok"}`.

### La web

Con la API corriendo, en otra ventana de Git Bash:

```bash
cd web
npm ci
npm run dev
```

Abrir en el navegador:

| Dirección | App | Cuenta de prueba |
|---|---|---|
| http://localhost:5173/ | Pasajero | `pasajero1@colectivos.ejemplo.cl` |
| http://localhost:5173/conductor/ | Conductor | `conductor1@colectivos.ejemplo.cl` |
| http://localhost:5173/panel/ | Panel | `representante@colectivos.ejemplo.cl` o `admin@colectivos.ejemplo.cl` |

Vite pasa las peticiones de `/api` a la API del puerto 3000, así el navegador ve un solo sitio, igual que en producción. Para probar la ubicación sin salir a la calle, en Chrome: herramientas de desarrollo (F12), menú de tres puntos, **More tools → Sensors**, y en **Location** elegir una ubicación personalizada cerca de Puente Alto (latitud `-33.6012`, longitud `-70.5774`).

## 6. Ejecutar las pruebas

Desde la carpeta `api/`, con las bases arriba:

```bash
npm run lint         # análisis estático
npm test             # pruebas unitarias
npm run test:cov     # unitarias con cobertura (informe en coverage/)
npm run test:e2e     # pruebas de integración contra las bases reales
```

Pruebas de integridad de las bases, desde la carpeta raíz del repositorio:

```bash
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d colectivos -f /scripts/pruebas_integridad.sql'
docker compose exec mongo sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --file /scripts/pruebas_validador.js'
```

Cada comprobación imprime `OK` o `FALLA`.

Pruebas de las herramientas del catálogo de recorridos, desde la carpeta raíz (necesitan Python 3.10 o más nuevo, sin bibliotecas extra):

```bash
python3 -m unittest discover -s herramientas/catalogo/pruebas
```

Pruebas de la web, desde la carpeta `web/` (no necesitan la API ni las bases: usan una API simulada):

```bash
npm run lint                      # análisis estático con reglas de React y accesibilidad
npm test                          # pruebas unitarias (Vitest)
npx playwright install chromium   # solo la primera vez: descarga el navegador de pruebas
npm run build                     # compila las tres apps
npm run test:e2e                  # las tres apps en Chrome: pasajero y conductor en un celular, el panel en escritorio
```

## 7. Recorrido de demostración

Con la API corriendo, desde `api/`:

```bash
bash demo/flujo-completo.sh            # flujo normal y ataques bloqueados
bash demo/flujo-completo.sh flujo      # solo el flujo normal
bash demo/flujo-completo.sh ataques    # solo los ataques
```

Todas las cuentas de prueba usan la contraseña `Clave.Prueba.2026`. Las personas, patentes y el trazado 9001 son ficticios.

## 8. Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| `docker compose up` dice que el puerto 5432 está en uso | Hay un PostgreSQL instalado en Windows | Detener el servicio «postgresql» en Servicios de Windows, o cambiar el puerto en `docker-compose.yml` |
| Docker Desktop no arranca o dice que falta WSL | WSL 2 no está instalado | Repetir `wsl --install` como administrador y reiniciar |
| `npm ci` falla diciendo que el archivo de dependencias no coincide | Versión de Node distinta de la 24 | Instalar Node.js 24 LTS y volver a ejecutar `npm ci` |
| La API no arranca: «Configuracion invalida» | Falta una variable o el secreto es corto | Revisar `api/.env` según el mensaje, o crearlo de nuevo con `bash generar-env-desarrollo.sh --reemplazar` |
| La API no se conecta a las bases | Contraseñas distintas entre los dos `.env` | Igualarlas. Si se cambió la contraseña después del primer `up`, reiniciar las bases desde cero (fila siguiente) |
| `password authentication failed for user "colectivos_api"` | Las bases se crearon antes de que existieran las cuentas de la API (antes del 17 de noviembre de 2026) | `bash generar-env-desarrollo.sh --reemplazar` y reiniciar las bases desde cero (fila siguiente) |
| Las tablas o los datos de prueba no aparecen | Los scripts de inicio solo corren la primera vez | `docker compose down -v` y `docker compose up -d` (borra los datos y los vuelve a crear) |
| «¿Qué colectivo me sirve?» no encuentra nada, o la API responde que no existe `catalogo_lineas` | La base se creó antes de que existiera el catálogo (scripts `04` a `06`) | Lo mismo: `docker compose down -v` y `docker compose up -d` |
| `bash demo/flujo-completo.sh` no funciona en PowerShell | El script es de bash | Ejecutarlo en Git Bash |
| La web muestra «No se pudo completar la acción» o «El servicio no respondió» | La API no está corriendo | Arrancar la API (sección 5) antes que `npm run dev` |
| En la web el mapa sale gris | El computador no tiene internet: el mapa se descarga de OpenStreetMap | Conectarse a internet; el resto de la app funciona igual |

## 9. Apagar el entorno

```bash
docker compose stop        # detiene las bases y conserva los datos
docker compose down -v     # las elimina junto con sus datos
```
