// Pruebas de los calculos del simulador:  node --test pruebas/simulador/simulador.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  acotar,
  avance,
  avisoParaRecoger,
  correoSimulado,
  esPatenteSimulada,
  largo,
  patenteSimulada,
  puntoEn,
  ubicacionInicial,
} from './simular-colectivos.mjs';

// Tres puntos en linea: 0 m, 400 m y 1000 m.
const recorrido = [
  { latitud: -33.6, longitud: -70.6, distancia_acumulada_m: 0 },
  { latitud: -33.596, longitud: -70.6, distancia_acumulada_m: 400 },
  { latitud: -33.59, longitud: -70.6, distancia_acumulada_m: 1000 },
];

test('el largo es la distancia acumulada del ultimo punto', () => {
  assert.equal(largo(recorrido), 1000);
  assert.equal(largo([]), 0);
});

test('interpola entre puntos guardados lejanos', () => {
  assert.deepEqual(puntoEn(recorrido, 0), { latitud: -33.6, longitud: -70.6 });
  assert.deepEqual(puntoEn(recorrido, 200), { latitud: -33.598, longitud: -70.6 });
  assert.deepEqual(puntoEn(recorrido, 700), { latitud: -33.593, longitud: -70.6 });
});

test('fuera del recorrido se queda en los extremos', () => {
  assert.deepEqual(puntoEn(recorrido, -50), { latitud: -33.6, longitud: -70.6 });
  assert.deepEqual(puntoEn(recorrido, 5000), { latitud: -33.59, longitud: -70.6 });
});

test('a 25 km/h avanza entre 29,5 y 40 m cada 5 s (nunca una velocidad imposible)', () => {
  assert.ok(Math.abs(avance(25, 5, 0) - 29.51) < 0.01);
  assert.ok(Math.abs(avance(25, 5, 0.999) - 39.9) < 0.1);
  // El tope de la API es 150 km/h: aun con la variacion maxima queda lejos.
  assert.ok((avance(25, 5, 0.999) / 5) * 3.6 < 150);
});

test('se detiene por el aviso mas cercano dentro de 60 m, una sola vez por tramo', () => {
  const avisos = [
    { metros_adelante: 300, numero_tramo: 4, personas: 1 },
    { metros_adelante: 40, numero_tramo: 3, personas: 2 },
    { metros_adelante: -20, numero_tramo: 2, personas: 1 },
  ];
  assert.deepEqual(avisoParaRecoger(avisos, new Set()), avisos[1]);
  assert.equal(avisoParaRecoger(avisos, new Set([3])), null);
  assert.equal(avisoParaRecoger([], new Set()), null);
});

test('no se pasa de largo: si en este envio avanza 280 m, considera avisos hasta 340 m', () => {
  const avisos = [{ metros_adelante: 300, numero_tramo: 4, personas: 1 }];
  assert.equal(avisoParaRecoger(avisos, new Set()), null);
  assert.deepEqual(avisoParaRecoger(avisos, new Set(), 280), avisos[0]);
});

test('los asientos libres quedan entre 0 y la capacidad', () => {
  assert.equal(acotar(-1, 4), 0);
  assert.equal(acotar(5, 4), 4);
  assert.equal(acotar(2, 4), 2);
});

test('los autos del simulador tienen patente SIMU y formato valido (BBBB12)', () => {
  assert.equal(patenteSimulada(1), 'SIMU01');
  assert.equal(patenteSimulada(12), 'SIMU12');
  assert.match(patenteSimulada(3), /^([A-Z]{2}[0-9]{4}|[A-Z]{4}[0-9]{2})$/);
  assert.ok(esPatenteSimulada('SIMU07'));
  // Nunca toma un auto de la demo ni uno real.
  assert.ok(!esPatenteSimulada('ZZZZ01'));
  assert.ok(!esPatenteSimulada('SIMU1'));
});

test('cada trazado tiene sus propias cuentas de conductor simulado', () => {
  assert.equal(correoSimulado('9001', 1), 'sim9001-1@colectivos.ejemplo.cl');
  assert.equal(correoSimulado('E-01', 2), 'sime01-2@colectivos.ejemplo.cl');
  assert.notEqual(correoSimulado('9001', 1), 'conductor1@colectivos.ejemplo.cl');
});

test('reparte los autos en ida y vuelta, no todos en el mismo sentido', () => {
  // 9001: 3,7 km de ida y 3,7 km de vuelta.
  const largos = [3700, 3700];
  const autos = [0, 1, 2].map((i) => ubicacionInicial(i, 3, largos));
  assert.deepEqual(autos.map((a) => a.sentido), [0, 0, 1]);
  assert.equal(autos[0].metros, 0);
  assert.ok(Math.abs(autos[1].metros - 2466.7) < 1);
  assert.ok(Math.abs(autos[2].metros - 1233.3) < 1);
  // Con 2 autos, uno en cada sentido.
  assert.deepEqual([0, 1].map((i) => ubicacionInicial(i, 2, largos).sentido), [0, 1]);
  // Un solo auto parte al inicio de la ida.
  assert.deepEqual(ubicacionInicial(0, 1, largos), { sentido: 0, metros: 0 });
});
