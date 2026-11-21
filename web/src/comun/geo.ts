import type { Coordenada, PuntoRuta, Recuadro } from './tipos';

const rad = (grados: number) => (grados * Math.PI) / 180;

/** Distancia en metros entre dos puntos (formula de haversine), igual que en la API. */
export function distanciaMetros(
  a: { latitud: number; longitud: number },
  b: { latitud: number; longitud: number },
): number {
  const radioTierra = 6_371_000;
  const dLat = rad(b.latitud - a.latitud);
  const dLon = rad(b.longitud - a.longitud);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitud)) * Math.cos(rad(b.latitud)) * Math.sin(dLon / 2) ** 2;
  return 2 * radioTierra * Math.asin(Math.sqrt(h));
}

/** Preferencias livianas de este navegador (no datos personales). Nunca fallan. */
export const preferencias = {
  leer(clave: string): string | null {
    try {
      return window.localStorage.getItem(`colectivos.${clave}`);
    } catch {
      return null;
    }
  },
  guardar(clave: string, valor: string | null): void {
    try {
      if (valor === null) window.localStorage.removeItem(`colectivos.${clave}`);
      else window.localStorage.setItem(`colectivos.${clave}`, valor);
    } catch {
      // Navegacion privada o almacenamiento bloqueado: la app funciona igual.
    }
  },
};

/**
 * Punto del recorrido que esta a cierta distancia desde el inicio. Sirve
 * para dibujar las esperas, que la API entrega como distancia sobre la
 * ruta y no como coordenadas (no se exponen ubicaciones de pasajeros).
 */
export function puntoEnRecorrido(recorrido: PuntoRuta[], distanciaM: number): { latitud: number; longitud: number } | null {
  if (recorrido.length === 0) return null;
  for (let i = 1; i < recorrido.length; i++) {
    const a = recorrido[i - 1];
    const b = recorrido[i];
    if (!a || !b) continue;
    if (distanciaM <= b.distancia_acumulada_m) {
      const largo = b.distancia_acumulada_m - a.distancia_acumulada_m;
      const t = largo > 0 ? Math.max(0, (distanciaM - a.distancia_acumulada_m) / largo) : 0;
      return { latitud: a.latitud + (b.latitud - a.latitud) * t, longitud: a.longitud + (b.longitud - a.longitud) * t };
    }
  }
  const ultimo = recorrido[recorrido.length - 1];
  return ultimo ? { latitud: ultimo.latitud, longitud: ultimo.longitud } : null;
}

/** Lado maximo del recuadro que acepta la API para dibujar lineas (unos 25 km). */
export const LADO_MAXIMO_RECUADRO = 0.25;

/**
 * Recuadro agrandado hasta una grilla de 0,01 grados (~1 km). Asi, mover un
 * poco el mapa da el mismo recuadro y no se vuelven a pedir las lineas.
 */
const fijo = (valor: number) => Number(valor.toFixed(4));

export function recuadroEnGrilla(r: Recuadro, paso = 0.01): Recuadro {
  return {
    sur: fijo(Math.floor(r.sur / paso) * paso),
    oeste: fijo(Math.floor(r.oeste / paso) * paso),
    norte: fijo(Math.ceil(r.norte / paso) * paso),
    este: fijo(Math.ceil(r.este / paso) * paso),
  };
}

export interface PuntoPantalla {
  x: number;
  y: number;
}

function distanciaASegmento(p: PuntoPantalla, a: PuntoPantalla, b: PuntoPantalla): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const largo2 = dx * dx + dy * dy;
  const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / largo2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Lineas que pasan a menos de `umbral` pixeles de donde se toco el mapa, la
 * mas cercana primero. En una avenida pasan varias juntas: por eso se
 * devuelven todas y la persona elige. `proyectar` lleva una coordenada a
 * pixeles de la pantalla (en Leaflet, latLngToContainerPoint).
 */
export function lineasTocadas<T extends { id: number; tramos: { puntos: Coordenada[] }[] }>(
  lineas: T[],
  toque: PuntoPantalla,
  proyectar: (coordenada: Coordenada) => PuntoPantalla,
  umbral = 12,
): T[] {
  const cercanas: { linea: T; distancia: number }[] = [];
  for (const linea of lineas) {
    let menor = Infinity;
    for (const tramo of linea.tramos) {
      const pantalla = tramo.puntos.map(proyectar);
      for (let i = 1; i < pantalla.length; i++) {
        menor = Math.min(menor, distanciaASegmento(toque, pantalla[i - 1] as PuntoPantalla, pantalla[i] as PuntoPantalla));
      }
    }
    if (menor <= umbral) cercanas.push({ linea, distancia: menor });
  }
  return cercanas.toSorted((a, b) => a.distancia - b.distancia).map((c) => c.linea);
}

/** Cuentas ficticias de la demostracion: solo ellas pueden simular la ubicacion. */
export function esCuentaDemo(correo: string): boolean {
  return correo.trim().toLowerCase().endsWith('@colectivos.ejemplo.cl');
}

/**
 * Ubicacion de demostracion: la mitad del recorrido del sentido elegido.
 * Sirve para mostrar la app en una sala lejos del recorrido; la pantalla
 * avisa siempre que es simulada.
 */
export function puntoDemostracion(recorrido: PuntoRuta[]): { latitud: number; longitud: number } | null {
  const ultimo = recorrido[recorrido.length - 1];
  if (recorrido.length < 2 || !ultimo) return null;
  return puntoEnRecorrido(recorrido, ultimo.distancia_acumulada_m / 2);
}

/**
 * Navegador interno de otra app (Instagram, Facebook, TikTok): no suele
 * compartir la ubicacion. null si es un navegador normal.
 */
export function navegadorDeApp(agente: string): string | null {
  if (/Instagram/i.test(agente)) return 'Instagram';
  if (/FBAN|FBAV|FB_IAB/.test(agente)) return 'Facebook';
  if (/TikTok|musical_ly|BytedanceWebview/i.test(agente)) return 'TikTok';
  return null;
}

/**
 * Distancia en metros del punto al recorrido (al tramo mas cercano, no solo
 * a sus puntos: en algunos recorridos los puntos estan a cientos de metros).
 * Infinity si el recorrido no tiene tramos.
 */
export function distanciaAlRecorridoM(punto: { latitud: number; longitud: number }, recorrido: PuntoRuta[]): number {
  const metrosPorGrado = 111_320;
  const coseno = Math.cos(rad(punto.latitud));
  const plano = (p: { latitud: number; longitud: number }) => ({
    x: (p.longitud - punto.longitud) * metrosPorGrado * coseno,
    y: (p.latitud - punto.latitud) * metrosPorGrado,
  });
  let menor = Infinity;
  for (let i = 1; i < recorrido.length; i++) {
    const a = recorrido[i - 1];
    const b = recorrido[i];
    if (!a || !b) continue;
    menor = Math.min(menor, distanciaASegmento({ x: 0, y: 0 }, plano(a), plano(b)));
  }
  return menor;
}
