/**
 * Sesion compartida por las tres apps.
 *
 * Al abrir la app se intenta renovar la sesion con la cookie de refresco:
 * si la persona ya habia entrado, no tiene que escribir su contrasena de
 * nuevo. Cada app decide despues si el rol de la cuenta puede usarla
 * (la API igual lo vuelve a revisar en cada ruta).
 */
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, cuandoSePierdaLaSesion, guardarToken, renovarSesion } from './api';
import type { Sesion, Usuario } from './tipos';

type Estado = { tipo: 'cargando' } | { tipo: 'sin-sesion' } | { tipo: 'con-sesion'; usuario: Usuario };

export interface DatosRegistro {
  nombre_completo: string;
  correo_electronico: string;
  contrasena: string;
  acepta_terminos: boolean;
}

interface ContextoSesion {
  estado: Estado;
  entrar(correo: string, contrasena: string): Promise<Usuario>;
  registrar(datos: DatosRegistro): Promise<Usuario>;
  salir(): Promise<void>;
  /** Para reflejar cambios del perfil (por ejemplo, el nombre) sin volver a entrar. */
  actualizarUsuario(cambios: Partial<Usuario>): void;
}

const Contexto = createContext<ContextoSesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  useEffect(() => {
    cuandoSePierdaLaSesion(() => setEstado({ tipo: 'sin-sesion' }));
    let vigente = true;
    void renovarSesion().then((sesion) => {
      if (vigente) {
        setEstado(sesion ? { tipo: 'con-sesion', usuario: sesion.usuario } : { tipo: 'sin-sesion' });
      }
    });
    return () => {
      vigente = false;
    };
  }, []);

  const entrar = useCallback(async (correo: string, contrasena: string) => {
    const sesion = await api<Sesion>('/autenticacion/inicio-sesion', {
      metodo: 'POST',
      cuerpo: { correo_electronico: correo.trim(), contrasena },
    });
    guardarToken(sesion.token_acceso);
    // El formulario desaparece con el foco en la contrasena: en Android el teclado se quedaba abierto.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setEstado({ tipo: 'con-sesion', usuario: sesion.usuario });
    return sesion.usuario;
  }, []);

  const registrar = useCallback(
    async (datos: DatosRegistro) => {
      await api('/autenticacion/registro', { metodo: 'POST', cuerpo: datos });
      return entrar(datos.correo_electronico, datos.contrasena);
    },
    [entrar],
  );

  const salir = useCallback(async () => {
    try {
      await api('/autenticacion/cierre-sesion', { metodo: 'POST' });
    } finally {
      guardarToken(null);
      setEstado({ tipo: 'sin-sesion' });
    }
  }, []);

  const actualizarUsuario = useCallback((cambios: Partial<Usuario>) => {
    setEstado((actual) =>
      actual.tipo === 'con-sesion' ? { tipo: 'con-sesion', usuario: { ...actual.usuario, ...cambios } } : actual,
    );
  }, []);

  const valor = useMemo(
    () => ({ estado, entrar, registrar, salir, actualizarUsuario }),
    [estado, entrar, registrar, salir, actualizarUsuario],
  );
  return <Contexto value={valor}>{children}</Contexto>;
}

export function useSesion(): ContextoSesion {
  const contexto = use(Contexto);
  if (!contexto) {
    throw new Error('useSesion debe usarse dentro de ProveedorSesion');
  }
  return contexto;
}

/** Usuario con sesion. Solo se usa en pantallas que ya verificaron la sesion. */
export function useUsuario(): Usuario {
  const { estado } = useSesion();
  if (estado.tipo !== 'con-sesion') {
    throw new Error('No hay sesion');
  }
  return estado.usuario;
}
