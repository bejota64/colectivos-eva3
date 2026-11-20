/**
 * Ventana modal sobre el elemento <dialog> del navegador: atrapa el foco,
 * se cierra con Escape y anuncia el titulo a los lectores de pantalla sin
 * codigo extra. En el celular se muestra como hoja que sube desde abajo.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  abierto: boolean;
  alCerrar(): void;
  titulo: string;
  descripcion?: ReactNode;
  children: ReactNode;
  /** "hoja" en las apps de celular; "centro" en el panel. */
  forma?: 'hoja' | 'centro';
  ancho?: 'normal' | 'amplio';
}

export function Dialogo({ abierto, alCerrar, titulo, descripcion, children, forma = 'hoja', ancho = 'normal' }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  // Si la ventana la cierra quien la abrio (abierto = false), el evento
  // «close» del navegador no debe volver a avisar como si la persona la
  // hubiera cerrado: «Aceptar» terminaria contado tambien como «Ahora no».
  const sigueAbierta = useRef(abierto);

  useEffect(() => {
    const dialogo = ref.current;
    sigueAbierta.current = abierto;
    if (!dialogo) return;
    if (abierto && !dialogo.open) {
      if (typeof dialogo.showModal === 'function') dialogo.showModal();
      else dialogo.setAttribute('open', '');
    } else if (!abierto && dialogo.open) {
      if (typeof dialogo.close === 'function') dialogo.close();
      else dialogo.removeAttribute('open');
    }
  }, [abierto]);

  // Un clic en el fondo oscuro (fuera del contenido) cierra la ventana. Con
  // teclado, Escape la cierra: lo hace el propio elemento <dialog>.
  const cerrar = useRef(alCerrar);
  useEffect(() => {
    cerrar.current = alCerrar;
  });
  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    const alHacerClic = (evento: MouseEvent) => {
      if (evento.target === dialogo) cerrar.current();
    };
    dialogo.addEventListener('click', alHacerClic);
    return () => dialogo.removeEventListener('click', alHacerClic);
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialogo dialogo-${forma} dialogo-${ancho}`}
      aria-labelledby={`${id}-titulo`}
      onClose={() => {
        // Solo cuando la cierra la persona (Escape); ver «sigueAbierta».
        if (sigueAbierta.current) cerrar.current();
      }}
    >
      {abierto && (
        <div className="dialogo-contenido">
          <header className="dialogo-cabecera">
            <h2 id={`${id}-titulo`}>{titulo}</h2>
            <button type="button" className="boton boton-icono boton-secundario" onClick={alCerrar} aria-label="Cerrar">
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          {descripcion && <div className="dialogo-descripcion">{descripcion}</div>}
          {children}
        </div>
      )}
    </dialog>
  );
}
