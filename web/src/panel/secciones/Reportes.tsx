/** Quejas y felicitaciones de los pasajeros y su gestion (CU-11). */
import { useState, type FormEvent } from 'react';
import { Download, Inbox } from 'lucide-react';
import { api, descargarArchivo } from '../../comun/api';
import { MensajeError } from '../../comun/componentes/Formulario';
import { Patente } from '../../comun/componentes/Letrero';
import { useNotificar } from '../../comun/componentes/Notificacion';
import { formatoFechaCorta, formatoHora, NOMBRE_CATEGORIA, NOMBRE_ESTADO_REPORTE } from '../../comun/formato';
import { textoDeError, useDatos } from '../../comun/ganchos';
import type { EstadoReporte, Reporte } from '../../comun/tipos';
import { Encabezado, useTrazado } from '../App';

type Filtro = EstadoReporte | 'todos';
const FILTROS: { valor: Filtro; nombre: string }[] = [
  { valor: 'pendiente', nombre: 'Sin revisar' },
  { valor: 'en_revision', nombre: 'En revisión' },
  { valor: 'cerrado', nombre: 'Cerrados' },
  { valor: 'todos', nombre: 'Todos' },
];
const CLASE_ESTADO: Record<EstadoReporte, string> = {
  pendiente: 'pildora-ambar',
  en_revision: 'pildora-azul',
  cerrado: 'pildora-gris',
};

export function Reportes() {
  const { trazado } = useTrazado();
  const [filtro, setFiltro] = useState<Filtro>('pendiente');
  const [elegidoId, setElegidoId] = useState<string | null>(null);
  const [errorCsv, setErrorCsv] = useState('');
  const reportes = useDatos(
    () =>
      api<Reporte[]>(`/trazados/${trazado.id}/reportes`, {
        consulta: { estado: filtro === 'todos' ? undefined : filtro },
      }),
    `${trazado.id}:${filtro}`,
  );
  const lista = reportes.datos ?? [];
  const elegido = lista.find((r) => r.id === elegidoId) ?? lista[0] ?? null;

  async function exportar() {
    setErrorCsv('');
    try {
      await descargarArchivo(`/estadisticas/trazados/${trazado.id}/reportes/csv`, `reportes-${trazado.codigo}.csv`);
    } catch (e) {
      setErrorCsv(textoDeError(e));
    }
  }

  return (
    <div className="p-seccion">
      <Encabezado titulo="Reportes" detalle="Quejas y felicitaciones de los pasajeros sobre sus viajes.">
        <button type="button" className="boton boton-secundario" onClick={() => void exportar()}>
          <Download size={18} aria-hidden="true" />
          Exportar últimos 7 días
        </button>
      </Encabezado>

      <div className="p-pestanas" role="tablist" aria-label="Estado">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            type="button"
            role="tab"
            aria-selected={filtro === f.valor}
            onClick={() => {
              setFiltro(f.valor);
              setElegidoId(null);
            }}
          >
            {f.nombre}
          </button>
        ))}
      </div>
      <MensajeError>{reportes.error || errorCsv}</MensajeError>

      {reportes.datos && lista.length === 0 ? (
        <div className="p-tarjeta vacio">
          <Inbox size={36} aria-hidden="true" />
          <p>
            <b>{filtro === 'pendiente' ? 'Todo revisado.' : 'No hay reportes aquí.'}</b>
          </p>
          <p>Cuando un pasajero envíe una queja o felicitación, aparecerá en esta lista.</p>
        </div>
      ) : (
        <div className="p-bandeja">
          <ul className="p-bandeja-lista" aria-label="Reportes">
            {lista.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="p-bandeja-item"
                  aria-current={r.id === elegido?.id ? 'true' : undefined}
                  onClick={() => setElegidoId(r.id)}
                >
                  <span className={`p-tipo p-tipo-${r.tipo}`}>{r.tipo === 'queja' ? 'Queja' : 'Felicitación'}</span>
                  <span className="p-bandeja-categoria">{NOMBRE_CATEGORIA[r.categoria]}</span>
                  <span className="p-bandeja-resumen">{r.descripcion}</span>
                  <span className="p-bandeja-pie">
                    <Patente>{r.patente}</Patente>
                    <span>{formatoFechaCorta(r.creado_en)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {elegido && (
            <DetalleReporte
              key={elegido.id}
              reporte={elegido}
              trazadoId={trazado.id}
              alCambiar={() => {
                setElegidoId(null);
                reportes.recargar();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function DetalleReporte({
  reporte,
  trazadoId,
  alCambiar,
}: {
  reporte: Reporte;
  trazadoId: string;
  alCambiar(): void;
}) {
  const notificar = useNotificar();
  const [respuesta, setRespuesta] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function cambiar(estado: 'en_revision' | 'cerrado') {
    setEnviando(true);
    setError('');
    try {
      await api(`/trazados/${trazadoId}/reportes/${reporte.id}`, {
        metodo: 'PATCH',
        cuerpo: estado === 'cerrado' ? { estado, respuesta: respuesta.trim() } : { estado },
      });
      notificar(estado === 'cerrado' ? 'Reporte respondido y cerrado' : 'Reporte marcado en revisión');
      alCambiar();
    } catch (e) {
      setError(textoDeError(e));
      setEnviando(false);
    }
  }

  function responder(evento: FormEvent) {
    evento.preventDefault();
    void cambiar('cerrado');
  }

  return (
    <article className="p-tarjeta p-detalle" aria-labelledby="titulo-detalle">
      <header className="p-detalle-cabecera">
        <span className={`p-tipo p-tipo-${reporte.tipo}`}>{reporte.tipo === 'queja' ? 'Queja' : 'Felicitación'}</span>
        <span className={`pildora ${CLASE_ESTADO[reporte.estado]}`}>{NOMBRE_ESTADO_REPORTE[reporte.estado]}</span>
      </header>
      <h2 id="titulo-detalle">{NOMBRE_CATEGORIA[reporte.categoria]}</h2>
      <dl className="p-datos">
        <div>
          <dt>Conductor</dt>
          <dd>{reporte.conductor}</dd>
        </div>
        <div>
          <dt>Auto</dt>
          <dd>
            <Patente>{reporte.patente}</Patente>
          </dd>
        </div>
        <div>
          <dt>Recibido</dt>
          <dd>
            {formatoFechaCorta(reporte.creado_en)}, {formatoHora(reporte.creado_en)}
          </dd>
        </div>
      </dl>
      <blockquote className="p-cita">{reporte.descripcion}</blockquote>

      {reporte.estado === 'cerrado' ? (
        <div className="p-respuesta-final">
          <p className="p-etiqueta">
            Respuesta enviada{reporte.cerrado_en ? ` el ${formatoFechaCorta(reporte.cerrado_en)}` : ''}
          </p>
          <p>{reporte.respuesta}</p>
        </div>
      ) : (
        <form className="formulario" onSubmit={responder}>
          <div className="campo">
            <label htmlFor="respuesta">Respuesta al pasajero</label>
            <textarea
              id="respuesta"
              className="entrada"
              value={respuesta}
              onChange={(e) => setRespuesta(e.target.value)}
              minLength={10}
              maxLength={1000}
              placeholder="Qué revisaste y qué se hizo. El pasajero la ve en su historial de viajes."
            />
            <span className="campo-ayuda">Obligatoria para cerrar. Entre 10 y 1000 caracteres.</span>
          </div>
          <MensajeError>{error}</MensajeError>
          <div className="p-detalle-acciones">
            <button type="submit" className="boton boton-oscuro" disabled={enviando || respuesta.trim().length < 10}>
              Responder y cerrar
            </button>
            {reporte.estado === 'pendiente' && (
              <button type="button" className="boton boton-secundario" disabled={enviando} onClick={() => void cambiar('en_revision')}>
                Marcar en revisión
              </button>
            )}
          </div>
        </form>
      )}
    </article>
  );
}
