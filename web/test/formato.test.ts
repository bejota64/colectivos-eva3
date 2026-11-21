import { describe, expect, it } from 'vitest';
import {
  formatoDistancia,
  formatoDuracion,
  formatoHora,
  formatoNota,
  formatoPesos,
  fortalezaClave,
  horaCorta,
  hoyEnChile,
  iniciales,
  nombreCorto,
  nivelAsientos,
  nombreTramo,
  primerNombre,
  textoAsientos,
} from '../src/comun/formato';

describe('formatos para Chile', () => {
  it('muestra pesos chilenos sin decimales y con punto de miles', () => {
    expect(formatoPesos(1500)).toBe('$1.500');
    expect(formatoPesos(1000)).toBe('$1.000');
  });

  it('muestra la hora de Chile aunque la fecha venga en UTC', () => {
    // 21:40 UTC del 17 de noviembre = 18:40 en Chile (horario de verano, UTC-3)
    expect(formatoHora('2026-11-17T21:40:00.000Z')).toBe('18:40');
  });

  it('calcula el dia de hoy en Chile, no en UTC', () => {
    // 01:30 UTC del 18 todavia es el 17 en Chile
    expect(hoyEnChile(new Date('2026-11-18T01:30:00.000Z'))).toBe('2026-11-17');
  });

  it('formatea distancias, duraciones y notas', () => {
    expect(formatoDistancia(344)).toBe('340 m');
    expect(formatoDistancia(1630)).toBe('1,6 km');
    expect(formatoDuracion(45 * 60_000)).toBe('45 min');
    expect(formatoDuracion(134 * 60_000)).toBe('2 h 14 min');
    expect(formatoDuracion(120 * 60_000)).toBe('2 h');
    expect(formatoNota(4.6)).toBe('4,6');
    expect(formatoNota(null)).toBe('Sin notas');
  });

  it('recorta la hora de PostgreSQL y numera los tramos desde 1', () => {
    expect(horaCorta('22:00:00')).toBe('22:00');
    expect(horaCorta(null)).toBe('');
    expect(nombreTramo(0)).toBe('Tramo 1');
  });
});

describe('asientos', () => {
  it('clasifica el nivel igual que los colores del mapa', () => {
    expect(nivelAsientos(0)).toBe('completo');
    expect(nivelAsientos(1)).toBe('ultimo');
    expect(nivelAsientos(3)).toBe('disponible');
  });

  it('usa singular y plural', () => {
    expect(textoAsientos(0)).toBe('Completo');
    expect(textoAsientos(1)).toBe('1 asiento');
    expect(textoAsientos(4)).toBe('4 asientos');
  });
});

describe('nombres', () => {
  it('saca iniciales del primer nombre y el ultimo apellido', () => {
    expect(iniciales('Camila Rojas Soto')).toBe('CS');
    expect(iniciales('Héctor')).toBe('H');
    expect(primerNombre('  Pedro Muñoz Díaz ')).toBe('Pedro');
  });
});

describe('fortaleza de la contrasena', () => {
  it('bajo 12 caracteres siempre es debil, como exige la API', () => {
    expect(fortalezaClave('')).toBe(0);
    expect(fortalezaClave('Ab1!Ab1!')).toBe(1);
  });

  it('premia el largo y la variedad', () => {
    expect(fortalezaClave('unafraselarga')).toBe(2);
    expect(fortalezaClave('Una frase larga 26')).toBe(4);
  });
});

describe('nombre corto del sentido', () => {
  it('usa la primera palabra del destino con su articulo', () => {
    expect(nombreCorto('Hospital Sótero del Río')).toBe('Al Hospital');
    expect(nombreCorto('Plaza de Puente Alto')).toBe('A la Plaza');
    expect(nombreCorto('Estación Las Mercedes')).toBe('A la Estación');
  });

  it('no confunde palabras masculinas terminadas en a', () => {
    expect(nombreCorto('Sistema de buses')).toBe('Al Sistema');
  });
});
