import { describe, expect, it } from 'vitest';
import { distanciaMetros, puntoEnRecorrido } from '../src/comun/geo';

describe('distanciaMetros', () => {
  it('es cero para el mismo punto', () => {
    expect(distanciaMetros({ latitud: -33.6, longitud: -70.57 }, { latitud: -33.6, longitud: -70.57 })).toBe(0);
  });

  it('un grado de latitud mide cerca de 111 km', () => {
    const d = distanciaMetros({ latitud: -33, longitud: -70 }, { latitud: -34, longitud: -70 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_500);
  });
});

describe('puntoEnRecorrido', () => {
  const recorrido = [
    { orden: 1, latitud: -33.6, longitud: -70.5, distancia_acumulada_m: 0 },
    { orden: 2, latitud: -33.5, longitud: -70.5, distancia_acumulada_m: 1000 },
    { orden: 3, latitud: -33.5, longitud: -70.4, distancia_acumulada_m: 2000 },
  ];

  it('interpola dentro del tramo que corresponde', () => {
    const punto = puntoEnRecorrido(recorrido, 500);
    expect(punto?.latitud).toBeCloseTo(-33.55);
    expect(punto?.longitud).toBeCloseTo(-70.5);
    expect(puntoEnRecorrido(recorrido, 1500)?.longitud).toBeCloseTo(-70.45);
  });

  it('se queda en el final si la distancia lo supera y devuelve null sin recorrido', () => {
    expect(puntoEnRecorrido(recorrido, 9000)).toEqual({ latitud: -33.5, longitud: -70.4 });
    expect(puntoEnRecorrido([], 100)).toBeNull();
  });
});
