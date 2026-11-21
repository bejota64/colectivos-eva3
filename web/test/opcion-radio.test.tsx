import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { OpcionRadio } from '../src/comun/componentes/OpcionRadio';

afterEach(cleanup);

function Grupo() {
  const [elegida, setElegida] = useState(2);
  return (
    <div role="radiogroup" aria-label="Personas">
      {[1, 2, 3, 4].map((n) => (
        <OpcionRadio key={n} marcada={elegida === n} alElegir={() => setElegida(n)}>
          {n}
        </OpcionRadio>
      ))}
    </div>
  );
}

describe('OpcionRadio', () => {
  it('es un grupo de radio para los lectores de pantalla, hecho con botones (no abre el teclado en Android)', () => {
    render(<Grupo />);
    const opciones = screen.getAllByRole('radio');
    expect(opciones).toHaveLength(4);
    expect(opciones.every((o) => o.tagName === 'BUTTON')).toBe(true);
    expect(screen.getByRole('radio', { name: '2' }).getAttribute('aria-checked')).toBe('true');
    // Solo la marcada entra con Tab.
    expect(opciones.map((o) => o.tabIndex)).toEqual([-1, 0, -1, -1]);
  });

  it('se elige tocando y se mueve con las flechas, Inicio y Fin, como un radio nativo', () => {
    render(<Grupo />);
    fireEvent.click(screen.getByRole('radio', { name: '4' }));
    expect(screen.getByRole('radio', { name: '4' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(screen.getByRole('radio', { name: '4' }), { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: '1' }).getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '1' }));
    fireEvent.keyDown(screen.getByRole('radio', { name: '1' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('radio', { name: '4' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(screen.getByRole('radio', { name: '4' }), { key: 'Home' });
    expect(screen.getByRole('radio', { name: '1' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(screen.getByRole('radio', { name: '1' }), { key: 'End' });
    expect(screen.getByRole('radio', { name: '4' }).getAttribute('aria-checked')).toBe('true');
  });
});
