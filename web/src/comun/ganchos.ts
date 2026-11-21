import { useCallback, useEffect, useRef, useState } from 'react';

/** Mensaje legible de cualquier error (los de la API ya vienen traducidos). */
export function textoDeError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Algo salió mal. Intenta de nuevo.';
}

/**
 * Repite una accion cada `ms` milisegundos mientras la pantalla esta visible.
 * Con la app en segundo plano no se gasta bateria ni datos; al volver se
 * actualiza de inmediato. Con `ms = null` se detiene. Si cambia `clave`
 * (por ejemplo, el sentido elegido), se ejecuta de inmediato y el conteo
 * vuelve a empezar.
 */
export function useIntervalo(accion: () => unknown, ms: number | null, clave = ''): void {
  const ultima = useRef(accion);
  useEffect(() => {
    ultima.current = accion;
  });
  useEffect(() => {
    if (ms === null) {
      return;
    }
    const ejecutar = () => {
      if (document.visibilityState !== 'hidden') {
        void ultima.current();
      }
    };
    ejecutar();
    const id = window.setInterval(ejecutar, ms);
    document.addEventListener('visibilitychange', ejecutar);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', ejecutar);
    };
  }, [ms, clave]);
}

interface EstadoDatos<T> {
  /** Clave de la ultima respuesta recibida: si no es la actual, se esta cargando. */
  para: string | null;
  datos: T | undefined;
  error: string | null;
}

/**
 * Carga datos de la API y los vuelve a pedir cuando cambia `clave` o al
 * llamar a `recargar`. Si llega una respuesta vieja (la persona cambio de
 * filtro antes), se descarta. Mientras carga se siguen mostrando los datos
 * anteriores, para que la pantalla no parpadee.
 */
export function useDatos<T>(cargar: () => Promise<T>, clave: string) {
  const [version, setVersion] = useState(0);
  const [estado, setEstado] = useState<EstadoDatos<T>>({ para: null, datos: undefined, error: null });
  const funcion = useRef(cargar);
  useEffect(() => {
    funcion.current = cargar;
  });
  const actual = `${clave}#${version}`;

  useEffect(() => {
    let vigente = true;
    funcion.current().then(
      (datos) => {
        if (vigente) setEstado({ para: actual, datos, error: null });
      },
      (error: unknown) => {
        if (vigente) setEstado((anterior) => ({ para: actual, datos: anterior.datos, error: textoDeError(error) }));
      },
    );
    return () => {
      vigente = false;
    };
  }, [actual]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  /** Reemplaza los datos en pantalla sin volver a pedirlos (tras una accion). */
  const fijar = useCallback((datos: T) => setEstado({ para: actual, datos, error: null }), [actual]);
  return { datos: estado.datos, error: estado.error, cargando: estado.para !== actual, recargar, fijar };
}

export interface Posicion {
  latitud: number;
  longitud: number;
  precision: number;
  velocidadKmh: number | null;
}

export type EstadoUbicacion = 'apagada' | 'buscando' | 'activa' | 'denegada' | 'no-disponible';

/**
 * Sigue la ubicacion del telefono mientras `activa` sea true. La ubicacion
 * nunca se guarda en el navegador: vive en memoria mientras la pantalla
 * esta abierta. `alRecibir` se llama con cada lectura nueva.
 */
export function useUbicacion(activa: boolean, alRecibir?: (posicion: Posicion) => void) {
  const [lectura, setLectura] = useState<{ posicion: Posicion | null; estado: EstadoUbicacion }>({
    posicion: null,
    estado: 'buscando',
  });
  const avisar = useRef(alRecibir);
  useEffect(() => {
    avisar.current = alRecibir;
  });
  const soportada = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  useEffect(() => {
    if (!activa || !soportada) return;
    const id = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const posicion: Posicion = {
          latitud: coords.latitude,
          longitud: coords.longitude,
          precision: coords.accuracy,
          velocidadKmh: coords.speed === null ? null : coords.speed * 3.6,
        };
        setLectura({ posicion, estado: 'activa' });
        avisar.current?.(posicion);
      },
      (error) =>
        setLectura((anterior) => ({
          posicion: anterior.posicion,
          estado: error.code === error.PERMISSION_DENIED ? 'denegada' : 'no-disponible',
        })),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [activa, soportada]);

  const estado: EstadoUbicacion = !activa ? 'apagada' : !soportada ? 'no-disponible' : lectura.estado;
  return { posicion: activa ? lectura.posicion : null, estado };
}

/** Hora actual que se actualiza sola, para cuentas regresivas y "hace 5 min". */
export function useAhora(cadaMs = 30_000): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), cadaMs);
    return () => window.clearInterval(id);
  }, [cadaMs]);
  return ahora;
}
