import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialogo } from '../src/comun/componentes/Dialogo';
import { CampoClave } from '../src/comun/componentes/Formulario';
import { Asientos, Letrero } from '../src/comun/componentes/Letrero';

afterEach(cleanup);

describe('Asientos', () => {
  it('usa el color del nivel y el texto correcto', () => {
    const { container, rerender } = render(<Asientos cantidad={3} />);
    expect(container.firstElementChild?.getAttribute('data-nivel')).toBe('disponible');
    expect(container.textContent).toBe('3libres');
    rerender(<Asientos cantidad={1} />);
    expect(container.firstElementChild?.getAttribute('data-nivel')).toBe('ultimo');
    rerender(<Asientos cantidad={0} />);
    expect(container.textContent).toBe('Completo');
  });
});

describe('Letrero', () => {
  it('muestra el codigo y el destino del recorrido', () => {
    render(<Letrero codigo="9001" destino="Hospital Sótero del Río" detalle="Desde Plaza de Puente Alto" />);
    expect(screen.getByText('9001')).toBeTruthy();
    expect(screen.getByText('Hospital Sótero del Río')).toBeTruthy();
  });
});

function Prueba({ nueva }: { nueva?: boolean }) {
  return <CampoClave valor="corta" alCambiar={() => undefined} nueva={nueva} />;
}

describe('CampoClave', () => {
  it('permite ver la contrasena y volver a ocultarla', () => {
    render(<Prueba />);
    const campo = screen.getByLabelText('Contraseña');
    expect(campo.getAttribute('type')).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }));
    expect(campo.getAttribute('type')).toBe('text');
    expect(screen.getByRole('button', { name: 'Ocultar' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('en una contrasena nueva avisa que es muy corta', () => {
    render(<Prueba nueva />);
    expect(screen.getByText('Muy corta: usa al menos 12 caracteres')).toBeTruthy();
    expect(screen.getByLabelText('Contraseña').getAttribute('autocomplete')).toBe('new-password');
  });

  it('con un minimo de 15 (representantes) una de 14 sigue siendo muy corta', () => {
    render(<CampoClave valor="trompo-nube-14" alCambiar={() => undefined} nueva minimo={15} />);
    expect(screen.getByText('Muy corta: usa al menos 15 caracteres')).toBeTruthy();
    expect(screen.getByLabelText('Contraseña').getAttribute('minlength')).toBe('15');
  });
});

describe('Dialogo', () => {
  // jsdom no implementa showModal ni close: se imitan como en el navegador,
  // donde close() siempre dispara el evento «close».
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };

  it('cerrarla desde el codigo (por ejemplo al «Aceptar») no cuenta como que la persona la cerro', () => {
    const alCerrar = vi.fn();
    const { rerender } = render(
      <Dialogo abierto titulo="¿Nos dejas usar tu ubicación?" alCerrar={alCerrar}>
        <p>Contenido</p>
      </Dialogo>,
    );
    rerender(
      <Dialogo abierto={false} titulo="¿Nos dejas usar tu ubicación?" alCerrar={alCerrar}>
        <p>Contenido</p>
      </Dialogo>,
    );
    expect(alCerrar).not.toHaveBeenCalled();
  });

  it('cerrarla con Escape avisa una vez', () => {
    const alCerrar = vi.fn();
    render(
      <Dialogo abierto titulo="Califica tu viaje" alCerrar={alCerrar}>
        <p>Contenido</p>
      </Dialogo>,
    );
    // Escape: el navegador cierra el <dialog> sin pasar por React.
    screen.getByRole('dialog', { hidden: true }).closest('dialog')?.close();
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });
});
