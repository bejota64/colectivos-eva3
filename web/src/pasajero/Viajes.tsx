/** Historial de viajes: calificar al conductor y enviar quejas o felicitaciones (CU-06). */
import { useState, type FormEvent } from 'react';
import { Route, Star } from 'lucide-react';
import { api } from '../comun/api';
import { OpcionRadio } from '../comun/componentes/OpcionRadio';
import { Dialogo } from '../comun/componentes/Dialogo';
import { MensajeError } from '../comun/componentes/Formulario';
import { Patente } from '../comun/componentes/Letrero';
import { Cargando } from '../comun/componentes/OtraApp';
import { useNotificar } from '../comun/componentes/Notificacion';
import {
  CATEGORIAS_FELICITACION,
  CATEGORIAS_QUEJA,
  formatoFechaCorta,
  formatoHora,
  NOMBRE_CATEGORIA,
  NOMBRE_ESTADO_REPORTE,
  NOMBRE_SENTIDO,
  PLAZO_VALORACION_MS,
} from '../comun/formato';
import { textoDeError, useAhora, useDatos } from '../comun/ganchos';
import type { CategoriaReporte, TipoReporte, Viaje } from '../comun/tipos';
import { Subpagina } from './Subpagina';

export function Viajes() {
  const viajes = useDatos(() => api<Viaje[]>('/abordajes/mios'), 'viajes');
  const [reportando, setReportando] = useState<Viaje | null>(null);
  const ahora = useAhora(60_000);

  function actualizar(id: string, cambios: Partial<Viaje>) {
    if (!viajes.datos) return;
    viajes.fijar(viajes.datos.map((v) => (v.id === id ? { ...v, ...cambios } : v)));
  }

  return (
    <Subpagina titulo="Mis viajes">
      {viajes.cargando && !viajes.datos && <Cargando texto="Cargando tus viajes…" />}
      <MensajeError>{viajes.error}</MensajeError>
      {viajes.datos?.length === 0 && (
        <div className="vacio">
          <Route size={36} aria-hidden="true" />
          <p>
            <b>Todavía no tienes viajes.</b>
          </p>
          <p>Cuando toques «Me subí» en un colectivo, el viaje aparece aquí para que lo califiques.</p>
        </div>
      )}
      <ul className="viajes">
        {viajes.datos?.map((viaje) => {
          const enPlazo = ahora - new Date(viaje.abordado_en).getTime() <= PLAZO_VALORACION_MS;
          return (
            <li key={viaje.id} className="viaje">
              <header className="viaje-cabecera">
                <div>
                  <p className="viaje-fecha">
                    {formatoFechaCorta(viaje.abordado_en)}, {formatoHora(viaje.abordado_en)}
                  </p>
                  <p className="viaje-sentido">{NOMBRE_SENTIDO[viaje.sentido]}</p>
                </div>
                <Patente>{viaje.patente}</Patente>
              </header>

              {viaje.estrellas !== null ? (
                <EstrellasFijas valor={viaje.estrellas} />
              ) : enPlazo ? (
                <Calificar viajeId={viaje.id} alCalificar={(estrellas) => actualizar(viaje.id, { estrellas })} />
              ) : (
                <p className="viaje-plazo">El plazo para calificar este viaje terminó.</p>
              )}

              {viaje.reporte_tipo ? (
                <div className="viaje-reporte">
                  <p>
                    {viaje.reporte_tipo === 'queja' ? 'Enviaste una queja' : 'Enviaste una felicitación'}
                    {viaje.reporte_estado && (
                      <span className={`pildora ${viaje.reporte_estado === 'cerrado' ? 'pildora-verde' : 'pildora-ambar'}`}>
                        {NOMBRE_ESTADO_REPORTE[viaje.reporte_estado]}
                      </span>
                    )}
                  </p>
                  {viaje.reporte_respuesta && (
                    <blockquote className="viaje-respuesta">
                      <span>Respuesta del trazado</span>
                      {viaje.reporte_respuesta}
                    </blockquote>
                  )}
                </div>
              ) : (
                enPlazo && (
                  <button type="button" className="boton boton-secundario boton-ancho" onClick={() => setReportando(viaje)}>
                    Felicitar o reportar un problema
                  </button>
                )
              )}
            </li>
          );
        })}
      </ul>
      <Reportar
        key={reportando?.id ?? 'ninguno'}
        abordajeId={reportando?.id ?? null}
        alCerrar={() => setReportando(null)}
        alEnviar={(tipo) => {
          if (reportando) actualizar(reportando.id, { reporte_tipo: tipo, reporte_estado: 'pendiente' });
          setReportando(null);
        }}
      />
    </Subpagina>
  );
}

export function EstrellasFijas({ valor }: { valor: number }) {
  return (
    <p className="estrellas-fijas" aria-label={`Calificaste con ${valor} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={20} aria-hidden="true" className={n <= valor ? 'llena' : ''} />
      ))}
      <span>Tu calificación</span>
    </p>
  );
}

export function Calificar({ viajeId, alCalificar }: { viajeId: string; alCalificar(estrellas: number): void }) {
  const notificar = useNotificar();
  const [elegidas, setElegidas] = useState(0);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setEnviando(true);
    setError('');
    try {
      await api(`/abordajes/${viajeId}/calificacion`, { metodo: 'POST', cuerpo: { estrellas: elegidas } });
      alCalificar(elegidas);
      notificar('Gracias por calificar el viaje');
    } catch (e) {
      setError(textoDeError(e));
      setEnviando(false);
    }
  }

  return (
    <div className="calificar">
      <fieldset className="estrellas" role="radiogroup" aria-labelledby={`titulo-estrellas-${viajeId}`}>
        <legend id={`titulo-estrellas-${viajeId}`}>¿Cómo estuvo el viaje?</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <OpcionRadio
            key={n}
            className={n <= elegidas ? 'llena' : ''}
            marcada={elegidas === n}
            enfocable={elegidas === 0 && n === 1}
            alElegir={() => setElegidas(n)}
            etiqueta={n === 1 ? '1 estrella' : `${n} estrellas`}
          >
            <Star size={30} aria-hidden="true" />
          </OpcionRadio>
        ))}
      </fieldset>
      {elegidas > 0 && (
        <button type="button" className="boton boton-oscuro" onClick={() => void enviar()} disabled={enviando}>
          Enviar calificación
        </button>
      )}
      <MensajeError>{error}</MensajeError>
    </div>
  );
}

export function Reportar({
  abordajeId,
  tipoInicial = 'queja',
  alCerrar,
  alEnviar,
}: {
  abordajeId: string | null;
  tipoInicial?: TipoReporte;
  alCerrar(): void;
  alEnviar(tipo: TipoReporte): void;
}) {
  const notificar = useNotificar();
  const [tipo, setTipo] = useState<TipoReporte>(tipoInicial);
  const [categoria, setCategoria] = useState<CategoriaReporte>(
    tipoInicial === 'queja' ? 'conduccion_riesgosa' : 'buen_servicio',
  );
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const categorias = tipo === 'queja' ? CATEGORIAS_QUEJA : CATEGORIAS_FELICITACION;

  function cambiarTipo(nuevo: TipoReporte) {
    setTipo(nuevo);
    setCategoria(nuevo === 'queja' ? 'conduccion_riesgosa' : 'buen_servicio');
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!abordajeId) return;
    setEnviando(true);
    setError('');
    try {
      await api(`/abordajes/${abordajeId}/reporte`, {
        metodo: 'POST',
        cuerpo: { tipo, categoria, descripcion: descripcion.trim() },
      });
      notificar(tipo === 'queja' ? 'Queja enviada al representante' : 'Felicitación enviada');
      setDescripcion('');
      alEnviar(tipo);
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo
      abierto={abordajeId !== null}
      alCerrar={alCerrar}
      titulo={tipo === 'queja' ? 'Reportar un problema' : 'Felicitar al conductor'}
      descripcion={<p>Lo recibe el representante del trazado. El conductor no verá quién lo escribió.</p>}
    >
      <form className="formulario" onSubmit={(e) => void enviar(e)}>
        <fieldset className="segmentos segmentos-texto" role="radiogroup" aria-label="Tipo">
          <OpcionRadio className="segmento" marcada={tipo === 'queja'} alElegir={() => cambiarTipo('queja')}>
            <span>Queja</span>
          </OpcionRadio>
          <OpcionRadio className="segmento" marcada={tipo === 'felicitacion'} alElegir={() => cambiarTipo('felicitacion')}>
            <span>Felicitación</span>
          </OpcionRadio>
        </fieldset>
        <div className="campo">
          <label htmlFor="categoria">Motivo</label>
          <select
            id="categoria"
            className="entrada"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as CategoriaReporte)}
          >
            {categorias.map((c) => (
              <option key={c} value={c}>
                {NOMBRE_CATEGORIA[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="descripcion">Cuéntanos qué pasó</label>
          <textarea
            id="descripcion"
            className="entrada"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            minLength={10}
            maxLength={1000}
            required
          />
          <span className="campo-ayuda">{descripcion.trim().length}/1000. Mínimo 10 caracteres.</span>
        </div>
        <MensajeError>{error}</MensajeError>
        <button
          type="submit"
          className="boton boton-principal boton-ancho"
          disabled={enviando || descripcion.trim().length < 10}
        >
          {tipo === 'queja' ? 'Enviar queja' : 'Enviar felicitación'}
        </button>
      </form>
    </Dialogo>
  );
}
