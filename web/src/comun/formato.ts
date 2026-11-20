/**
 * Textos y formatos que comparten las tres apps. Todas las fechas se
 * muestran en hora de Chile, aunque el telefono este configurado en otra
 * zona: el servicio funciona en Puente Alto.
 */
import type { CategoriaReporte, EstadoReporte, NombreSentido, TipoEvento } from './tipos';

const ZONA = 'America/Santiago';

const pesos = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});
const hora = new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fechaCorta = new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, weekday: 'short', day: 'numeric', month: 'short' });
const fechaLarga = new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, day: 'numeric', month: 'long', year: 'numeric' });
const diaIso = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });
const decimal = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export function formatoPesos(monto: number): string {
  return pesos.format(monto);
}

export function formatoHora(fecha: string | Date): string {
  return hora.format(new Date(fecha));
}

/** "lun, 16 nov" */
export function formatoFechaCorta(fecha: string | Date): string {
  return fechaCorta.format(new Date(fecha)).replace(/\.$/, '');
}

/** "16 de noviembre de 2026" */
export function formatoFechaLarga(fecha: string | Date): string {
  return fechaLarga.format(new Date(fecha));
}

/** Fecha de hoy en Chile como AAAA-MM-DD, el formato que piden las consultas de la API. */
export function hoyEnChile(ahora: Date = new Date()): string {
  return diaIso.format(ahora);
}

export function formatoNota(nota: number | null): string {
  return nota === null ? 'Sin notas' : decimal.format(nota);
}

/** "350 m" o "1,2 km" */
export function formatoDistancia(metros: number): string {
  if (metros < 1000) {
    return `${Math.max(0, Math.round(metros / 10) * 10)} m`;
  }
  return `${decimal.format(metros / 1000)} km`;
}

/** Duracion legible: "45 min", "2 h 10 min". */
export function formatoDuracion(milisegundos: number): string {
  const minutos = Math.max(0, Math.floor(milisegundos / 60_000));
  if (minutos < 60) {
    return `${minutos} min`;
  }
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

/** "07:00:00" (tipo time de PostgreSQL) a "07:00". */
export function horaCorta(valor: string | null): string {
  return valor ? valor.slice(0, 5) : '';
}

export type NivelAsientos = 'disponible' | 'ultimo' | 'completo';

export function nivelAsientos(asientos: number): NivelAsientos {
  if (asientos <= 0) return 'completo';
  if (asientos === 1) return 'ultimo';
  return 'disponible';
}

export function textoAsientos(asientos: number): string {
  if (asientos <= 0) return 'Completo';
  return asientos === 1 ? '1 asiento' : `${asientos} asientos`;
}

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const primera = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '';
  return (primera + ultima).toUpperCase();
}

/** Primer nombre, para saludar sin sonar a formulario. */
export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? '';
}

/**
 * Fortaleza de una contrasena de 0 a 4. La API solo exige el largo
 * (12 a 64); esto es una ayuda visual, no una regla.
 */
export function fortalezaClave(clave: string): number {
  if (clave.length < 12) return clave.length === 0 ? 0 : 1;
  let puntos = 2;
  const variedad = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(clave)).length;
  if (variedad >= 3) puntos++;
  if (clave.length >= 16) puntos++;
  return Math.min(puntos, 4);
}

/** Los tramos de la API parten en 0; para las personas parten en 1. */
export function nombreTramo(numeroTramo: number): string {
  return `Tramo ${numeroTramo + 1}`;
}

export const NOMBRE_SENTIDO: Record<NombreSentido, string> = {
  ida: 'Ida',
  vuelta: 'Vuelta',
};

export const NOMBRE_CATEGORIA: Record<CategoriaReporte, string> = {
  conduccion_riesgosa: 'Conducción riesgosa',
  uso_de_celular: 'Uso del celular al manejar',
  sospecha_de_alcohol: 'Sospecha de alcohol',
  trato_al_pasajero: 'Trato al pasajero',
  cobro_incorrecto: 'Cobro incorrecto',
  buen_servicio: 'Buen servicio',
  otro: 'Otro',
};

export const CATEGORIAS_QUEJA: CategoriaReporte[] = [
  'conduccion_riesgosa',
  'uso_de_celular',
  'sospecha_de_alcohol',
  'trato_al_pasajero',
  'cobro_incorrecto',
  'otro',
];

/** La API rechaza una felicitacion con categoria de queja, y al reves (reglas-valoracion.ts). */
export const CATEGORIAS_FELICITACION: CategoriaReporte[] = ['buen_servicio', 'otro'];

/** Un viaje se califica o reporta dentro de las 24 horas siguientes (CU-06). */
export const PLAZO_VALORACION_MS = 24 * 60 * 60 * 1000;

export const NOMBRE_ESTADO_REPORTE: Record<EstadoReporte, string> = {
  pendiente: 'Sin revisar',
  en_revision: 'En revisión',
  cerrado: 'Cerrado',
};

export const NOMBRE_EVENTO: Record<TipoEvento, string> = {
  inicio_sesion_exitoso: 'Inicio de sesión',
  inicio_sesion_fallido: 'Inicio de sesión fallido',
  cierre_sesion: 'Cierre de sesión',
  acceso_denegado: 'Acceso denegado',
  inicio_jornada: 'Inicio de jornada',
  fin_jornada: 'Fin de jornada',
  cambio_tarifa: 'Cambio de tarifa',
  cambio_estado_reporte: 'Cambio de reporte',
  cambio_datos_maestros: 'Cambio de trazado, flota o cuenta',
  eliminacion_cuenta: 'Cuenta eliminada',
};
/** «Hospital Sótero del Río» -> «Al Hospital»; «Plaza de Puente Alto» -> «A la Plaza»; «Estación Central» -> «A la Estación». */
export function nombreCorto(destino: string): string {
  const [primera = destino] = destino.trim().split(/\s+/);
  // Femeninas: las que terminan en -a (salvo dia, mapa, sistema...) y en -cion, -sion, -dad, -tud.
  const femenino =
    (/a$/i.test(primera) && !/^(d[ií]a|mapa|sistema|programa|problema)$/i.test(primera)) ||
    /(ci[oó]n|si[oó]n|dad|tad|tud|umbre)$/i.test(primera);
  return `${femenino ? 'A la' : 'Al'} ${primera}`;
}

