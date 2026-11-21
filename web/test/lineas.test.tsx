import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LineaCatalogo, Trazado } from '../src/comun/tipos';
import { FichaLinea, ListaLineas, textoSentido, trazadoDeLinea } from '../src/pasajero/Lineas';

afterEach(cleanup);

const LINEA: LineaCatalogo = {
  id: 351,
  nombre: 'Línea 4001',
  numero_linea: '4001',
  empresa: 'COPAC LTDA.',
  tipo_servicio: 'urbano',
  variante: 'T',
  alternativo: false,
  circular: false,
  desde: 'Los Lirios',
  hasta: 'Plaza de Puente Alto',
  comunas: ['Puente Alto', 'La Florida'],
  tiene_trazado: true,
};

const TRAZADO: Trazado = {
  id: 't1',
  codigo: '4001',
  nombre: 'Los Lirios - Plaza',
  comuna: 'Puente Alto',
  sentidos: [],
};

describe('trazadoDeLinea', () => {
  it('reconoce la linea que ya usa la app por su numero, sin importar mayusculas ni espacios', () => {
    expect(trazadoDeLinea([TRAZADO], '4001')).toBe(TRAZADO);
    expect(trazadoDeLinea([{ ...TRAZADO, codigo: 'e01 ' }], 'E01')).not.toBeNull();
    expect(trazadoDeLinea([TRAZADO], '4002')).toBeNull();
    expect(trazadoDeLinea([TRAZADO], null)).toBeNull();
  });
});

describe('textoSentido', () => {
  it('dice hacia donde va cada sentido, y si es circular', () => {
    expect(textoSentido(LINEA, 'ida', ['ida', 'vuelta'])).toBe('Ida: hacia Plaza de Puente Alto');
    expect(textoSentido(LINEA, 'vuelta', ['ida', 'vuelta'])).toBe('Vuelta: hacia Los Lirios');
    expect(textoSentido({ ...LINEA, circular: true }, 'ida', ['ida'])).toBe('Recorrido circular desde Los Lirios');
  });
});

describe('FichaLinea', () => {
  it('muestra ida y vuelta, por donde pasa y que aun no usa la app', () => {
    render(
      <MemoryRouter>
        <FichaLinea linea={LINEA} sentidos={['ida', 'vuelta']} enApp={false} listo alVerEnMapa={() => undefined} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Ida: hacia Plaza de Puente Alto')).toBeTruthy();
    expect(screen.getByText('Vuelta: hacia Los Lirios')).toBeTruthy();
    expect(screen.getByText(/COPAC LTDA\. Pasa por Puente Alto y La Florida\./)).toBeTruthy();
    expect(screen.getByText(/todavía no usa la aplicación/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Calles por donde pasa' }).getAttribute('href')).toBe('/recorridos/351');
  });

  it('si la linea usa la app ofrece ver sus colectivos', () => {
    const alVerColectivos = vi.fn();
    render(
      <MemoryRouter>
        <FichaLinea linea={LINEA} sentidos={null} enApp listo={false} alVerEnMapa={() => undefined} alVerColectivos={alVerColectivos} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ver sus colectivos' }));
    expect(alVerColectivos).toHaveBeenCalledOnce();
    // Mientras llega el recorrido completo no se puede encuadrar.
    expect(screen.getByRole('button', { name: 'Cargando el recorrido…' }).hasAttribute('disabled')).toBe(true);
  });
});

describe('ListaLineas', () => {
  it('lista numero, desde y hasta, y avisa cual se eligio', () => {
    const alElegir = vi.fn();
    render(
      <ListaLineas
        lineas={[LINEA, { ...LINEA, id: 9, numero_linea: null, desde: 'A', hasta: 'B', alternativo: true, comunas: ['Puente Alto'] }]}
        alElegir={alElegir}
      />,
    );
    expect(screen.getByText('4001')).toBeTruthy();
    // Dos trazados de la misma linea no se confunden: el alternativo lo dice.
    expect(screen.getByText('Trazado alternativo. Puente Alto')).toBeTruthy();
    fireEvent.click(screen.getByText('A – B'));
    expect(alElegir).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
  });
});
