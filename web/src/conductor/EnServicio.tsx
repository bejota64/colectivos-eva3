/**
 * Jornada en curso (CU-07 y CU-08): asientos libres, posicion GPS cada
 * 5 segundos y personas esperando mas adelante en el recorrido.
 */
import { useEffect, useRef, useState } from 'react';
import { Hand, Minus, Plus, UsersRound } from 'lucide-react';
import { nombreCorto } from '../comun/formato';
import { api, ErrorApi } from '../comun/api';
import { Dialogo } from '../comun/componentes/Dialogo';
import { MensajeError } from '../comun/componentes/Formulario';
import { Letrero, Patente } from '../comun/componentes/Letrero';
import { formatoDistancia, formatoHora, nivelAsientos, nombreTramo } from '../comun/formato';
import { textoDeError, useIntervalo, useUbicacion, type Posicion } from '../comun/ganchos';
import type { EsperaAdelante, Jornada, Trazado } from '../comun/tipos';

const ENVIO_GPS_MS = 5_000;
const ESPERAS_MS = 15_000;
/** Sobre esta velocidad el contador se bloquea: no se usa el celular manejando. */
const VELOCIDAD_BLOQUEO_KMH = 5;

type EstadoEnvio = 'esperando' | 'ok' | 'fuera' | 'sin-permiso' | 'error';

interface Props {
  jornada: Jornada;
  trazados: Trazado[];
  alCambiar(jornada: Jornada): void;
  alTerminar(motivo: string): void;
}

const NIVEL: Record<ReturnType<typeof nivelAsientos>, { texto: string; clase: string }> = {
  disponible: { texto: 'Con asientos', clase: 'pildora-verde' },
  ultimo: { texto: 'Último asiento', clase: 'pildora-ambar' },
  completo: { texto: 'Completo', clase: 'pildora-rojo' },
};

export function EnServicio({ jornada, trazados, alCambiar, alTerminar }: Props) {
  const { posicion, estado: gps } = useUbicacion(true);
  const ultimaPosicion = useRef<Posicion | null>(null);
  const [envio, setEnvio] = useState<EstadoEnvio>('esperando');
  const [asientos, setAsientos] = useState(jornada.asientos_disponibles);
  const [esperas, setEsperas] = useState<EsperaAdelante[] | null>(null);
  const [error, setError] = useState('');
  const [confirmar, setConfirmar] = useState<'sentido' | 'terminar' | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    ultimaPosicion.current = posicion;
  }, [posicion]);

  const sentidos = trazados.flatMap((t) => t.sentidos.map((s) => ({ ...s, codigo: t.codigo })));
  const sentido = sentidos.find((s) => s.id === jornada.sentido_id);
  const otroSentido = sentido ? sentidos.find((s) => s.trazado_id === sentido.trazado_id && s.id !== sentido.id) : undefined;
  const enMovimiento = (posicion?.velocidadKmh ?? 0) > VELOCIDAD_BLOQUEO_KMH;

  useMantenerPantallaEncendida();

  function manejarJornadaCerrada(e: unknown): boolean {
    if (e instanceof ErrorApi && e.estado === 409 && e.message === 'Jornada cerrada') {
      alTerminar('Tu jornada se cerró');
      return true;
    }
    return false;
  }

  // Envia la ultima posicion conocida cada 5 s, aunque el auto este detenido:
  // si deja de llegar, el colectivo se ve atenuado en el mapa del pasajero.
  useIntervalo(async () => {
    const p = ultimaPosicion.current;
    if (!p) return;
    try {
      await api('/tiempo-real/posiciones', {
        metodo: 'POST',
        cuerpo: {
          latitud: p.latitud,
          longitud: p.longitud,
          ...(p.velocidadKmh !== null ? { velocidad_kmh: Math.min(150, Math.max(0, p.velocidadKmh)) } : {}),
        },
      });
      setEnvio('ok');
    } catch (e) {
      if (manejarJornadaCerrada(e)) return;
      if (e instanceof ErrorApi && e.estado === 422) setEnvio('fuera');
      else if (e instanceof ErrorApi && e.estado === 403) setEnvio('sin-permiso');
      else setEnvio('error');
    }
  }, ENVIO_GPS_MS);

  useIntervalo(
    async () => {
      try {
        setEsperas(await api<EsperaAdelante[]>('/avisos-espera/adelante'));
      } catch (e) {
        manejarJornadaCerrada(e);
      }
    },
    ESPERAS_MS,
    jornada.sentido_id,
  );

  async function cambiarAsientos(nuevo: number) {
    if (nuevo < 0 || nuevo > jornada.capacidad) return;
    const anterior = asientos;
    setAsientos(nuevo);
    setError('');
    try {
      const actualizada = await api<Jornada>('/jornadas/actual/asientos', {
        metodo: 'PATCH',
        cuerpo: { asientos_disponibles: nuevo },
      });
      setAsientos(actualizada.asientos_disponibles);
    } catch (e) {
      setAsientos(anterior);
      if (!manejarJornadaCerrada(e)) setError(textoDeError(e));
    }
  }

  async function cambiarSentido() {
    if (!otroSentido) return;
    setOcupado(true);
    setError('');
    try {
      const actualizada = await api<Jornada>('/jornadas/actual/sentido', {
        metodo: 'PATCH',
        cuerpo: { sentido_id: otroSentido.id },
      });
      setEsperas(null);
      setConfirmar(null);
      alCambiar(actualizada);
    } catch (e) {
      if (!manejarJornadaCerrada(e)) setError(textoDeError(e));
      setConfirmar(null);
    } finally {
      setOcupado(false);
    }
  }

  async function terminar() {
    setOcupado(true);
    setError('');
    try {
      await api('/jornadas/actual/cierre', { metodo: 'POST' });
      alTerminar('Jornada terminada');
    } catch (e) {
      if (!manejarJornadaCerrada(e)) {
        setError(textoDeError(e));
        setConfirmar(null);
        setOcupado(false);
      }
    }
  }

  const nivel = NIVEL[nivelAsientos(asientos)];
  const personasAdelante = (esperas ?? []).reduce((total, e) => total + e.personas, 0);

  return (
    <main className="c-servicio">
      <section className="c-ruta-actual">
        {sentido && <Letrero codigo={sentido.codigo} destino={sentido.destino} detalle={`Desde ${sentido.origen}`} />}
        <div className="c-ruta-datos">
          <Patente>{jornada.patente}</Patente>
          <EstadoGps gps={gps} envio={envio} />
          <span className="c-desde">Desde las {formatoHora(jornada.iniciada_en)}</span>
        </div>
        {gps === 'denegada' && (
          <p className="mensaje mensaje-error" role="alert">
            El navegador bloqueó la ubicación. Permítela para este sitio en la configuración del navegador: sin ella los
            pasajeros no te ven en el mapa.
          </p>
        )}
      </section>

      {otroSentido && sentido && (
        <div className="c-sentidos" role="group" aria-label="Sentido en que vas">
          <button type="button" aria-pressed="true">
            {nombreCorto(sentido.destino)}
          </button>
          <button type="button" aria-pressed="false" onClick={() => setConfirmar('sentido')} disabled={enMovimiento}>
            {nombreCorto(otroSentido.destino)}
          </button>
        </div>
      )}

      <section className="c-asientos" aria-labelledby="titulo-asientos">
        <h2 id="titulo-asientos">Asientos libres</h2>
        <div className="c-contador">
          <button
            type="button"
            className="c-boton-contador"
            onClick={() => void cambiarAsientos(asientos - 1)}
            disabled={enMovimiento || asientos <= 0}
          >
            <Minus size={40} strokeWidth={2.5} aria-hidden="true" />
            <span>Se subió alguien</span>
          </button>
          <output className="c-cifra" aria-live="polite" aria-label={`${asientos} de ${jornada.capacidad} asientos libres`}>
            <b>{asientos}</b>
            <span>de {jornada.capacidad}</span>
          </output>
          <button
            type="button"
            className="c-boton-contador"
            onClick={() => void cambiarAsientos(asientos + 1)}
            disabled={enMovimiento || asientos >= jornada.capacidad}
          >
            <Plus size={40} strokeWidth={2.5} aria-hidden="true" />
            <span>Se bajó alguien</span>
          </button>
        </div>
        <span className={`pildora ${nivel.clase}`}>{nivel.texto}</span>
        {enMovimiento && (
          <p className="c-bloqueo" role="status">
            <Hand size={20} aria-hidden="true" />
            Controles bloqueados mientras el auto se mueve.
          </p>
        )}
        <MensajeError>{error}</MensajeError>
      </section>

      <section className="c-adelante" aria-labelledby="titulo-adelante">
        <header>
          <h2 id="titulo-adelante">Esperando adelante</h2>
          {personasAdelante > 0 && (
            <span className="c-total">
              <UsersRound size={18} aria-hidden="true" />
              {personasAdelante}
            </span>
          )}
        </header>
        {esperas === null && <p className="c-nota">Buscando avisos…</p>}
        {esperas?.length === 0 && <p className="c-nota">Nadie avisó que espera más adelante. Se actualiza cada 15 segundos.</p>}
        {esperas && esperas.length > 0 && (
          <ul className="c-esperas">
            {esperas.map((e) => (
              <li key={`${e.numero_tramo}-${e.metros_adelante}`}>
                <b className="c-esperas-distancia">{formatoDistancia(e.metros_adelante)}</b>
                <span className="c-esperas-tramo">{nombreTramo(e.numero_tramo)}</span>
                <span className="c-esperas-personas">
                  {e.personas} {e.personas === 1 ? 'persona' : 'personas'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="c-acciones">
        <button type="button" className="boton boton-peligro boton-ancho" onClick={() => setConfirmar('terminar')}>
          Terminar jornada
        </button>
      </footer>

      <Dialogo
        abierto={confirmar === 'sentido'}
        alCerrar={() => setConfirmar(null)}
        titulo={otroSentido ? `¿Cambiar a «${nombreCorto(otroSentido.destino)}»?` : '¿Cambiar de sentido?'}
        descripcion={otroSentido && <p>Vas a quedar en el recorrido hacia {otroSentido.destino}. Los pasajeros de ese sentido empezarán a verte.</p>}
      >
        <div className="dialogo-acciones">
          <button type="button" className="boton boton-principal boton-ancho" disabled={ocupado} onClick={() => void cambiarSentido()}>
            Sí, cambiar
          </button>
          <button type="button" className="boton boton-texto" onClick={() => setConfirmar(null)}>
            Cancelar
          </button>
        </div>
      </Dialogo>

      <Dialogo
        abierto={confirmar === 'terminar'}
        alCerrar={() => setConfirmar(null)}
        titulo="¿Terminar la jornada?"
        descripcion={<p>Dejas de aparecer en el mapa y el auto {jornada.patente} queda libre para otro conductor.</p>}
      >
        <div className="dialogo-acciones">
          <button type="button" className="boton boton-peligro boton-ancho" disabled={ocupado} onClick={() => void terminar()}>
            Terminar
          </button>
          <button type="button" className="boton boton-texto" onClick={() => setConfirmar(null)}>
            Seguir
          </button>
        </div>
      </Dialogo>
    </main>
  );
}

function EstadoGps({ gps, envio }: { gps: string; envio: EstadoEnvio }) {
  if (gps === 'denegada') return <span className="pildora pildora-rojo">GPS bloqueado</span>;
  if (gps === 'no-disponible') return <span className="pildora pildora-rojo">Sin GPS</span>;
  if (gps !== 'activa' || envio === 'esperando') return <span className="pildora pildora-ambar">Buscando GPS</span>;
  if (envio === 'fuera') return <span className="pildora pildora-ambar">Fuera del recorrido</span>;
  if (envio === 'sin-permiso') return <span className="pildora pildora-rojo">Sin permiso de ubicación</span>;
  if (envio === 'error') return <span className="pildora pildora-ambar">Sin conexión</span>;
  return <span className="pildora pildora-verde">En el mapa</span>;
}

/** Evita que la pantalla se apague mientras la jornada esta abierta (Screen Wake Lock). */
function useMantenerPantallaEncendida() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let candado: WakeLockSentinel | null = null;
    const pedir = async () => {
      try {
        candado = await navigator.wakeLock.request('screen');
      } catch {
        // Bateria baja o permiso denegado: la app sigue funcionando igual.
      }
    };
    const alVolver = () => {
      if (document.visibilityState === 'visible') void pedir();
    };
    void pedir();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      void candado?.release();
    };
  }, []);
}
