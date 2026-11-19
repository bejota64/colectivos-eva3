# Catálogo de recorridos reales

La pantalla «¿Qué colectivo me sirve?» del pasajero busca entre los **660
recorridos de taxis colectivos de la Región Metropolitana** inscritos en el
Registro Nacional de Transporte Público de Pasajeros (RNTPP) del Ministerio de
Transportes. Sirve aunque la línea todavía no use la aplicación: muestra por
qué calles pasa, en orden y por sentido, y el recorrido dibujado en el mapa.

| | |
|---|---|
| Fuente de los recorridos | Planilla «Transporte Público – Julio 2026» del MTT (entregada por la docente el 17-11-2026) |
| Fuente de las calles | OpenStreetMap, © colaboradores de OpenStreetMap, licencia ODbL |
| Tablas | `catalogo_lineas`, `catalogo_calles`, `catalogo_puntos` (`bd/postgres/inicio/04_catalogo.sql`) |
| Datos | `05_catalogo_datos.sql` (recorridos y calles) y `06_catalogo_puntos.sql.gz` (recorridos dibujados) |
| API | `GET /api/catalogo/comunas`, `GET /api/catalogo/lineas?buscar=&comuna=`, `GET /api/catalogo/lineas/cercanas?latitud=&longitud=&radio_m=`, `GET /api/catalogo/lineas/:id` (todas exigen sesión) |

Estas tablas son de **solo lectura** y están separadas de `trazados`, que son
los recorridos que operan con la aplicación (con representante, flota y
tarifas). Una línea del catálogo pasa a operar cuando su representante la
inscribe como trazado.

## Datos personales (Ley 21.719)

La planilla del MTT trae nombres, RUT, domicilios, teléfonos y correos de los
dueños y conductores. **Nada de eso entra al sistema**:

- `extraer_rntpp.py` lee de la hoja «Servicios» solo el folio, el número de
  línea, la flota vigente y el nombre de fantasía **cuando el responsable es
  una empresa** (persona jurídica). De las hojas de recorridos lee origen,
  destino y calles. No abre las hojas de representantes ni de conductores.
- La planilla original **no se sube al repositorio**.
- La integración continua revisa que los SQL del catálogo no contengan nada
  con forma de RUT, correo o teléfono (trabajo `catalogo` de `.github/workflows/api.yml`).
- La API devuelve solo campos del recorrido; una prueba lo verifica
  (`api/test/catalogo.e2e-spec.ts`).

## Cómo se dibuja un recorrido

El registro describe cada sentido como una lista ordenada de calles
(«Arturo Prat, Av. Ejército Libertador, Las Achiras…»), sin coordenadas.
`geometria.py` lo convierte en una línea sobre el mapa:

1. Arma un grafo con las calles de OpenStreetMap, respetando el sentido del
   tránsito.
2. Busca cada calle del registro por una clave común (sin tildes, sin «Av.»,
   «General», «Oriente»…) y **solo dentro de su comuna** (o a menos de ~400 m
   del límite): hay muchas «San Pedro» en Santiago. Junta las variantes del
   nombre («Balmaceda» y «José Manuel Balmaceda»).
3. Busca la esquina donde se pasa de una calle a la siguiente. Si dos calles
   se cruzan en varias esquinas, elige las que hacen más corto el recorrido
   completo (programación dinámica). Una esquina dudosa (las calles no
   comparten un punto en OSM) que obliga a un desvío de más de 1,5 km se omite.
4. Une cada esquina con la siguiente por el camino más corto (A*),
   prefiriendo la calle indicada: salir de ella cuesta 4 veces más.
5. Deja un punto cada 100 m como máximo, con la distancia acumulada. Con eso
   «Cerca de mí» (radio de 400 a 500 m) encuentra las líneas que pasan.

Cada sentido recibe una nota de calidad (calles encontradas y esquinas unidas
por calles reales); solo se cargan los que llegan a 0,75.

### Resultado (17-11-2026)

| | Sentidos |
|---|---|
| Dibujados y cargados | 756 de 1.320 (57 %) |
| Bajo la calidad mínima (no se cargan) | 64 |
| Fuera del área del mapa (Buin, Melipilla, Paine, Talagante, El Monte, Colina, Peñaflor, Curacaví, María Pinto, Isla de Maipo) | 500 |
| De Puente Alto | 151 de 154 |

El detalle está en `herramientas/catalogo/informe-geometria.md`, con una lista
de 26 sentidos «para revisar» (un sentido mucho más largo que el otro). Las
líneas no dibujadas igual aparecen en la búsqueda con sus calles; la pantalla
avisa que el dibujo no está disponible.

**Es una aproximación.** El registro no dice por qué pista de una avenida va
el colectivo ni dónde dobla exactamente; el dibujo sigue las calles en el
orden inscrito. Antes de usarlo para algo más que orientar a un pasajero, el
representante de cada línea debe revisarlo.

## Regenerar los datos

Se necesita Python 3.10 o más nuevo. Solo `extraer_rntpp.py` usa una
biblioteca externa (`openpyxl`).

```bash
# 1. Recorridos y calles desde la planilla del MTT (no se sube al repositorio)
pip install openpyxl
python3 herramientas/catalogo/extraer_rntpp.py ruta/a/transporte.xlsx

# 2. Calles de OpenStreetMap: el grafo vial del Gran Santiago y los límites
#    comunales, ambos construidos desde OSM (ODbL). Se usan los del repositorio
#    público github.com/tatanas/notengocalle-com, commit 109c107 (26-10-2026).
mkdir -p herramientas/catalogo/datos
curl -L -o herramientas/catalogo/datos/santiago.json \
  https://raw.githubusercontent.com/tatanas/notengocalle-com/109c107e1d2d12129e80759554b82ceda6b0942a/public/data/grafo/santiago.json
curl -L -o herramientas/catalogo/datos/comunas.geojson \
  https://raw.githubusercontent.com/tatanas/notengocalle-com/109c107e1d2d12129e80759554b82ceda6b0942a/tools/comunas_s.geojson

# 3. Dibujar (unos 30 segundos)
python3 herramientas/catalogo/geometria.py herramientas/catalogo/datos/santiago.json \
  --comunas herramientas/catalogo/datos/comunas.geojson
```

`geometria.py` también acepta una descarga propia de Overpass
(`[out:json]` con `out geom`), por ejemplo para cubrir comunas fuera del Gran
Santiago:

```bash
curl -o osm.json -G https://overpass-api.de/api/interpreter --data-urlencode \
  'data=[out:json][timeout:600];way["highway"]["name"](-33.80,-71.00,-33.30,-70.40);out geom;'
python3 herramientas/catalogo/geometria.py osm.json --comunas herramientas/catalogo/datos/comunas.geojson
```

Los archivos de `herramientas/catalogo/datos/` no se suben (están en
`.gitignore`). Los SQL generados sí.

**Una base que ya existe no carga los SQL nuevos**: los scripts de
`bd/postgres/inicio` solo corren la primera vez. En desarrollo:
`docker compose down -v && docker compose up -d` (borra los datos de prueba y
los vuelve a crear).

## Pruebas

| Qué | Dónde |
|---|---|
| Lectura del registro, nombres de calles, grafo, filtro por comuna, elección de esquinas, densificado | `herramientas/catalogo/pruebas/test_catalogo.py` (13 pruebas, `python3 -m unittest discover -s herramientas/catalogo/pruebas`) |
| Restricciones de las tablas (recorrido repetido, sentido inválido, punto fuera de Chile) | `bd/postgres/pruebas_integridad.sql` (casos 30 a 33) |
| Búsqueda, normalización y forma de la respuesta | `api/src/modulos/catalogo/catalogo.servicio.spec.ts` |
| API contra la base real: sesión, búsqueda sin tildes, detalle, sin datos personales, validación, líneas cerca de la Plaza de Puente Alto | `api/test/catalogo.e2e-spec.ts` |
| Pantallas de búsqueda, detalle con mapa y «Cerca de mí» | `web/e2e/pasajero.spec.ts`, con diez líneas reales de Puente Alto en `web/e2e/datos/catalogo.json` (lo genera `herramientas/catalogo/datos_prueba_web.py` desde la base de desarrollo) |
