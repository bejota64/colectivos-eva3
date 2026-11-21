/**
 * Demanda del trazado (CU-10): cuantas personas avisaron que esperaban,
 * por hora y por tramo. Sirve para decidir cuantos autos sacar y a que hora.
 */
import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { api, descargarArchivo } from '../../comun/api';
import { MensajeError } from '../../comun/componentes/Formulario';
import { formatoFechaLarga, hoyEnChile, NOMBRE_SENTIDO, nombreTramo } from '../../comun/formato';
import { textoDeError, useDatos } from '../../comun/ganchos';
import type { DemandaFila, NombreSentido } from '../../comun/tipos';
import { Encabezado, useTrazado } from '../App';

type Filtro = 'todos' | NombreSentido;
const HORAS = Array.from({ length: 19 }, (_, i) => i + 5); // 05:00 a 23:00

export function Demanda() {
  const { trazado } = useTrazado();
  const [fecha, setFecha] = useState(() => hoyEnChile());
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [errorCsv, setErrorCsv] = useState('');
  const demanda = useDatos(
    () => api<DemandaFila[]>(`/estadisticas/trazados/${trazado.id}/demanda`, { consulta: { fecha } }),
    `${trazado.id}:${fecha}`,
  );

  const filas = useMemo(
    () => (demanda.datos ?? []).filter((f) => filtro === 'todos' || f.sentido === filtro),
    [demanda.datos, filtro],
  );

  const porHora = useMemo(() => {
    const mapa = new Map<number, number>();
    for (const f of filas) mapa.set(f.hora, (mapa.get(f.hora) ?? 0) + f.personas);
    return HORAS.map((hora) => ({ hora, personas: mapa.get(hora) ?? 0 }));
  }, [filas]);

  const porTramo = useMemo(() => {
    const mapa = new Map<string, { sentido: NombreSentido; numero_tramo: number; avisos: number; personas: number }>();
    for (const f of filas) {
      const clave = `${f.sentido}-${f.numero_tramo}`;
      const actual = mapa.get(clave) ?? { sentido: f.sentido, numero_tramo: f.numero_tramo, avisos: 0, personas: 0 };
      actual.avisos += f.avisos;
      actual.personas += f.personas;
      mapa.set(clave, actual);
    }
    return [...mapa.values()].toSorted((a, b) => b.personas - a.personas);
  }, [filas]);

  const total = filas.reduce((suma, f) => suma + f.personas, 0);

  async function exportar(tipo: 'demanda' | 'reportes') {
    setErrorCsv('');
    try {
      await descargarArchivo(`/estadisticas/trazados/${trazado.id}/${tipo}/csv`, `${tipo}-${trazado.codigo}-${fecha}.csv`, {
        desde: fecha,
        hasta: fecha,
      });
    } catch (e) {
      setErrorCsv(textoDeError(e));
    }
  }

  return (
    <div className="p-seccion">
      <Encabezado titulo="Demanda" detalle="Personas que avisaron que esperaban, por hora y por tramo de 500 metros.">
        <button type="button" className="boton boton-secundario" onClick={() => void exportar('demanda')}>
          <Download size={18} aria-hidden="true" />
          Exportar CSV
        </button>
      </Encabezado>

      <div className="p-filtros">
        <label className="p-filtro">
          <span>Día</span>
          <input
            type="date"
            className="entrada"
            value={fecha}
            max={hoyEnChile()}
            onChange={(e) => e.target.value && setFecha(e.target.value)}
          />
        </label>
        <div className="p-alternador" role="group" aria-label="Sentido">
          {(['todos', 'ida', 'vuelta'] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
              {f === 'todos' ? 'Ambos sentidos' : NOMBRE_SENTIDO[f]}
            </button>
          ))}
        </div>
      </div>
      <MensajeError>{demanda.error || errorCsv}</MensajeError>

      <section className="p-tarjeta" aria-labelledby="titulo-horas">
        <header className="p-tarjeta-cabecera">
          <div>
            <h2 id="titulo-horas">Personas esperando por hora</h2>
            <p className="p-tarjeta-detalle">
              {formatoFechaLarga(`${fecha}T12:00:00`)}. {total === 1 ? '1 persona' : `${total} personas`} en total.
            </p>
          </div>
        </header>
        <GraficoHoras datos={porHora} />
      </section>

      <section className="p-tarjeta" aria-labelledby="titulo-tramos">
        <header className="p-tarjeta-cabecera">
          <h2 id="titulo-tramos">Tramos con más espera</h2>
        </header>
        {porTramo.length === 0 ? (
          <p className="p-nada">Sin avisos de espera este día.</p>
        ) : (
          <div className="p-tabla-contenedor">
            <table className="p-tabla">
              <thead>
                <tr>
                  <th scope="col">Tramo</th>
                  <th scope="col">Sentido</th>
                  <th scope="col" className="p-num">Avisos</th>
                  <th scope="col" className="p-columna-barra">Personas</th>
                </tr>
              </thead>
              <tbody>
                {porTramo.map((t) => (
                  <tr key={`${t.sentido}-${t.numero_tramo}`}>
                    <th scope="row">{nombreTramo(t.numero_tramo)}</th>
                    <td>{NOMBRE_SENTIDO[t.sentido]}</td>
                    <td className="p-num">{t.avisos}</td>
                    <td className="p-columna-barra">
                      <span className="p-barra-celda">
                        <span className="p-barra-pista" aria-hidden="true">
                          <span className="p-barra-fila" style={{ width: `${(t.personas / (porTramo[0]?.personas || 1)) * 100}%` }} />
                        </span>
                        <b>{t.personas}</b>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Barras por hora. Una sola serie: el titulo la nombra y no lleva leyenda.
 * La hora con mas espera va en amarillo con su valor; el resto, en gris.
 * Cada barra es enfocable y muestra su valor al pasar el mouse o el foco.
 */
function GraficoHoras({ datos }: { datos: { hora: number; personas: number }[] }) {
  const [activa, setActiva] = useState<number | null>(null);
  const maximo = Math.max(...datos.map((d) => d.personas), 0);
  const escala = maximo > 0 ? maximo : 1;
  const pico = maximo > 0 ? datos.find((d) => d.personas === maximo)?.hora : undefined;

  if (maximo === 0) {
    return <p className="p-nada">Sin avisos de espera este día.</p>;
  }

  return (
    <figure className="grafico" aria-label="Personas esperando por hora">
      <div className="grafico-area">
        <div className="grafico-guias" aria-hidden="true">
          <span data-valor={maximo} />
          <span data-valor={Math.round(maximo / 2)} />
          <span data-valor={0} />
        </div>
        <div className="grafico-barras">
          {datos.map((d) => {
            const esPico = d.hora === pico;
            const etiqueta = `${String(d.hora).padStart(2, '0')}:00, ${d.personas} ${d.personas === 1 ? 'persona' : 'personas'}`;
            return (
              <div key={d.hora} className="grafico-columna">
                {(esPico || activa === d.hora) && d.personas > 0 && (
                  <span className={`grafico-valor${activa === d.hora && !esPico ? ' grafico-valor-flotante' : ''}`}>
                    {d.personas}
                  </span>
                )}
                <button
                  type="button"
                  className={`grafico-barra${esPico ? ' pico' : ''}`}
                  style={{ height: `${(d.personas / escala) * 100}%` }}
                  aria-label={etiqueta}
                  title={etiqueta}
                  onMouseEnter={() => setActiva(d.hora)}
                  onMouseLeave={() => setActiva(null)}
                  onFocus={() => setActiva(d.hora)}
                  onBlur={() => setActiva(null)}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="grafico-eje" aria-hidden="true">
        {datos.map((d) => (
          <span key={d.hora}>{d.hora % 3 === 0 ? `${d.hora}h` : ''}</span>
        ))}
      </div>
      {pico !== undefined && (
        <figcaption className="grafico-nota">
          La hora con más espera fue las {String(pico).padStart(2, '0')}:00, con {maximo} {maximo === 1 ? 'persona' : 'personas'}.
        </figcaption>
      )}
    </figure>
  );
}
