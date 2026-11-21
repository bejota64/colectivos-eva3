/**
 * El letrero amarillo del techo del colectivo es la identidad visual de las
 * tres apps: es lo primero que busca alguien que espera en la calle.
 */
import type { ReactNode } from 'react';

interface PropsLetrero {
  codigo: string;
  destino?: string;
  detalle?: string;
  chico?: boolean;
  className?: string;
}

export function Letrero({ codigo, destino, detalle, chico, className }: PropsLetrero) {
  const clases = ['letrero', chico ? 'letrero-chico' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <span className={clases}>
      <span className="letrero-numero">{codigo}</span>
      {destino && (
        <span className="letrero-texto">
          <b>{destino}</b>
          {detalle && <span>{detalle}</span>}
        </span>
      )}
    </span>
  );
}

/** Placa patente chilena. */
export function Patente({ children }: { children: ReactNode }) {
  return <span className="patente">{children}</span>;
}

/** Nombre de la app junto al letrero, en la cabecera y en el acceso. */
export function Marca({ app, oscura }: { app: string; oscura?: boolean }) {
  return (
    <span className={`marca${oscura ? ' marca-oscura' : ''}`}>
      <span className="letrero letrero-chico">
        <span className="letrero-numero">Colectivos</span>
      </span>
      <span className="marca-app">{app}</span>
    </span>
  );
}

/** Asientos libres con el color del nivel: verde, ambar (el ultimo) o rojo. */
export function Asientos({ cantidad }: { cantidad: number }) {
  const nivel = cantidad <= 0 ? 'completo' : cantidad === 1 ? 'ultimo' : 'disponible';
  return (
    <span className="asientos" data-nivel={nivel}>
      {cantidad <= 0 ? (
        'Completo'
      ) : (
        <>
          <b>{cantidad}</b>
          {cantidad === 1 ? 'libre' : 'libres'}
        </>
      )}
    </span>
  );
}
