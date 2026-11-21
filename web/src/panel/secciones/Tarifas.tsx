/** Tarifas del trazado (CU-13). Cambiar una tarifa no borra la anterior: queda en el historial. */
import { useState, type FormEvent } from 'react';
import { Clock, Plus } from 'lucide-react';
import { api } from '../../comun/api';
import { Dialogo } from '../../comun/componentes/Dialogo';
import { Campo, MensajeError } from '../../comun/componentes/Formulario';
import { useNotificar } from '../../comun/componentes/Notificacion';
import { formatoFechaCorta, formatoPesos, horaCorta } from '../../comun/formato';
import { textoDeError, useDatos } from '../../comun/ganchos';
import type { Tarifa } from '../../comun/tipos';
import { Encabezado, useTrazado } from '../App';

const MONTO_MINIMO = 1000;
const MONTO_MAXIMO = 3000;

function horario(t: Tarifa): string {
  return t.hora_inicio && t.hora_fin ? `De ${horaCorta(t.hora_inicio)} a ${horaCorta(t.hora_fin)}` : 'Todo el día';
}

export function Tarifas() {
  const { trazado } = useTrazado();
  const notificar = useNotificar();
  const base = `/trazados/${trazado.id}/tarifas`;
  const vigentes = useDatos(() => api<Tarifa[]>(base), base);
  const historial = useDatos(() => api<Tarifa[]>(`${base}/historial`), `${base}/historial`);
  const [nueva, setNueva] = useState(false);
  const [cerrando, setCerrando] = useState<Tarifa | null>(null);
  const [error, setError] = useState('');

  function recargar() {
    vigentes.recargar();
    historial.recargar();
  }

  async function cerrar() {
    if (!cerrando) return;
    try {
      await api(`${base}/${cerrando.id}/cierre`, { metodo: 'POST' });
      notificar(`«${cerrando.nombre}» ya no se cobra`);
      recargar();
    } catch (e) {
      setError(textoDeError(e));
    }
    setCerrando(null);
  }

  return (
    <div className="p-seccion">
      <Encabezado titulo="Tarifas" detalle="Lo que ven los pasajeros. Si cambias el monto de una tarifa, la anterior queda en el historial.">
        <button type="button" className="boton boton-principal" onClick={() => setNueva(true)}>
          <Plus size={18} aria-hidden="true" />
          Nueva tarifa
        </button>
      </Encabezado>
      <MensajeError>{vigentes.error || error}</MensajeError>

      {vigentes.datos?.length === 0 && (
        <div className="p-tarjeta vacio">
          <p>
            <b>No hay tarifas vigentes.</b>
          </p>
          <p>Agrega al menos una para que los pasajeros sepan cuánto cuesta el viaje.</p>
        </div>
      )}
      <div className="p-tarifas">
        {vigentes.datos?.map((t) => (
          <article key={t.id} className="p-tarifa">
            <h2>{t.nombre}</h2>
            <p className="p-tarifa-monto">{formatoPesos(t.monto)}</p>
            <p className="p-tarifa-horario">
              <Clock size={16} aria-hidden="true" />
              {horario(t)}
            </p>
            <footer>
              <span>Desde el {formatoFechaCorta(t.vigente_desde)}</span>
              <button type="button" className="boton boton-texto p-boton-chico" onClick={() => setCerrando(t)}>
                Dejar de cobrar
              </button>
            </footer>
          </article>
        ))}
      </div>

      <section className="p-tarjeta" aria-labelledby="titulo-historial">
        <header className="p-tarjeta-cabecera">
          <h2 id="titulo-historial">Historial de cambios</h2>
        </header>
        <MensajeError>{historial.error}</MensajeError>
        <div className="p-tabla-contenedor">
          <table className="p-tabla">
            <thead>
              <tr>
                <th scope="col">Tarifa</th>
                <th scope="col" className="p-num">Monto</th>
                <th scope="col">Horario</th>
                <th scope="col">Desde</th>
                <th scope="col">Hasta</th>
              </tr>
            </thead>
            <tbody>
              {historial.datos?.map((t) => (
                <tr key={t.id} className={t.vigente_hasta ? 'p-fila-apagada' : ''}>
                  <th scope="row">{t.nombre}</th>
                  <td className="p-num">{formatoPesos(t.monto)}</td>
                  <td>{horario(t)}</td>
                  <td>{formatoFechaCorta(t.vigente_desde)}</td>
                  <td>{t.vigente_hasta ? formatoFechaCorta(t.vigente_hasta) : <span className="pildora pildora-verde">Vigente</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <NuevaTarifa
        abierta={nueva}
        base={base}
        nombresVigentes={(vigentes.datos ?? []).map((t) => t.nombre)}
        alCerrar={() => setNueva(false)}
        alGuardar={() => {
          setNueva(false);
          recargar();
        }}
      />

      <Dialogo
        abierto={cerrando !== null}
        alCerrar={() => setCerrando(null)}
        forma="centro"
        titulo={`¿Dejar de cobrar «${cerrando?.nombre ?? ''}»?`}
        descripcion={<p>Deja de mostrarse a los pasajeros desde ahora. Queda registrada en el historial.</p>}
      >
        <div className="dialogo-acciones">
          <button type="button" className="boton boton-peligro" onClick={() => void cerrar()}>
            Dejar de cobrar
          </button>
          <button type="button" className="boton boton-secundario" onClick={() => setCerrando(null)}>
            Cancelar
          </button>
        </div>
      </Dialogo>
    </div>
  );
}

function NuevaTarifa({
  abierta,
  base,
  nombresVigentes,
  alCerrar,
  alGuardar,
}: {
  abierta: boolean;
  base: string;
  nombresVigentes: string[];
  alCerrar(): void;
  alGuardar(): void;
}) {
  const notificar = useNotificar();
  const [nombre, setNombre] = useState('');
  const [monto, setMonto] = useState('');
  const [conHorario, setConHorario] = useState(false);
  const [inicio, setInicio] = useState('21:00');
  const [fin, setFin] = useState('06:00');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const reemplaza = nombresVigentes.some((n) => n.toLowerCase() === nombre.trim().toLowerCase());

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setError('');
    try {
      await api(base, {
        metodo: 'POST',
        cuerpo: {
          nombre: nombre.trim(),
          monto: Number(monto),
          ...(conHorario ? { hora_inicio: inicio, hora_fin: fin } : {}),
        },
      });
      notificar(reemplaza ? `«${nombre.trim()}» actualizada` : `«${nombre.trim()}» agregada`);
      setNombre('');
      setMonto('');
      setConHorario(false);
      alGuardar();
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo abierto={abierta} alCerrar={alCerrar} forma="centro" titulo="Nueva tarifa">
      <form className="formulario" onSubmit={(e) => void guardar(e)}>
        <Campo
          etiqueta="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          minLength={3}
          maxLength={40}
          required
          placeholder="Por ejemplo: Recorrido completo"
          ayuda={reemplaza ? 'Ya existe una tarifa con este nombre: la nueva la reemplaza.' : undefined}
        />
        <Campo
          etiqueta="Monto en pesos"
          type="number"
          inputMode="numeric"
          min={MONTO_MINIMO}
          max={MONTO_MAXIMO}
          step={50}
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          required
          ayuda={`Entre ${formatoPesos(MONTO_MINIMO)} y ${formatoPesos(MONTO_MAXIMO)}.`}
        />
        <label className="casilla">
          <input type="checkbox" checked={conHorario} onChange={(e) => setConHorario(e.target.checked)} />
          <span>Solo en un horario (por ejemplo, tarifa nocturna)</span>
        </label>
        {conHorario && (
          <div className="p-dos-columnas">
            <Campo etiqueta="Desde" type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
            <Campo etiqueta="Hasta" type="time" value={fin} onChange={(e) => setFin(e.target.value)} required />
          </div>
        )}
        <MensajeError>{error}</MensajeError>
        <div className="dialogo-acciones">
          <button type="submit" className="boton boton-principal" disabled={enviando}>
            {reemplaza ? 'Reemplazar tarifa' : 'Agregar tarifa'}
          </button>
          <button type="button" className="boton boton-secundario" onClick={alCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </Dialogo>
  );
}
