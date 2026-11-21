/**
 * Pruebas de carga del sistema publicado (k6).
 *
 * Simula lo que hace la app en la calle:
 *   - pasajeros que miran el mapa: piden los colectivos de su sentido cada
 *     5 segundos (lo mismo que hace la app) y a veces buscan en el catalogo;
 *   - conductores en jornada que envian su posicion cada 5 segundos,
 *     avanzando por el recorrido real del trazado.
 *
 * Escenarios (variable ESCENARIO):
 *   limite_ip  Configuracion real (100 peticiones por minuto por IP). Un solo
 *              computador pide mas de eso: se espera que la API responda 429
 *              al exceso, rapido, y siga sana.
 *   normal     30 pasajeros y 3 conductores durante 5 minutos.
 *   punta      Sube a 150 pasajeros en 2 minutos y se mantiene 3 minutos.
 *   quiebre    Sube de a poco hasta 600 pasajeros en 10 minutos, para ver
 *              donde empieza a fallar. No tiene umbrales: se mira el grafico.
 *
 * normal, punta y quiebre salen todos desde un mismo computador, asi que
 * antes hay que subir el limite por IP en el servidor (ver pruebas/README.md)
 * y volver a dejarlo en 100 al terminar.
 *
 * Uso (con Docker, sin instalar k6):
 *   docker run --rm -i -e BASE_URL=https://<dominio> -e CLAVE_DEMO -e ESCENARIO=normal \
 *     -v "$PWD/pruebas/carga:/carga" grafana/k6 run /carga/colectivos.k6.js \
 *     --summary-export=/carga/resultado-normal.json
 *
 * CLAVE_DEMO es la contrasena de las cuentas ficticias de prueba. Se pasa
 * por variable de entorno y nunca se escribe en este archivo.
 */
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const API = `${BASE}/api`;
const CLAVE = __ENV.CLAVE_DEMO;
const ESCENARIO = __ENV.ESCENARIO || 'normal';
const CODIGO_TRAZADO = __ENV.TRAZADO || '9001';
const PASAJERO = __ENV.PASAJERO || 'pasajero1@colectivos.ejemplo.cl';
const CONDUCTORES = (__ENV.CONDUCTORES ||
  'conductor1@colectivos.ejemplo.cl,conductor2@colectivos.ejemplo.cl,conductor3@colectivos.ejemplo.cl').split(',');

// Busquedas tipicas en el catalogo de recorridos (sin datos personales).
const BUSQUEDAS = ['Concha y Toro', 'Puente Alto', 'Plaza', 'Hospital', 'Gabriela', 'La Florida', 'Metro'];

const limitadas = new Counter('respuestas_429');
const errores = new Rate('errores_reales');
const tiempoMapa = new Trend('tiempo_mapa_ms', true);
const tiempoPosicion = new Trend('tiempo_posicion_ms', true);

/**
 * Un escenario por conductor (1 usuario virtual cada uno), para que cada
 * cuenta tenga su propio auto. Parten 65 s despues que los pasajeros: la API
 * compara cada posicion con la anterior del ultimo minuto, y si se corre un
 * escenario justo despues de otro, el primer envio "saltaria" desde donde
 * quedo el auto en la prueba anterior y se rechazaria (422).
 */
function escenariosConductores(totalSegundos) {
  const escenarios = {};
  CONDUCTORES.forEach((_, i) => {
    escenarios[`conductor_${i + 1}`] = {
      executor: 'constant-vus',
      exec: 'conductor',
      vus: 1,
      startTime: '65s',
      duration: `${totalSegundos - 65}s`,
      env: { INDICE: String(i) },
    };
  });
  return escenarios;
}

const ESCENARIOS = {
  limite_ip: {
    scenarios: {
      exceso: { executor: 'constant-arrival-rate', exec: 'pasajeroSinPausa', rate: 4, timeUnit: '1s', duration: '90s', preAllocatedVUs: 10 },
    },
    thresholds: {
      respuestas_429: ['count>0'], // el limite tiene que actuar
      'http_req_duration{status:429}': ['p(95)<200'], // y rechazar rapido
      errores_reales: ['rate<0.01'], // sin 5xx ni caidas
    },
  },
  normal: {
    scenarios: {
      pasajeros: { executor: 'constant-vus', exec: 'pasajero', vus: 30, duration: '5m' },
      ...escenariosConductores(300),
    },
    thresholds: {
      http_req_failed: ['rate<0.01'],
      http_req_duration: ['p(95)<500'],
      tiempo_mapa_ms: ['p(95)<500'],
      tiempo_posicion_ms: ['p(95)<500'],
    },
  },
  punta: {
    scenarios: {
      pasajeros: {
        executor: 'ramping-vus',
        exec: 'pasajero',
        startVUs: 0,
        stages: [
          { duration: '2m', target: 150 },
          { duration: '3m', target: 150 },
        ],
      },
      ...escenariosConductores(300),
    },
    thresholds: {
      http_req_failed: ['rate<0.01'],
      http_req_duration: ['p(95)<1000'],
      tiempo_mapa_ms: ['p(95)<1000'],
    },
  },
  quiebre: {
    scenarios: {
      pasajeros: {
        executor: 'ramping-vus',
        exec: 'pasajero',
        startVUs: 0,
        stages: [
          { duration: '2m', target: 100 },
          { duration: '2m', target: 200 },
          { duration: '2m', target: 300 },
          { duration: '2m', target: 450 },
          { duration: '2m', target: 600 },
        ],
      },
      ...escenariosConductores(600),
    },
    thresholds: {},
  },
};

if (!ESCENARIOS[ESCENARIO]) {
  throw new Error(`ESCENARIO desconocido: ${ESCENARIO}. Usa limite_ip, normal, punta o quiebre.`);
}

export const options = {
  ...ESCENARIOS[ESCENARIO],
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  // El certificado del servidor es real (Let's Encrypt): no se desactiva la verificacion.
};

const conToken = (token, etiqueta) => ({ headers: { Authorization: `Bearer ${token}` }, tags: { name: etiqueta } });

function iniciarSesion(correo) {
  const r = http.post(`${API}/autenticacion/inicio-sesion`, JSON.stringify({ correo_electronico: correo, contrasena: CLAVE }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'inicio-sesion' },
  });
  if (r.status !== 200) fail(`No se pudo iniciar sesion con ${correo}: ${r.status} ${r.body}`);
  return r.json('token_acceso');
}

/** Corre una vez antes de la prueba: sesiones, sentido y jornadas abiertas. */
export function setup() {
  if (!CLAVE) fail('Falta CLAVE_DEMO (contrasena de las cuentas de prueba)');
  const salud = http.get(`${API}/salud`);
  if (salud.status !== 200) fail(`La API no responde bien: GET /api/salud = ${salud.status}`);

  const pasajero = iniciarSesion(PASAJERO);
  const trazados = http.get(`${API}/trazados`, conToken(pasajero, 'trazados')).json();
  const trazado = trazados.find((t) => t.codigo === CODIGO_TRAZADO);
  if (!trazado) fail(`No hay un trazado activo con codigo ${CODIGO_TRAZADO}`);
  const sentidos = trazado.sentidos.map((s) => s.id);
  const recorrido = http
    .get(`${API}/trazados/sentidos/${sentidos[0]}/recorrido`, conToken(pasajero, 'recorrido'))
    .json()
    .map((p) => [p.latitud, p.longitud, p.distancia_acumulada_m]);

  if (ESCENARIO === 'limite_ip') return { pasajero, sentidos, recorrido, conductores: [] };

  const datosConductores = CONDUCTORES.map((correo) => {
    const token = iniciarSesion(correo);
    // 404 = no tiene jornada abierta: es una respuesta esperada, no un error.
    let jornada = http.get(`${API}/jornadas/actual`, {
      ...conToken(token, 'jornada-actual'),
      responseCallback: http.expectedStatuses(200, 404),
    });
    let abiertaPorLaPrueba = false;
    if (jornada.status !== 200) {
      const autos = http.get(`${API}/flota/vehiculos-disponibles`, conToken(token, 'autos')).json();
      if (!Array.isArray(autos) || autos.length === 0) fail(`${correo}: no hay autos libres para abrir jornada`);
      jornada = http.post(`${API}/jornadas`, JSON.stringify({ vehiculo_id: autos[0].id, sentido_id: sentidos[0] }), {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        tags: { name: 'abrir-jornada' },
      });
      if (jornada.status !== 201 && jornada.status !== 200) fail(`${correo}: no se pudo abrir jornada (${jornada.status} ${jornada.body})`);
      abiertaPorLaPrueba = true;
    }
    // La prueba siempre recorre la ida: deja la jornada en ese sentido.
    if (jornada.json('sentido_id') !== sentidos[0]) {
      http.patch(`${API}/jornadas/actual/sentido`, JSON.stringify({ sentido_id: sentidos[0] }), {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        tags: { name: 'cambiar-sentido' },
      });
    }
    return { correo, token, abiertaPorLaPrueba };
  });
  return { pasajero, sentidos, recorrido, conductores: datosConductores };
}

function registrar(r) {
  if (r.status === 429) limitadas.add(1);
  errores.add(r.status === 0 || r.status >= 500);
}

/** Un pasajero con la app abierta: mapa cada 5 s y, a veces, una busqueda. */
export function pasajero(datos) {
  const sentido = datos.sentidos[__VU % datos.sentidos.length];
  const punto = datos.recorrido[(__VU * 7) % datos.recorrido.length];
  const r = http.get(
    `${API}/tiempo-real/colectivos?sentido_id=${sentido}&latitud=${punto[0]}&longitud=${punto[1]}`,
    conToken(datos.pasajero, 'colectivos'),
  );
  registrar(r);
  tiempoMapa.add(r.timings.duration);
  check(r, { 'mapa responde 200': (x) => x.status === 200 });

  if (Math.random() < 0.05) {
    const termino = BUSQUEDAS[Math.floor(Math.random() * BUSQUEDAS.length)];
    const b = http.get(`${API}/catalogo/lineas?buscar=${encodeURIComponent(termino)}`, conToken(datos.pasajero, 'catalogo'));
    registrar(b);
    check(b, { 'catalogo responde 200': (x) => x.status === 200 });
  }
  sleep(5);
}

/** Escenario limite_ip: pide sin pausa para pasar el limite por minuto. */
export function pasajeroSinPausa(datos) {
  const r = http.get(`${API}/tiempo-real/colectivos?sentido_id=${datos.sentidos[0]}`, conToken(datos.pasajero, 'colectivos'));
  registrar(r);
  check(r, { 'responde 200 o 429': (x) => x.status === 200 || x.status === 429 });
}

/**
 * Punto del recorrido a una distancia dada (metros desde el inicio),
 * interpolando entre los puntos guardados. Los puntos pueden estar a varios
 * cientos de metros: saltar de uno a otro seria una velocidad imposible y la
 * API lo rechazaria (VELOCIDAD_MAXIMA_CREIBLE_KMH).
 */
function puntoA(recorrido, metros) {
  const total = recorrido[recorrido.length - 1][2];
  // Al llegar al final se devuelve por el mismo camino (sin saltar al inicio).
  const vuelta = total > 0 ? metros % (2 * total) : 0;
  const d = vuelta > total ? 2 * total - vuelta : vuelta;
  for (let i = 1; i < recorrido.length; i++) {
    const [lat0, lon0, d0] = recorrido[i - 1];
    const [lat1, lon1, d1] = recorrido[i];
    if (d <= d1) {
      const t = d1 > d0 ? (d - d0) / (d1 - d0) : 0;
      return [lat0 + (lat1 - lat0) * t, lon0 + (lon1 - lon0) * t];
    }
  }
  return [recorrido[0][0], recorrido[0][1]];
}

const METROS_POR_ENVIO = (25 * 1000 * 5) / 3600; // 25 km/h, un envio cada 5 s

/** Un conductor en jornada: posicion cada 5 s, avanzando a 25 km/h por el recorrido. */
export function conductor(datos) {
  const indice = Number(__ENV.INDICE);
  const c = datos.conductores[indice];
  // Cada conductor parte 1 km mas adelante que el anterior.
  const punto = puntoA(datos.recorrido, indice * 1000 + __ITER * METROS_POR_ENVIO);
  const r = http.post(
    `${API}/tiempo-real/posiciones`,
    JSON.stringify({ latitud: punto[0], longitud: punto[1], velocidad_kmh: 25 }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.token}` }, tags: { name: 'posicion' } },
  );
  registrar(r);
  tiempoPosicion.add(r.timings.duration);
  check(r, { 'posicion aceptada': (x) => x.status === 200 || x.status === 201 || x.status === 204 });
  if (r.status >= 400 && __ITER < 3) console.warn(`${c.correo}: posicion rechazada ${r.status} ${r.body}`);
  sleep(5);
}

/** Al final: cierra solo las jornadas que abrio la prueba. */
export function teardown(datos) {
  for (const c of datos.conductores) {
    if (c.abiertaPorLaPrueba) {
      http.post(`${API}/jornadas/actual/cierre`, null, conToken(c.token, 'cerrar-jornada'));
    }
  }
}
