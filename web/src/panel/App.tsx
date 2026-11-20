/**
 * Panel del representante del trazado y del administrador. Solo entran esos
 * dos perfiles: la app lo revisa para mostrar las pantallas correctas, y la
 * API lo vuelve a exigir en cada ruta (RolesGuard), que es lo que protege.
 */
import { createContext, use, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router';
import {
  Banknote,
  CarFront,
  ChartColumn,
  LayoutDashboard,
  LogOut,
  MessageSquareWarning,
  Route as IconoTrazado,
  ScrollText,
  UsersRound,
} from 'lucide-react';
import { api } from '../comun/api';
import { FormularioAcceso } from '../comun/componentes/FormularioAcceso';
import { Cordillera } from '../comun/componentes/Ilustraciones';
import { Marca } from '../comun/componentes/Letrero';
import { Cargando, OtraApp } from '../comun/componentes/OtraApp';
import { iniciales } from '../comun/formato';
import { useDatos } from '../comun/ganchos';
import { preferencias } from '../comun/geo';
import { useSesion, useUsuario } from '../comun/sesion';
import type { Trazado, TrazadoPropio } from '../comun/tipos';
import { Auditoria } from './secciones/Auditoria';
import { Demanda } from './secciones/Demanda';
import { Flota } from './secciones/Flota';
import { Reportes } from './secciones/Reportes';
import { Representantes } from './secciones/Representantes';
import { Resumen } from './secciones/Resumen';
import { Tarifas } from './secciones/Tarifas';
import { Trazados } from './secciones/Trazados';

export function App() {
  const { estado } = useSesion();
  if (estado.tipo === 'cargando') {
    return <Cargando />;
  }
  if (estado.tipo === 'sin-sesion') {
    return <Acceso />;
  }
  const { rol } = estado.usuario;
  if (rol === 'administrador') {
    return (
      <Marco>
        <Routes>
          <Route path="trazados" element={<Trazados />} />
          <Route path="representantes" element={<Representantes />} />
          <Route path="auditoria" element={<Auditoria />} />
          <Route path="*" element={<Navigate to="/trazados" replace />} />
        </Routes>
      </Marco>
    );
  }
  if (rol === 'representante') {
    return <PanelRepresentante />;
  }
  return <OtraApp rol={rol} />;
}

function Acceso() {
  return (
    <div className="p-acceso">
      <section className="p-acceso-portada">
        <Marca app="Panel" oscura />
        <div className="p-acceso-texto">
          <h1>Tu trazado, en una sola pantalla</h1>
          <ul>
            <li>Dónde van tus colectivos y cuánta gente espera</li>
            <li>Quejas y felicitaciones de los pasajeros</li>
            <li>Tarifas, autos y conductores</li>
          </ul>
        </div>
        <Cordillera className="p-acceso-cordillera" />
      </section>
      <section className="p-acceso-formulario">
        <div className="p-acceso-caja">
          <h2>Entrar al panel</h2>
          <p>Solo para representantes de trazado y administradores.</p>
          <FormularioAcceso />
        </div>
      </section>
    </div>
  );
}

// ---------- Trazado elegido por el representante ----------

interface ContextoTrazado {
  trazado: TrazadoPropio;
  /** Trazado con sus sentidos (para el mapa y los filtros). */
  detalle: Trazado | undefined;
}

const Contexto = createContext<ContextoTrazado | null>(null);

export function useTrazado(): ContextoTrazado {
  const contexto = use(Contexto);
  if (!contexto) throw new Error('useTrazado fuera del panel del representante');
  return contexto;
}

function PanelRepresentante() {
  const mios = useDatos(() => api<TrazadoPropio[]>('/trazados/mios'), 'mios');
  const activos = useDatos(() => api<Trazado[]>('/trazados'), 'activos');
  const [elegido, setElegido] = useState(() => preferencias.leer('trazado-panel'));

  if (mios.error) {
    return (
      <Marco>
        <p className="mensaje mensaje-error">{mios.error}</p>
      </Marco>
    );
  }
  if (!mios.datos) {
    return <Cargando />;
  }
  const trazado = mios.datos.find((t) => t.id === elegido) ?? mios.datos[0];
  if (!trazado) {
    return (
      <Marco>
        <div className="vacio">
          <p>
            <b>No tienes trazados asignados.</b>
          </p>
          <p>Pide al administrador que te asigne como representante de un trazado.</p>
        </div>
      </Marco>
    );
  }
  const detalle = activos.datos?.find((t) => t.id === trazado.id);
  return (
    <Contexto value={{ trazado, detalle }}>
      <Marco
        trazados={mios.datos}
        trazadoId={trazado.id}
        alElegirTrazado={(id) => {
          setElegido(id);
          preferencias.guardar('trazado-panel', id);
        }}
      >
        <Routes>
          <Route path="resumen" element={<Resumen key={trazado.id} />} />
          <Route path="demanda" element={<Demanda key={trazado.id} />} />
          <Route path="reportes" element={<Reportes key={trazado.id} />} />
          <Route path="tarifas" element={<Tarifas key={trazado.id} />} />
          <Route path="flota" element={<Flota key={trazado.id} />} />
          <Route path="*" element={<Navigate to="/resumen" replace />} />
        </Routes>
      </Marco>
    </Contexto>
  );
}

// ---------- Estructura: barra lateral y contenido ----------

const SECCIONES_REPRESENTANTE = [
  { ruta: '/resumen', nombre: 'Resumen', Icono: LayoutDashboard },
  { ruta: '/demanda', nombre: 'Demanda', Icono: ChartColumn },
  { ruta: '/reportes', nombre: 'Reportes', Icono: MessageSquareWarning },
  { ruta: '/tarifas', nombre: 'Tarifas', Icono: Banknote },
  { ruta: '/flota', nombre: 'Flota', Icono: CarFront },
];
const SECCIONES_ADMINISTRADOR = [
  { ruta: '/trazados', nombre: 'Trazados', Icono: IconoTrazado },
  { ruta: '/representantes', nombre: 'Representantes', Icono: UsersRound },
  { ruta: '/auditoria', nombre: 'Auditoría', Icono: ScrollText },
];

function Marco({
  children,
  trazados,
  trazadoId,
  alElegirTrazado,
}: {
  children: ReactNode;
  trazados?: TrazadoPropio[];
  trazadoId?: string;
  alElegirTrazado?(id: string): void;
}) {
  const usuario = useUsuario();
  const { salir } = useSesion();
  const secciones = usuario.rol === 'administrador' ? SECCIONES_ADMINISTRADOR : SECCIONES_REPRESENTANTE;
  const trazado = trazados?.find((t) => t.id === trazadoId);

  return (
    <div className="p-marco">
      <aside className="p-lateral">
        <Marca app="Panel" oscura />
        {trazado && trazados && (
          <div className="p-trazado">
            {trazados.length > 1 ? (
              <label>
                <span className="solo-lector">Trazado</span>
                <select className="p-trazado-selector" value={trazado.id} onChange={(e) => alElegirTrazado?.(e.target.value)}>
                  {trazados.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.codigo} {t.nombre}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <span className="p-trazado-codigo">{trazado.codigo}</span>
                <span className="p-trazado-nombre">
                  {trazado.nombre}
                  <small>{trazado.comuna}</small>
                </span>
              </>
            )}
          </div>
        )}
        <nav className="p-navegacion" aria-label="Secciones">
          {secciones.map(({ ruta, nombre, Icono }) => (
            <NavLink key={ruta} to={ruta} className="p-enlace">
              <Icono size={20} aria-hidden="true" />
              <span>{nombre}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-usuario">
          <span className="avatar">{iniciales(usuario.nombre_completo)}</span>
          <span className="p-usuario-datos">
            <b>{usuario.nombre_completo}</b>
            <span>{usuario.rol === 'administrador' ? 'Administrador' : 'Representante'}</span>
          </span>
          <button type="button" className="p-salir" onClick={() => void salir()} aria-label="Cerrar sesión" title="Cerrar sesión">
            <LogOut size={20} aria-hidden="true" />
          </button>
        </div>
      </aside>
      <main className="p-contenido">{children}</main>
    </div>
  );
}

/** Encabezado de cada seccion: titulo, explicacion breve y acciones a la derecha. */
export function Encabezado({ titulo, detalle, children }: { titulo: string; detalle?: string; children?: ReactNode }) {
  return (
    <header className="p-encabezado">
      <div>
        <h1>{titulo}</h1>
        {detalle && <p>{detalle}</p>}
      </div>
      {children && <div className="p-encabezado-acciones">{children}</div>}
    </header>
  );
}
