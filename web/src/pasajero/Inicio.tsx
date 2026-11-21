/**
 * Pantalla principal del pasajero. Sigue el flujo validado en el prototipo
 * 1.2 de la EVA 2 (recorrido cognitivo con 4 personas tipo):
 *
 *   elegir sentido («Al Hospital» / «A la Plaza»)
 *   -> «Estoy esperando» (con el permiso de ubicacion la primera vez)
 *   -> «Me subí al ZZZZ01»  -> «Vas en el ZZZZ01»
 *   -> «Ya bajé»            -> calificar, felicitar o reportar
 *
 * Arriba, el mapa del recorrido con los colectivos: el numero de cada uno es
 * cuantos asientos libres trae. Abajo, una hoja con un solo paso a la vez.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Banknote, BusFront, Check, ChevronDown, ChevronRight, CircleHelp, List, LogOut, Route, Search, Star, UserRound } from 'lucide-react';
import { api, ErrorApi } from '../comun/api';
import { Dialogo } from '../comun/componentes/Dialogo';
import { MensajeError } from '../comun/componentes/Formulario';
import { Asientos, Letrero, Patente } from '../comun/componentes/Letrero';
import { Mapa } from '../comun/componentes/Mapa';
import { useNotificar } from '../comun/componentes/Notificacion';
import { formatoDistancia, formatoNota, formatoPesos, horaCorta, iniciales, nombreCorto } from '../comun/formato';
import { textoDeError, useAhora, useDatos, useIntervalo, useUbicacion, type Posicion } from '../comun/ganchos';
import { distanciaMetros, preferencias } from '../comun/geo';
import { useSesion, useUsuario } from '../comun/sesion';
import type { Abordaje, AvisoCreado, ColectivoEnRuta, PuntoRuta, Tarifa, Trazado } from '../comun/tipos';
import { ConsentimientoUbicacion, olvidarUbicacion, ubicacionAceptada } from './ConsentimientoUbicacion';
import { Guia, guiaVista } from './Guia';
import { Calificar, EstrellasFijas, Reportar } from './Viajes';

const CADA_CUANTO_MS = 10_000;
const MENSAJE_SIN_CONSENTIMIENTO = 'Debes aceptar el uso de tu ubicacion';

type Viaje =
  | { tipo: 'libre' }
  | { tipo: 'esperando'; aviso: AvisoCreado }
  | { tipo: 'a-bordo'; abordajeId: string; patente: string; vehiculo: string }
  | { tipo: 'bajo'; abordajeId: string; patente: string };

export function Inicio() {
  const notificar = useNotificar();
  const ahora = useAhora(15_000);
  const trazados = useDatos(() => api<Trazado[]>('/trazados'), 'trazados');
  const [sentidoId, setSentidoId] = useState<string | null>(() => preferencias.leer('sentido'));
  const [conPermiso, setConPermiso] = useState(ubicacionAceptada);
  const [esperandoUbicacion, setEsperandoUbicacion] = useState(false);
  const avisoPendiente = useRef(false);
  const { posicion, estado: estadoUbicacion } = useUbicacion(conPermiso, (nueva) => {
    if (avisoPendiente.current) {
      avisoPendiente.current = false;
      setEsperandoUbicacion(false);
      void avisarEspera(nueva);
    }
  });
  const [colectivos, setColectivos] = useState<ColectivoEnRuta[] | null>(null);
  const [errorColectivos, setErrorColectivos] = useState('');
  const [elegido, setElegido] = useState<string | null>(null);
  const [personas, setPersonas] = useState(1);
  const [viaje, setViaje] = useState<Viaje>({ tipo: 'libre' });
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [verPermiso, setVerPermiso] = useState(false);
  const [verMenu, setVerMenu] = useState(false);
  const [verLineas, setVerLineas] = useState(false);
  const [verLista, setVerLista] = useState(false);
  const [verDetalle, setVerDetalle] = useState(false);
  const [verOtro, setVerOtro] = useState(false);
  const [verGuia, setVerGuia] = useState(() => !guiaVista());

  const todos = trazados.datos ?? [];
  const sentidos = todos.flatMap((t) => t.sentidos.map((s) => ({ ...s, trazado: t })));
  const sentido = sentidos.find((s) => s.id === sentidoId) ?? sentidos[0] ?? null;
  const delMismoTrazado = sentido ? sentidos.filter((s) => s.trazado_id === sentido.trazado_id) : [];

  const recorrido = useDatos(
    () => (sentido ? api<PuntoRuta[]>(`/trazados/sentidos/${sentido.id}/recorrido`) : Promise.resolve([])),
    sentido?.id ?? '',
  );
  const tarifas = useDatos(
    () => (sentido ? api<Tarifa[]>(`/trazados/${sentido.trazado_id}/tarifas`) : Promise.resolve([])),
    sentido?.trazado_id ?? '',
  );

  const hayUbicacion = posicion !== null;
  useIntervalo(
    async () => {
      if (!sentido) return;
      try {
        const lista = await api<ColectivoEnRuta[]>('/tiempo-real/colectivos', {
          consulta: { sentido_id: sentido.id, latitud: posicion?.latitud, longitud: posicion?.longitud },
        });
        setColectivos(lista);
        setErrorColectivos('');
      } catch (e) {
        if (e instanceof ErrorApi && e.estado === 403 && e.message.startsWith(MENSAJE_SIN_CONSENTIMIENTO)) {
          // El permiso se retiro desde otro dispositivo: se vuelve a pedir cuando haga falta.
          olvidarUbicacion();
          setConPermiso(false);
          return;
        }
        setErrorColectivos(textoDeError(e));
      }
    },
    sentido ? CADA_CUANTO_MS : null,
    `${sentido?.id ?? ''}:${hayUbicacion}`,
  );

  // El mapa encuadra el recorrido en la parte que no tapa la hoja.
  const hoja = useRef<HTMLElement>(null);
  const [tapado, setTapado] = useState({ abajo: 360, izquierda: 0 });
  useEffect(() => {
    const elemento = hoja.current;
    if (!elemento || typeof ResizeObserver === 'undefined') return;
    const medir = () => {
      const ancha = window.matchMedia('(min-width: 760px)').matches;
      const caja = elemento.getBoundingClientRect();
      setTapado(ancha ? { abajo: 0, izquierda: Math.round(caja.right) } : { abajo: Math.round(caja.height), izquierda: 0 });
    };
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  function elegirSentido(id: string) {
    if (id === sentido?.id) return;
    setSentidoId(id);
    setColectivos(null);
    setElegido(null);
    preferencias.guardar('sentido', id);
  }

  /** `recien` es la posicion que acaba de llegar, cuando el aviso estaba pendiente. */
  async function avisarEspera(recien?: Posicion) {
    const donde = recien ?? posicion;
    if (!sentido) return;
    if (!conPermiso) {
      avisoPendiente.current = true;
      setVerPermiso(true);
      return;
    }
    if (!donde) {
      avisoPendiente.current = true;
      setEsperandoUbicacion(true);
      return;
    }
    setOcupado(true);
    setError('');
    try {
      const aviso = await api<AvisoCreado>('/avisos-espera', {
        metodo: 'POST',
        cuerpo: { latitud: donde.latitud, longitud: donde.longitud, sentido_id: sentido.id, personas },
      });
      setViaje({ tipo: 'esperando', aviso });
      notificar('Listo: los conductores saben que esperas');
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 403 && e.message.startsWith(MENSAJE_SIN_CONSENTIMIENTO)) {
        olvidarUbicacion();
        setConPermiso(false);
        avisoPendiente.current = true;
        setVerPermiso(true);
      } else {
        setError(textoDeError(e));
      }
    } finally {
      setOcupado(false);
    }
  }

  async function dejarDeEsperar() {
    setOcupado(true);
    setError('');
    try {
      await api('/avisos-espera/actual', { metodo: 'DELETE' });
    } catch (e) {
      // Si el aviso ya habia vencido, igual se vuelve al inicio.
      if (!(e instanceof ErrorApi && e.estado === 404)) {
        setError(textoDeError(e));
        setOcupado(false);
        return;
      }
    }
    notificar('Ya no apareces como esperando');
    setViaje({ tipo: 'libre' });
    setOcupado(false);
  }

  async function subirme(colectivo: ColectivoEnRuta) {
    if (!posicion) {
      setError('Necesitamos tu ubicación para confirmar que estás junto al colectivo.');
      return;
    }
    setOcupado(true);
    setError('');
    try {
      const abordaje = await api<Abordaje>('/abordajes', {
        metodo: 'POST',
        cuerpo: { jornada_id: colectivo.jornada_id, latitud: posicion.latitud, longitud: posicion.longitud },
      });
      setVerOtro(false);
      setVerDetalle(false);
      setViaje({ tipo: 'a-bordo', abordajeId: abordaje.id, patente: colectivo.patente, vehiculo: colectivo.vehiculo });
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setOcupado(false);
    }
  }

  const lista = useMemo(() => colectivos ?? [], [colectivos]);
  // El proximo: el que llega antes; sin ubicacion, el primero de la lista.
  const ordenados = useMemo(
    () => lista.toSorted((a, b) => (a.minutos_estimados ?? Infinity) - (b.minutos_estimados ?? Infinity)),
    [lista],
  );
  const proximo = ordenados.find((c) => c.jornada_id === elegido) ?? ordenados.find((c) => c.minutos_estimados !== null) ?? ordenados[0] ?? null;
  const minutosAviso =
    viaje.tipo === 'esperando' ? Math.max(0, Math.round((new Date(viaje.aviso.expira_en).getTime() - ahora) / 60_000)) : 0;
  const buscandoUbicacion = esperandoUbicacion && conPermiso && estadoUbicacion !== 'denegada' && estadoUbicacion !== 'no-disponible';

  return (
    <div className="inicio">
      <div className="inicio-mapa">
        <Mapa
          recorrido={recorrido.datos ?? []}
          colectivos={lista}
          miUbicacion={posicion}
          seleccionado={proximo?.jornada_id ?? null}
          alSeleccionar={(id) => {
            setElegido(id);
            setVerDetalle(true);
          }}
          margenSuperior={136}
          margenInferior={tapado.abajo}
          margenIzquierdo={tapado.izquierda}
        />
        <p className="leyenda-mapa" aria-hidden="true">
          <b>3</b> = asientos libres
        </p>
      </div>

      <header className="inicio-barra">
        <div className="inicio-fila">
          {sentido && todos.length > 1 ? (
            // Con mas de una linea en la app, el letrero sirve para cambiar de linea.
            <button
              type="button"
              className="inicio-cambiar-linea"
              onClick={() => setVerLineas(true)}
              disabled={viaje.tipo !== 'libre'}
              aria-haspopup="dialog"
              aria-label={`Línea ${sentido.trazado.codigo} hacia ${sentido.destino}. Cambiar de línea`}
            >
              <Letrero codigo={sentido.trazado.codigo} destino={sentido.destino} detalle={`Desde ${sentido.origen}`} className="inicio-letrero" />
              <ChevronDown size={18} aria-hidden="true" className="inicio-cambiar-icono" />
            </button>
          ) : sentido ? (
            <Letrero codigo={sentido.trazado.codigo} destino={sentido.destino} detalle={`Desde ${sentido.origen}`} className="inicio-letrero" />
          ) : (
            <span className="inicio-letrero-vacio">Cargando recorridos…</span>
          )}
          <button type="button" className="boton-flotante boton-avatar" onClick={() => setVerMenu(true)} aria-label="Menú">
            <MenuIniciales />
          </button>
        </div>
        {delMismoTrazado.length > 1 && (
          <div className="sentidos" role="group" aria-label="¿Hacia dónde vas?">
            {delMismoTrazado.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={s.id === sentido?.id}
                disabled={viaje.tipo !== 'libre'}
                onClick={() => elegirSentido(s.id)}
              >
                {nombreCorto(s.destino)}
              </button>
            ))}
          </div>
        )}
      </header>

      <section ref={hoja} className="hoja" aria-label="Tu viaje">
        <span className="hoja-asa" aria-hidden="true" />
        {trazados.error && <MensajeError>{trazados.error}</MensajeError>}

        {viaje.tipo === 'libre' && (
          <>
            <LineaTarifa tarifas={tarifas.datos ?? []} />
            <Proximo
              colectivo={proximo}
              cargando={colectivos === null && !errorColectivos}
              hayUbicacion={hayUbicacion}
              posicion={posicion}
              alAbrir={() => setVerDetalle(true)}
            />
            {errorColectivos && <p className="mensaje mensaje-aviso">{errorColectivos}</p>}

            <fieldset className="segmentos">
              <legend>¿Cuántos esperan? Cuéntate a ti</legend>
              {[1, 2, 3, 4].map((n) => (
                <label key={n} className="segmento">
                  <input type="radio" name="personas" value={n} checked={personas === n} onChange={() => setPersonas(n)} />
                  <span>{n}</span>
                </label>
              ))}
            </fieldset>
            {estadoUbicacion === 'denegada' && (
              <p className="mensaje mensaje-aviso">
                El teléfono bloqueó la ubicación. Actívala para este sitio en la configuración del navegador y vuelve a intentar.
              </p>
            )}
            <MensajeError>{error}</MensajeError>
            <button
              type="button"
              className="boton boton-principal boton-ancho boton-gigante"
              onClick={() => void avisarEspera()}
              disabled={ocupado || buscandoUbicacion || !sentido}
            >
              <Hand />
              <span>
                {buscandoUbicacion ? 'Buscando tu ubicación…' : 'Estoy esperando'}
                <small>Avisa a los colectivos que vienen</small>
              </span>
            </button>
            <div className="hoja-enlaces">
              <button type="button" className="boton boton-texto" onClick={() => setVerLista(true)}>
                <List size={18} aria-hidden="true" />
                Ver como lista
              </button>
              <Link className="boton boton-texto" to="/recorridos">
                <Search size={18} aria-hidden="true" />
                ¿Qué colectivo me sirve?
              </Link>
            </div>
          </>
        )}

        {viaje.tipo === 'esperando' && (
          <div className="estado">
            <p className="estado-marca estado-marca-ok">
              <Check size={18} aria-hidden="true" />
              Avisaste que esperas
            </p>
            <h2>
              {proximo
                ? proximo.minutos_estimados === null
                  ? `El ${proximo.patente} viene en camino`
                  : proximo.minutos_estimados <= 0
                    ? `El ${proximo.patente} está llegando`
                    : `El más cercano llega en ${proximo.minutos_estimados} min`
                : 'Todavía no viene ningún colectivo'}
            </h2>
            <p className="estado-detalle">
              {viaje.aviso.personas === 1 ? 'Avisaste por 1 persona' : `Avisaste por ${viaje.aviso.personas} personas`}. Tu
              aviso vence en {minutosAviso} {minutosAviso === 1 ? 'minuto' : 'minutos'}. Espera en la calle del recorrido.
            </p>
            <MensajeError>{error}</MensajeError>
            {proximo && (
              <button
                type="button"
                className="boton boton-principal boton-ancho boton-gigante"
                onClick={() => void subirme(proximo)}
                disabled={ocupado}
              >
                <BusFront aria-hidden="true" />
                <span>
                  Me subí al {proximo.patente}
                  <small>Tócalo cuando ya estés arriba</small>
                </span>
              </button>
            )}
            {lista.length > 1 && (
              <button type="button" className="boton boton-secundario boton-ancho" onClick={() => setVerOtro(true)}>
                Me subí a otro colectivo
              </button>
            )}
            <button type="button" className="boton boton-texto" onClick={() => void dejarDeEsperar()} disabled={ocupado}>
              Ya no espero
            </button>
          </div>
        )}

        {viaje.tipo === 'a-bordo' && (
          <div className="estado">
            <p className="estado-marca">
              <BusFront size={18} aria-hidden="true" />
              En viaje
            </p>
            <h2>Vas en el {viaje.patente}</h2>
            <p className="estado-detalle">
              {viaje.vehiculo}. Paga en efectivo al conductor. Cuando bajes, toca «Ya bajé» para calificar el viaje.
            </p>
            <button
              type="button"
              className="boton boton-principal boton-ancho boton-gigante"
              onClick={() => setViaje({ tipo: 'bajo', abordajeId: viaje.abordajeId, patente: viaje.patente })}
            >
              <Check aria-hidden="true" />
              <span>
                Ya bajé
                <small>Califica el viaje en un minuto</small>
              </span>
            </button>
          </div>
        )}
      </section>

      <ConsentimientoUbicacion
        abierto={verPermiso}
        alAceptar={() => {
          setVerPermiso(false);
          setConPermiso(true);
          if (avisoPendiente.current) setEsperandoUbicacion(true);
        }}
        alCancelar={() => {
          setVerPermiso(false);
          avisoPendiente.current = false;
        }}
      />

      <Dialogo abierto={verDetalle && proximo !== null} alCerrar={() => setVerDetalle(false)} titulo={proximo ? `Colectivo ${proximo.patente}` : ''}>
        {proximo && (
          <DetalleColectivo
            colectivo={proximo}
            destino={sentido?.destino ?? ''}
            posicion={posicion}
            puedeSubir={viaje.tipo === 'esperando'}
            ocupado={ocupado}
            alSubir={() => void subirme(proximo)}
          />
        )}
        <MensajeError>{verDetalle ? error : ''}</MensajeError>
      </Dialogo>

      <Dialogo abierto={verLista} alCerrar={() => setVerLista(false)} titulo="Colectivos en servicio">
        <ListaColectivos
          colectivos={ordenados}
          alElegir={(c) => {
            setElegido(c.jornada_id);
            setVerLista(false);
            setVerDetalle(true);
          }}
        />
      </Dialogo>

      <Dialogo
        abierto={verOtro}
        alCerrar={() => setVerOtro(false)}
        titulo="¿A cuál te subiste?"
        descripcion={<p>Toca su patente. Tienes que estar a menos de 200 metros de él.</p>}
      >
        <ListaColectivos colectivos={ordenados} posicion={posicion} alElegir={(c) => void subirme(c)} deshabilitado={ocupado} />
        <MensajeError>{verOtro ? error : ''}</MensajeError>
      </Dialogo>

      <DespuesDelViaje
        key={viaje.tipo === 'bajo' ? viaje.abordajeId : 'sin-viaje'}
        viaje={viaje.tipo === 'bajo' ? viaje : null}
        alTerminar={() => {
          setViaje({ tipo: 'libre' });
          notificar('Gracias por contarnos cómo te fue');
        }}
      />

      <Dialogo
        abierto={verLineas}
        alCerrar={() => setVerLineas(false)}
        titulo="¿En qué línea vas?"
        descripcion={<p>Estas líneas ya usan la aplicación. Para ver otras, busca en «¿Qué colectivo me sirve?».</p>}
      >
        <ul className="lineas-app">
          {todos.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                aria-pressed={t.id === sentido?.trazado_id}
                onClick={() => {
                  const primero = t.sentidos[0];
                  if (primero && t.id !== sentido?.trazado_id) elegirSentido(primero.id);
                  setVerLineas(false);
                }}
              >
                <Letrero codigo={t.codigo} chico />
                <span>
                  <b>{t.nombre}</b>
                  <small>{t.comuna}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Dialogo>
      <MenuCuenta abierto={verMenu} alCerrar={() => setVerMenu(false)} alVerGuia={() => setVerGuia(true)} />
      <Guia abierta={verGuia} alCerrar={() => setVerGuia(false)} />
    </div>
  );
}

function MenuIniciales() {
  const usuario = useUsuario();
  return <>{iniciales(usuario.nombre_completo)}</>;
}

function Hand() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 11V6a2 2 0 0 0-4 0v1M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  );
}

/** Tarifa vigente arriba de todo: es lo primero que pregunta quien sube. */
function LineaTarifa({ tarifas }: { tarifas: Tarifa[] }) {
  if (tarifas.length === 0) return null;
  return (
    <p className="tarifa-linea">
      <Banknote size={18} aria-hidden="true" />
      <span>
        {tarifas
          .map((t) => `${t.nombre} ${formatoPesos(t.monto)}${t.hora_inicio && t.hora_fin ? ` (${horaCorta(t.hora_inicio)} a ${horaCorta(t.hora_fin)})` : ''}`)
          .join(', ')}
      </span>
    </p>
  );
}

function Proximo({
  colectivo,
  cargando,
  hayUbicacion,
  posicion,
  alAbrir,
}: {
  colectivo: ColectivoEnRuta | null;
  cargando: boolean;
  hayUbicacion: boolean;
  posicion: { latitud: number; longitud: number } | null;
  alAbrir(): void;
}) {
  if (cargando) {
    return <p className="proximo-vacio">Buscando colectivos en camino…</p>;
  }
  if (!colectivo) {
    return (
      <div className="proximo-vacio">
        <Route size={28} aria-hidden="true" />
        <p>
          <b>No hay colectivos en servicio en este sentido ahora.</b> La pantalla se actualiza sola.
        </p>
      </div>
    );
  }
  const minutos = colectivo.minutos_estimados;
  const distancia = posicion ? distanciaMetros(posicion, colectivo) : null;
  return (
    <button type="button" className={`proximo${colectivo.atenuado ? ' proximo-atenuado' : ''}`} onClick={alAbrir}>
      <span className="proximo-minutos">
        {minutos === null ? (
          <span className="proximo-sin-minutos">{hayUbicacion ? 'Ya pasó' : 'Sin ubicación'}</span>
        ) : (
          <>
            <b>{minutos <= 0 ? 'Ya' : minutos}</b>
            <span>{minutos <= 0 ? 'llegando' : minutos === 1 ? 'minuto' : 'minutos'}</span>
          </>
        )}
      </span>
      <span className="proximo-datos">
        <span className="proximo-titulo">Próximo: {colectivo.patente}</span>
        <span className="proximo-fila">
          <Asientos cantidad={colectivo.asientos_disponibles} />
          <span className="proximo-vehiculo">{colectivo.vehiculo}</span>
        </span>
        <span className="proximo-nota">
          {colectivo.atenuado
            ? `Sin señal: última posición hace ${colectivo.actualizado_hace_s} s`
            : distancia !== null
              ? `A ${formatoDistancia(distancia)} de ti`
              : 'Toca «Estoy esperando» para ver cuánto falta'}
        </span>
      </span>
      <ChevronRight className="proximo-flecha" size={22} aria-hidden="true" />
    </button>
  );
}

function DetalleColectivo({
  colectivo,
  destino,
  posicion,
  puedeSubir,
  ocupado,
  alSubir,
}: {
  colectivo: ColectivoEnRuta;
  destino: string;
  posicion: { latitud: number; longitud: number } | null;
  puedeSubir: boolean;
  ocupado: boolean;
  alSubir(): void;
}) {
  const distancia = posicion ? distanciaMetros(posicion, colectivo) : null;
  return (
    <>
      <dl className="ficha">
        <div>
          <dt>Patente</dt>
          <dd>
            <Patente>{colectivo.patente}</Patente>
          </dd>
        </div>
        <div>
          <dt>Auto</dt>
          <dd>{colectivo.vehiculo}</dd>
        </div>
        <div>
          <dt>Asientos</dt>
          <dd>
            <Asientos cantidad={colectivo.asientos_disponibles} />
          </dd>
        </div>
        <div>
          <dt>Nota del conductor</dt>
          <dd className="nota">
            <Star size={16} aria-hidden="true" />
            {formatoNota(colectivo.nota_promedio)}
          </dd>
        </div>
        <div>
          <dt>Llega en</dt>
          <dd>{colectivo.minutos_estimados === null ? 'Activa tu ubicación' : `${colectivo.minutos_estimados} min`}</dd>
        </div>
        <div>
          <dt>Va hacia</dt>
          <dd>{destino}</dd>
        </div>
      </dl>
      {puedeSubir ? (
        <>
          <button type="button" className="boton boton-principal boton-ancho boton-grande" onClick={alSubir} disabled={ocupado}>
            Me subí
          </button>
          <p className="campo-ayuda">
            Solo se puede marcar a menos de 200 metros del colectivo
            {distancia !== null ? ` (estás a ${formatoDistancia(distancia)})` : ''}.
          </p>
        </>
      ) : (
        <p className="campo-ayuda">Para marcar que te subiste, primero toca «Estoy esperando».</p>
      )}
    </>
  );
}

function ListaColectivos({
  colectivos,
  posicion,
  alElegir,
  deshabilitado,
}: {
  colectivos: ColectivoEnRuta[];
  posicion?: { latitud: number; longitud: number } | null;
  alElegir(colectivo: ColectivoEnRuta): void;
  deshabilitado?: boolean;
}) {
  if (colectivos.length === 0) {
    return <p className="proximo-vacio">No hay colectivos en servicio en este sentido.</p>;
  }
  return (
    <ul className="elegir">
      {colectivos.map((c) => (
        <li key={c.jornada_id}>
          <button type="button" className="elegir-opcion" disabled={deshabilitado} onClick={() => alElegir(c)}>
            <Patente>{c.patente}</Patente>
            <span className="elegir-vehiculo">
              {c.minutos_estimados === null ? c.vehiculo : `Llega en ${c.minutos_estimados} min`}
            </span>
            {posicion ? (
              <span className="elegir-distancia">{formatoDistancia(distanciaMetros(posicion, c))}</span>
            ) : (
              <Asientos cantidad={c.asientos_disponibles} />
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Al bajar: calificar con estrellas y, si quiere, felicitar o reportar (CU-06). */
function DespuesDelViaje({
  viaje,
  alTerminar,
}: {
  viaje: { abordajeId: string; patente: string } | null;
  alTerminar(): void;
}) {
  const [reporte, setReporte] = useState<'queja' | 'felicitacion' | null>(null);
  const [estrellas, setEstrellas] = useState<number | null>(null);
  return (
    <>
      <Dialogo
        abierto={viaje !== null && reporte === null}
        alCerrar={alTerminar}
        titulo="Califica tu viaje"
        descripcion={viaje && <p>Colectivo {viaje.patente}. Toca una estrella.</p>}
      >
        {viaje &&
          (estrellas === null ? (
            <Calificar viajeId={viaje.abordajeId} alCalificar={setEstrellas} />
          ) : (
            <div className="calificado">
              <EstrellasFijas valor={estrellas} />
              <p>¡Gracias! Tu calificación ayuda a otros pasajeros.</p>
            </div>
          ))}
        <div className="dialogo-acciones">
          <button type="button" className="boton boton-secundario boton-ancho" onClick={() => setReporte('felicitacion')}>
            Felicitar al conductor
          </button>
          <button type="button" className="boton boton-secundario boton-ancho" onClick={() => setReporte('queja')}>
            Reportar un problema
          </button>
          <button type="button" className="boton boton-texto" onClick={alTerminar}>
            Listo
          </button>
        </div>
      </Dialogo>
      {reporte && viaje && (
        <Reportar
          abordajeId={viaje.abordajeId}
          tipoInicial={reporte}
          alCerrar={() => setReporte(null)}
          alEnviar={() => {
            setReporte(null);
            alTerminar();
          }}
        />
      )}
    </>
  );
}

function MenuCuenta({ abierto, alCerrar, alVerGuia }: { abierto: boolean; alCerrar(): void; alVerGuia(): void }) {
  const usuario = useUsuario();
  const { salir } = useSesion();
  return (
    <Dialogo abierto={abierto} alCerrar={alCerrar} titulo={usuario.nombre_completo} descripcion={<p>{usuario.correo_electronico}</p>}>
      <nav className="menu">
        <Link className="menu-opcion" to="/recorridos" onClick={alCerrar}>
          <Search size={20} aria-hidden="true" />
          ¿Qué colectivo me sirve?
        </Link>
        <Link className="menu-opcion" to="/viajes" onClick={alCerrar}>
          <Route size={20} aria-hidden="true" />
          Mis viajes
        </Link>
        <Link className="menu-opcion" to="/cuenta" onClick={alCerrar}>
          <UserRound size={20} aria-hidden="true" />
          Mi cuenta y privacidad
        </Link>
        <button
          type="button"
          className="menu-opcion"
          onClick={() => {
            alCerrar();
            alVerGuia();
          }}
        >
          <CircleHelp size={20} aria-hidden="true" />
          ¿Cómo funciona?
        </button>
        <button type="button" className="menu-opcion" onClick={() => void salir()}>
          <LogOut size={20} aria-hidden="true" />
          Cerrar sesión
        </button>
      </nav>
    </Dialogo>
  );
}
