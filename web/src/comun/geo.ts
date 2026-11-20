import type { PuntoRuta } from './tipos';

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
