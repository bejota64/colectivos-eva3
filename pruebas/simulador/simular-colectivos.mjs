#!/usr/bin/env node
/**
 * Simulador de colectivos para demostraciones.
 *
 * Mueve colectivos de prueba por el recorrido de un trazado, como si sus
 * conductores tuvieran la app abierta, y envia la posicion de cada uno cada
 * 5 segundos a la API real (POST /api/tiempo-real/posiciones). Avanza a unos
 * 25 km/h, se detiene a recoger a quien avisa que espera, cambia sus
 * asientos libres y en cada terminal da la vuelta.
 *
 * Usa SOLO cuentas y autos propios del simulador, separados de los de la
 * demo y de los reales:
 *   - autos con patente SIMU01, SIMU02... (marca y modelo «Auto simulado»),
 *     asi el pasajero ve en la app que ese colectivo es simulado;
 *   - conductores sim<codigo>-1@colectivos.ejemplo.cl, sim<codigo>-2@...
 * Los crea la primera vez con la cuenta del representante del trazado (las
 * mismas rutas que usa el panel), los activa al partir y al terminar los
 * deja desactivados: fuera de la simulacion no aparecen en la app del
 * conductor ni en el mapa.
 *
 * Lo simulado son las posiciones GPS y los asientos de esos autos. Todo lo
 * demas es el sistema real: la API las valida igual que las de un telefono
 * (sobre el recorrido, velocidad creible, jornada abierta) y el pasajero las
 * ve en el mapa en vivo.
 *
 * Uso (Node 24, sin dependencias):
 *   CLAVE_DEMO=... BASE_URL=https://<dominio> node pruebas/simulador/simular-colectivos.mjs
 * En el servidor se corre como servicio de Docker (ver pruebas/simulador/README.md).
 *
 * Variables:
 *   CLAVE_DEMO     contrasena de las cuentas de la demo (obligatoria; nunca en archivos).
 *                  Las cuentas del simulador se crean con esta misma contrasena.
 *   BASE_URL       por defecto http://localhost:3000
 *   TRAZADO        codigo del trazado, por defecto 9001
 *   REPRESENTANTE  correo del representante del trazado, por defecto representante@colectivos.ejemplo.cl
 *   AUTOS          cuantos autos simulados, 1 a 3 (por defecto 3)
 *   VELOCIDAD_KMH  velocidad media, por defecto 25
 *   DURACION_MIN   minutos antes de terminar solo, por defecto 240
 */
import { pathToFileURL } from 'node:url';

const INTERVALO_S = 5;
const ESPERA_TERMINAL_S = 60;
const PARADA_RECOGER_S = 25;
const METROS_PARA_DETENERSE = 60;

// ---------------------------------------------------------------------
// Calculos puros (los prueba simulador.test.mjs)
// ---------------------------------------------------------------------

/** Largo del recorrido en metros (distancia acumulada del ultimo punto). */
export function largo(recorrido) {
  return recorrido.length ? recorrido[recorrido.length - 1].distancia_acumulada_m : 0;
}

/**
 * Coordenada a cierta distancia desde el inicio del recorrido, interpolando
 * entre los puntos guardados (pueden estar a cientos de metros).
 */
export function puntoEn(recorrido, metros) {
  const total = largo(recorrido);
  const d = Math.min(Math.max(metros, 0), total);
  for (let i = 1; i < recorrido.length; i++) {
    const a = recorrido[i - 1];
    const b = recorrido[i];
    if (d <= b.distancia_acumulada_m) {
      const tramo = b.distancia_acumulada_m - a.distancia_acumulada_m;
      const t = tramo > 0 ? (d - a.distancia_acumulada_m) / tramo : 0;
      return {
        latitud: Number((a.latitud + (b.latitud - a.latitud) * t).toFixed(6)),
        longitud: Number((a.longitud + (b.longitud - a.longitud) * t).toFixed(6)),
      };
    }
  }
  const ultimo = recorrido[recorrido.length - 1];
  return { latitud: ultimo.latitud, longitud: ultimo.longitud };
}

/** Metros que avanza en un intervalo, con +-15 % de variacion (aleatorio en [0, 1)). */
export function avance(velocidadKmh, segundos, aleatorio) {
  return (velocidadKmh / 3.6) * segundos * (0.85 + 0.3 * aleatorio);
}

/**
 * Aviso de espera al que el colectivo debe detenerse ahora: el mas cercano
 * que no haya recogido ya, entre 0 m y lo que avanzara en este envio mas
 * METROS_PARA_DETENERSE (asi nunca se lo pasa de largo, ni yendo rapido).
 */
export function avisoParaRecoger(avisos, recogidos, paso = 0) {
  return (
    avisos
      .filter((a) => a.metros_adelante >= 0 && a.metros_adelante <= paso + METROS_PARA_DETENERSE)
      .filter((a) => !recogidos.has(a.numero_tramo))
      .sort((a, b) => a.metros_adelante - b.metros_adelante)[0] ?? null
  );
}

/** Asientos libres dentro de 0..capacidad. */
export function acotar(asientos, capacidad) {
  return Math.min(Math.max(asientos, 0), capacidad);
}

/** Patente de un auto del simulador: SIMU01..SIMU99 (formato BBBB12 valido). */
export function patenteSimulada(numero) {
  return `SIMU${String(numero).padStart(2, '0')}`;
}

export function esPatenteSimulada(patente) {
  return /^SIMU[0-9]{2}$/.test(patente);
}

/** Correo del conductor simulado numero n del trazado: sim9001-1@colectivos.ejemplo.cl */
export function correoSimulado(codigo, numero) {
  return `sim${String(codigo).toLowerCase().replace(/[^a-z0-9]/g, '')}-${numero}@colectivos.ejemplo.cl`;
}

// ---------------------------------------------------------------------
// Cliente de la API
// ---------------------------------------------------------------------

const hora = () => new Date().toLocaleTimeString('es-CL', { hour12: false });
const registrar = (texto) => console.log(`${hora()}  ${texto}`);
const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

function crearCliente(api, clave) {
  async function iniciarSesion(correo) {
    const r = await fetch(`${api}/autenticacion/inicio-sesion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo_electronico: correo, contrasena: clave }),
    });
    if (r.status !== 200) {
      throw Object.assign(new Error(`No se pudo iniciar sesion con ${correo} (${r.status})`), { estado: r.status });
    }
    return (await r.json()).token_acceso;
  }

  /** Peticion con la sesion de una cuenta; si el token vencio (15 min), entra de nuevo y reintenta. */
  async function pedir(cuenta, metodo, ruta, cuerpo) {
    for (let intento = 0; intento < 2; intento++) {
      const r = await fetch(`${api}${ruta}`, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${cuenta.token}`,
          ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      });
      if (r.status === 401 && intento === 0) {
        cuenta.token = await iniciarSesion(cuenta.correo);
        continue;
      }
      const texto = await r.text();
      let datos = null;
      try {
        datos = texto ? JSON.parse(texto) : null;
      } catch {
        datos = texto;
      }
      return { estado: r.status, datos };
    }
    throw new Error('inalcanzable');
  }

  return { iniciarSesion, pedir };
}

// ---------------------------------------------------------------------
// Simulacion
// ---------------------------------------------------------------------

/**
 * Deja listos los autos y conductores propios del simulador en el trazado,
 * con la cuenta de su representante: crea los que falten y activa los que
 * quedaron desactivados de una simulacion anterior. Devuelve [{correo, id,
 * vehiculo}] en orden (el conductor n maneja el auto n).
 */
async function prepararFlota(cliente, representante, trazado, cantidad, clave) {
  const ruta = `/trazados/${trazado.id}`;

  const vehiculos = await cliente.pedir(representante, 'GET', `${ruta}/vehiculos`);
  if (vehiculos.estado !== 200) {
    throw new Error(`${representante.correo} no administra el trazado ${trazado.codigo} (${vehiculos.estado})`);
  }
  const autos = vehiculos.datos.filter((v) => esPatenteSimulada(v.patente)).sort((x, y) => x.patente.localeCompare(y.patente));
  // Patentes libres: SIMU01, SIMU02... (si una ya la usa otro trazado, la API responde 409 y prueba la siguiente).
  for (let numero = 1; autos.length < cantidad && numero <= 99; numero++) {
    const patente = patenteSimulada(numero);
    if (autos.some((v) => v.patente === patente)) continue;
    const r = await cliente.pedir(representante, 'POST', `${ruta}/vehiculos`, {
      patente,
      marca: 'Auto',
      modelo: 'simulado',
      anio: 2020,
      capacidad: 4,
    });
    if (r.estado === 201) {
      autos.push(r.datos);
      registrar(`Crea el auto ${patente} del simulador`);
    } else if (r.estado !== 409) {
      throw new Error(`No se pudo crear el auto ${patente} (${r.estado} ${JSON.stringify(r.datos)})`);
    }
  }
  const propios = autos.slice(0, cantidad);
  for (const v of propios.filter((x) => !x.activo)) {
    await cliente.pedir(representante, 'PATCH', `${ruta}/vehiculos/${v.id}`, { activo: true });
  }

  const conductores = await cliente.pedir(representante, 'GET', `${ruta}/conductores`);
  const flota = [];
  for (const [i, vehiculo] of propios.entries()) {
    const correo = correoSimulado(trazado.codigo, i + 1);
    let conductor = conductores.datos.find((c) => c.correo_electronico === correo);
    if (!conductor) {
      const r = await cliente.pedir(representante, 'POST', `${ruta}/conductores`, {
        nombre_completo: `Conductor simulado ${i + 1} (${trazado.codigo})`,
        correo_electronico: correo,
        contrasena: clave,
      });
      if (r.estado !== 201) {
        throw new Error(`No se pudo crear la cuenta ${correo} (${r.estado} ${JSON.stringify(r.datos)})`);
      }
      conductor = r.datos;
      registrar(`Crea la cuenta ${correo} del simulador`);
    } else if (!conductor.habilitado) {
      await cliente.pedir(representante, 'PATCH', `${ruta}/conductores/${conductor.usuario_id}`, { habilitado: true });
    }
    flota.push({ correo, id: conductor.usuario_id, vehiculo });
  }
  return flota;
}

/** Al terminar: desactiva los autos y conductores del simulador para que no aparezcan en la app real. */
async function guardarFlota(cliente, representante, trazado, flota) {
  const ruta = `/trazados/${trazado.id}`;
  for (const f of flota) {
    const auto = await cliente.pedir(representante, 'PATCH', `${ruta}/vehiculos/${f.vehiculo.id}`, { activo: false });
    const cuenta = await cliente.pedir(representante, 'PATCH', `${ruta}/conductores/${f.id}`, { habilitado: false });
    if (auto.estado >= 400 || cuenta.estado >= 400) {
      registrar(`${f.vehiculo.patente}: no se pudo desactivar (${auto.estado}/${cuenta.estado}); hazlo desde el panel, seccion Flota`);
    }
  }
  registrar(`Autos ${flota.map((f) => f.vehiculo.patente).join(', ')} y sus conductores quedan desactivados hasta la proxima simulacion`);
}

export async function simular({
  base = process.env.BASE_URL ?? 'http://localhost:3000',
  clave = process.env.CLAVE_DEMO,
  codigo = process.env.TRAZADO ?? '9001',
  correoRepresentante = process.env.REPRESENTANTE ?? 'representante@colectivos.ejemplo.cl',
  cantidad = Number(process.env.AUTOS ?? 3),
  velocidadKmh = Number(process.env.VELOCIDAD_KMH ?? 25),
  duracionMin = Number(process.env.DURACION_MIN ?? 240),
  aleatorio = Math.random,
} = {}) {
  if (!clave) throw new Error('Falta CLAVE_DEMO (contrasena de las cuentas de prueba)');
  // Hasta 3 autos: con cada auto pidiendo cada 5 s, mas autos superarian el limite de 100 peticiones por minuto por IP.
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 3) throw new Error('AUTOS debe ser 1, 2 o 3');
  const api = `${base.replace(/\/$/, '')}/api`;
  const cliente = crearCliente(api, clave);

  // 1. Representante, trazado y recorridos de ida y vuelta.
  const representante = { correo: correoRepresentante, token: await cliente.iniciarSesion(correoRepresentante) };
  const trazados = await cliente.pedir(representante, 'GET', '/trazados');
  const trazado = Array.isArray(trazados.datos) ? trazados.datos.find((t) => t.codigo === codigo) : null;
  if (!trazado) throw new Error(`No hay un trazado activo con codigo ${codigo}`);
  const sentidos = [];
  for (const s of trazado.sentidos) {
    const r = await cliente.pedir(representante, 'GET', `/trazados/sentidos/${s.id}/recorrido`);
    sentidos.push({ ...s, recorrido: r.datos });
  }
  registrar(`Trazado ${codigo}: ${sentidos.map((s) => `${s.destino} ${(largo(s.recorrido) / 1000).toFixed(1)} km`).join(' / ')}`);

  // 2. Autos y conductores propios del simulador (los crea o los activa).
  const flota = await prepararFlota(cliente, representante, trazado, cantidad, clave);

  // 3. Sesion de cada conductor simulado, consentimiento de ubicacion y jornada en SU auto.
  const colectivos = [];
  for (const [i, f] of flota.entries()) {
    const c = { correo: f.correo, token: null };
    try {
      c.token = await cliente.iniciarSesion(f.correo);
    } catch (error) {
      if (error.estado !== 401) throw error;
      // La cuenta existe con otra contrasena (se cambio CLAVE_DEMO): el representante la restablece.
      await cliente.pedir(representante, 'POST', `/trazados/${trazado.id}/conductores/${f.id}/contrasena`, { contrasena: clave });
      c.token = await cliente.iniciarSesion(f.correo);
      registrar(`${f.correo}: el representante le dejo la contrasena de la demo`);
    }
    await cliente.pedir(c, 'POST', '/usuarios/yo/consentimientos/geolocalizacion');

    let jornada = await cliente.pedir(c, 'GET', '/jornadas/actual');
    if (jornada.estado !== 200) {
      const libres = await cliente.pedir(c, 'GET', '/flota/vehiculos-disponibles');
      const auto = Array.isArray(libres.datos) ? libres.datos.find((v) => v.patente === f.vehiculo.patente) : null;
      if (!auto) throw new Error(`${f.vehiculo.patente} no esta libre: otra cuenta tiene una jornada abierta con el`);
      jornada = await cliente.pedir(c, 'POST', '/jornadas', { vehiculo_id: auto.id, sentido_id: sentidos[0].id });
      if (jornada.estado !== 201 && jornada.estado !== 200) {
        throw new Error(`${f.correo}: no se pudo abrir jornada (${jornada.estado} ${JSON.stringify(jornada.datos)})`);
      }
    }
    c.patente = jornada.datos.patente;
    c.capacidad = jornada.datos.capacidad;
    c.asientos = jornada.datos.asientos_disponibles;
    c.sentido = Math.max(0, sentidos.findIndex((s) => s.id === jornada.datos.sentido_id));
    if (sentidos[c.sentido].id !== jornada.datos.sentido_id) {
      await cliente.pedir(c, 'PATCH', '/jornadas/actual/sentido', { sentido_id: sentidos[c.sentido].id });
    }
    // Reparte los autos a lo largo del recorrido.
    c.metros = (largo(sentidos[c.sentido].recorrido) * i) / flota.length;
    c.detenidoHasta = 0;
    c.darVuelta = false;
    c.subenAlPartir = 0;
    c.avisoCerca = false;
    c.recogidos = new Set();
    colectivos.push(c);
    registrar(`${c.patente} (${c.correo}) parte hacia ${sentidos[c.sentido].destino} con ${c.asientos} asientos libres`);
  }

  // 4. Ciclo: cada 5 s cada auto avanza (o sigue detenido) y envia su posicion.
  let terminar = false;
  const detener = () => {
    terminar = true;
  };
  process.once('SIGINT', detener);
  process.once('SIGTERM', detener);
  const fin = Date.now() + duracionMin * 60_000;

  for (let vuelta = 0; !terminar && Date.now() < fin; vuelta++) {
    const inicio = Date.now();
    for (const c of colectivos) {
      const sentido = sentidos[c.sentido];
      const total = largo(sentido.recorrido);

      // Gente esperando adelante, como la ve la app del conductor: cada 15 s,
      // o en cada envio si hay alguien a menos de 400 m (para no pasarse de largo).
      let avisos = null;
      if (vuelta % 3 === 0 || c.avisoCerca) {
        const adelante = await cliente.pedir(c, 'GET', '/avisos-espera/adelante');
        avisos = Array.isArray(adelante.datos) ? adelante.datos : [];
        c.avisoCerca = avisos.some((a) => a.metros_adelante >= 0 && a.metros_adelante < 400);
        const personas = avisos.reduce((suma, a) => suma + a.personas, 0);
        if (personas > 0 && vuelta % 6 === 0) {
          const cercano = Math.min(...avisos.map((a) => a.metros_adelante));
          registrar(`${c.patente} ve ${personas} persona(s) esperando adelante (la mas cercana a ${Math.round(cercano)} m)`);
        }
      }

      if (Date.now() >= c.detenidoHasta) {
        if (c.darVuelta) {
          // Fin de la espera en el terminal: pasa al otro sentido con gente nueva.
          c.sentido = (c.sentido + 1) % sentidos.length;
          c.metros = 0;
          c.darVuelta = false;
          c.recogidos.clear();
          c.asientos = acotar(Math.floor(aleatorio() * (c.capacidad + 1)), c.capacidad);
          await cliente.pedir(c, 'PATCH', '/jornadas/actual/sentido', { sentido_id: sentidos[c.sentido].id });
          await cliente.pedir(c, 'PATCH', '/jornadas/actual/asientos', { asientos_disponibles: c.asientos });
          registrar(`${c.patente} sale del terminal hacia ${sentidos[c.sentido].destino} con ${c.asientos} asientos libres`);
        } else {
          if (c.subenAlPartir) {
            // Terminada la parada: el conductor marca a los que subieron (en la app, «Se subio alguien»).
            c.asientos = acotar(c.asientos - c.subenAlPartir, c.capacidad);
            c.subenAlPartir = 0;
            await cliente.pedir(c, 'PATCH', '/jornadas/actual/asientos', { asientos_disponibles: c.asientos });
            registrar(`${c.patente} sigue con ${c.asientos} asientos libres`);
          }
          const paso = avance(velocidadKmh, INTERVALO_S, aleatorio());
          const aviso = avisos && c.asientos > 0 ? avisoParaRecoger(avisos, c.recogidos, paso) : null;
          if (aviso) {
            // Avanza hasta 10 m antes de quien espera y se detiene a recogerlo.
            c.metros = Math.min(total, c.metros + Math.max(0, aviso.metros_adelante - 10));
            c.recogidos.add(aviso.numero_tramo);
            c.detenidoHasta = Date.now() + PARADA_RECOGER_S * 1000;
            c.subenAlPartir = aviso.personas;
            registrar(`${c.patente} se detiene ${PARADA_RECOGER_S} s a recoger a ${aviso.personas} persona(s): ya pueden marcar «Me subi»`);
          } else {
            c.metros += paso;
            if (c.metros >= total) {
              c.metros = total;
              c.darVuelta = true;
              c.detenidoHasta = Date.now() + ESPERA_TERMINAL_S * 1000;
              registrar(`${c.patente} llega al terminal (${sentido.destino}); espera ${ESPERA_TERMINAL_S} s`);
            }
          }
        }
      }

      const posicion = puntoEn(sentidos[c.sentido].recorrido, c.metros);
      const r = await cliente.pedir(c, 'POST', '/tiempo-real/posiciones', { ...posicion, velocidad_kmh: velocidadKmh });
      if (r.estado === 422 && String(r.datos?.message ?? '').includes('coherente')) {
        // La ultima posicion del auto (de antes de partir el simulador) esta lejos: hay que esperar que caduque.
        registrar(`${c.patente}: la API rechaza el salto desde su posicion anterior; espera 60 s y sigue`);
        c.detenidoHasta = Date.now() + 61_000;
      } else if (r.estado >= 400) {
        registrar(`${c.patente}: posicion rechazada (${r.estado} ${r.datos?.message ?? ''})`);
      }

      // De vez en cuando alguien se baja o se sube en el camino.
      if (!c.darVuelta && !c.subenAlPartir && Date.now() >= c.detenidoHasta && aleatorio() < 0.06) {
        const nuevo = acotar(c.asientos + (aleatorio() < 0.5 ? -1 : 1), c.capacidad);
        if (nuevo !== c.asientos) {
          c.asientos = nuevo;
          await cliente.pedir(c, 'PATCH', '/jornadas/actual/asientos', { asientos_disponibles: c.asientos });
        }
      }
    }

    if (vuelta % 6 === 0) {
      registrar(
        colectivos
          .map((c) => `${c.patente} ${(c.metros / 1000).toFixed(1)} km hacia ${sentidos[c.sentido].destino}, ${c.asientos} libres`)
          .join(' | '),
      );
    }
    await esperar(Math.max(0, INTERVALO_S * 1000 - (Date.now() - inicio)));
  }

  // 5. Al terminar cierra las jornadas y deja los autos y cuentas del simulador desactivados.
  for (const c of colectivos) {
    await cliente.pedir(c, 'POST', '/jornadas/actual/cierre');
    registrar(`${c.patente}: jornada cerrada`);
  }
  await guardarFlota(cliente, representante, trazado, flota);
  registrar('Simulador detenido');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  simular().catch((error) => {
    console.error(`${hora()}  Error: ${error.message}`);
    process.exit(1);
  });
}
