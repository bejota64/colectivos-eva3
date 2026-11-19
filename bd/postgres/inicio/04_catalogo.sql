-- =====================================================================
-- Catalogo oficial de recorridos de taxis colectivos (Evaluacion 3)
--
-- Son los recorridos inscritos en el Registro Nacional de Transporte
-- Publico de Pasajeros (RNTPP) del Ministerio de Transportes. Sirven para
-- que el pasajero encuentre que linea le sirve y vea por donde pasa, aunque
-- esa linea todavia no use la aplicacion.
--
-- Va separado de «trazados» a proposito: un trazado es una linea que OPERA
-- en la plataforma (tiene representante, flota, jornadas y demanda); el
-- catalogo es informacion publica de solo lectura. Cuando una linea se suma
-- a la plataforma, el administrador crea su trazado a partir del catalogo.
--
-- Datos: 05_catalogo_datos.sql (lineas y calles, desde la planilla del
-- MTT) y 06_catalogo_puntos.sql (la linea dibujada sobre las calles de
-- OpenStreetMap). Ambos se generan con herramientas/catalogo/.
-- =====================================================================

-- Busqueda por parte del nombre de una calle («concha» encuentra «Av. Concha
-- y Toro»): indice de trigramas. Viene con la imagen oficial de PostgreSQL.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Forma para buscar: minusculas y sin tildes. translate() es inmutable, por
-- eso se puede usar en una columna generada y en un indice.
CREATE FUNCTION texto_busqueda(texto text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    RETURN lower(translate(texto, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));

CREATE TABLE catalogo_lineas (
    id                integer PRIMARY KEY,
    folio             integer NOT NULL,
    numero_linea      text,
    -- Solo si el responsable es una empresa: el nombre de una persona natural no se guarda.
    empresa           text,
    tipo_servicio     text NOT NULL,
    nombre_recorrido  text NOT NULL,
    tipo_trazado      text NOT NULL,
    flota_vigente     integer,
    origen            text NOT NULL,
    comuna_origen     text NOT NULL,
    lugar_origen      text,
    destino           text NOT NULL,
    comuna_destino    text NOT NULL,
    lugar_destino     text,
    busqueda          text GENERATED ALWAYS AS (
        texto_busqueda(coalesce(numero_linea, '') || ' ' || coalesce(empresa, '') || ' ' ||
                       origen || ' ' || comuna_origen || ' ' || destino || ' ' || comuna_destino)
    ) STORED,
    CONSTRAINT catalogo_lineas_unica UNIQUE (folio, nombre_recorrido, tipo_trazado),
    CONSTRAINT catalogo_lineas_folio_positivo CHECK (folio > 0),
    CONSTRAINT catalogo_lineas_servicio_valido CHECK (tipo_servicio IN ('urbano', 'rural')),
    CONSTRAINT catalogo_lineas_trazado_valido CHECK (tipo_trazado IN ('principal', 'alternativo')),
    CONSTRAINT catalogo_lineas_flota_no_negativa CHECK (flota_vigente >= 0)
);

CREATE INDEX catalogo_lineas_busqueda ON catalogo_lineas USING gin (busqueda gin_trgm_ops);
CREATE INDEX catalogo_lineas_por_numero ON catalogo_lineas (numero_linea);

-- Calles en el orden en que las recorre cada sentido, tal como estan inscritas.
CREATE TABLE catalogo_calles (
    linea_id   integer NOT NULL REFERENCES catalogo_lineas (id) ON DELETE CASCADE,
    sentido    text NOT NULL,
    orden      integer NOT NULL,
    calle      text NOT NULL,
    comuna     text NOT NULL,
    busqueda   text GENERATED ALWAYS AS (texto_busqueda(calle || ' ' || comuna)) STORED,
    PRIMARY KEY (linea_id, sentido, orden),
    CONSTRAINT catalogo_calles_sentido_valido CHECK (sentido IN ('ida', 'vuelta')),
    CONSTRAINT catalogo_calles_orden_positivo CHECK (orden >= 1)
);

CREATE INDEX catalogo_calles_busqueda ON catalogo_calles USING gin (busqueda gin_trgm_ops);

-- La linea dibujada: puntos ordenados sobre las calles, con la distancia
-- acumulada (igual que puntos_ruta). Un punto cada 50 m como maximo, para
-- que «lineas cerca de mi» no se salte un tramo largo entre dos esquinas.
CREATE TABLE catalogo_puntos (
    linea_id               integer NOT NULL REFERENCES catalogo_lineas (id) ON DELETE CASCADE,
    sentido                text NOT NULL,
    orden                  integer NOT NULL,
    latitud                numeric(9, 6) NOT NULL,
    longitud               numeric(9, 6) NOT NULL,
    distancia_acumulada_m  integer NOT NULL,
    PRIMARY KEY (linea_id, sentido, orden),
    CONSTRAINT catalogo_puntos_sentido_valido CHECK (sentido IN ('ida', 'vuelta')),
    CONSTRAINT catalogo_puntos_orden_positivo CHECK (orden >= 1),
    CONSTRAINT catalogo_puntos_latitud_chile CHECK (latitud BETWEEN -56.5 AND -17.0),
    CONSTRAINT catalogo_puntos_longitud_chile CHECK (longitud BETWEEN -76.0 AND -66.0),
    CONSTRAINT catalogo_puntos_distancia_no_negativa CHECK (distancia_acumulada_m >= 0)
);

-- «Lineas cerca de mi»: primero se filtra por un cuadrado alrededor de la
-- persona usando este indice, y solo con esos puntos se calcula la distancia.
CREATE INDEX catalogo_puntos_ubicacion ON catalogo_puntos (latitud, longitud);

-- La cuenta de la API solo puede leer el catalogo: lo cargan los scripts.
\getenv api_usuario POSTGRES_API_USUARIO
GRANT SELECT ON catalogo_lineas, catalogo_calles, catalogo_puntos TO :"api_usuario";
GRANT EXECUTE ON FUNCTION texto_busqueda(text) TO :"api_usuario";
