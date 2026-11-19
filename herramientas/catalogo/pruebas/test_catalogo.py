"""Pruebas de las herramientas del catalogo con un barrio inventado.

Se ejecutan con:  python3 -m unittest discover -s herramientas/catalogo/pruebas
No necesitan internet ni la planilla del MTT.

Barrio de prueba (cada cuadra mide unos 111 m):

      y=3   ......................  «Calle Norte» (solo de poniente a oriente)
      y=2   ----------+-----------  «Avenida Eyzaguirre»
      y=1             |
      y=0   ----------+-----------  «Los Lirios»
            x=-2     x=0       x=2
                  «Avenida Concha y Toro» (x=0, de y=0 a y=3)
"""
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from geometria import (  # noqa: E402
    PASO_MAXIMO_M, Comunas, Grafo, con_distancia, decodificar_polilinea, densificar, dibujar, distancia, extremo,
    simplificar, valores,
)
from textos import clave_calle, reparar, titulo  # noqa: E402

LAT0, LON0, CUADRA = -33.60, -70.58, 0.001


def punto(x, y):
    return {'lat': LAT0 + y * CUADRA, 'lon': LON0 + x * CUADRA}


def nodo(x, y):
    return int((x + 10) * 100 + (y + 10))


def calle(nombre, coordenadas, **etiquetas):
    return {
        'type': 'way',
        'tags': {'highway': 'residential', 'name': nombre, **etiquetas},
        'nodes': [nodo(x, y) for x, y in coordenadas],
        'geometry': [punto(x, y) for x, y in coordenadas],
    }


BARRIO = {'elements': [
    calle('Avenida Concha y Toro', [(0, 0), (0, 1), (0, 2), (0, 3)], highway='primary'),
    calle('Los Lirios', [(-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0)]),
    calle('Avenida Eyzaguirre', [(-2, 2), (-1, 2), (0, 2), (1, 2), (2, 2)]),
    calle('Calle Norte', [(-2, 3), (-1, 3), (0, 3), (1, 3), (2, 3)], oneway='yes'),
    calle('Pasaje Cierre', [(2, 2), (2, 3)]),
    calle('Pasaje Cierre Oeste', [(-2, 2), (-2, 3)]),
]}


class Textos(unittest.TestCase):
    def test_recupera_la_enie_y_deja_el_nombre_legible(self):
        self.assertEqual(reparar('VICU?A MACKENNA'), 'VICUÑA MACKENNA')
        self.assertEqual(reparar('?u?oa'), 'Ñuñoa')
        self.assertEqual(titulo('AV. CONCHA Y TORO'), 'Av. Concha y Toro')
        self.assertEqual(titulo('CIRCUNVALACION: LOS MAQUIS'), 'Circunvalacion: Los Maquis')
        self.assertEqual(titulo('PAPA JUAN PABLO II'), 'Papa Juan Pablo II')
        self.assertEqual(titulo('AV.CONCHA Y TORO'), 'Av. Concha y Toro')
        self.assertEqual(titulo('1? DE MAYO'), '1° de Mayo')
        self.assertEqual(titulo('PE?ALOLEN'), 'Peñalolen')
        self.assertEqual(titulo('AV. LIBERTADOR BERNARDO O´HIGGINS'), "Av. Libertador Bernardo O'Higgins")
        self.assertEqual(titulo('AV. CONCHA Y TORO (VIA LOCAL)'), 'Av. Concha y Toro (Via Local)')

    def test_la_clave_iguala_el_registro_con_openstreetmap(self):
        self.assertEqual(clave_calle('AV. VICU?A MACKENNA PONIENTE'), clave_calle('Avenida Vicuña Mackenna'))
        self.assertEqual(clave_calle('PRESIDENTE BULNES'), clave_calle('Presidente Bulnes'))
        self.assertEqual(clave_calle('CAMINO A LAS VIZCACHAS'), clave_calle('Camino Las Vizcachas'))
        self.assertEqual(clave_calle('SAN CARLOS'), 'san carlos')
        self.assertEqual(clave_calle('Calle Norte'), 'norte')
        self.assertEqual(clave_calle('AV.CONCHA Y TORO ORIENTE (RET. ALT. INDEPENDENCIA)'), 'concha y toro')
        self.assertEqual(clave_calle('AV. LIBERTADOR BERNARDO O´HIGGINS VIRAJE ALT. 1300'),
                         clave_calle("Avenida Libertador Bernardo O'Higgins"))
        self.assertEqual(clave_calle('AV. CONCHA Y TORO PONIENTE (VIA LOCAL)'), 'concha y toro')

    def test_lee_tuplas_sql_con_comillas_y_null(self):
        self.assertEqual(valores("1, 'ida', 3, 'O''Higgins', NULL"), ['1', 'ida', '3', "O'Higgins", None])


class Geometria(unittest.TestCase):
    def setUp(self):
        self.grafo = Grafo.desde_overpass(BARRIO)

    def test_une_las_calles_en_sus_esquinas_y_en_orden(self):
        recorrido = [(1, 'LOS LIRIOS', 'X'), (2, 'AV. CONCHA Y TORO', 'X'), (3, 'EYZAGUIRRE', 'X')]
        puntos, calidad, notas = dibujar(self.grafo, recorrido, 'Los Lirios con Las Rosas', None)
        self.assertEqual(calidad, 1.0, notas)
        esquina_lirios = (punto(0, 0)['lat'], punto(0, 0)['lon'])
        esquina_eyzaguirre = (punto(0, 2)['lat'], punto(0, 2)['lon'])
        self.assertIn(esquina_lirios, puntos)
        self.assertIn(esquina_eyzaguirre, puntos)
        self.assertLess(puntos.index(esquina_lirios), puntos.index(esquina_eyzaguirre))

    def test_respeta_el_sentido_del_transito(self):
        # Calle Norte es de poniente a oriente: de x=1 a x=-1 no se puede ir por ella.
        desde, hasta = nodo(1, 3), nodo(-1, 3)
        ruta = self.grafo.camino(desde, hasta, clave_calle('Calle Norte'))
        self.assertIsNotNone(ruta)
        coordenadas = [self.grafo.coordenadas[n] for n in ruta]
        # Rodea por Eyzaguirre (y=2) en vez de ir en contra por y=3.
        self.assertTrue(any(abs(c[0] - punto(0, 2)['lat']) < 1e-9 for c in coordenadas))
        en_contra = self.grafo.camino(desde, hasta, clave_calle('Calle Norte'), respetar_sentido=False)
        self.assertEqual(len(en_contra), 3)

    def test_una_calle_que_no_existe_baja_la_calidad(self):
        recorrido = [(1, 'LOS LIRIOS', 'X'), (2, 'CALLE INVENTADA', 'X'), (3, 'AV. CONCHA Y TORO', 'X')]
        _, calidad, notas = dibujar(self.grafo, recorrido)
        self.assertLess(calidad, 1.0)
        self.assertTrue(any('CALLE INVENTADA' in n for n in notas))

    def test_reconoce_el_inicio_escrito_como_esquina(self):
        inicio = extremo(self.grafo, 'Av. Concha y Toro con Los Lirios', clave_calle('Concha y Toro'))
        self.assertEqual(inicio, nodo(0, 0))

    def test_densifica_y_acumula_la_distancia(self):
        a, b = (LAT0, LON0), (LAT0 + 0.004, LON0)  # unos 444 m
        puntos = densificar([a, b])
        self.assertEqual(len(puntos), 6)
        self.assertTrue(all(distancia(p, q) <= PASO_MAXIMO_M + 0.5 for p, q in zip(puntos, puntos[1:])))
        filas = con_distancia(puntos)
        self.assertEqual(filas[0][2], 0)
        self.assertTrue(math.isclose(filas[-1][2], distancia(a, b), abs_tol=1))


    def test_simplificar_quita_puntos_en_linea_recta_y_deja_las_esquinas(self):
        recta = [(LAT0 + k * 0.0001, LON0) for k in range(10)]
        esquina = recta + [(recta[-1][0], LON0 + 0.001)]
        self.assertEqual(simplificar(recta), [recta[0], recta[-1]])
        self.assertEqual(simplificar(esquina), [recta[0], recta[-1], esquina[-1]])


class GrafoVial(unittest.TestCase):
    """El formato {nodos, aristas, nombres, formas} del grafo ya armado."""

    def setUp(self):
        # Tres cruces en linea (0 -> 1 -> 2). «Los Lirios» de doble sentido entre 0 y 1
        # (aristas 0 y 1, inversas entre si, con una curva al medio); «Tocornal» de
        # sentido unico de 1 a 2 (arista 2, sin inversa).
        self.datos = {
            'nodos': {'lat': [-3360000, -3359800, -3359600], 'lon': [-7058000, -7058000, -7058000]},
            'aristas': {
                'desde': [0, 1, 1], 'hasta': [1, 0, 2], 'nombre': [0, 0, 1], 'inversa': [1, 0, -1],
            },
            'nombres': [{'n': 'Los Lirios', 'r': ''}, {'n': 'Tocornal', 'r': ''}],
            'formas': {'0': codificar([(-33.599, -70.5801)])},
        }
        self.grafo = Grafo.desde_grafo_vial(self.datos)

    def test_lee_la_forma_y_respeta_el_sentido_unico(self):
        self.assertEqual(len(self.grafo.coordenadas), 4)  # 3 cruces y el punto de la curva
        ida = self.grafo.camino(0, 2, 'tocornal')
        self.assertEqual(len(ida), 4)
        self.assertIsNone(self.grafo.camino(2, 1, 'tocornal'))
        self.assertEqual(self.grafo.camino(2, 1, 'tocornal', respetar_sentido=False), [2, 1])

    def test_decodifica_polilineas_de_seis_decimales(self):
        puntos = [(-33.611234, -70.575678), (-33.6, -70.58)]
        self.assertEqual([tuple(round(c, 6) for c in p) for p in decodificar_polilinea(codificar(puntos))], puntos)


class FiltroPorComuna(unittest.TestCase):
    """Dos calles «San Pedro» en comunas distintas: se usa la de la comuna del registro."""

    def setUp(self):
        oeste = [[-70.70, -33.70], [-70.60, -33.70], [-70.60, -33.50], [-70.70, -33.50], [-70.70, -33.70]]
        este = [[-70.60, -33.70], [-70.50, -33.70], [-70.50, -33.50], [-70.60, -33.50], [-70.60, -33.70]]
        self.comunas = Comunas({'features': [
            {'properties': {'name': 'Maipú'}, 'geometry': {'type': 'Polygon', 'coordinates': [oeste]}},
            {'properties': {'name': 'Puente Alto'}, 'geometry': {'type': 'Polygon', 'coordinates': [este]}},
        ]})
        grafo = Grafo()
        grafo._agregar_tramo([(1, (-33.60, -70.66)), (2, (-33.59, -70.66))], 'san pedro', False)
        grafo._agregar_tramo([(3, (-33.60, -70.55)), (4, (-33.59, -70.55))], 'san pedro', False)
        grafo.comunas = self.comunas
        self.grafo = grafo

    def test_ubica_cada_punto_en_su_comuna(self):
        self.assertEqual(self.comunas.de_celda(-33.6 // 0.002, -70.66 // 0.002), 'maipu')
        self.assertTrue(self.comunas.cerca((-33.6, -70.55), 'puente alto'))
        self.assertFalse(self.comunas.cerca((-33.6, -70.66), 'puente alto'))

    def test_elige_la_calle_de_la_comuna_anotada(self):
        clave = self.grafo.calle('SAN PEDRO', comuna='PUENTE ALTO')
        self.assertEqual(self.grafo.nodos(clave), {3, 4})
        self.assertEqual(self.grafo.nodos(self.grafo.calle('San Pedro', comuna='Maipú')), {1, 2})


def codificar(puntos, precision=6):
    """Polilinea de Google, para armar datos de prueba."""
    salida, anterior = [], (0, 0)
    for lat, lon in puntos:
        actual = (round(lat * 10 ** precision), round(lon * 10 ** precision))
        for delta in (actual[0] - anterior[0], actual[1] - anterior[1]):
            valor = ~(delta << 1) if delta < 0 else delta << 1
            while valor >= 0x20:
                salida.append(chr((0x20 | (valor & 0x1F)) + 63))
                valor >>= 5
            salida.append(chr(valor + 63))
        anterior = actual
    return ''.join(salida)


if __name__ == '__main__':
    unittest.main()
