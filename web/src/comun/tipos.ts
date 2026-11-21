/**
 * Formas de los datos que devuelve la API. Se escriben a mano a partir de
 * los controladores de api/src/modulos; si la API cambia una respuesta,
 * este archivo es el primer lugar a revisar.
 */

export type Rol = 'pasajero' | 'conductor' | 'representante' | 'administrador';

export interface Usuario {
  id: string;
  nombre_completo: string;
  correo_electronico: string;
  rol: Rol;
}

export interface Sesion {
  token_acceso: string;
  usuario: Usuario;
}

export type NombreSentido = 'ida' | 'vuelta';

export interface Sentido {
  id: string;
  trazado_id: string;
  sentido: NombreSentido;
  origen: string;
  destino: string;
}

export interface Trazado {
  id: string;
  codigo: string;
  nombre: string;
  comuna: string;
  sentidos: Sentido[];
}

export interface TrazadoPropio {
  id: string;
  codigo: string;
  nombre: string;
  comuna: string;
}

export interface PuntoRuta {
  orden: number;
  latitud: number;
  longitud: number;
  distancia_acumulada_m: number;
}

/** Colectivo en servicio, como lo ve el pasajero en el mapa. */
export interface ColectivoEnRuta {
  jornada_id: string;
  patente: string;
  vehiculo: string;
  asientos_disponibles: number;
  nota_promedio: number | null;
  latitud: number;
  longitud: number;
  actualizado_hace_s: number;
  /** La ultima senal tiene mas de 30 segundos: se muestra atenuado. */
  atenuado: boolean;
  /** null si el pasajero no compartio su ubicacion o si el colectivo ya paso. */
  minutos_estimados: number | null;
}

export interface AvisoCreado {
  numero_tramo: number;
  personas: number;
  expira_en: string;
  reactivado: boolean;
}

export interface Abordaje {
  id: string;
  abordado_en: string;
  distancia_al_vehiculo_m: number;
}

export type TipoReporte = 'queja' | 'felicitacion';
export type EstadoReporte = 'pendiente' | 'en_revision' | 'cerrado';
export type CategoriaReporte =
  | 'conduccion_riesgosa'
  | 'uso_de_celular'
  | 'sospecha_de_alcohol'
  | 'trato_al_pasajero'
  | 'cobro_incorrecto'
  | 'buen_servicio'
  | 'otro';

export interface Viaje {
  id: string;
  abordado_en: string;
  patente: string;
  sentido: NombreSentido;
  estrellas: number | null;
  reporte_tipo: TipoReporte | null;
  reporte_estado: EstadoReporte | null;
  reporte_respuesta: string | null;
}

// ---------- Conductor ----------

export interface Jornada {
  id: string;
  patente: string;
  sentido_id: string;
  asientos_disponibles: number;
  capacidad: number;
  iniciada_en: string;
}

export interface VehiculoDisponible {
  id: string;
  patente: string;
  marca: string;
  modelo: string;
  capacidad: number;
}

export interface EsperaAdelante {
  metros_adelante: number;
  numero_tramo: number;
  personas: number;
}

// ---------- Representante ----------

export interface JornadaAbierta {
  id: string;
  patente: string;
  iniciada_en: string;
}

export interface AvisoDelTrazado {
  sentido: NombreSentido;
  numero_tramo: number;
  distancia_ruta_m: number;
  personas: number;
}

export interface Reporte {
  id: string;
  tipo: TipoReporte;
  categoria: CategoriaReporte;
  descripcion: string;
  estado: EstadoReporte;
  respuesta: string | null;
  creado_en: string;
  cerrado_en: string | null;
  patente: string;
  conductor: string;
}

export interface Tarifa {
  id: string;
  nombre: string;
  monto: number;
  hora_inicio: string | null;
  hora_fin: string | null;
  vigente_desde: string;
  vigente_hasta: string | null;
}

export interface Vehiculo {
  id: string;
  patente: string;
  marca: string;
  modelo: string;
  anio: number;
  capacidad: number;
  activo: boolean;
  en_servicio: boolean;
}

export interface Conductor {
  usuario_id: string;
  nombre_completo: string;
  correo_electronico: string;
  habilitado: boolean;
  en_servicio: boolean;
}

export interface DemandaFila {
  sentido: NombreSentido;
  numero_tramo: number;
  hora: number;
  avisos: number;
  personas: number;
}

export interface EstadisticaConductor {
  conductor: string;
  abordajes: number;
  nota_promedio: number | null;
  quejas: number;
  felicitaciones: number;
}

// ---------- Administrador ----------

export type TipoEvento =
  | 'inicio_sesion_exitoso'
  | 'inicio_sesion_fallido'
  | 'cierre_sesion'
  | 'acceso_denegado'
  | 'inicio_jornada'
  | 'fin_jornada'
  | 'cambio_tarifa'
  | 'cambio_estado_reporte'
  | 'cambio_datos_maestros'
  | 'eliminacion_cuenta';

export interface EventoAuditoria {
  tipo: TipoEvento;
  usuario_id: string | null;
  direccion_ip?: string;
  detalle?: Record<string, unknown>;
  ocurrido_en: string;
}

export interface PaginaAuditoria {
  pagina: number;
  por_pagina: number;
  eventos: EventoAuditoria[];
}

// ---------- Catalogo oficial de recorridos (RNTPP) ----------

export interface LineaCatalogo {
  id: number;
  nombre: string;
  numero_linea: string | null;
  empresa: string | null;
  tipo_servicio: 'urbano' | 'rural';
  variante: string;
  alternativo: boolean;
  circular: boolean;
  desde: string;
  hasta: string;
  comunas: string[];
  tiene_trazado: boolean;
  distancia_m?: number;
}

export interface SentidoCatalogo {
  sentido: NombreSentido;
  calles: { orden: number; calle: string; comuna: string }[];
  puntos: { latitud: number; longitud: number; distancia_acumulada_m: number }[];
}

export interface DetalleLineaCatalogo extends LineaCatalogo {
  folio: number;
  flota_vigente: number | null;
  origen: string;
  comuna_origen: string;
  lugar_origen: string | null;
  destino: string;
  comuna_destino: string;
  lugar_destino: string | null;
  sentidos: SentidoCatalogo[];
}

/** [latitud, longitud] */
export type Coordenada = [number, number];

/** Linea del catalogo en el mapa principal: su resumen y los pedazos que caen en la zona visible. */
export interface LineaMapa extends LineaCatalogo {
  tramos: { sentido: NombreSentido; puntos: Coordenada[] }[];
}

export interface MapaCatalogo {
  lineas: LineaMapa[];
  /** Pasan mas lineas por la zona que las que vienen: hay que acercar el mapa. */
  recortado: boolean;
}

/** Recuadro del mapa en grados. */
export interface Recuadro {
  sur: number;
  oeste: number;
  norte: number;
  este: number;
}

// ---------- Administracion de trazados y representantes (CU-13) ----------

export interface TrazadoAdministracion {
  id: string;
  codigo: string;
  nombre: string;
  comuna: string;
  activo: boolean;
  representante: { id: string; nombre_completo: string; correo_electronico: string; activo: boolean };
  sentidos: { sentido: NombreSentido; origen: string; destino: string }[];
  vehiculos: number;
  conductores: number;
  en_servicio: number;
}

export interface RepresentanteAdministracion {
  id: string;
  nombre_completo: string;
  correo_electronico: string;
  activo: boolean;
  creado_en?: string;
  trazados: { id: string; codigo: string; nombre: string; activo: boolean }[];
}
