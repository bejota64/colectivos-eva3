/**
 * Cliente de la API.
 *
 * - El token de acceso (15 minutos) vive solo en memoria: nunca en
 *   localStorage, para que un script inyectado no pueda leerlo despues.
 * - El token de refresco va en una cookie HttpOnly que el navegador manda
 *   solo a /api/autenticacion; el codigo de la pagina no puede leerla.
 * - Si una peticion responde 401, se renueva la sesion UNA vez y se repite.
 *   Si varias peticiones fallan juntas, comparten la misma renovacion.
 */
import type { Sesion } from './tipos';

export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

type Metodo = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type Consulta = Record<string, string | number | undefined>;

interface Opciones {
  metodo?: Metodo;
  cuerpo?: unknown;
  consulta?: Consulta;
}

let tokenAcceso: string | null = null;
let renovacionEnCurso: Promise<Sesion | null> | null = null;
let alPerderSesion: (() => void) | null = null;

export function guardarToken(token: string | null): void {
  tokenAcceso = token;
}

/** La app avisa aqui que hacer cuando la sesion ya no se puede renovar. */
export function cuandoSePierdaLaSesion(accion: () => void): void {
  alPerderSesion = accion;
}

function construirUrl(ruta: string, consulta?: Consulta): string {
  const url = `/api${ruta}`;
  if (!consulta) {
    return url;
  }
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(consulta)) {
    if (valor !== undefined && valor !== '') {
      parametros.set(clave, String(valor));
    }
  }
  const texto = parametros.toString();
  return texto ? `${url}?${texto}` : url;
}

/** Convierte el cuerpo de error de NestJS en un mensaje para la persona. */
export async function mensajeDeError(respuesta: Response): Promise<string> {
  if (respuesta.status === 429) {
    return 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.';
  }
  try {
    const cuerpo = (await respuesta.json()) as { message?: string | string[] };
    if (Array.isArray(cuerpo.message)) {
      return cuerpo.message.join('. ');
    }
    if (cuerpo.message) {
      return cuerpo.message;
    }
  } catch {
    // Sin cuerpo JSON: se usa el mensaje generico de abajo.
  }
  return respuesta.status >= 500
    ? 'El servicio no respondió. Intenta de nuevo en unos segundos.'
    : 'No se pudo completar la acción.';
}

export const MENSAJE_SIN_CONEXION = 'Sin conexión. Revisa tu internet y vuelve a intentar.';

async function enviar(url: string, opciones: Opciones): Promise<Response> {
  const cabeceras: Record<string, string> = {};
  if (tokenAcceso) {
    cabeceras.Authorization = `Bearer ${tokenAcceso}`;
  }
  if (opciones.cuerpo !== undefined) {
    cabeceras['Content-Type'] = 'application/json';
  }
  try {
    return await fetch(url, {
      method: opciones.metodo ?? 'GET',
      headers: cabeceras,
      credentials: 'same-origin',
      body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
    });
  } catch {
    // Sin señal o sin internet: el navegador lanza «Failed to fetch» (o «Load failed» en
    // Safari), en ingles. La persona ve un mensaje que entiende.
    throw new ErrorApi(0, MENSAJE_SIN_CONEXION);
  }
}

/** Pide un token nuevo con la cookie de refresco. Devuelve null si ya no hay sesion. */
export function renovarSesion(): Promise<Sesion | null> {
  if (!renovacionEnCurso) {
    renovacionEnCurso = (async () => {
      try {
        const respuesta = await fetch('/api/autenticacion/renovar', {
          method: 'POST',
          credentials: 'same-origin',
        });
        if (!respuesta.ok) {
          guardarToken(null);
          return null;
        }
        const sesion = (await respuesta.json()) as Sesion;
        guardarToken(sesion.token_acceso);
        return sesion;
      } catch {
        return null;
      } finally {
        renovacionEnCurso = null;
      }
    })();
  }
  return renovacionEnCurso;
}

async function pedir(ruta: string, opciones: Opciones = {}): Promise<Response> {
  const url = construirUrl(ruta, opciones.consulta);
  let respuesta = await enviar(url, opciones);
  const esAutenticacion = ruta.startsWith('/autenticacion/');
  if (respuesta.status === 401 && !esAutenticacion) {
    const sesion = await renovarSesion();
    if (!sesion) {
      alPerderSesion?.();
      throw new ErrorApi(401, 'Tu sesión terminó. Vuelve a entrar.');
    }
    respuesta = await enviar(url, opciones);
  }
  if (!respuesta.ok) {
    throw new ErrorApi(respuesta.status, await mensajeDeError(respuesta));
  }
  return respuesta;
}

export async function api<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const respuesta = await pedir(ruta, opciones);
  if (respuesta.status === 204) {
    return undefined as T;
  }
  return (await respuesta.json()) as T;
}

/**
 * Descarga un CSV protegido. No se puede usar un enlace comun porque la
 * peticion necesita el token en la cabecera Authorization.
 */
export async function descargarArchivo(ruta: string, nombre: string, consulta?: Consulta): Promise<void> {
  const respuesta = await pedir(ruta, { consulta });
  const blob = await respuesta.blob();
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(blob);
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}
