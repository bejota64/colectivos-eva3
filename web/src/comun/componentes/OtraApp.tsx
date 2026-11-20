/**
 * Cada app atiende solo a sus perfiles. Si alguien entra con una cuenta de
 * otro perfil (por ejemplo, un conductor en la app del pasajero), se le
 * indica cual es su app en vez de mostrar pantallas que la API le negaria.
 */
import type { Rol } from '../tipos';
import { useSesion } from '../sesion';

const APP_DEL_ROL: Record<Rol, { nombre: string; ruta: string }> = {
  pasajero: { nombre: 'la app del pasajero', ruta: '/' },
  conductor: { nombre: 'la app del conductor', ruta: '/conductor/' },
  representante: { nombre: 'el panel del trazado', ruta: '/panel/' },
  administrador: { nombre: 'el panel del trazado', ruta: '/panel/' },
};

const NOMBRE_ROL: Record<Rol, string> = {
  pasajero: 'pasajero',
  conductor: 'conductor',
  representante: 'representante del trazado',
  administrador: 'administrador',
};

export function OtraApp({ rol, oscura }: { rol: Rol; oscura?: boolean }) {
  const { salir } = useSesion();
  const destino = APP_DEL_ROL[rol];
  return (
    <main className={`otra-app${oscura ? ' otra-app-oscura' : ''}`}>
      <div className="otra-app-tarjeta">
        <h1>Esta app no es para tu cuenta</h1>
        <p>
          Entraste como {NOMBRE_ROL[rol]}. Tus herramientas están en {destino.nombre}.
        </p>
        <a className="boton boton-principal boton-ancho" href={destino.ruta}>
          Ir a {destino.nombre}
        </a>
        <button type="button" className="boton boton-texto" onClick={() => void salir()}>
          Entrar con otra cuenta
        </button>
      </div>
    </main>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="cargando" role="status">
      <span className="cargando-letrero" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  );
}
