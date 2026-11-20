/**
 * API simulada para las pruebas de las pantallas. Responde con las mismas
 * formas que la API real (ver src/comun/tipos.ts) y guarda en memoria lo
 * que cada prueba cambia. Los datos son ficticios, igual que los de
 * bd/postgres/inicio: patentes ZZZZ01 y similares, correos .ejemplo.cl.
 *
 * La API real se prueba aparte (api/test con Supertest y en el despliegue
 * de produccion de la integracion continua).
 */
import { readFileSync } from 'node:fs';
import type { Page, Route } from '@playwright/test';

export const CLAVE = 'Clave.Prueba.2026';
/** Hora fija de las pruebas: martes 17 de noviembre de 2026, 18:40 en Chile (UTC-3). */
export const AHORA = new Date('2026-11-17T21:40:00.000Z');

const TRAZADO = '00000000-0000-4000-8000-000000000100';
const IDA = '00000000-0000-4000-8000-000000000101';
const VUELTA = '00000000-0000-4000-8000-000000000102';

const USUARIOS = {
  'pasajero1@colectivos.ejemplo.cl': { id: '00000000-0000-4000-8000-000000000201', nombre_completo: 'Camila Rojas Soto', rol: 'pasajero' },
  'conductor1@colectivos.ejemplo.cl': { id: '00000000-0000-4000-8000-000000000301', nombre_completo: 'Pedro Muñoz Díaz', rol: 'conductor' },
  'representante@colectivos.ejemplo.cl': { id: '00000000-0000-4000-8000-000000000401', nombre_completo: 'Héctor Fuentes Lagos', rol: 'representante' },
  'admin@colectivos.ejemplo.cl': { id: '00000000-0000-4000-8000-000000000501', nombre_completo: 'Valentina Araya Pino', rol: 'administrador' },
} as const;
export type CorreoDemo = keyof typeof USUARIOS;

function hace(minutos: number): string {
  return new Date(AHORA.getTime() - minutos * 60_000).toISOString();
}

// ---------- Recorrido: Plaza de Puente Alto hasta el Hospital Sotero del Rio ----------
const VERTICES: [number, number][] = [
  [-33.6105, -70.5757], [-33.6079, -70.5761], [-33.6052, -70.5766], [-33.6024, -70.5771],
  [-33.5996, -70.5775], [-33.5969, -70.5779], [-33.5941, -70.5783], [-33.5913, -70.5787],
  [-33.5886, -70.5791], [-33.5858, -70.5795], [-33.5830, -70.5800], [-33.5802, -70.5805], [-33.5776, -70.5810],
];

const rad = (g: number) => (g * Math.PI) / 180;

function distancia(a: [number, number], b: [number, number]): number {
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

function recorrido(vertices: [number, number][]) {
  let acumulado = 0;
  return vertices.map((v, i) => {
    const anterior = vertices[i - 1];
    if (anterior) acumulado += distancia(anterior, v);
    return { orden: i + 1, latitud: v[0], longitud: v[1], distancia_acumulada_m: Math.round(acumulado) };
  });
}

const RECORRIDO_IDA = recorrido(VERTICES);
const RECORRIDO_VUELTA = recorrido(VERTICES.toReversed());

/** Segunda linea en la app (opcion variosTrazados): la crea el administrador desde el registro del MTT. */
const TRAZADO_2 = '00000000-0000-4000-8000-000000000120';
const IDA_2 = '00000000-0000-4000-8000-000000000121';
const VUELTA_2 = '00000000-0000-4000-8000-000000000122';
const SEGUNDO_TRAZADO = {
  id: TRAZADO_2,
  codigo: '4008',
  nombre: 'Arturo Prat - Ramon Corvalan Melgarejo',
  comuna: 'Puente Alto',
  sentidos: [
    { id: IDA_2, trazado_id: TRAZADO_2, sentido: 'ida', origen: 'Arturo Prat', destino: 'Ramon Corvalan Melgarejo' },
    { id: VUELTA_2, trazado_id: TRAZADO_2, sentido: 'vuelta', origen: 'Ramon Corvalan Melgarejo', destino: 'Arturo Prat' },
  ],
};

const TRAZADOS = [
  {
    id: TRAZADO,
    codigo: '9001',
    nombre: 'Plaza Puente Alto - Hospital',
    comuna: 'Puente Alto',
    sentidos: [
      { id: IDA, trazado_id: TRAZADO, sentido: 'ida', origen: 'Plaza de Puente Alto', destino: 'Hospital Sótero del Río' },
      { id: VUELTA, trazado_id: TRAZADO, sentido: 'vuelta', origen: 'Hospital Sótero del Río', destino: 'Plaza de Puente Alto' },
    ],
  },
];

function colectivos(sentidoId: string, conUbicacion: boolean) {
  const ruta = sentidoId === IDA ? RECORRIDO_IDA : RECORRIDO_VUELTA;
  const lista = [
    { jornada_id: 'j-1', patente: 'ZZZZ01', vehiculo: 'Nissan Versa', asientos_disponibles: 3, nota_promedio: 4.6, punto: 1, minutos: 4, hace: 6 },
    { jornada_id: 'j-2', patente: 'ZZZZ02', vehiculo: 'Chevrolet Sail', asientos_disponibles: 1, nota_promedio: 4.2, punto: 4, minutos: 11, hace: 9 },
    { jornada_id: 'j-3', patente: 'ZZ9903', vehiculo: 'Hyundai Accent', asientos_disponibles: 0, nota_promedio: null, punto: 9, minutos: 23, hace: 42 },
  ];
  return lista.map(({ punto, minutos, hace: edad, ...c }) => ({
    ...c,
    latitud: ruta[punto]?.latitud ?? 0,
    longitud: ruta[punto]?.longitud ?? 0,
    actualizado_hace_s: edad,
    atenuado: edad > 30,
    minutos_estimados: conUbicacion ? minutos : null,
  }));
}

// ---------- Catalogo oficial de recorridos ----------
// Datos reales: diez lineas de Puente Alto del Registro Nacional de Transporte
// Publico (MTT), dibujadas sobre las calles de OpenStreetMap. Los genera un
// script desde la base local (ver «fuente» en el archivo); no traen datos de personas.
interface LineaCatalogo {
  id: number;
  nombre: string;
  numero_linea: string | null;
  empresa: string | null;
  desde: string;
  hasta: string;
  origen: string;
  destino: string;
  comunas: string[];
  sentidos: { calles: { calle: string }[] }[];
  [clave: string]: unknown;
}
const CATALOGO = JSON.parse(readFileSync(new URL('./datos/catalogo.json', import.meta.url), 'utf8')) as {
  comunas: { comuna: string; lineas: number }[];
  lineas: LineaCatalogo[];
  cercanas: { id: number; distancia_m: number }[];
};

const sinTildes = (texto: string) => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Lo mismo que entrega la API en las listas (sin calles ni puntos). */
const CLAVES_RESUMEN = ['id', 'nombre', 'numero_linea', 'empresa', 'tipo_servicio', 'variante', 'alternativo', 'circular', 'desde', 'hasta', 'comunas', 'tiene_trazado'];
function resumenCatalogo(linea: LineaCatalogo): Record<string, unknown> {
  return Object.fromEntries(CLAVES_RESUMEN.map((clave) => [clave, linea[clave]]));
}

function buscarEnCatalogo(buscar: string, comuna: string) {
  const palabras = sinTildes(buscar).split(/\s+/).filter((p) => p.length >= 2).slice(0, 4);
  return CATALOGO.lineas
    .filter((l) => !comuna || l.comunas.includes(comuna))
    .filter((l) => {
      const texto = sinTildes(
        [l.nombre, l.numero_linea, l.empresa, l.desde, l.hasta, l.origen, l.destino, ...l.comunas, ...l.sentidos.flatMap((s) => s.calles.map((c) => c.calle))].join(' '),
      );
      return palabras.every((p) => texto.includes(p));
    })
    .map(resumenCatalogo);
}

// ---------- Estado que cambian las pruebas ----------
interface Estado {
  sesion: CorreoDemo | null;
  consentimiento: boolean;
  jornada: { id: string; patente: string; sentido_id: string; asientos_disponibles: number; capacidad: number; iniciada_en: string } | null;
  pedirConsentimientoAlConductor: boolean;
  viajes: Record<string, unknown>[];
  reportes: Record<string, unknown>[];
  tarifas: Record<string, unknown>[];
  vehiculos: Record<string, unknown>[];
  conductores: Record<string, unknown>[];
  jornadasTrazado: Record<string, unknown>[];
  representantes: RepresentanteSimulado[];
  trazadosAdmin: TrazadoSimulado[];
  variosTrazados: boolean;
}

interface RepresentanteSimulado {
  id: string;
  nombre_completo: string;
  correo_electronico: string;
  activo: boolean;
}

interface TrazadoSimulado {
  id: string;
  codigo: string;
  nombre: string;
  comuna: string;
  activo: boolean;
  representante_id: string;
  sentidos: { sentido: 'ida' | 'vuelta'; origen: string; destino: string }[];
  vehiculos: number;
  conductores: number;
  en_servicio: number;
}

const REPRESENTANTE_9001 = USUARIOS['representante@colectivos.ejemplo.cl'];

export interface Opciones {
  /** Simula una sesion ya iniciada (cookie de refresco vigente). */
  sesion?: CorreoDemo;
  /** El conductor ya tiene una jornada abierta. */
  conJornada?: boolean;
  /** La primera vez que el conductor abre jornada, la API pide consentimiento. */
  sinConsentimiento?: boolean;
  /** Muestra la guia de la primera vez (por omision se da por vista). */
  conGuia?: boolean;
  /** Hay dos lineas en la app (9001 y 4008): el pasajero puede elegir. */
  variosTrazados?: boolean;
}

function estadoInicial(opciones: Opciones): Estado {
  return {
    sesion: opciones.sesion ?? null,
    variosTrazados: Boolean(opciones.variosTrazados),
    consentimiento: !opciones.sinConsentimiento,
    pedirConsentimientoAlConductor: Boolean(opciones.sinConsentimiento),
    jornada: opciones.conJornada
      ? { id: 'j-1', patente: 'ZZZZ01', sentido_id: IDA, asientos_disponibles: 3, capacidad: 4, iniciada_en: hace(134) }
      : null,
    viajes: [
      { id: 'v-1', abordado_en: hace(50), patente: 'ZZZZ01', sentido: 'ida', estrellas: null, reporte_tipo: null, reporte_estado: null, reporte_respuesta: null },
      { id: 'v-2', abordado_en: hace(60 * 26), patente: 'ZZZZ02', sentido: 'vuelta', estrellas: 5, reporte_tipo: 'felicitacion', reporte_estado: 'cerrado', reporte_respuesta: 'Gracias por tu mensaje. Se lo hicimos llegar a Luis, que maneja ese auto.' },
      { id: 'v-3', abordado_en: hace(60 * 50), patente: 'ZZ9903', sentido: 'ida', estrellas: null, reporte_tipo: null, reporte_estado: null, reporte_respuesta: null },
    ],
    reportes: [
      { id: 'r-1', tipo: 'queja', categoria: 'uso_de_celular', descripcion: 'El conductor iba escribiendo en el celular mientras manejaba por Concha y Toro, a la altura del paradero 14.', estado: 'pendiente', respuesta: null, creado_en: hace(95), cerrado_en: null, patente: 'ZZZZ02', conductor: 'Luis Herrera Vega' },
      { id: 'r-2', tipo: 'felicitacion', categoria: 'buen_servicio', descripcion: 'Muy amable, me esperó mientras subía con el coche de mi guagua y me ayudó a guardarlo.', estado: 'pendiente', respuesta: null, creado_en: hace(260), cerrado_en: null, patente: 'ZZZZ01', conductor: 'Pedro Muñoz Díaz' },
      { id: 'r-3', tipo: 'queja', categoria: 'cobro_incorrecto', descripcion: 'Me cobraron 1.500 por un tramo corto, que según el letrero vale 1.000.', estado: 'en_revision', respuesta: null, creado_en: hace(60 * 20), cerrado_en: null, patente: 'ZZ9903', conductor: 'Jorge Castillo Ríos' },
    ],
    tarifas: [
      { id: 't-1', nombre: 'Tramo corto', monto: 1000, hora_inicio: null, hora_fin: null, vigente_desde: '2026-09-01T12:00:00.000Z', vigente_hasta: null },
      { id: 't-2', nombre: 'Recorrido completo', monto: 1500, hora_inicio: null, hora_fin: null, vigente_desde: '2026-10-15T12:00:00.000Z', vigente_hasta: null },
      { id: 't-3', nombre: 'Nocturna', monto: 1800, hora_inicio: '22:00:00', hora_fin: '06:00:00', vigente_desde: '2026-09-01T12:00:00.000Z', vigente_hasta: null },
    ],
    vehiculos: [
      { id: 'a-1', patente: 'ZZZZ01', marca: 'Nissan', modelo: 'Versa', anio: 2021, capacidad: 4, activo: true, en_servicio: true },
      { id: 'a-2', patente: 'ZZZZ02', marca: 'Chevrolet', modelo: 'Sail', anio: 2019, capacidad: 4, activo: true, en_servicio: true },
      { id: 'a-3', patente: 'ZZ9903', marca: 'Hyundai', modelo: 'Accent', anio: 2018, capacidad: 4, activo: true, en_servicio: true },
      { id: 'a-4', patente: 'ZZZZ04', marca: 'Toyota', modelo: 'Yaris', anio: 2016, capacidad: 4, activo: false, en_servicio: false },
    ],
    conductores: [
      { usuario_id: 'c-3', nombre_completo: 'Jorge Castillo Ríos', correo_electronico: 'conductor3@colectivos.ejemplo.cl', habilitado: true, en_servicio: true },
      { usuario_id: 'c-2', nombre_completo: 'Luis Herrera Vega', correo_electronico: 'conductor2@colectivos.ejemplo.cl', habilitado: true, en_servicio: true },
      { usuario_id: 'c-1', nombre_completo: 'Pedro Muñoz Díaz', correo_electronico: 'conductor1@colectivos.ejemplo.cl', habilitado: true, en_servicio: true },
    ],
    jornadasTrazado: [
      { id: 'j-1', patente: 'ZZZZ01', iniciada_en: hace(134) },
      { id: 'j-2', patente: 'ZZZZ02', iniciada_en: hace(71) },
      { id: 'j-3', patente: 'ZZ9903', iniciada_en: hace(18) },
    ],
    representantes: [
      { id: REPRESENTANTE_9001.id, nombre_completo: REPRESENTANTE_9001.nombre_completo, correo_electronico: 'representante@colectivos.ejemplo.cl', activo: true },
      { id: '00000000-0000-4000-8000-000000000402', nombre_completo: 'Marcela Vidal Rojas', correo_electronico: 'representante2@colectivos.ejemplo.cl', activo: true },
    ],
    trazadosAdmin: [
      {
        id: TRAZADO, codigo: '9001', nombre: 'Plaza Puente Alto - Hospital', comuna: 'Puente Alto', activo: true,
        representante_id: REPRESENTANTE_9001.id,
        sentidos: [
          { sentido: 'ida', origen: 'Plaza de Puente Alto', destino: 'Hospital Sótero del Río' },
          { sentido: 'vuelta', origen: 'Hospital Sótero del Río', destino: 'Plaza de Puente Alto' },
        ],
        vehiculos: 3, conductores: 3, en_servicio: 3,
      },
      {
        id: '00000000-0000-4000-8000-000000000110', codigo: '9002', nombre: 'Bajos de Mena - Metro Las Mercedes', comuna: 'Puente Alto', activo: false,
        representante_id: '00000000-0000-4000-8000-000000000402',
        sentidos: [
          { sentido: 'ida', origen: 'Bajos de Mena', destino: 'Metro Las Mercedes' },
          { sentido: 'vuelta', origen: 'Metro Las Mercedes', destino: 'Bajos de Mena' },
        ],
        vehiculos: 0, conductores: 0, en_servicio: 0,
      },
    ],
  };
}

/** Misma forma que GET /administracion/trazados de la API. */
function trazadoAdmin(estado: Estado, t: TrazadoSimulado) {
  const { representante_id, ...resto } = t;
  const representante = estado.representantes.find((r) => r.id === representante_id);
  return { ...resto, representante };
}

/** Misma forma que GET /administracion/representantes de la API. */
function representanteAdmin(estado: Estado, r: RepresentanteSimulado) {
  const trazados = estado.trazadosAdmin
    .filter((t) => t.representante_id === r.id)
    .map(({ id, codigo, nombre, activo }) => ({ id, codigo, nombre, activo }));
  return { ...r, trazados };
}

// Demanda del dia: dos peaks (manana y tarde), como en un dia habil.
const PERSONAS_POR_HORA: Record<number, number> = {
  6: 4, 7: 13, 8: 19, 9: 9, 10: 5, 11: 4, 12: 6, 13: 8, 14: 5, 15: 6, 16: 9, 17: 15, 18: 22, 19: 12, 20: 6, 21: 3,
};
function demanda() {
  const filas: Record<string, unknown>[] = [];
  for (const [hora, personas] of Object.entries(PERSONAS_POR_HORA)) {
    const ida = Math.ceil(personas * 0.6);
    filas.push({ sentido: 'ida', numero_tramo: Number(hora) % 4, hora: Number(hora), avisos: Math.ceil(ida / 1.6), personas: ida });
    filas.push({ sentido: 'vuelta', numero_tramo: (Number(hora) + 2) % 5, hora: Number(hora), avisos: Math.ceil((personas - ida) / 1.5), personas: personas - ida });
  }
  return filas;
}

const EVENTOS = [
  { tipo: 'inicio_sesion_exitoso', usuario_id: USUARIOS['representante@colectivos.ejemplo.cl'].id, direccion_ip: '190.20.14.8', ocurrido_en: hace(3) },
  { tipo: 'cambio_estado_reporte', usuario_id: USUARIOS['representante@colectivos.ejemplo.cl'].id, direccion_ip: '190.20.14.8', detalle: { reporte_id: 'r-9', estado: 'cerrado' }, ocurrido_en: hace(9) },
  { tipo: 'inicio_sesion_fallido', usuario_id: null, direccion_ip: '45.83.12.201', detalle: { correo_intentado: 'admin@colectivos.ejemplo.cl', motivo: 'credenciales_invalidas' }, ocurrido_en: hace(14) },
  { tipo: 'inicio_jornada', usuario_id: USUARIOS['conductor1@colectivos.ejemplo.cl'].id, direccion_ip: '181.43.2.17', detalle: { patente: 'ZZ9903' }, ocurrido_en: hace(18) },
  { tipo: 'acceso_denegado', usuario_id: USUARIOS['pasajero1@colectivos.ejemplo.cl'].id, direccion_ip: '181.43.7.90', detalle: { ruta: '/api/auditoria', rol: 'pasajero' }, ocurrido_en: hace(22) },
  { tipo: 'cambio_tarifa', usuario_id: USUARIOS['representante@colectivos.ejemplo.cl'].id, direccion_ip: '190.20.14.8', detalle: { nombre: 'Recorrido completo', monto_anterior: 1400, monto: 1500 }, ocurrido_en: hace(60 * 24 * 33) },
  { tipo: 'cierre_sesion', usuario_id: USUARIOS['conductor1@colectivos.ejemplo.cl'].id, direccion_ip: '181.43.2.17', ocurrido_en: hace(60 * 9) },
];

// ---------- Enrutador ----------
type Respuesta = { estado: number; cuerpo?: unknown; tipo?: string };

function error(estado: number, mensaje: string): Respuesta {
  return { estado, cuerpo: { message: mensaje, error: 'Error', statusCode: estado } };
}

function sesionDe(correo: CorreoDemo) {
  return { token_acceso: `token-${correo}`, usuario: { ...USUARIOS[correo], correo_electronico: correo } };
}

function responder(estado: Estado, metodo: string, ruta: string, consulta: URLSearchParams, cuerpo: Record<string, unknown>): Respuesta {
  const clave = `${metodo} ${ruta}`;

  // Autenticacion
  if (clave === 'POST /autenticacion/renovar') {
    return estado.sesion ? { estado: 200, cuerpo: sesionDe(estado.sesion) } : error(401, 'Sesion no valida');
  }
  if (clave === 'POST /autenticacion/inicio-sesion') {
    const correo = String(cuerpo.correo_electronico ?? '').toLowerCase() as CorreoDemo;
    if (!(correo in USUARIOS) || cuerpo.contrasena !== CLAVE) return error(401, 'Correo o contraseña incorrectos');
    estado.sesion = correo;
    return { estado: 200, cuerpo: sesionDe(correo) };
  }
  if (clave === 'POST /autenticacion/registro') {
    return error(409, 'Ya existe una cuenta con ese correo');
  }
  if (clave === 'POST /autenticacion/cierre-sesion') {
    estado.sesion = null;
    return { estado: 204 };
  }
  if (!estado.sesion) return error(401, 'Sesion no valida');

  // Comunes
  if (clave === 'GET /trazados') return { estado: 200, cuerpo: estado.variosTrazados ? [...TRAZADOS, SEGUNDO_TRAZADO] : TRAZADOS };
  if (clave === `GET /trazados/sentidos/${IDA}/recorrido`) return { estado: 200, cuerpo: RECORRIDO_IDA };
  if (clave === `GET /trazados/sentidos/${VUELTA}/recorrido`) return { estado: 200, cuerpo: RECORRIDO_VUELTA };
  if (estado.variosTrazados) {
    if (clave === `GET /trazados/sentidos/${IDA_2}/recorrido`) return { estado: 200, cuerpo: RECORRIDO_VUELTA };
    if (clave === `GET /trazados/sentidos/${VUELTA_2}/recorrido`) return { estado: 200, cuerpo: RECORRIDO_IDA };
    if (clave === `GET /trazados/${TRAZADO_2}/tarifas`) {
      return { estado: 200, cuerpo: [{ id: 't-20', nombre: 'Recorrido completo', monto: 1300, hora_inicio: null, hora_fin: null, vigente_desde: '2026-11-18T12:00:00.000Z', vigente_hasta: null }] };
    }
  }
  if (clave === 'GET /tiempo-real/colectivos') {
    return { estado: 200, cuerpo: colectivos(consulta.get('sentido_id') ?? IDA, consulta.has('latitud')) };
  }
  if (clave === 'POST /usuarios/yo/consentimientos/geolocalizacion') {
    estado.consentimiento = true;
    estado.pedirConsentimientoAlConductor = false;
    return { estado: 201, cuerpo: { geolocalizacion: 'aceptada' } };
  }
  if (clave === 'DELETE /usuarios/yo/consentimientos/geolocalizacion') {
    estado.consentimiento = false;
    return { estado: 204 };
  }
  if (clave === 'PATCH /usuarios/yo') {
    return { estado: 200, cuerpo: { ...USUARIOS[estado.sesion], correo_electronico: estado.sesion, telefono: cuerpo.telefono ?? null, nombre_completo: cuerpo.nombre_completo } };
  }

  // Catalogo oficial de recorridos
  if (clave === 'GET /catalogo/comunas') return { estado: 200, cuerpo: CATALOGO.comunas };
  if (clave === 'GET /catalogo/lineas') {
    return { estado: 200, cuerpo: buscarEnCatalogo(consulta.get('buscar') ?? '', consulta.get('comuna') ?? '') };
  }
  if (clave === 'GET /catalogo/lineas/cercanas') {
    return {
      estado: 200,
      cuerpo: CATALOGO.cercanas.flatMap(({ id, distancia_m }) => {
        const linea = CATALOGO.lineas.find((l) => l.id === id);
        return linea ? [{ ...resumenCatalogo(linea), distancia_m }] : [];
      }),
    };
  }
  const lineaCatalogo = /^GET \/catalogo\/lineas\/(\d+)$/.exec(clave);
  if (lineaCatalogo) {
    const linea = CATALOGO.lineas.find((l) => l.id === Number(lineaCatalogo[1]));
    return linea ? { estado: 200, cuerpo: linea } : error(404, 'Linea no encontrada');
  }

  // Pasajero
  if (clave === 'POST /avisos-espera') {
    return { estado: 201, cuerpo: { numero_tramo: 2, personas: cuerpo.personas, expira_en: new Date(AHORA.getTime() + 15 * 60_000).toISOString(), reactivado: false } };
  }
  if (clave === 'DELETE /avisos-espera/actual') return { estado: 204 };
  if (clave === 'POST /abordajes') return { estado: 201, cuerpo: { id: 'v-nuevo', abordado_en: AHORA.toISOString(), distancia_al_vehiculo_m: 35 } };
  if (clave === 'GET /abordajes/mios') return { estado: 200, cuerpo: estado.viajes };
  const valoracion = /^POST \/abordajes\/([^/]+)\/(calificacion|reporte)$/.exec(clave);
  if (valoracion) return { estado: 201, cuerpo: {} };

  // Conductor
  if (clave === 'GET /jornadas/actual') return estado.jornada ? { estado: 200, cuerpo: estado.jornada } : error(409, 'Jornada cerrada');
  if (clave === 'GET /flota/vehiculos-disponibles') {
    return {
      estado: 200,
      cuerpo: [
        { id: 'a-1', patente: 'ZZZZ01', marca: 'Nissan', modelo: 'Versa', capacidad: 4 },
        { id: 'a-5', patente: 'ZZZZ05', marca: 'Kia', modelo: 'Rio', capacidad: 4 },
      ],
    };
  }
  if (clave === 'POST /jornadas') {
    if (estado.pedirConsentimientoAlConductor) return error(403, 'Debes aceptar el uso de tu ubicacion antes de usar esta funcion');
    estado.jornada = { id: 'j-9', patente: cuerpo.vehiculo_id === 'a-5' ? 'ZZZZ05' : 'ZZZZ01', sentido_id: String(cuerpo.sentido_id), asientos_disponibles: 4, capacidad: 4, iniciada_en: AHORA.toISOString() };
    return { estado: 201, cuerpo: estado.jornada };
  }
  if (clave === 'PATCH /jornadas/actual/asientos' && estado.jornada) {
    estado.jornada.asientos_disponibles = Number(cuerpo.asientos_disponibles);
    return { estado: 200, cuerpo: estado.jornada };
  }
  if (clave === 'PATCH /jornadas/actual/sentido' && estado.jornada) {
    estado.jornada.sentido_id = String(cuerpo.sentido_id);
    return { estado: 200, cuerpo: estado.jornada };
  }
  if (clave === 'POST /jornadas/actual/cierre') {
    estado.jornada = null;
    return { estado: 204 };
  }
  if (clave === 'POST /tiempo-real/posiciones') return { estado: 201, cuerpo: {} };
  if (clave === 'GET /avisos-espera/adelante') {
    return {
      estado: 200,
      cuerpo: [
        { metros_adelante: 340, numero_tramo: 1, personas: 2 },
        { metros_adelante: 910, numero_tramo: 2, personas: 1 },
        { metros_adelante: 1630, numero_tramo: 3, personas: 3 },
      ],
    };
  }

  // Representante
  const base = `/trazados/${TRAZADO}`;
  if (clave === 'GET /trazados/mios') return { estado: 200, cuerpo: [{ id: TRAZADO, codigo: '9001', nombre: 'Plaza Puente Alto - Hospital', comuna: 'Puente Alto' }] };
  if (clave === `GET ${base}/jornadas`) return { estado: 200, cuerpo: estado.jornadasTrazado };
  const cierreJornada = new RegExp(`^POST ${base}/jornadas/([^/]+)/cierre$`).exec(clave);
  if (cierreJornada) {
    estado.jornadasTrazado = estado.jornadasTrazado.filter((j) => j.id !== cierreJornada[1]);
    return { estado: 204 };
  }
  if (clave === `GET ${base}/avisos`) {
    return {
      estado: 200,
      cuerpo: [
        { sentido: 'ida', numero_tramo: 1, distancia_ruta_m: 930, personas: 2 },
        { sentido: 'ida', numero_tramo: 3, distancia_ruta_m: 1920, personas: 3 },
        { sentido: 'ida', numero_tramo: 7, distancia_ruta_m: 3520, personas: 1 },
        { sentido: 'vuelta', numero_tramo: 2, distancia_ruta_m: 1300, personas: 2 },
      ],
    };
  }
  if (clave === `GET ${base}/reportes`) {
    const filtro = consulta.get('estado');
    return { estado: 200, cuerpo: estado.reportes.filter((r) => !filtro || r.estado === filtro) };
  }
  const reporte = new RegExp(`^PATCH ${base}/reportes/([^/]+)$`).exec(clave);
  if (reporte) {
    const encontrado = estado.reportes.find((r) => r.id === reporte[1]);
    if (!encontrado) return error(404, 'Reporte no encontrado');
    Object.assign(encontrado, { estado: cuerpo.estado, respuesta: cuerpo.respuesta ?? null, cerrado_en: cuerpo.estado === 'cerrado' ? AHORA.toISOString() : null });
    return { estado: 200, cuerpo: encontrado };
  }
  if (clave === `GET ${base}/tarifas`) return { estado: 200, cuerpo: estado.tarifas.filter((t) => !t.vigente_hasta) };
  if (clave === `GET ${base}/tarifas/historial`) {
    return {
      estado: 200,
      cuerpo: [
        ...estado.tarifas,
        { id: 't-0', nombre: 'Recorrido completo', monto: 1400, hora_inicio: null, hora_fin: null, vigente_desde: '2026-03-01T12:00:00.000Z', vigente_hasta: '2026-10-15T12:00:00.000Z' },
      ],
    };
  }
  if (clave === `POST ${base}/tarifas`) {
    const nueva = { id: `t-${estado.tarifas.length + 1}`, nombre: cuerpo.nombre, monto: cuerpo.monto, hora_inicio: cuerpo.hora_inicio ?? null, hora_fin: cuerpo.hora_fin ?? null, vigente_desde: AHORA.toISOString(), vigente_hasta: null };
    for (const t of estado.tarifas) {
      if (String(t.nombre).toLowerCase() === String(cuerpo.nombre).toLowerCase() && !t.vigente_hasta) t.vigente_hasta = AHORA.toISOString();
    }
    estado.tarifas.push(nueva);
    return { estado: 201, cuerpo: nueva };
  }
  if (clave === `GET ${base}/vehiculos`) return { estado: 200, cuerpo: estado.vehiculos };
  if (clave === `POST ${base}/vehiculos`) {
    const nuevo = { id: `a-${estado.vehiculos.length + 1}`, ...cuerpo, activo: true, en_servicio: false };
    estado.vehiculos.push(nuevo);
    return { estado: 201, cuerpo: nuevo };
  }
  if (clave === `GET ${base}/conductores`) return { estado: 200, cuerpo: estado.conductores };
  if (clave === `GET /estadisticas${base}/demanda`) return { estado: 200, cuerpo: demanda() };
  if (clave === `GET /estadisticas${base}/conductores`) {
    return {
      estado: 200,
      cuerpo: [
        { conductor: 'Jorge Castillo Ríos', abordajes: 38, nota_promedio: 3.9, quejas: 2, felicitaciones: 0 },
        { conductor: 'Luis Herrera Vega', abordajes: 52, nota_promedio: 4.2, quejas: 1, felicitaciones: 3 },
        { conductor: 'Pedro Muñoz Díaz', abordajes: 61, nota_promedio: 4.6, quejas: 0, felicitaciones: 5 },
      ],
    };
  }
  if (clave.startsWith(`GET /estadisticas${base}/`) && ruta.endsWith('/csv')) {
    return { estado: 200, cuerpo: 'fecha;sentido;tramo;personas\n2026-11-17;ida;1;2\n', tipo: 'text/csv; charset=utf-8' };
  }

  // Administrador: trazados y representantes (CU-13)
  if (clave === 'GET /administracion/trazados') {
    const orden = estado.trazadosAdmin.toSorted((a, b) => Number(b.activo) - Number(a.activo) || a.codigo.localeCompare(b.codigo));
    return { estado: 200, cuerpo: orden.map((t) => trazadoAdmin(estado, t)) };
  }
  if (clave === 'POST /administracion/trazados') {
    const codigo = String(cuerpo.codigo);
    if (estado.trazadosAdmin.some((t) => t.codigo === codigo)) return error(409, 'Ya existe un trazado con ese código');
    const representante = estado.representantes.find((r) => r.id === cuerpo.representante_id && r.activo);
    if (!representante) return error(400, 'El representante no existe o no está activo');
    const origen = String(cuerpo.origen);
    const destino = String(cuerpo.destino);
    const nuevo: TrazadoSimulado = {
      id: `00000000-0000-4000-8000-${String(900 + estado.trazadosAdmin.length).padStart(12, '0')}`,
      codigo, nombre: String(cuerpo.nombre), comuna: String(cuerpo.comuna), activo: true, representante_id: representante.id,
      sentidos: [
        { sentido: 'ida', origen, destino },
        { sentido: 'vuelta', origen: destino, destino: origen },
      ],
      vehiculos: 0, conductores: 0, en_servicio: 0,
    };
    estado.trazadosAdmin.push(nuevo);
    return { estado: 201, cuerpo: trazadoAdmin(estado, nuevo) };
  }
  const cambioTrazado = /^PATCH \/administracion\/trazados\/([^/]+)$/.exec(clave);
  if (cambioTrazado) {
    const trazado = estado.trazadosAdmin.find((t) => t.id === cambioTrazado[1]);
    if (!trazado) return error(404, 'Trazado no encontrado');
    if (cuerpo.activo === false && trazado.en_servicio > 0) {
      return error(400, 'El trazado tiene colectivos en servicio: espera a que cierren sus jornadas para desactivarlo');
    }
    if (typeof cuerpo.representante_id === 'string') {
      if (!estado.representantes.some((r) => r.id === cuerpo.representante_id && r.activo)) {
        return error(400, 'El representante no existe o no está activo');
      }
      trazado.representante_id = cuerpo.representante_id;
    }
    if (typeof cuerpo.activo === 'boolean') trazado.activo = cuerpo.activo;
    return { estado: 200, cuerpo: trazadoAdmin(estado, trazado) };
  }
  if (clave === 'GET /administracion/representantes') {
    const orden = estado.representantes.toSorted((a, b) => Number(b.activo) - Number(a.activo) || a.nombre_completo.localeCompare(b.nombre_completo));
    return { estado: 200, cuerpo: orden.map((r) => representanteAdmin(estado, r)) };
  }
  if (clave === 'POST /administracion/representantes') {
    const correo = String(cuerpo.correo_electronico).toLowerCase();
    if (String(cuerpo.contrasena ?? '').length < 15) return error(400, 'La contraseña debe tener al menos 15 caracteres');
    if (estado.representantes.some((r) => r.correo_electronico === correo) || correo in USUARIOS) {
      return error(409, 'Ya existe una cuenta con ese correo');
    }
    const nuevo = {
      id: `00000000-0000-4000-8000-${String(410 + estado.representantes.length).padStart(12, '0')}`,
      nombre_completo: String(cuerpo.nombre_completo),
      correo_electronico: correo,
      activo: true,
    };
    estado.representantes.push(nuevo);
    return { estado: 201, cuerpo: representanteAdmin(estado, nuevo) };
  }
  const estadoRepresentante = /^PATCH \/administracion\/representantes\/([^/]+)$/.exec(clave);
  if (estadoRepresentante) {
    const representante = estado.representantes.find((r) => r.id === estadoRepresentante[1]);
    if (!representante) return error(404, 'Representante no encontrado');
    representante.activo = Boolean(cuerpo.activo);
    return { estado: 204 };
  }

  // Administrador: auditoria
  if (clave === 'GET /auditoria') {
    const tipo = consulta.get('tipo');
    return { estado: 200, cuerpo: { pagina: 1, por_pagina: 50, eventos: EVENTOS.filter((e) => !tipo || e.tipo === tipo) } };
  }

  return error(404, `Ruta no simulada: ${clave}`);
}

/** Instala la API simulada en la pagina. Devuelve el estado para revisarlo en la prueba. */
export async function simularApi(page: Page, opciones: Opciones = {}): Promise<Estado> {
  const estado = estadoInicial(opciones);
  if (!opciones.conGuia) {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('colectivos.guia', 'vista');
      } catch {
        // sin almacenamiento: la guia aparece y la prueba lo nota
      }
    });
  }
  // El reloj parte en AHORA y avanza normal (Leaflet lo necesita para mostrar las teselas).
  await page.clock.install({ time: AHORA });
  await page.clock.resume();
  // Las teselas del mapa no se piden a internet durante las pruebas.
  await page.route('https://tile.openstreetmap.org/**', (ruta) =>
    ruta.fulfill({ status: 200, contentType: 'image/png', body: TESELA_GRIS }),
  );
  await page.route('**/api/**', async (ruta: Route) => {
    const peticion = ruta.request();
    const url = new URL(peticion.url());
    const camino = url.pathname.replace(/^\/api/, '');
    let cuerpo: Record<string, unknown> = {};
    try {
      cuerpo = (peticion.postDataJSON() as Record<string, unknown> | null) ?? {};
    } catch {
      cuerpo = {};
    }
    const respuesta = responder(estado, peticion.method(), camino, url.searchParams, cuerpo);
    if (respuesta.estado === 204) {
      await ruta.fulfill({ status: 204 });
      return;
    }
    const esTexto = typeof respuesta.cuerpo === 'string';
    await ruta.fulfill({
      status: respuesta.estado,
      contentType: respuesta.tipo ?? 'application/json',
      body: esTexto ? (respuesta.cuerpo as string) : JSON.stringify(respuesta.cuerpo ?? {}),
    });
  });
  return estado;
}

/** PNG de 1x1 gris claro. */
const TESELA_GRIS = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN4+O7dfwAJYAPQ2HQZ3gAAAABJRU5ErkJggg==',
  'base64',
);
