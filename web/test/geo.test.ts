import { describe, expect, it } from 'vitest';
import {
  distanciaAlRecorridoM,
  distanciaMetros,
  esCuentaDemo,
  lineasTocadas,
  navegadorDeApp,
  puntoDemostracion,
  puntoEnRecorrido,
  recuadroEnGrilla,
} from '../src/comun/geo';
import type { Coordenada, PuntoRuta } from '../src/comun/tipos';

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

describe('recuadroEnGrilla', () => {
  it('agranda el recuadro hasta la grilla y da el mismo al mover un poco el mapa', () => {
    const a = recuadroEnGrilla({ sur: -33.6234, oeste: -70.5912, norte: -33.5871, este: -70.5603 });
    const b = recuadroEnGrilla({ sur: -33.6221, oeste: -70.5901, norte: -33.5862, este: -70.5611 });
    expect(a).toEqual({ sur: -33.63, oeste: -70.6, norte: -33.58, este: -70.56 });
    expect(b).toEqual(a);
  });
});

// Proyeccion de prueba: 1 grado = 10 000 px (0,0001 grados = 1 px).
const proyectar = ([lat, lon]: Coordenada) => ({ x: (lon + 70.6) * 10_000, y: (-33.5 - lat) * 10_000 });

describe('lineasTocadas', () => {
  const vertical = { id: 1, tramos: [{ puntos: [[-33.6, -70.58], [-33.59, -70.58]] as Coordenada[] }] };
  const paralela = { id: 2, tramos: [{ puntos: [[-33.6, -70.5795], [-33.59, -70.5795]] as Coordenada[] }] };
  const lejana = { id: 3, tramos: [{ puntos: [[-33.6, -70.57], [-33.59, -70.57]] as Coordenada[] }] };

  it('encuentra las lineas cerca del toque, la mas cercana primero', () => {
    // A 2 px de la vertical y a 3 px de la paralela (van por la misma avenida).
    const toque = proyectar([-33.595, -70.5798]);
    expect(lineasTocadas([lejana, paralela, vertical], toque, proyectar).map((l) => l.id)).toEqual([1, 2]);
  });

  it('no devuelve nada si se toca lejos de todas', () => {
    expect(lineasTocadas([vertical, lejana], proyectar([-33.595, -70.575]), proyectar)).toEqual([]);
  });

  it('mide la distancia al segmento, no solo a los puntos', () => {
    // Entre los dos puntos de la linea, a 1 px de ella: lejos de ambos extremos.
    expect(lineasTocadas([vertical], proyectar([-33.595, -70.5801]), proyectar, 4)).toEqual([vertical]);
  });
});

describe('ubicacion respecto del recorrido', () => {
  // Dos puntos a 1 km uno del otro, en linea recta hacia el norte (como el 9001, con puntos lejanos).
  const recorrido = [
    { latitud: -33.61, longitud: -70.58, distancia_acumulada_m: 0 },
    { latitud: -33.601, longitud: -70.58, distancia_acumulada_m: 1000 },
  ] as PuntoRuta[];

  it('mide la distancia al tramo, aunque los puntos guardados esten lejos', () => {
    // En la mitad del tramo, 100 m al oriente: lejos de los dos puntos, pero a 100 m del recorrido.
    const cerca = { latitud: -33.6055, longitud: -70.58 + 100 / (111_320 * Math.cos((33.6055 * Math.PI) / 180)) };
    expect(distanciaAlRecorridoM(cerca, recorrido)).toBeCloseTo(100, 0);
    expect(distanciaMetros(cerca, recorrido[0] as PuntoRuta)).toBeGreaterThan(400);
    // Santiago centro queda a mas de 15 km.
    expect(distanciaAlRecorridoM({ latitud: -33.4521, longitud: -70.6536 }, recorrido)).toBeGreaterThan(15_000);
    expect(distanciaAlRecorridoM({ latitud: -33.6, longitud: -70.58 }, [])).toBe(Infinity);
  });

  it('la ubicacion de demostracion es la mitad del recorrido, solo para cuentas de la demo', () => {
    expect(puntoDemostracion(recorrido)).toEqual({ latitud: -33.6055, longitud: -70.58 });
    expect(puntoDemostracion([])).toBeNull();
    expect(esCuentaDemo('pasajero1@colectivos.ejemplo.cl')).toBe(true);
    expect(esCuentaDemo(' Pasajero1@Colectivos.Ejemplo.cl ')).toBe(true);
    expect(esCuentaDemo('alguien@gmail.com')).toBe(false);
  });

  it('reconoce el navegador interno de Instagram y Facebook, no Chrome', () => {
    expect(navegadorDeApp('Mozilla/5.0 (Linux; Android 14) ... Instagram 350.0.0.0 Android')).toBe('Instagram');
    expect(navegadorDeApp('Mozilla/5.0 ... [FBAN/FB4A;FBAV/450.0.0;]')).toBe('Facebook');
    expect(navegadorDeApp('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36')).toBeNull();
  });
});
