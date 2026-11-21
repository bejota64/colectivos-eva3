import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CalleFila,
  CatalogoRepositorio,
  type LineaFila,
  type PuntoCatalogoFila,
  type PuntoMapaFila,
  type Recuadro,
} from './catalogo.repositorio';

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

// ---------------------------------------------------------------------
// Lineas en el mapa principal
// ---------------------------------------------------------------------

/** Lado maximo del recuadro (unos 25 km): mas lejos las lineas ya no se distinguen. */
export const LADO_MAXIMO_GRADOS = 0.25;
/** Lineas por respuesta; si pasan mas por la zona, se avisa con «recortado». */
export const LIMITE_LINEAS_MAPA = 100;
/** Margen alrededor del recuadro: los puntos del catalogo estan cada ~90 m, asi la linea llega al borde. */
const MARGEN_M = 200;
const METROS_POR_GRADO = 111_320;

/** [latitud, longitud] */
export type Coordenada = [number, number];

export interface TramoMapa {
  sentido: 'ida' | 'vuelta';
  puntos: Coordenada[];
}

export type LineaMapa = LineaResumen & { tramos: TramoMapa[] };

export interface MapaCatalogo {
  lineas: LineaMapa[];
  recortado: boolean;
}

/** null si el recuadro sirve; si no, el motivo para la persona. */
export function revisarRecuadro(r: Recuadro): string | null {
  if (r.sur >= r.norte || r.oeste >= r.este) return 'El recuadro del mapa no es valido';
  if (r.norte - r.sur > LADO_MAXIMO_GRADOS || r.este - r.oeste > LADO_MAXIMO_GRADOS) {
    return 'Acerca el mapa para ver las lineas';
  }
  return null;
}

function cosenoLatitud(r: Recuadro): number {
  return Math.cos((((r.sur + r.norte) / 2) * Math.PI) / 180);
}

/** El recuadro con un margen en metros por cada lado. */
export function ampliar(r: Recuadro, metros: number): Recuadro {
  const latitud = metros / METROS_POR_GRADO;
  const longitud = metros / (METROS_POR_GRADO * cosenoLatitud(r));
  return { sur: r.sur - latitud, oeste: r.oeste - longitud, norte: r.norte + latitud, este: r.este + longitud };
}

/** Cuanto se puede simplificar la linea sin que se note: ~1/800 del ancho visible, entre 5 y 30 m. */
export function toleranciaPara(r: Recuadro): number {
  const ancho = (r.este - r.oeste) * METROS_POR_GRADO * cosenoLatitud(r);
  return Math.min(30, Math.max(5, ancho / 800));
}

/** Distancia en metros del punto p al segmento a-b (coordenadas planas en metros). */
function distanciaASegmento(p: Coordenada, a: Coordenada, b: Coordenada): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const largo2 = dx * dx + dy * dy;
  const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / largo2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Douglas-Peucker: quita los puntos que se desvian menos de toleranciaM de
 * la linea recta entre sus vecinos conservados (en una calle recta quedan
 * solo las esquinas donde dobla). Siempre conserva el primero y el ultimo.
 */
export function simplificar(puntos: Coordenada[], toleranciaM: number): Coordenada[] {
  if (puntos.length <= 2) return puntos;
  const coseno = Math.cos(((puntos[0]?.[0] ?? 0) * Math.PI) / 180);
  const planos: Coordenada[] = puntos.map(([lat, lon]) => [lon * METROS_POR_GRADO * coseno, lat * METROS_POR_GRADO]);
  const conservar = Array.from({ length: puntos.length }, () => false);
  conservar[0] = true;
  conservar[puntos.length - 1] = true;
  const pendientes: [number, number][] = [[0, puntos.length - 1]];
  while (pendientes.length > 0) {
    const [inicio, fin] = pendientes.pop() as [number, number];
    let mayor = 0;
    let indice = -1;
    for (let i = inicio + 1; i < fin; i++) {
      const d = distanciaASegmento(planos[i] as Coordenada, planos[inicio] as Coordenada, planos[fin] as Coordenada);
      if (d > mayor) {
        mayor = d;
        indice = i;
      }
    }
    if (indice !== -1 && mayor > toleranciaM) {
      conservar[indice] = true;
      pendientes.push([inicio, indice], [indice, fin]);
    }
  }
  return puntos.filter((_, i) => conservar[i]);
}

const redondear = ([lat, lon]: Coordenada): Coordenada => [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5];

/**
 * Pedazos de la linea dentro del recuadro: puntos seguidos del mismo
 * sentido (si la linea sale del recuadro y vuelve a entrar, son dos
 * tramos). Recibe los puntos ordenados por sentido y orden.
 */
export function tramos(puntos: Pick<PuntoMapaFila, 'sentido' | 'orden' | 'latitud' | 'longitud'>[], toleranciaM: number): TramoMapa[] {
  const resultado: TramoMapa[] = [];
  let actual: { sentido: 'ida' | 'vuelta'; ultimo: number; puntos: Coordenada[] } | null = null;
  const cerrar = () => {
    if (actual && actual.puntos.length > 1) {
      resultado.push({ sentido: actual.sentido, puntos: simplificar(actual.puntos, toleranciaM).map(redondear) });
    }
  };
  for (const p of puntos) {
    if (!actual || p.sentido !== actual.sentido || p.orden !== actual.ultimo + 1) {
      cerrar();
      actual = { sentido: p.sentido, ultimo: p.orden, puntos: [] };
    }
    actual.puntos.push([p.latitud, p.longitud]);
    actual.ultimo = p.orden;
  }
  cerrar();
  return resultado;
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

  /** Lineas del catalogo que pasan por el recuadro visible del mapa, recortadas y simplificadas. */
  async mapa(recuadro: Recuadro): Promise<MapaCatalogo> {
    const motivo = revisarRecuadro(recuadro);
    if (motivo) throw new BadRequestException(motivo);
    const filas = await this.catalogo.enRecuadro(recuadro, LIMITE_LINEAS_MAPA + 1);
    const visibles = filas.slice(0, LIMITE_LINEAS_MAPA);
    if (visibles.length === 0) return { lineas: [], recortado: false };

    const puntos = await this.catalogo.puntosEnRecuadro(
      visibles.map((f) => f.id),
      ampliar(recuadro, MARGEN_M),
    );
    const porLinea = new Map<number, PuntoMapaFila[]>();
    for (const p of puntos) {
      const lista = porLinea.get(p.linea_id) ?? [];
      lista.push(p);
      porLinea.set(p.linea_id, lista);
    }
    const tolerancia = toleranciaPara(recuadro);
    return {
      recortado: filas.length > LIMITE_LINEAS_MAPA,
      lineas: visibles.map((fila) => ({ ...resumir(fila), tramos: tramos(porLinea.get(fila.id) ?? [], tolerancia) })),
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
