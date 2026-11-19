"""Limpieza de textos del Registro Nacional de Transporte Publico (RNTPP).

El archivo del Ministerio llega con la Ñ convertida en «?» (VICU?A MACKENNA,
?u?oa) y todo en mayusculas. Aqui se corrige y se deja en un formato legible
para las personas («Av. Vicuña Mackenna»), y ademas se arma una forma
normalizada (sin tildes, sin abreviaturas) para comparar nombres de calles
con los de OpenStreetMap.
"""
import re
import unicodedata

COMUNAS = {
    'Pe?aflor': 'Peñaflor', 'Pe?alolén': 'Peñalolén', '?u?oa': 'Ñuñoa',
    'Pe?alolen': 'Peñalolén',
}

MINUSCULAS = {'de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'a', 'al', 'en', 'con', 'por', 'o'}
ROMANOS = re.compile(r'^(i{1,3}|iv|v|vi{1,3}|ix|x{1,3})$', re.I)
ABREVIATURAS = {'av.': 'Av.', 'avda.': 'Avda.', 'gral.': 'Gral.', 'pje.': 'Pje.', 'sta.': 'Sta.',
                'sto.': 'Sto.', 'pdte.': 'Pdte.', 'pte.': 'Pte.', 'dr.': 'Dr.', 'cnel.': 'Cnel.',
                'tte.': 'Tte.', 'sgto.': 'Sgto.', 'cap.': 'Cap.', 'ex': 'Ex', 'n°': 'N°'}


def reparar(texto):
    """Devuelve el texto sin espacios de mas y con la Ñ recuperada."""
    if texto is None:
        return ''
    texto = re.sub(r'\s+', ' ', str(texto)).strip()
    if texto in COMUNAS:
        return COMUNAS[texto]
    # «AV.CONCHA Y TORO»: falta el espacio despues de la abreviatura.
    texto = re.sub(r'\b(AV|AVDA|GRAL|PJE|PDTE)\.(?=[A-ZÁÉÍÓÚÑ])', r'\1. ', texto, flags=re.I)
    # En el archivo original «?» solo aparece donde iba una Ñ.
    texto = texto.replace('´', "'").replace('`', "'")
    # «1? DE MAYO»: despues de un numero, el «?» era un «°».
    texto = re.sub(r'(?<=\d)\?', '°', texto)
    return texto.replace('?', 'Ñ')


def titulo(texto):
    """«AV. CONCHA Y TORO» -> «Av. Concha y Toro»."""
    palabras = reparar(texto).lower().split(' ')
    salida = []
    for i, palabra in enumerate(palabras):
        if palabra in ABREVIATURAS:
            salida.append(ABREVIATURAS[palabra])
        elif ROMANOS.match(palabra):
            salida.append(palabra.upper())
        elif i > 0 and palabra in MINUSCULAS and not palabras[i - 1].endswith(':'):
            salida.append(palabra)
        else:
            # Mayuscula al inicio y despues de guion, apostrofo o parentesis: «O'Higgins», «(Ret.».
            salida.append(re.sub(r"(^|[-'(])(\w)", lambda m: m.group(1) + m.group(2).upper(), palabra))
    return ' '.join(salida)


def sin_tildes(texto):
    return ''.join(c for c in unicodedata.normalize('NFD', texto) if unicodedata.category(c) != 'Mn')


PREFIJOS = re.compile(
    r'^(avenida|avda\.?|av\.?|calle local|calle|pasaje|pje\.?|camino|cno\.?|ruta|autopista|'
    r'general|gral\.?|presidente|pdte\.?|doctor|dr\.?|coronel|cnel\.?|teniente|tte\.?|'
    r'sargento|sgto\.?|capitan|cap\.?)\s+'
)
RUIDO = re.compile(r'\b(oriente|poniente|norte|sur|ote\.?|pte\.?|nte\.?)\b')


def clave_calle(texto):
    """Forma para comparar nombres de calles entre el registro y OpenStreetMap.

    «AV. VICUÑA MACKENNA PONIENTE» y «Avenida Vicuña Mackenna» dan la misma
    clave: «vicuna mackenna». Se quitan tildes, prefijos (avenida, general,
    presidente...) y la orientacion (oriente, poniente...), que el registro y
    OpenStreetMap escriben distinto.
    """
    texto = sin_tildes(reparar(texto)).lower()
    # Notas del registro que no son parte del nombre: «(ret. alt. Independencia)»,
    # «viraje alt. 1300», «via local».
    texto = re.sub(r'\(.*?\)', ' ', texto)
    texto = re.sub(r'\b(viraje|retorno|ret\.)\b.*$', ' ', texto)
    texto = re.sub(r'\b(via local|calle local|caletera)\b', ' ', texto)
    texto = re.sub(r'[^a-z0-9. ]', ' ', texto)
    texto = re.sub(r'\s+', ' ', texto).strip()
    anterior = None
    while anterior != texto:
        anterior = texto
        texto = PREFIJOS.sub('', texto)
    # «Calle Norte» o «Avenida Sur» se llaman asi: si al quitar la orientacion
    # no queda nada, se conserva.
    sin_orientacion = RUIDO.sub('', texto).strip()
    texto = sin_orientacion or texto
    texto = re.sub(r'^(a|al|hacia)\s+', '', texto)
    texto = texto.replace('.', ' ')
    return re.sub(r'\s+', ' ', texto).strip()
