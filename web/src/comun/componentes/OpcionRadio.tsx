/**
 * Una opcion de un grupo «elige una» hecha con un boton y no con
 * <input type="radio">: en Android (Chrome y el navegador de Instagram)
 * tocar un radio oculto bajo el dibujo abria el teclado del telefono.
 *
 * Para los lectores de pantalla sigue siendo un grupo de radio: el
 * contenedor lleva role="radiogroup", cada opcion role="radio" con
 * aria-checked, y con las flechas se pasa de una opcion a otra (solo la
 * marcada entra en el orden de la tecla Tab).
 */
import type { KeyboardEvent, ReactNode } from 'react';

const TECLAS: Record<string, number | 'inicio' | 'fin'> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
  Home: 'inicio',
  End: 'fin',
};

/** Flechas, Inicio y Fin: marca la opcion vecina del mismo grupo, como un radio nativo. */
export function moverConFlechas(evento: KeyboardEvent<HTMLButtonElement>) {
  const paso = TECLAS[evento.key];
  if (paso === undefined) return;
  const grupo = evento.currentTarget.closest('[role="radiogroup"]');
  if (!grupo) return;
  const opciones = Array.from(grupo.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)'));
  const actual = opciones.indexOf(evento.currentTarget);
  const siguiente =
    paso === 'inicio' ? 0 : paso === 'fin' ? opciones.length - 1 : (actual + paso + opciones.length) % opciones.length;
  const destino = opciones[siguiente];
  if (!destino) return;
  evento.preventDefault();
  destino.focus();
  destino.click();
}

export function OpcionRadio({
  marcada,
  alElegir,
  enfocable,
  className,
  etiqueta,
  children,
}: {
  marcada: boolean;
  alElegir(): void;
  /** Si ninguna esta marcada, la primera recibe el foco con Tab. */
  enfocable?: boolean;
  className?: string;
  /** Nombre para lectores de pantalla, si el contenido visible no basta. */
  etiqueta?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={marcada}
      aria-label={etiqueta}
      tabIndex={marcada || enfocable ? 0 : -1}
      className={className}
      onClick={alElegir}
      onKeyDown={moverConFlechas}
    >
      {children}
    </button>
  );
}
