# Pruebas del sistema publicado

Estas pruebas se corren **contra el servidor de Azure**, desde el computador
de un integrante, cuando el sistema ya está publicado. Complementan las que
corren solas en GitHub con cada pull request (unitarias, integración contra
las bases reales, integridad de la base, navegador y despliegue).

| Carpeta | Qué prueba | Herramienta |
|---|---|---|
| `seguridad/revisar-servidor.sh` | HTTPS, encabezados de seguridad, TLS, rutas cerradas sin sesión, archivos internos | Git Bash (curl y openssl) |
| (comando más abajo) | Escaneo pasivo de vulnerabilidades web | OWASP ZAP (Docker) |
| `carga/colectivos.k6.js` | Límite por IP, carga normal, hora punta y punto de quiebre | k6 (Docker) |
| (manual) | Rendimiento y accesibilidad de las páginas | Lighthouse (Chrome) |

Aparte, `simulador/` mueve colectivos de prueba por el recorrido para las
demostraciones, con autos y cuentas propias (ver `simulador/README.md`).

Los resultados se guardan en `pruebas/resultados/` y se copian a la tabla
«esperado vs obtenido» del informe, con la fecha y la captura. Esa carpeta no
se sube al repositorio (tiene su propio `.gitignore`): los informes van como
anexo del informe.

## Antes de empezar

- El sistema publicado en `https://colectivos-inacap.chilecentral.cloudapp.azure.com`.
  En los comandos se usa la variable `DOMINIO`:
  ```bash
  DOMINIO=colectivos-inacap.chilecentral.cloudapp.azure.com
  ```
- Docker Desktop abierto (para ZAP y k6). Los comandos son para **Git Bash**
  en la carpeta del repositorio. `MSYS_NO_PATHCONV=1` y `pwd -W` evitan que
  Git Bash cambie las rutas de las carpetas compartidas con Docker.
- La contraseña de las cuentas ficticias de la demo, la que se fijó con
  `despliegue/cambiar-clave-demo.sh`. **No se escribe en ningún archivo**: se
  pide en la terminal y queda solo en esa ventana.
  ```bash
  read -rsp "Clave de las cuentas de prueba: " CLAVE_DEMO; export CLAVE_DEMO; echo
  ```
- Mientras corre una prueba de carga, nadie usa las cuentas de los
  conductores de la demo (la prueba envía posiciones con ellas). Si un
  conductor no tiene jornada abierta, la prueba la abre y al final la cierra.
  El simulador de la demo usa sus propias cuentas y no choca con estas
  pruebas, pero conviene apagarlo mientras se mide la carga, para que los
  números sean solo de k6.

## 1. Seguridad del servidor (2 minutos)

```bash
bash pruebas/seguridad/revisar-servidor.sh "$DOMINIO" | tee "pruebas/resultados/seguridad-$(date +%Y%m%d-%H%M).txt"
```

**Esperado:** 27 comprobaciones OK y 0 con falla. Cada línea dice qué se
comprobó y qué respondió el servidor. Hace un solo intento de inicio de sesión
fallido (con `pasajero3`), lejos del bloqueo de 5 intentos.

## 2. OWASP ZAP, escaneo pasivo (5 minutos)

Recorre el sitio como un navegador y revisa las respuestas sin atacar: no
envía formularios ni intenta explotar nada. Se hace solo contra nuestro
servidor.

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/pruebas/resultados:/zap/wrk:rw" \
  ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t "https://$DOMINIO" -r zap-baseline.html
```

**Esperado:** 0 alertas de riesgo alto. Las de riesgo medio o bajo se anotan
con su explicación (por ejemplo, avisos que no aplican a una app que exige
sesión) o pasan a recomendaciones. El informe queda en
`pruebas/resultados/zap-baseline.html`.

## 3. Carga con k6

Simula pasajeros con el mapa abierto (piden los colectivos cada 5 segundos,
como la app, y a veces buscan en el catálogo) y conductores que envían su
posición cada 5 segundos avanzando a 25 km/h por el recorrido real del 9001.

Comando base (cambia `ESCENARIO`):

```bash
ESCENARIO=normal
MSYS_NO_PATHCONV=1 docker run --rm -e BASE_URL="https://$DOMINIO" -e CLAVE_DEMO -e ESCENARIO="$ESCENARIO" \
  -e K6_WEB_DASHBOARD=true -e K6_WEB_DASHBOARD_EXPORT="/pruebas/resultados/k6-$ESCENARIO.html" \
  -v "$(pwd -W)/pruebas:/pruebas" grafana/k6 run /pruebas/carga/colectivos.k6.js \
  --summary-export="/pruebas/resultados/k6-$ESCENARIO.json"
```

Cada corrida deja un informe con gráficos en
`pruebas/resultados/k6-<escenario>.html` y los números en el `.json`.

### 3.1 Límite por IP (con la configuración real, 90 segundos)

`ESCENARIO=limite_ip`. Un solo computador pide 4 veces por segundo, más que
las 100 peticiones por minuto que acepta la API por IP.

**Esperado:** aparecen respuestas 429 (`respuestas_429` mayor que 0), se
responden en menos de 200 ms (p95) y no hay errores 5xx. Muestra que un
cliente abusivo no puede saturar la API.

Para la discusión de resultados: una persona con la app abierta hace unas 12
peticiones por minuto, lejos de 100. Pero en las redes móviles muchas personas
salen a internet con la misma IP (CGNAT), y en un paradero concurrido podrían
sumar más de 100 entre todas. Es un riesgo a evaluar en el piloto: limitar
además por cuenta y no solo por IP.

### 3.2 Subir el límite por IP solo para medir capacidad

Las demás pruebas salen todas desde un mismo computador: con el límite de 100
por minuto se cortarían a los pocos segundos. Antes de correrlas se sube el
límite en el servidor, **y al terminar se vuelve a 100**.

Por SSH, en el servidor:

```bash
cd ~/colectivos-proyecto-integrado/despliegue
echo "LIMITE_GENERAL_POR_MINUTO=100000" >> .env && docker compose up -d api
```

Para mirar CPU y memoria durante la prueba, en otra ventana SSH:

```bash
docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
```

Al terminar todas las pruebas de capacidad:

```bash
sed -i '/^LIMITE_GENERAL_POR_MINUTO=/d' .env && docker compose up -d api
docker compose exec api printenv LIMITE_GENERAL_POR_MINUTO   # tiene que decir 100
```

Y se repite `limite_ip` para comprobar que el límite volvió.

### 3.3 Escenarios de capacidad

Entre un escenario y otro no hace falta esperar: los conductores parten 65
segundos después que los pasajeros (la API rechaza una posición que «salta»
desde donde quedó el auto en la prueba anterior).

| Escenario | Carga | Duración | Esperado (umbral en k6) |
|---|---|---|---|
| `normal` | 30 pasajeros y 3 conductores | 5 min | Errores < 1 %, p95 < 500 ms (mapa y posiciones) |
| `punta` | Sube a 150 pasajeros en 2 min y se mantiene; 3 conductores | 5 min | Errores < 1 %, p95 < 1 s |
| `quiebre` | Sube de a poco hasta 600 pasajeros; 3 conductores | 10 min | Sin umbral: se anota con cuántos pasajeros el p95 pasa de 2 s o los errores de 5 % |

k6 marca con ✓ o ✗ cada umbral al final. Si un umbral falla, no se repite
hasta que pase: se anota como obtenido y se explica (eso también es un
resultado).

Con 150 pasajeros pidiendo cada 5 segundos la API recibe unas 30 peticiones
por segundo; con 600, unas 120.

## 4. Lighthouse (rendimiento y accesibilidad)

En Chrome: abrir el sitio, `F12` → pestaña **Lighthouse** → modo
**Navigation**, dispositivo **Mobile**, categorías Performance, Accessibility y
Best practices → **Analyze page load**. Guardar el informe (menú ⋮ → Save as
HTML) en `pruebas/resultados/`.

Páginas: `/` (acceso), `/` con sesión de pasajero (desmarcar «Clear storage»
para que use la sesión abierta), `/conductor/` y `/panel/`.

**Esperado:** Accesibilidad ≥ 90, Buenas prácticas ≥ 90, Rendimiento ≥ 70 en
celular.

## Plantilla de resultados

| ID | Prueba | Esperado | Obtenido | Estado | Evidencia |
|---|---|---|---|---|---|
| SEG-SRV | Revisión del servidor | 27 OK, 0 fallas | | | `seguridad-<fecha>.txt` |
| SEG-ZAP | OWASP ZAP pasivo | 0 alertas altas | | | `zap-baseline.html` |
| CAR-01 | Límite por IP | 429 al exceso, p95 < 200 ms, 0 errores 5xx | | | `k6-limite_ip.html` |
| CAR-02 | Carga normal | Errores < 1 %, p95 < 500 ms | | | `k6-normal.html` |
| CAR-03 | Hora punta | Errores < 1 %, p95 < 1 s | | | `k6-punta.html` |
| CAR-04 | Punto de quiebre | Se identifica el punto | | | `k6-quiebre.html` |
| UX-LH | Lighthouse | Acc. ≥ 90, B.P. ≥ 90, Rend. ≥ 70 | | | `lighthouse-*.html` |

Los resultados de estas pruebas dependen del servidor (2 vCPU y 4 GB) y de la
conexión de quien las corre: se anota desde dónde se corrieron.
