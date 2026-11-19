"""Dibuja cada recorrido del catalogo sobre las calles de OpenStreetMap y
genera bd/postgres/inicio/06_catalogo_puntos.sql.

El registro del MTT describe un recorrido como la lista ordenada de calles
por las que pasa («Los Lirios, Av. Concha y Toro, Eyzaguirre...»), sin
coordenadas. Para dibujarlo:

1. Se arma un grafo con las calles de OpenStreetMap (nodos = esquinas y
   puntos de la calle, aristas = tramos, respetando el sentido del transito).
2. Cada nombre del registro se busca en OpenStreetMap con una clave comun
   (sin tildes, sin «Avenida», «General», «Oriente»...; ver textos.py).
3. Entre dos calles seguidas, el colectivo dobla en su esquina: se busca el
   nodo que comparten (o el par de nodos mas cercano si OSM las corta).
4. Entre una esquina y la siguiente se busca el camino mas corto (Dijkstra),
   prefiriendo la calle indicada: salir de ella cuesta 4 veces mas.
5. La linea resultante se deja con un punto cada 50 m como maximo y con su
   distancia acumulada, igual que puntos_ruta.

Cada sentido recibe una nota de calidad (calles encontradas y esquinas
unidas por calles reales). Solo se cargan los que superan el minimo; el
resto queda en el informe para revisarlo.

Un mismo nombre se repite en varias comunas (hay muchas «San Pedro»). Como
el registro dice en que comuna va cada calle, solo se usan los tramos que
quedan dentro de esa comuna o a menos de ~400 m de su limite.

Uso:
    python3 herramientas/catalogo/geometria.py CALLES.json [--comunas COMUNAS.geojson]

CALLES.json puede ser:
- una descarga de Overpass con «out geom» (ver docs/catalogo-recorridos.md), o
- un grafo vial ya armado con el formato {nodos, aristas, nombres, formas}
  (el de github.com/tatanas/notengocalle-com, public/data/grafo/santiago.json,
  construido desde OpenStreetMap el 26-oct-2026).
COMUNAS.geojson son los limites comunales (de OpenStreetMap) con la
propiedad «name». Sin el, no se filtra por comuna.

Solo usa la biblioteca estandar de Python.
"""
import argparse
import difflib
import gzip
import heapq
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

from textos import clave_calle, sin_tildes

RAIZ = Path(__file__).resolve().parents[2]
DATOS = RAIZ / 'bd' / 'postgres' / 'inicio' / '05_catalogo_datos.sql'
SALIDA = RAIZ / 'bd' / 'postgres' / 'inicio' / '06_catalogo_puntos.sql.gz'
INFORME = Path(__file__).resolve().parent / 'informe-geometria.md'

CALIDAD_MINIMA = 0.75
CASTIGO_FUERA_DE_CALLE = 4.0
PASO_MAXIMO_M = 100   # con «cerca de mi» a 400-500 m, un punto cada 100 m basta
OMITIR_ESQUINA_M = 1500  # una esquina que alarga el recorrido mas que esto se considera mal elegida
DESVIO_TOLERADO = 1.5  # si respetar el sentido de OSM alarga el tramo mas que esto, se dibuja el directo
SALTO_MAXIMO_M = 250  # dos calles que OSM corta: se aceptan si estan a menos de esto


COS_LATITUD = math.cos(math.radians(-33.5))


def distancia_rapida(a, b):
    """Aproximacion plana para la heuristica de A* (un poco por debajo de la real)."""
    d_lat = (b[0] - a[0]) * 111_000
    d_lon = (b[1] - a[1]) * 111_000 * COS_LATITUD
    return math.hypot(d_lat, d_lon) * 0.99


def distancia(a, b):
    """Metros entre dos puntos (lat, lon), haversine."""
    rad = math.radians
    d_lat = rad(b[0] - a[0])
    d_lon = rad(b[1] - a[1])
    h = math.sin(d_lat / 2) ** 2 + math.cos(rad(a[0])) * math.cos(rad(b[0])) * math.sin(d_lon / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(h))


# ---------------------------------------------------------------------------
# Datos del catalogo (desde el SQL que genero extraer_rntpp.py)
# ---------------------------------------------------------------------------

TUPLA = re.compile(r"^\((.*)\)[,;]?$")


def valores(texto):
    """Separa «1, 'ida', 3, 'O''Higgins', NULL» respetando comillas SQL."""
    salida, actual, en_texto, i = [], '', False, 0
    while i < len(texto):
        c = texto[i]
        if en_texto:
            if c == "'" and i + 1 < len(texto) and texto[i + 1] == "'":
                actual += "'"
                i += 1
            elif c == "'":
                en_texto = False
            else:
                actual += c
        elif c == "'":
            en_texto = True
            actual = ''
        elif c == ',':
            salida.append(actual.strip() if actual.strip() != 'NULL' else None)
            actual = ''
        else:
            actual += c
        i += 1
    salida.append(actual.strip() if actual.strip() != 'NULL' else None)
    return salida


def leer_catalogo(ruta=DATOS):
    lineas, calles = {}, defaultdict(list)
    tabla = None
    for fila in Path(ruta).read_text(encoding='utf-8').splitlines():
        if fila.startswith('INSERT INTO catalogo_lineas'):
            tabla = 'lineas'
        elif fila.startswith('INSERT INTO catalogo_calles'):
            tabla = 'calles'
        m = TUPLA.match(fila.strip())
        if not m or tabla is None:
            continue
        v = valores(m.group(1))
        if tabla == 'lineas':
            lineas[int(v[0])] = {'lugar_origen': v[10], 'lugar_destino': v[13], 'numero': v[2]}
        else:
            calles[(int(v[0]), v[1])].append((int(v[2]), v[3], v[4]))
    for clave in calles:
        calles[clave].sort()
    return lineas, calles


# ---------------------------------------------------------------------------
# Comunas: en que comuna cae cada punto (celdas de ~200 m)
# ---------------------------------------------------------------------------

def nombre_comuna(texto):
    return sin_tildes(texto or '').lower().strip()


def dentro(lat, lon, anillo):
    """Punto en poligono (rayo); el anillo viene como [[lon, lat], ...]."""
    adentro = False
    j = len(anillo) - 1
    for i in range(len(anillo)):
        xi, yi = anillo[i][0], anillo[i][1]
        xj, yj = anillo[j][0], anillo[j][1]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            adentro = not adentro
        j = i
    return adentro


class Comunas:
    CELDA = 0.002     # grados: ~220 m de norte a sur, ~185 m de este a oeste
    HOLGURA = 2       # celdas: una calle limite puede caer en la comuna vecina

    def __init__(self, geojson):
        self.poligonos = []
        for elemento in geojson.get('features', []):
            nombre = nombre_comuna(elemento.get('properties', {}).get('name'))
            geometria = elemento.get('geometry') or {}
            partes = ([geometria['coordinates']] if geometria.get('type') == 'Polygon'
                      else geometria.get('coordinates', []))
            for anillos in partes:
                exterior = anillos[0]
                lats = [p[1] for p in exterior]
                lons = [p[0] for p in exterior]
                self.poligonos.append((nombre, (min(lats), max(lats), min(lons), max(lons)), anillos))
        self.nombres = {p[0] for p in self.poligonos}
        self.celdas = {}

    def de_celda(self, i, j):
        if (i, j) not in self.celdas:
            lat, lon = (i + 0.5) * self.CELDA, (j + 0.5) * self.CELDA
            encontrada = None
            for nombre, (s, n, o, e), anillos in self.poligonos:
                if s <= lat <= n and o <= lon <= e and dentro(lat, lon, anillos[0]) \
                        and not any(dentro(lat, lon, hoyo) for hoyo in anillos[1:]):
                    encontrada = nombre
                    break
            self.celdas[(i, j)] = encontrada
        return self.celdas[(i, j)]

    def cerca(self, punto, comuna):
        i, j = math.floor(punto[0] / self.CELDA), math.floor(punto[1] / self.CELDA)
        h = self.HOLGURA
        return any(self.de_celda(i + di, j + dj) == comuna for di in range(-h, h + 1) for dj in range(-h, h + 1))


# ---------------------------------------------------------------------------
# Grafo de calles de OpenStreetMap
# ---------------------------------------------------------------------------

class Grafo:
    def __init__(self):
        self.coordenadas = {}
        self.vecinos = defaultdict(list)       # nodo -> [(otro, metros, clave_calle)]
        self.nodos_de_calle = defaultdict(set)  # clave -> nodos
        self.por_comuna = {}                    # 'clave@comuna' -> nodos de la calle en esa comuna
        self.bases = {}                         # 'clave@comuna' -> claves de OSM que la forman
        self.comunas = None
        self._parecidas = {}
        self._palabras = None

    def nodos(self, clave):
        return self.por_comuna.get(clave) or self.nodos_de_calle.get(clave) or set()

    def _agregar_tramo(self, puntos, clave, sentido_unico):
        """puntos: [(nodo, (lat, lon))] en el sentido del transito."""
        for nodo, punto in puntos:
            self.coordenadas[nodo] = punto
            if clave:
                self.nodos_de_calle[clave].add(nodo)
        for (a, pa), (b, pb) in zip(puntos, puntos[1:]):
            metros = distancia(pa, pb)
            if sentido_unico:
                self.vecinos[a].append((b, metros, clave, True))
                self.vecinos[b].append((a, metros, clave, None))
            else:
                self.vecinos[a].append((b, metros, clave, False))
                self.vecinos[b].append((a, metros, clave, False))

    @classmethod
    def desde_grafo_vial(cls, datos):
        """Grafo dirigido {nodos, aristas, nombres, formas}: una arista por sentido entre dos cruces,
        «inversa» = la arista del otro sentido (-1 si la calle es de sentido unico) y la forma
        intermedia como polilinea de 6 decimales."""
        grafo = cls()
        lats, lons = datos['nodos']['lat'], datos['nodos']['lon']
        aristas = datos['aristas']
        claves = [clave_calle(n.get('n', '')) for n in datos['nombres']]
        formas = datos.get('formas', {})
        siguiente = -1
        for arista, (desde, hasta, nombre, inversa) in enumerate(
                zip(aristas['desde'], aristas['hasta'], aristas['nombre'], aristas['inversa'])):
            if inversa != -1 and inversa < arista:
                continue  # el par doble sentido ya se agrego desde la otra arista
            if str(arista) in formas:
                intermedios = decodificar_polilinea(formas[str(arista)])
            elif inversa != -1 and str(inversa) in formas:
                intermedios = decodificar_polilinea(formas[str(inversa)])[::-1]
            else:
                intermedios = []
            puntos = [(desde, (lats[desde] / 1e5, lons[desde] / 1e5))]
            for punto in intermedios:
                puntos.append((siguiente, punto))
                siguiente -= 1
            puntos.append((hasta, (lats[hasta] / 1e5, lons[hasta] / 1e5)))
            clave = claves[nombre] if 0 <= nombre < len(claves) else ''
            grafo._agregar_tramo(puntos, clave, inversa == -1)
        return grafo

    @classmethod
    def desde_overpass(cls, datos):
        grafo = cls()
        for elemento in datos.get('elements', []):
            if elemento.get('type') != 'way':
                continue
            etiquetas = elemento.get('tags', {})
            nodos = elemento.get('nodes') or []
            puntos = elemento.get('geometry') or []
            if len(nodos) < 2 or len(nodos) != len(puntos):
                continue
            claves = {clave_calle(etiquetas[n]) for n in ('name', 'alt_name', 'old_name', 'official_name')
                      if etiquetas.get(n)}
            claves.discard('')
            if not claves:
                continue
            principal = clave_calle(etiquetas.get('name', '')) or next(iter(claves))
            sentido = etiquetas.get('oneway', 'no')
            if etiquetas.get('junction') in ('roundabout', 'circular') and sentido == 'no':
                sentido = 'yes'
            for nodo, punto in zip(nodos, puntos):
                grafo.coordenadas[nodo] = (punto['lat'], punto['lon'])
                for clave in claves:
                    grafo.nodos_de_calle[clave].add(nodo)
            for a, b in zip(nodos, nodos[1:]):
                metros = distancia(grafo.coordenadas[a], grafo.coordenadas[b])
                if sentido in ('yes', 'true', '1'):
                    grafo.vecinos[a].append((b, metros, principal, True))
                elif sentido == '-1':
                    grafo.vecinos[b].append((a, metros, principal, True))
                else:
                    grafo.vecinos[a].append((b, metros, principal, False))
                    grafo.vecinos[b].append((a, metros, principal, False))
                # Arista inversa «prohibida»: solo se usa si no hay otro camino.
                if sentido in ('yes', 'true', '1'):
                    grafo.vecinos[b].append((a, metros, principal, None))
                elif sentido == '-1':
                    grafo.vecinos[a].append((b, metros, principal, None))
        return grafo

    def restringir(self, clave, comuna):
        """La calle dentro de la comuna (o cerca de su limite), juntando las variantes del nombre
        («Balmaceda» y «Jose Manuel Balmaceda»). None si no pasa por esa comuna."""
        comuna = nombre_comuna(comuna)
        if self.comunas is None or comuna not in self.comunas.nombres:
            return clave if clave in self.nodos_de_calle else None
        llave = f'{clave}@{comuna}'
        if llave not in self.por_comuna:
            parecidas = sorted(self.parecidas(clave), reverse=True)
            variantes = ([clave] if clave in self.nodos_de_calle else []) + [o for p, o in parecidas if p >= 0.9 and o != clave]
            nodos, bases = set(), set()
            for variante in variantes:
                aqui = {n for n in self.nodos_de_calle[variante] if self.comunas.cerca(self.coordenadas[n], comuna)}
                if aqui:
                    nodos |= aqui
                    bases.add(variante)
            if not nodos:
                # Ultimo recurso: un nombre parecido (errores de tipeo del registro).
                for _, otra in parecidas:
                    aqui = {n for n in self.nodos_de_calle[otra] if self.comunas.cerca(self.coordenadas[n], comuna)}
                    if aqui:
                        nodos, bases = aqui, {otra}
                        break
            self.por_comuna[llave] = nodos
            self.bases[llave] = bases
        return llave if self.por_comuna[llave] else None

    def sin_comuna(self, llave):
        """La misma calle en todo el mapa (para cuando el registro anota mal la comuna)."""
        if '@' not in llave:
            return llave
        todas = f'{llave.split("@")[0]}@*'
        if todas not in self.por_comuna:
            self.por_comuna[todas] = set().union(*(self.nodos_de_calle[b] for b in self.bases[llave]))
            self.bases[todas] = self.bases[llave]
        return todas

    def preferidas(self, llave):
        return self.bases.get(llave) or {llave}

    def parecidas(self, clave):
        """Claves de OSM con un nombre parecido (solo entre las que comparten alguna palabra)."""
        if self._palabras is None:
            self._palabras = defaultdict(set)
            for otra in self.nodos_de_calle:
                for palabra in otra.split():
                    if len(palabra) >= 4:
                        self._palabras[palabra].add(otra)
        if clave not in self._parecidas:
            vistas = set()
            for palabra in clave.split():
                vistas |= self._palabras.get(palabra, set())
            candidatas = []
            for otra in vistas:
                if otra == clave:
                    continue
                if (clave in otra or otra in clave) and min(len(clave), len(otra)) >= 5:
                    parecido = 0.9
                else:
                    parecido = difflib.SequenceMatcher(None, clave, otra).ratio()
                if parecido >= 0.85:
                    candidatas.append((parecido, otra))
            self._parecidas[clave] = candidatas
        return self._parecidas[clave]

    def calle(self, nombre, cerca_de=None, comuna=None):
        """Clave de una calle del registro: exacta y en su comuna; si no, la mas parecida."""
        clave = clave_calle(nombre)
        if not clave:
            return None
        if comuna and self.comunas is not None:
            return self.restringir(clave, comuna)
        if clave in self.nodos_de_calle:
            return clave
        candidatas = list(self.parecidas(clave))
        if not candidatas:
            return None
        if cerca_de is not None:
            # Entre las parecidas, la que pasa mas cerca de donde va el recorrido.
            candidatas.sort(key=lambda c: (-round(c[0], 2), self.distancia_minima(c[1], cerca_de)))
            mejor = candidatas[0]
            return mejor[1] if self.distancia_minima(mejor[1], cerca_de) < 3000 else None
        candidatas.sort(reverse=True)
        return candidatas[0][1]

    def distancia_minima(self, clave, punto):
        return min(distancia(self.coordenadas[n], punto) for n in self.nodos(clave))

    def esquinas(self, clave_a, clave_b):
        """Nodos donde se cruzan dos calles; si OSM no las une, el par mas cercano (< 250 m)."""
        nodos_a, nodos_b = self.nodos(clave_a), self.nodos(clave_b)
        comunes = nodos_a & nodos_b
        if comunes:
            return [(n, n) for n in comunes]
        # Sin nodo comun: el par mas cercano, buscando solo en las celdas vecinas.
        celda = 0.003  # ~330 m, mas que SALTO_MAXIMO_M
        rejilla = defaultdict(list)
        for b in nodos_b:
            lat, lon = self.coordenadas[b]
            rejilla[(math.floor(lat / celda), math.floor(lon / celda))].append(b)
        mejor, par = SALTO_MAXIMO_M, None
        for a in nodos_a:
            pa = self.coordenadas[a]
            i, j = math.floor(pa[0] / celda), math.floor(pa[1] / celda)
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    for b in rejilla.get((i + di, j + dj), ()):
                        d = distancia(pa, self.coordenadas[b])
                        if d < mejor:
                            mejor, par = d, (a, b)
        return [par] if par else []

    def camino(self, desde, hasta, clave_preferida, respetar_sentido=True):
        """A*: el camino mas corto prefiriendo la calle indicada (salir de ella cuesta mas)."""
        if desde == hasta:
            return [desde]
        preferidas = self.preferidas(clave_preferida) if clave_preferida else set()
        meta = self.coordenadas[hasta]
        directo = distancia(self.coordenadas[desde], meta)
        tope = directo * 6 + 3000
        costos = {desde: 0.0}
        previo = {}
        cola = [(distancia_rapida(self.coordenadas[desde], meta), 0.0, desde)]
        while cola:
            _, costo, nodo = heapq.heappop(cola)
            if nodo == hasta:
                break
            if costo > costos.get(nodo, math.inf) or costo > tope:
                continue
            for otro, metros, clave, permitido in self.vecinos[nodo]:
                if permitido is None and respetar_sentido:
                    continue
                factor = 1.0 if clave in preferidas else CASTIGO_FUERA_DE_CALLE
                nuevo = costo + metros * factor
                if nuevo < costos.get(otro, math.inf):
                    costos[otro] = nuevo
                    previo[otro] = nodo
                    heapq.heappush(cola, (nuevo + distancia_rapida(self.coordenadas[otro], meta), nuevo, otro))
        if hasta not in previo:
            return None
        ruta = [hasta]
        while ruta[-1] != desde:
            ruta.append(previo[ruta[-1]])
        return ruta[::-1]


# ---------------------------------------------------------------------------
# Un sentido del recorrido
# ---------------------------------------------------------------------------

def decodificar_polilinea(texto, precision=6):
    """Polilinea codificada (formato de Google) a [(lat, lon)]."""
    puntos, indice, lat, lon = [], 0, 0, 0
    factor = 10 ** precision

    def valor():
        nonlocal indice
        resultado, desplazamiento = 0, 0
        while True:
            byte = ord(texto[indice]) - 63
            indice += 1
            resultado |= (byte & 0x1F) << desplazamiento
            desplazamiento += 5
            if byte < 0x20:
                break
        return ~(resultado >> 1) if resultado & 1 else resultado >> 1

    while indice < len(texto):
        lat += valor()
        lon += valor()
        puntos.append((lat / factor, lon / factor))
    return puntos


def extremo(grafo, lugar, calle_clave, cerca_de=None):
    """«Los Lirios con Las Rosas» o «X altura Y»: esquina de la calle con la otra mencionada."""
    if not lugar or not calle_clave:
        return None
    partes = re.split(r'\s+(?:con|altura|esquina)\s+', re.sub(r'^circunvalaci[oó]n\s*:\s*', '', lugar, flags=re.I),
                      flags=re.I)
    comuna = calle_clave.split('@')[1] if '@' in calle_clave else None
    for otra in partes:
        clave = grafo.calle(otra, comuna=comuna)
        if clave and clave != calle_clave:
            esquinas = grafo.esquinas(calle_clave, clave)
            if esquinas:
                if cerca_de is not None:
                    return min(esquinas, key=lambda par: distancia(grafo.coordenadas[par[0]], cerca_de))[0]
                return esquinas[0][0]
    return None


def elegir_esquinas(grafo, pares, maximo=40, castigo_m=OMITIR_ESQUINA_M, saltos=2):
    """Dos calles pueden cruzarse en varias esquinas. Se elige una por cada par de calles
    seguidas de modo que el recorrido completo, de esquina en esquina, sea lo mas corto
    posible en linea recta (programacion dinamica, como Viterbi).

    Una esquina dudosa (las calles no comparten un nodo en OSM, o se busco fuera de la
    comuna anotada) que obliga a desviarse mas de «castigo_m» se omite (como mucho
    «saltos» seguidas): suele ser otra calle con un nombre parecido («Lago Balmaceda»
    por «Balmaceda»). Las esquinas donde las calles si se cruzan nunca se omiten.

    pares: [(opciones [(nodo en la calle anterior, nodo en la siguiente)], siguiente, anterior, dudosa)]
    Devuelve (anclas [(nodo donde se llega, nodo desde donde se sigue, siguiente, anterior)],
    indices de los pares omitidos).
    """
    if not pares:
        return [], []
    capas = [sorted(opciones)[:maximo] for opciones, _, _, _ in pares]
    dudosa = [par[3] for par in pares]
    total = len(capas)

    def omitibles(desde, hasta):
        return all(dudosa[m] for m in range(desde, hasta))
    # costo[k][i]: lo mejor para terminar en la opcion i de la capa k; previo[k][i] = (capa, opcion) anterior.
    costo, previo = [], []
    for k, capa in enumerate(capas):
        costos_k, previos_k = [], []
        for llega, _ in capa:
            punto = grafo.coordenadas[llega]
            mejor, desde = (castigo_m * k if k <= saltos and omitibles(0, k) else math.inf), None
            for j in range(max(0, k - saltos - 1), k):
                if not omitibles(j + 1, k):
                    continue
                extra = castigo_m * (k - j - 1)
                for i, (_, sale) in enumerate(capas[j]):
                    c = costo[j][i] + extra + distancia_rapida(grafo.coordenadas[sale], punto)
                    if c < mejor:
                        mejor, desde = c, (j, i)
            costos_k.append(mejor)
            previos_k.append(desde)
        costo.append(costos_k)
        previo.append(previos_k)
    mejor, final = math.inf, None
    for k in range(max(0, total - saltos - 1), total):
        if not omitibles(k + 1, total):
            continue
        for i, c in enumerate(costo[k]):
            c += castigo_m * (total - 1 - k)
            if c < mejor:
                mejor, final = c, (k, i)
    elegidos = []
    while final is not None:
        elegidos.append(final)
        final = previo[final[0]][final[1]]
    elegidos.reverse()
    usados = {k for k, _ in elegidos}
    anclas = [(capas[k][i][0], capas[k][i][1], pares[k][1], pares[k][2]) for k, i in elegidos]
    return anclas, [k for k in range(total) if k not in usados]


def dibujar(grafo, calles, lugar_inicio=None, lugar_fin=None):
    """Devuelve (puntos [(lat, lon)], calidad 0..1, observaciones)."""
    observaciones = []
    claves, referencia = [], None
    for _, nombre, comuna in calles:
        clave = grafo.calle(nombre, referencia, comuna)
        claves.append(clave)
        if clave is None:
            observaciones.append(f'calle no encontrada en OSM: {nombre} ({comuna})')
        elif referencia is None:
            nodo = next(iter(grafo.nodos(clave)))
            referencia = grafo.coordenadas[nodo]

    # Esquinas: donde se pasa de una calle a la siguiente encontrada.
    pares = []
    indices = [i for i, c in enumerate(claves) if c]
    for i, j in zip(indices, indices[1:]):
        if claves[i] == claves[j]:
            continue
        opciones = grafo.esquinas(claves[i], claves[j])
        dudosa = all(a != b for a, b in opciones)
        if not opciones and ('@' in claves[i] or '@' in claves[j]):
            # El registro a veces anota la comuna de la calle anterior: se busca la esquina en todo el
            # mapa, pero solo cerca (1,5 km) de donde estan esas calles en las comunas anotadas.
            cerca = [grafo.coordenadas[n] for n in grafo.nodos(claves[i]) | grafo.nodos(claves[j])]
            s, n = min(p[0] for p in cerca) - 0.0135, max(p[0] for p in cerca) + 0.0135
            o, e = min(p[1] for p in cerca) - 0.016, max(p[1] for p in cerca) + 0.016
            opciones = [par for par in grafo.esquinas(grafo.sin_comuna(claves[i]), grafo.sin_comuna(claves[j]))
                        if s <= grafo.coordenadas[par[0]][0] <= n and o <= grafo.coordenadas[par[0]][1] <= e]
        if not opciones:
            observaciones.append(f'sin esquina entre {calles[i][1]} y {calles[j][1]}')
            continue
        pares.append((opciones, claves[j], claves[i], dudosa))
    anclas, omitidos = elegir_esquinas(grafo, pares)
    for k in omitidos:
        observaciones.append(f'esquina omitida por desvio: {pares[k][2]} / {pares[k][1]}')

    if not anclas:
        return [], 0.0, observaciones + ['no se pudo unir ninguna esquina']

    # Inicio y fin: la esquina que nombra el registro, si se puede leer.
    nodos = []
    primera = next((c for c in claves if c), None)
    inicio = extremo(grafo, lugar_inicio, primera, grafo.coordenadas[anclas[0][0]])
    tramos_ok, tramos_total = 0, 0
    if inicio is not None:
        anclas.insert(0, (inicio, inicio, anclas[0][3], primera))
    ultima = next((c for c in reversed(claves) if c), None)
    fin = extremo(grafo, lugar_fin, ultima, grafo.coordenadas[anclas[-1][1]])
    if fin is not None:
        anclas.append((fin, fin, ultima, ultima))

    for (_, sale_a, _, _), (llega_b, _, _, clave_tramo) in zip(anclas, anclas[1:]):
        tramos_total += 1
        ruta = grafo.camino(sale_a, llega_b, clave_tramo)
        libre = grafo.camino(sale_a, llega_b, clave_tramo, False)
        if libre is not None and (ruta is None or largo(grafo, ruta) > largo(grafo, libre) * DESVIO_TOLERADO + 200):
            # Respetar el sentido de OSM obliga a dar una vuelta: suele ser la otra pista de una avenida
            # de doble calzada o un dato de OSM. Para mostrar por donde pasa, basta el camino directo.
            ruta = libre
        if ruta is None:
            observaciones.append('tramo sin camino por calles: se une en linea recta')
            ruta = [sale_a, llega_b]
        else:
            tramos_ok += 1
        if nodos and nodos[-1] == ruta[0]:
            ruta = ruta[1:]
        nodos.extend(ruta)

    puntos = [grafo.coordenadas[n] for n in nodos]
    encontradas = sum(1 for c in claves if c) / max(len(claves), 1)
    unidas = tramos_ok / max(tramos_total, 1)
    return puntos, round(min(encontradas, unidas), 3), observaciones


def simplificar(puntos, tolerancia_m=3.0):
    """Douglas-Peucker: quita los puntos que no cambian la forma en mas de 3 m."""
    if len(puntos) < 3:
        return list(puntos)

    def plano(p):
        return (p[0] * 111_000, p[1] * 111_000 * COS_LATITUD)

    xy = [plano(p) for p in puntos]
    conservar = [False] * len(puntos)
    conservar[0] = conservar[-1] = True
    pendientes = [(0, len(puntos) - 1)]
    while pendientes:
        a, b = pendientes.pop()
        (ax, ay), (bx, by) = xy[a], xy[b]
        largo_ab = math.hypot(bx - ax, by - ay)
        peor, indice = 0.0, None
        for k in range(a + 1, b):
            px, py = xy[k]
            if largo_ab == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                d = abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / largo_ab
            if d > peor:
                peor, indice = d, k
        if indice is not None and peor > tolerancia_m:
            conservar[indice] = True
            pendientes += [(a, indice), (indice, b)]
    return [p for p, si in zip(puntos, conservar) if si]


def largo(grafo, nodos):
    return sum(distancia(grafo.coordenadas[a], grafo.coordenadas[b]) for a, b in zip(nodos, nodos[1:]))


def densificar(puntos, paso=PASO_MAXIMO_M):
    """Agrega puntos intermedios para que no haya dos a mas de «paso» metros."""
    if not puntos:
        return []
    salida = [puntos[0]]
    for a, b in zip(puntos, puntos[1:]):
        d = distancia(a, b)
        partes = max(1, math.ceil(d / paso))
        for k in range(1, partes + 1):
            t = k / partes
            p = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
            if distancia(salida[-1], p) > 0.5:
                salida.append(p)
    return salida


def con_distancia(puntos):
    acumulada, salida = 0.0, []
    for i, p in enumerate(puntos):
        if i:
            acumulada += distancia(puntos[i - 1], p)
        salida.append((round(p[0], 6), round(p[1], 6), int(round(acumulada))))
    return salida


# ---------------------------------------------------------------------------

def main():
    argumentos = argparse.ArgumentParser(description='Dibuja los recorridos del catalogo sobre OpenStreetMap')
    argumentos.add_argument('osm', help='descarga de Overpass o grafo vial en JSON')
    argumentos.add_argument('--comunas', help='limites comunales en GeoJSON (propiedad name)')
    argumentos.add_argument('--salida', default=str(SALIDA))
    opciones = argumentos.parse_args()

    datos = json.loads(Path(opciones.osm).read_text(encoding='utf-8'))
    grafo = Grafo.desde_grafo_vial(datos) if 'aristas' in datos else Grafo.desde_overpass(datos)
    del datos
    if opciones.comunas:
        grafo.comunas = Comunas(json.loads(Path(opciones.comunas).read_text(encoding='utf-8')))
    lineas, calles = leer_catalogo()
    filas, informe, revisar, largos = [], [], [], {}
    fuera = Counter()
    aceptados = rechazados = 0
    for (linea_id, sentido), lista in sorted(calles.items()):
        linea = lineas[linea_id]
        inicio, fin = ((linea['lugar_origen'], linea['lugar_destino']) if sentido == 'ida'
                       else (linea['lugar_destino'], linea['lugar_origen']))
        puntos, calidad, notas = dibujar(grafo, lista, inicio, fin)
        if not puntos:
            fuera[Counter(c for _, _, c in lista).most_common(1)[0][0]] += 1
            continue
        if calidad < CALIDAD_MINIMA:
            rechazados += 1
            informe.append(f'| {linea_id} | {linea["numero"] or ""} | {sentido} | {calidad:.2f} | {"; ".join(notas[:3])} |')
            continue
        aceptados += 1
        final = con_distancia(densificar(simplificar(puntos)))
        largos[(linea_id, sentido)] = final[-1][2]
        for orden, (lat, lon, metros) in enumerate(final, start=1):
            filas.append(f'{linea_id}\t{sentido}\t{orden}\t{lat:.5f}\t{lon:.5f}\t{metros}')

    # Un sentido mucho mas largo que el otro suele ser una esquina mal elegida: queda para revisar.
    for (linea_id, sentido), metros in sorted(largos.items()):
        otro = largos.get((linea_id, 'vuelta' if sentido == 'ida' else 'ida'))
        if otro and metros > otro * 1.6 and metros - otro > 5000:
            revisar.append(f'| {linea_id} | {lineas[linea_id]["numero"] or ""} | {sentido} | '
                           f'{metros / 1000:.1f} km | {otro / 1000:.1f} km |')

    texto = '\n'.join([
        '-- Puntos de los recorridos del catalogo, dibujados sobre las calles de OpenStreetMap.',
        '-- GENERADO por herramientas/catalogo/geometria.py: no editar a mano.',
        '-- Calles: (c) colaboradores de OpenStreetMap, licencia ODbL (openstreetmap.org/copyright).',
        '', 'BEGIN;', '',
        'COPY catalogo_puntos (linea_id, sentido, orden, latitud, longitud, distancia_acumulada_m) FROM stdin;',
        *filas, '\\.', '', 'COMMIT;', '',
    ])
    salida = Path(opciones.salida)
    if salida.suffix == '.gz':
        # mtime=0: el mismo resultado da el mismo archivo (no ensucia git).
        with open(salida, 'wb') as archivo, gzip.GzipFile(fileobj=archivo, mode='wb', mtime=0, filename='') as comprimido:
            comprimido.write(texto.encode('utf-8'))
    else:
        salida.write_text(texto, encoding='utf-8')

    sin_datos = sum(fuera.values())
    resumen = (f'{aceptados} sentidos dibujados, {rechazados} bajo la calidad minima ({CALIDAD_MINIMA}), '
               f'{sin_datos} fuera del area del mapa; {len(filas)} puntos')
    INFORME.write_text('\n'.join([
        '# Informe de la geometria del catalogo', '',
        f'Calles: `{Path(opciones.osm).name}`. Comunas: `{Path(opciones.comunas).name if opciones.comunas else "sin filtro"}`.',
        '', resumen, '',
        '## Fuera del area del mapa (por comuna principal del recorrido)', '',
        '| Comuna | Sentidos |', '|---|---|', *(f'| {c} | {n} |' for c, n in fuera.most_common()), '',
        '## Sentidos que no alcanzaron la calidad minima (no se cargan)', '',
        '| Linea (id) | Numero | Sentido | Calidad | Observaciones |', '|---|---|---|---|---|', *informe, '',
        '## Para revisar: un sentido mucho mas largo que el otro (se cargan)', '',
        '| Linea (id) | Numero | Sentido | Largo | Largo del otro sentido |', '|---|---|---|---|---|', *revisar, '',
    ]), encoding='utf-8')
    print(resumen)


if __name__ == '__main__':
    main()
