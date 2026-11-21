/** Estado del trazado ahora: colectivos en servicio, esperas y conductores (CU-09 y CU-12). */
import { useMemo, useState } from 'react';
import { api } from '../../comun/api';
import { Dialogo } from '../../comun/componentes/Dialogo';
import { MensajeError } from '../../comun/componentes/Formulario';
import { Patente } from '../../comun/componentes/Letrero';
import { Mapa, type Espera } from '../../comun/componentes/Mapa';
import { useNotificar } from '../../comun/componentes/Notificacion';
import { formatoDuracion, formatoHora, formatoNota, NOMBRE_SENTIDO } from '../../comun/formato';
import { textoDeError, useAhora, useDatos, useIntervalo } from '../../comun/ganchos';
import { puntoEnRecorrido } from '../../comun/geo';
import type {
  AvisoDelTrazado,
  ColectivoEnRuta,
  EstadisticaConductor,
  JornadaAbierta,
  PuntoRuta,
  Reporte,
} from '../../comun/tipos';
import { Encabezado, useTrazado } from '../App';

const CADA_CUANTO_MS = 15_000;

export function Resumen() {
  const { trazado, detalle } = useTrazado();
  const notificar = useNotificar();
  const ahora = useAhora();
  const base = `/trazados/${trazado.id}`;
  const sentidos = detalle?.sentidos ?? [];
  const [sentidoId, setSentidoId] = useState<string | null>(null);
  const sentido = sentidos.find((s) => s.id === sentidoId) ?? sentidos[0];

  const [jornadas, setJornadas] = useState<JornadaAbierta[] | null>(null);
  const [avisos, setAvisos] = useState<AvisoDelTrazado[]>([]);
  const [colectivos, setColectivos] = useState<ColectivoEnRuta[]>([]);
  const [error, setError] = useState('');
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(null);
  const [cerrando, setCerrando] = useState<JornadaAbierta | null>(null);

  const recorrido = useDatos(
    () => (sentido ? api<PuntoRuta[]>(`/trazados/sentidos/${sentido.id}/recorrido`) : Promise.resolve([])),
    sentido?.id ?? '',
  );
  const pendientes = useDatos(() => api<Reporte[]>(`${base}/reportes`, { consulta: { estado: 'pendiente' } }), base);
  const conductores = useDatos(() => api<EstadisticaConductor[]>(`/estadisticas${base}/conductores`), base);

  useIntervalo(
    async () => {
      try {
        const [j, a, c] = await Promise.all([
          api<JornadaAbierta[]>(`${base}/jornadas`),
          api<AvisoDelTrazado[]>(`${base}/avisos`),
          sentido
            ? api<ColectivoEnRuta[]>('/tiempo-real/colectivos', { consulta: { sentido_id: sentido.id } })
            : Promise.resolve([]),
        ]);
        setJornadas(j);
        setAvisos(a);
        setColectivos(c);
        setActualizadoEn(new Date());
        setError('');
      } catch (e) {
        setError(textoDeError(e));
      }
    },
    CADA_CUANTO_MS,
    sentido?.id ?? '',
  );

  const esperas: Espera[] = useMemo(() => {
    const puntos = recorrido.datos ?? [];
    return avisos
      .filter((a) => a.sentido === sentido?.sentido)
      .flatMap((a, i) => {
        const punto = puntoEnRecorrido(puntos, a.distancia_ruta_m);
        return punto ? [{ clave: `${i}-${a.distancia_ruta_m}`, ...punto, personas: a.personas }] : [];
      });
  }, [avisos, recorrido.datos, sentido?.sentido]);

  async function cerrarJornada() {
    if (!cerrando) return;
    try {
      await api(`${base}/jornadas/${cerrando.id}/cierre`, { metodo: 'POST' });
      setJornadas((lista) => lista?.filter((j) => j.id !== cerrando.id) ?? null);
      notificar(`Jornada de ${cerrando.patente} cerrada`);
      setCerrando(null);
    } catch (e) {
      setError(textoDeError(e));
      setCerrando(null);
    }
  }

  const personasEsperando = avisos.reduce((total, a) => total + a.personas, 0);
  const notas = (conductores.datos ?? []).map((c) => c.nota_promedio).filter((n): n is number => n !== null);
  const notaTrazado = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;

  return (
    <div className="p-seccion">
      <Encabezado
        titulo="Resumen"
        detalle={actualizadoEn ? `Se actualiza solo cada 15 segundos. Último dato: ${formatoHora(actualizadoEn)}.` : 'Cargando el estado del trazado…'}
      />
      <MensajeError>{error}</MensajeError>

      <div className="p-cifras">
        <div className="p-cifra p-cifra-destacada">
          <b>{jornadas?.length ?? '–'}</b>
          <span>Colectivos en servicio</span>
        </div>
        <div className="p-cifra">
          <b>{personasEsperando}</b>
          <span>Personas esperando ahora</span>
        </div>
        <div className="p-cifra">
          <b>{pendientes.datos?.length ?? '–'}</b>
          <span>Reportes sin revisar</span>
        </div>
        <div className="p-cifra">
          <b>{formatoNota(notaTrazado)}</b>
          <span>Nota promedio de conductores</span>
        </div>
      </div>

      <div className="p-resumen">
        <section className="p-tarjeta p-tarjeta-mapa" aria-label="Mapa del trazado">
          <header className="p-tarjeta-cabecera">
            <h2>En el recorrido</h2>
            {sentidos.length > 1 && (
              <div className="p-alternador" role="group" aria-label="Sentido">
                {sentidos.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={s.id === sentido?.id}
                    onClick={() => setSentidoId(s.id)}
                  >
                    {NOMBRE_SENTIDO[s.sentido]}
                  </button>
                ))}
              </div>
            )}
          </header>
          {sentido && (
            <p className="p-tarjeta-detalle">
              Desde {sentido.origen} hasta {sentido.destino}
            </p>
          )}
          <div className="p-mapa">
            <Mapa recorrido={recorrido.datos ?? []} colectivos={colectivos} esperas={esperas} controlesZoom />
          </div>
          <p className="p-leyenda">
            <span className="p-leyenda-colectivo" aria-hidden="true" /> Colectivo con su patente
            <span className="p-leyenda-espera" aria-hidden="true">
              2
            </span>{' '}
            Personas esperando en ese punto
          </p>
        </section>

        <section className="p-tarjeta" aria-labelledby="titulo-jornadas">
          <header className="p-tarjeta-cabecera">
            <h2 id="titulo-jornadas">Jornadas abiertas</h2>
          </header>
          {jornadas?.length === 0 && <p className="p-nada">Ningún conductor está trabajando ahora.</p>}
          <ul className="p-jornadas">
            {jornadas?.map((j) => (
              <li key={j.id}>
                <Patente>{j.patente}</Patente>
                <span className="p-jornadas-tiempo">
                  {formatoDuracion(ahora - new Date(j.iniciada_en).getTime())}
                  <small>desde las {formatoHora(j.iniciada_en)}</small>
                </span>
                <button type="button" className="boton boton-secundario p-boton-chico" onClick={() => setCerrando(j)}>
                  Cerrar
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="p-tarjeta" aria-labelledby="titulo-conductores">
        <header className="p-tarjeta-cabecera">
          <h2 id="titulo-conductores">Conductores</h2>
        </header>
        <MensajeError>{conductores.error}</MensajeError>
        {conductores.datos?.length === 0 && <p className="p-nada">Todavía no hay viajes registrados.</p>}
        {conductores.datos && conductores.datos.length > 0 && (
          <div className="p-tabla-contenedor">
            <table className="p-tabla">
              <thead>
                <tr>
                  <th scope="col">Conductor</th>
                  <th scope="col" className="p-num">Viajes</th>
                  <th scope="col" className="p-num">Nota</th>
                  <th scope="col" className="p-num">Quejas</th>
                  <th scope="col" className="p-num">Felicitaciones</th>
                </tr>
              </thead>
              <tbody>
                {conductores.datos.map((c) => (
                  <tr key={c.conductor}>
                    <th scope="row">{c.conductor}</th>
                    <td className="p-num">{c.abordajes}</td>
                    <td className="p-num">{formatoNota(c.nota_promedio)}</td>
                    <td className="p-num">{c.quejas > 0 ? <span className="p-alerta">{c.quejas}</span> : 0}</td>
                    <td className="p-num">{c.felicitaciones}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialogo
        abierto={cerrando !== null}
        alCerrar={() => setCerrando(null)}
        forma="centro"
        titulo={`¿Cerrar la jornada de ${cerrando?.patente ?? ''}?`}
        descripcion={
          <p>
            Úsalo si el conductor olvidó terminarla o hay un problema con el auto. El colectivo deja de verse en el mapa
            y el conductor lo verá en su app.
          </p>
        }
      >
        <div className="dialogo-acciones">
          <button type="button" className="boton boton-peligro" onClick={() => void cerrarJornada()}>
            Cerrar jornada
          </button>
          <button type="button" className="boton boton-secundario" onClick={() => setCerrando(null)}>
            Cancelar
          </button>
        </div>
      </Dialogo>
    </div>
  );
}
