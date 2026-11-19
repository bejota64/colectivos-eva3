"""Genera web/e2e/datos/catalogo.json: diez lineas reales de Puente Alto del
catalogo, para la API simulada de las pruebas de la web (Playwright).

Lee la base de desarrollo con psql (con el catalogo ya cargado):
    python3 herramientas/catalogo/datos_prueba_web.py [URL de PostgreSQL]
La URL por omision es la de URL_POSTGRES_ADMIN (api/.env) o, si no esta,
postgresql://localhost:5432/colectivos. Solo lee datos de recorridos.
"""
import json, os, re, subprocess, sys
from pathlib import Path
from geometria import simplificar

URL = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('URL_POSTGRES_ADMIN', 'postgresql://localhost:5432/colectivos')
SALIDA = Path(__file__).resolve().parents[2] / 'web' / 'e2e' / 'datos' / 'catalogo.json'


def sql(q):
    r = subprocess.run(['psql', URL, '-At', '-c', q], capture_output=True, text=True, check=True)
    return json.loads(r.stdout or 'null')

def lugar_corto(l):
    if not l: return None
    s = re.sub(r'^circunvalaci[oó]n\s*:\s*', '', l, flags=re.I)
    c = re.split(r'\s+(?:(?:altura|viraje|esquina|frente|retorno)\b|n°|#)|\s*\(', s, flags=re.I)[0].strip()
    return c or None

COL = """l.*, ARRAY(SELECT DISTINCT c.comuna FROM catalogo_calles c WHERE c.linea_id = l.id ORDER BY c.comuna) AS comunas,
 (SELECT c.calle FROM catalogo_calles c WHERE c.linea_id = l.id AND c.sentido='ida' ORDER BY c.orden LIMIT 1) AS primera_calle,
 EXISTS (SELECT 1 FROM catalogo_puntos p WHERE p.linea_id = l.id) AS tiene_trazado"""

def resumir(f):
    return {
        'id': f['id'], 'nombre': f"Línea {f['numero_linea']}" if f['numero_linea'] else f"Folio {f['folio']}",
        'numero_linea': f['numero_linea'], 'empresa': f['empresa'], 'tipo_servicio': f['tipo_servicio'],
        'variante': f['nombre_recorrido'], 'alternativo': f['tipo_trazado'] == 'alternativo',
        'circular': bool(re.match(r'^circunvalaci[oó]n', f['lugar_destino'] or '', re.I)),
        'desde': lugar_corto(f['lugar_origen']) or f['primera_calle'] or f['origen'],
        'hasta': lugar_corto(f['lugar_destino']) or f['destino'],
        'comunas': f['comunas'], 'tiene_trazado': f['tiene_trazado'],
    }

ids = [351, 352, 353, 355, 358, 359, 360, 361, 366, 368]
filas = sql(f"SELECT json_agg(t ORDER BY (t.tipo_trazado <> 'principal'), t.numero_linea, t.id) FROM (SELECT {COL} FROM catalogo_lineas l WHERE l.id IN ({','.join(map(str, ids))})) t")
lineas = []
for f in filas:
    calles = sql(f"SELECT json_agg(json_build_object('sentido', sentido, 'orden', orden, 'calle', calle, 'comuna', comuna) ORDER BY sentido, orden) FROM catalogo_calles WHERE linea_id = {f['id']}")
    puntos = sql(f"SELECT json_agg(json_build_object('sentido', sentido, 'latitud', latitud::float8, 'longitud', longitud::float8, 'd', distancia_acumulada_m) ORDER BY sentido, orden) FROM catalogo_puntos WHERE linea_id = {f['id']}") or []
    sentidos = []
    for s in ('ida', 'vuelta'):
        ps = [p for p in puntos if p['sentido'] == s]
        # Menos puntos para el archivo de prueba: se quitan los que no cambian la forma en mas de 8 m.
        quedan = set(map(tuple, simplificar([(p['latitud'], p['longitud']) for p in ps], 8.0)))
        cs = [{'orden': c['orden'], 'calle': c['calle'], 'comuna': c['comuna']} for c in calles if c['sentido'] == s]
        if cs or ps:
            sentidos.append({'sentido': s, 'calles': cs, 'puntos': [
                {'latitud': p['latitud'], 'longitud': p['longitud'], 'distancia_acumulada_m': p['d']}
                for p in ps if (p['latitud'], p['longitud']) in quedan]})
    lineas.append({**resumir(f), 'folio': f['folio'], 'flota_vigente': f['flota_vigente'], 'origen': f['origen'],
                   'comuna_origen': f['comuna_origen'], 'lugar_origen': f['lugar_origen'], 'destino': f['destino'],
                   'comuna_destino': f['comuna_destino'], 'lugar_destino': f['lugar_destino'], 'sentidos': sentidos})

comunas = sql("SELECT json_agg(json_build_object('comuna', comuna, 'lineas', n) ORDER BY comuna) FROM (SELECT comuna, count(DISTINCT linea_id) n FROM catalogo_calles GROUP BY comuna) t")
# Cerca de la ubicacion simulada de las pruebas (playwright.config.ts), 500 m, solo las lineas del archivo.
la, lo, r = -33.6012, -70.5774, 500
cerca = sql(f"""SELECT json_agg(json_build_object('id', linea_id, 'distancia_m', round(d)::int) ORDER BY d) FROM (
  SELECT linea_id, min(sqrt(power((latitud::float8 - {la}) * 111320, 2) + power((longitud::float8 - {lo}) * 111320 * cos(radians({la})), 2))) d
  FROM catalogo_puntos WHERE linea_id IN ({','.join(map(str, ids))}) GROUP BY linea_id) t WHERE d <= {r}""") or []
salida = {
    'fuente': 'Registro Nacional de Transporte Publico de Pasajeros (MTT), julio de 2026; trazados sobre calles de OpenStreetMap (ODbL). '
              'Generado con herramientas/catalogo/datos_prueba_web.py; solo datos de recorridos.',
    'comunas': comunas, 'lineas': lineas, 'cercanas': cerca,
}
SALIDA.write_text(json.dumps(salida, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f"{len(lineas)} lineas, {sum(len(s['puntos']) for l in lineas for s in l['sentidos'])} puntos -> {SALIDA}")
