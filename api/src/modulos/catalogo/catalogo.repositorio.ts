import { Injectable } from '@nestjs/common';
import { BaseDatosServicio } from '../../comun/base-datos/base-datos.servicio';

export interface LineaFila {
  id: number;
  folio: number;
  numero_linea: string | null;
  empresa: string | null;
  tipo_servicio: 'urbano' | 'rural';
  nombre_recorrido: string;
  tipo_trazado: 'principal' | 'alternativo';
  flota_vigente: number | null;
  origen: string;
  comuna_origen: string;
  lugar_origen: string | null;
  destino: string;
  comuna_destino: string;
  lugar_destino: string | null;
  comunas: string[];
  primera_calle: string | null;
  tiene_trazado: boolean;
  distancia_m?: number;
}

export interface CalleFila {
  sentido: 'ida' | 'vuelta';
  orden: number;
  calle: string;
  comuna: string;
}

export interface PuntoCatalogoFila {
  sentido: 'ida' | 'vuelta';
  orden: number;
  latitud: number;
  longitud: number;
  distancia_acumulada_m: number;
}

export interface PuntoMapaFila {
  linea_id: number;
  sentido: 'ida' | 'vuelta';
  orden: number;
  latitud: number;
  longitud: number;
}

/** Recuadro del mapa en grados (sur < norte, oeste < este). */
export interface Recuadro {
  sur: number;
  oeste: number;
  norte: number;
  este: number;
}

/** Columnas comunes de una linea, mas sus comunas y si ya tiene la linea dibujada. */
const COLUMNAS = `
  l.id, l.folio, l.numero_linea, l.empresa, l.tipo_servicio, l.nombre_recorrido, l.tipo_trazado,
  l.flota_vigente, l.origen, l.comuna_origen, l.lugar_origen, l.destino, l.comuna_destino, l.lugar_destino,
  ARRAY(SELECT DISTINCT c.comuna FROM catalogo_calles c WHERE c.linea_id = l.id ORDER BY c.comuna) AS comunas,
  (SELECT c.calle FROM catalogo_calles c WHERE c.linea_id = l.id AND c.sentido = 'ida' ORDER BY c.orden LIMIT 1)
    AS primera_calle,
  EXISTS (SELECT 1 FROM catalogo_puntos p WHERE p.linea_id = l.id) AS tiene_trazado`;

const ORDEN = `ORDER BY (l.tipo_trazado <> 'principal'), l.numero_linea NULLS LAST, l.nombre_recorrido, l.id`;

/**
 * Catalogo oficial de recorridos (solo lectura). Todas las consultas usan
 * parametros ($1, $2...): el texto que escribe la persona nunca se pega
 * dentro del SQL.
 */
@Injectable()
export class CatalogoRepositorio {
  constructor(private readonly baseDatos: BaseDatosServicio) {}

  /**
   * Cada palabra buscada debe aparecer en los datos de la linea o en alguna
   * de sus calles. Los patrones llegan ya normalizados y con %, _ y \
   * escapados (ver CatalogoServicio.patron).
   */
  buscar(patrones: string[], comuna: string | null, limite: number): Promise<LineaFila[]> {
    const parametros: unknown[] = [];
    const condiciones = patrones.map((patron) => {
      parametros.push(patron);
      const n = parametros.length;
      return `(l.busqueda LIKE $${n} OR EXISTS (
        SELECT 1 FROM catalogo_calles c WHERE c.linea_id = l.id AND c.busqueda LIKE $${n}))`;
    });
    if (comuna) {
      parametros.push(comuna);
      condiciones.push(`EXISTS (SELECT 1 FROM catalogo_calles c WHERE c.linea_id = l.id AND c.comuna = $${parametros.length})`);
    }
    parametros.push(limite);
    return this.baseDatos.consultar<LineaFila>(
      `SELECT ${COLUMNAS}
       FROM catalogo_lineas l
       ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
       ${ORDEN}
       LIMIT $${parametros.length}`,
      parametros,
    );
  }

  /**
   * Lineas con algun punto a menos de radio_m metros. Primero un cuadrado
   * (usa el indice por latitud y longitud) y luego la distancia en metros
   * con la aproximacion equirectangular, precisa a esta escala.
   */
  cercanas(latitud: number, longitud: number, radioM: number): Promise<LineaFila[]> {
    const deltaLatitud = radioM / 111_320;
    const deltaLongitud = radioM / (111_320 * Math.cos((latitud * Math.PI) / 180));
    return this.baseDatos.consultar<LineaFila>(
      `WITH cerca AS (
         SELECT p.linea_id,
                min(sqrt(power((p.latitud::float8 - $1) * 111320, 2) +
                         power((p.longitud::float8 - $2) * 111320 * cos(radians($1)), 2))) AS distancia
         FROM catalogo_puntos p
         WHERE p.latitud BETWEEN $1 - $4 AND $1 + $4
           AND p.longitud BETWEEN $2 - $5 AND $2 + $5
         GROUP BY p.linea_id
       )
       SELECT ${COLUMNAS}, round(cerca.distancia)::int AS distancia_m
       FROM cerca JOIN catalogo_lineas l ON l.id = cerca.linea_id
       WHERE cerca.distancia <= $3
       ORDER BY cerca.distancia, (l.tipo_trazado <> 'principal'), l.numero_linea NULLS LAST
       LIMIT 30`,
      [latitud, longitud, radioM, deltaLatitud, deltaLongitud],
    );
  }

  async buscarPorId(id: number): Promise<LineaFila | null> {
    const filas = await this.baseDatos.consultar<LineaFila>(
      `SELECT ${COLUMNAS} FROM catalogo_lineas l WHERE l.id = $1`,
      [id],
    );
    return filas[0] ?? null;
  }

  calles(id: number): Promise<CalleFila[]> {
    return this.baseDatos.consultar<CalleFila>(
      `SELECT sentido, orden, calle, comuna FROM catalogo_calles
       WHERE linea_id = $1 ORDER BY sentido, orden`,
      [id],
    );
  }

  /** numeric(9,6) llega como texto desde pg: se convierte a float8 en el SQL. */
  puntos(id: number): Promise<PuntoCatalogoFila[]> {
    return this.baseDatos.consultar<PuntoCatalogoFila>(
      `SELECT sentido, orden, latitud::float8 AS latitud, longitud::float8 AS longitud, distancia_acumulada_m
       FROM catalogo_puntos WHERE linea_id = $1 ORDER BY sentido, orden`,
      [id],
    );
  }

  /**
   * Lineas con puntos dentro del recuadro del mapa, primero las que mas
   * recorrido tienen ahi. Usa el indice por latitud y longitud.
   */
  enRecuadro(r: Recuadro, limite: number): Promise<LineaFila[]> {
    return this.baseDatos.consultar<LineaFila>(
      `WITH dentro AS (
         SELECT p.linea_id, count(*) AS puntos
         FROM catalogo_puntos p
         WHERE p.latitud BETWEEN $1 AND $3 AND p.longitud BETWEEN $2 AND $4
         GROUP BY p.linea_id
         ORDER BY count(*) DESC, p.linea_id
         LIMIT $5
       )
       SELECT ${COLUMNAS}
       FROM dentro JOIN catalogo_lineas l ON l.id = dentro.linea_id
       ORDER BY dentro.puntos DESC, l.id`,
      [r.sur, r.oeste, r.norte, r.este, limite],
    );
  }

  /** Puntos de esas lineas dentro del recuadro, en orden por linea y sentido. */
  puntosEnRecuadro(lineas: number[], r: Recuadro): Promise<PuntoMapaFila[]> {
    return this.baseDatos.consultar<PuntoMapaFila>(
      `SELECT linea_id, sentido, orden, latitud::float8 AS latitud, longitud::float8 AS longitud
       FROM catalogo_puntos
       WHERE linea_id = ANY($1::int[])
         AND latitud BETWEEN $2 AND $4 AND longitud BETWEEN $3 AND $5
       ORDER BY linea_id, sentido, orden`,
      [lineas, r.sur, r.oeste, r.norte, r.este],
    );
  }

  comunas(): Promise<{ comuna: string; lineas: number }[]> {
    return this.baseDatos.consultar<{ comuna: string; lineas: number }>(
      `SELECT comuna, count(DISTINCT linea_id)::int AS lineas
       FROM catalogo_calles GROUP BY comuna ORDER BY comuna`,
    );
  }
}
