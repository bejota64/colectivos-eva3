"""Extrae del Registro Nacional de Transporte Publico de Pasajeros (RNTPP) los
recorridos de taxis colectivos de una region y genera el SQL que los carga
en el catalogo de la base (bd/postgres/inicio/05_catalogo_datos.sql).

Fuente: planilla «Transporte Publico - Julio 2026» del Ministerio de
Transportes y Telecomunicaciones, entregada por la docente el 17-11-2026.

Proteccion de datos (Ley 21.719): la planilla trae nombres, RUT, domicilios,
telefonos y correos de duenos y conductores. Este script NO los lee ni los
copia: de la hoja «Servicios» toma solo el folio, el numero de linea, la
flota vigente y el nombre de fantasia cuando el responsable es una empresa
(persona juridica). La planilla original no se sube al repositorio.

Uso:
    python3 herramientas/catalogo/extraer_rntpp.py planilla.xlsx [--region 13]

Necesita openpyxl (pip install openpyxl).
"""
import argparse
import sys
from collections import defaultdict
from pathlib import Path

from textos import reparar, titulo

RAIZ = Path(__file__).resolve().parents[2]
SALIDA = RAIZ / 'bd' / 'postgres' / 'inicio' / '05_catalogo_datos.sql'


def filas(hoja):
    """Recorre una hoja como diccionarios usando la primera fila de encabezado."""
    iterador = hoja.iter_rows(values_only=True)
    encabezado = [str(c).strip() if c is not None else '' for c in next(iterador)]
    # La hoja «Servicios» repite REGION: la segunda es la del domicilio del duenio.
    vistos = defaultdict(int)
    nombres = []
    for nombre in encabezado:
        vistos[nombre] += 1
        nombres.append(nombre if vistos[nombre] == 1 else f'{nombre}_{vistos[nombre]}')
    for fila in iterador:
        yield dict(zip(nombres, fila))


def es_colectivo(fila, region, columna='TIPO_SERVICIO'):
    return str(fila.get('REGION')) == region and 'TAXI COLECTIVO' in str(fila.get(columna) or '')


def sql_texto(valor):
    if valor is None or valor == '':
        return 'NULL'
    return "'" + str(valor).replace("'", "''") + "'"


def sql_entero(valor):
    try:
        return str(int(str(valor).strip()))
    except (TypeError, ValueError):
        return 'NULL'


def leer(planilla, region):
    try:
        import openpyxl
    except ImportError:
        sys.exit('Falta openpyxl: pip install openpyxl')
    libro = openpyxl.load_workbook(planilla, read_only=True)

    # Servicios: solo campos del servicio, nunca datos de personas.
    servicios = {}
    for fila in filas(libro['Servicios']):
        if not es_colectivo(fila, region, 'TIPO_SERVICO'):
            continue
        empresa = fila.get('NOMBRE_FANTASIA') if fila.get('TIPO_PERSONA') == 'JURIDICA' else None
        servicios[str(fila['FOLIO'])] = {
            'numero_linea': reparar(fila.get('NRO_LINEA')) or None,
            'flota': fila.get('FLOTA_VIGENTE'),
            'empresa': reparar(empresa) or None,
        }

    recorridos = {}
    for fila in filas(libro['O_D Recorridos']):
        if not es_colectivo(fila, region):
            continue
        clave = (str(fila['FOLIO']), reparar(fila['NOMBRE_RECORRIDO']), str(fila['TIPO_TRAZADO']).lower())
        recorridos[clave] = {
            'tipo_servicio': 'rural' if 'RURAL' in fila['TIPO_SERVICIO'] else 'urbano',
            'origen': titulo(fila['NOMBRE_ORIGEN']),
            'comuna_origen': reparar(fila['COMUNA_ORIGEN']),
            'lugar_origen': titulo(fila['DOMICILIO_ORIGEN']) or None,
            'destino': titulo(fila['NOMBRE_DESTINO']),
            'comuna_destino': reparar(fila['COMUNA_DESTINO']),
            'lugar_destino': titulo(fila['DOMICILIO_DESTINO']) or None,
        }

    calles = defaultdict(list)
    for fila in filas(libro['Trazados']):
        if not es_colectivo(fila, region):
            continue
        clave = (str(fila['FOLIO']), reparar(fila['NOMBRE_RECORRIDO']), str(fila['TIPO_TRAZADO']).lower())
        sentido = 'ida' if str(fila['SENTIDO']).upper() == 'IDA' else 'vuelta'
        calles[(clave, sentido)].append((int(fila['ORDEN']), titulo(fila['CALLE']), reparar(fila['COMUNA'])))
    return servicios, recorridos, calles


def ordenar_calles(lista):
    """Ordena por ORDEN (en el archivo sigue de la ida a la vuelta) y une repetidas seguidas."""
    salida = []
    for _, calle, comuna in sorted(lista):
        if not calle:
            continue
        if salida and salida[-1][0].lower() == calle.lower():
            continue
        salida.append((calle, comuna))
    return salida


def generar(servicios, recorridos, calles, region):
    claves = sorted(recorridos, key=lambda c: (int(c[0]), c[1], c[2] != 'principal', c[2]))
    lineas, filas_calles = [], []
    sin_calles = 0
    for numero, clave in enumerate(claves, start=1):
        folio, nombre, tipo = clave
        r, s = recorridos[clave], servicios.get(folio, {})
        lineas.append(
            f"({numero}, {sql_entero(folio)}, {sql_texto(s.get('numero_linea'))}, {sql_texto(s.get('empresa'))}, "
            f"{sql_texto(r['tipo_servicio'])}, {sql_texto(nombre)}, {sql_texto(tipo)}, {sql_entero(s.get('flota'))}, "
            f"{sql_texto(r['origen'])}, {sql_texto(r['comuna_origen'])}, {sql_texto(r['lugar_origen'])}, "
            f"{sql_texto(r['destino'])}, {sql_texto(r['comuna_destino'])}, {sql_texto(r['lugar_destino'])})"
        )
        total = 0
        for sentido in ('ida', 'vuelta'):
            for orden, (calle, comuna) in enumerate(ordenar_calles(calles.get((clave, sentido), [])), start=1):
                filas_calles.append(f"({numero}, '{sentido}', {orden}, {sql_texto(calle)}, {sql_texto(comuna)})")
                total += 1
        if total == 0:
            sin_calles += 1

    partes = [
        '-- =====================================================================',
        f'-- Catalogo de recorridos de taxis colectivos, region {region}.',
        '-- GENERADO por herramientas/catalogo/extraer_rntpp.py: no editar a mano.',
        '-- Fuente: Registro Nacional de Transporte Publico de Pasajeros (MTT),',
        '-- planilla «Transporte Publico - Julio 2026». Solo datos del recorrido:',
        '-- sin nombres, RUT, domicilios ni contactos de personas (Ley 21.719).',
        '-- =====================================================================',
        '',
        'BEGIN;',
        '',
        'INSERT INTO catalogo_lineas (id, folio, numero_linea, empresa, tipo_servicio, nombre_recorrido,',
        '    tipo_trazado, flota_vigente, origen, comuna_origen, lugar_origen, destino, comuna_destino, lugar_destino)',
        'VALUES',
        ',\n'.join(lineas) + ';',
        '',
    ]
    for inicio in range(0, len(filas_calles), 2000):
        bloque = filas_calles[inicio:inicio + 2000]
        partes += ['INSERT INTO catalogo_calles (linea_id, sentido, orden, calle, comuna) VALUES',
                   ',\n'.join(bloque) + ';', '']
    partes += ['COMMIT;', '']
    return '\n'.join(partes), len(lineas), len(filas_calles), sin_calles


def main():
    argumentos = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    argumentos.add_argument('planilla')
    argumentos.add_argument('--region', default='13')
    argumentos.add_argument('--salida', default=str(SALIDA))
    opciones = argumentos.parse_args()
    servicios, recorridos, calles = leer(opciones.planilla, opciones.region)
    sql, n_lineas, n_calles, sin_calles = generar(servicios, recorridos, calles, opciones.region)
    Path(opciones.salida).write_text(sql, encoding='utf-8')
    print(f'{n_lineas} recorridos, {n_calles} calles, {sin_calles} recorridos sin calles -> {opciones.salida}')


if __name__ == '__main__':
    main()
