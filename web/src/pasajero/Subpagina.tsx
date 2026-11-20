import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';

/** Pagina secundaria (Mis viajes, Mi cuenta) con vuelta al mapa. */
export function Subpagina({ titulo, children, volverA = '/' }: { titulo: string; children: ReactNode; volverA?: string }) {
  return (
    <div className="subpagina">
      <header className="subpagina-barra">
        <Link to={volverA} className="boton boton-icono subpagina-volver" aria-label={volverA === '/' ? 'Volver al mapa' : 'Volver'}>
          <ChevronLeft size={24} aria-hidden="true" />
        </Link>
        <h1>{titulo}</h1>
      </header>
      <main className="subpagina-contenido">{children}</main>
    </div>
  );
}
