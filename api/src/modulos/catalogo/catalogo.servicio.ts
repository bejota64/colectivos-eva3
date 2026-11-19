import { Injectable, NotFoundException } from '@nestjs/common';
import { type CalleFila, CatalogoRepositorio, type LineaFila, type PuntoCatalogoFila } from './catalogo.repositorio';

/** Igual que la funcion texto_busqueda() de la base: minusculas y sin tildes. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Patron para LIKE: %, _ y \ son comodines o escape en SQL, asi que se
 * escapan para que alguien que escribe «100%» busque eso y no «cualquier cosa».
 */
export function patron(palabra: string): string {
  return `%${palabra.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Hasta 4 palabras de 2 letras o mas: «av concha y toro» -> ["av", "concha", "toro"]. */
export function palabras(buscar: string | undefined): string[] {
  if (!buscar) return [];
  return normalizar(buscar)
    .split(' ')
    .filter((p) => p.length >= 2)
    .slice(0, 4);
}

/**
 * El registro describe los terminales con frases largas: «Circunvalacion:
 * Doctor Eduardo Cordero Altura Av. Concha y Toro». Para una lista basta
 * con «Doctor Eduardo Cordero».
 */
export function lugarCorto(lugar: string | null): string | null {
  if (!lugar) return null;
  const sinPrefijo = lugar.replace(/^circunvalaci[oó]n\s*:\s*/i, '');
  const corto = sinPrefijo.split(/\s+(?:(?:altura|viraje|esquina|frente|retorno)\b|n°|#)|\s*\(/i)[0]?.trim();
  return corto || null;
}

export interface LineaResumen {
  id: number;
  nombre: string;
  numero_linea: string | null;
  empresa: string | null;
  tipo_servicio: 'urbano' | 'rural';
  variante: string;
  alternativo: boolean;
  circular: boolean;
  desde: string;
  hasta: string;
  comunas: string[];
  tiene_trazado: boolean;
  distancia_m?: number;
}

export function resumir(fila: LineaFila): LineaResumen {
  const circular = /^circunvalaci[oó]n/i.test(fila.lugar_destino ?? '');
  const resumen: LineaResumen = {
    id: fila.id,
    nombre: fila.numero_linea ? `Línea ${fila.numero_linea}` : `Folio ${fila.folio}`,
    numero_linea: fila.numero_linea,
    empresa: fila.empresa,
    tipo_servicio: fila.tipo_servicio,
    variante: fila.nombre_recorrido,
    alternativo: fila.tipo_trazado === 'alternativo',
    circular,
    desde: lugarCorto(fila.lugar_origen) ?? fila.primera_calle ?? fila.origen,
    hasta: lugarCorto(fila.lugar_destino) ?? fila.destino,
    comunas: fila.comunas,
    tiene_trazado: fila.tiene_trazado,
  };
  if (fila.distancia_m !== undefined) resumen.distancia_m = fila.distancia_m;
  return resumen;
}

@Injectable()
export class CatalogoServicio {
  constructor(private readonly catalogo: CatalogoRepositorio) {}

  async buscar(buscar: string | undefined, comuna: string | undefined, limite = 30): Promise<LineaResumen[]> {
    const filas = await this.catalogo.buscar(palabras(buscar).map(patron), comuna?.trim() || null, limite);
    return filas.map(resumir);
  }

  async cercanas(latitud: number, longitud: number, radioM = 400): Promise<LineaResumen[]> {
    return (await this.catalogo.cercanas(latitud, longitud, radioM)).map(resumir);
  }

  async detalle(id: number) {
    const fila = await this.catalogo.buscarPorId(id);
    if (!fila) throw new NotFoundException('Linea no encontrada');
    const [calles, puntos] = await Promise.all([this.catalogo.calles(id), this.catalogo.puntos(id)]);
    return {
      ...resumir(fila),
      folio: fila.folio,
      flota_vigente: fila.flota_vigente,
      origen: fila.origen,
      comuna_origen: fila.comuna_origen,
      lugar_origen: fila.lugar_origen,
      destino: fila.destino,
      comuna_destino: fila.comuna_destino,
      lugar_destino: fila.lugar_destino,
      sentidos: agruparSentidos(calles, puntos),
    };
  }

  comunas() {
    return this.catalogo.comunas();
  }
}

/** Calles y puntos de la base, separados por sentido (ida primero). */
export function agruparSentidos(calles: CalleFila[], puntos: PuntoCatalogoFila[]) {
  return (['ida', 'vuelta'] as const)
    .map((sentido) => ({
      sentido,
      calles: calles.filter((c) => c.sentido === sentido).map(({ orden, calle, comuna }) => ({ orden, calle, comuna })),
      puntos: puntos
        .filter((p) => p.sentido === sentido)
        .map(({ latitud, longitud, distancia_acumulada_m }) => ({ latitud, longitud, distancia_acumulada_m })),
    }))
    .filter((s) => s.calles.length > 0 || s.puntos.length > 0);
}
