/** Detalle de un recorrido del catalogo: el mapa y las calles por donde pasa, por sentido. */
import { useState } from 'react';
import { useParams } from 'react-router';
import { Info } from 'lucide-react';
import { api } from '../comun/api';
import { MensajeError } from '../comun/componentes/Formulario';
import { Mapa } from '../comun/componentes/Mapa';
import { Cargando } from '../comun/componentes/OtraApp';
import { formatoDistancia } from '../comun/formato';
import { useDatos } from '../comun/ganchos';
import type { DetalleLineaCatalogo, NombreSentido } from '../comun/tipos';
import { Subpagina } from './Subpagina';

export function Recorrido() {
  const { id = '' } = useParams();
  const detalle = useDatos(() => api<DetalleLineaCatalogo>(`/catalogo/lineas/${encodeURIComponent(id)}`), id);
  const [sentido, setSentido] = useState<NombreSentido>('ida');
  const linea = detalle.datos;
  const actual = linea?.sentidos.find((s) => s.sentido === sentido) ?? linea?.sentidos[0];
  const puntos = (actual?.puntos ?? []).map((p, i) => ({ ...p, orden: i + 1 }));
  const largo = puntos.at(-1)?.distancia_acumulada_m;

  return (
    <Subpagina titulo={linea ? linea.nombre : 'Recorrido'} volverA="/recorridos">
      {detalle.cargando && !linea && <Cargando texto="Cargando el recorrido…" />}
      <MensajeError>{detalle.error}</MensajeError>
      {linea && (
        <>
          <section className="tarjeta recorrido-cabecera">
            <h2>
              {linea.desde} <span aria-hidden="true">–</span> {linea.hasta}
            </h2>
            <p>
              {linea.empresa ? `${linea.empresa.replace(/\.$/, '')}. ` : ''}
              {linea.flota_vigente ? `${linea.flota_vigente} autos inscritos. ` : ''}
              Folio {linea.folio}.
            </p>
            <p className="aviso-catalogo">
              <Info size={18} aria-hidden="true" />
              Esta línea todavía no usa la aplicación: puedes ver por dónde pasa, pero no dónde vienen sus autos.
            </p>
          </section>

          {linea.sentidos.length > 1 && (
            <div className="sentidos sentidos-pagina" role="group" aria-label="Sentido">
              {linea.sentidos.map((s) => (
                <button key={s.sentido} type="button" aria-pressed={s.sentido === actual?.sentido} onClick={() => setSentido(s.sentido)}>
                  {s.sentido === 'ida' ? `Hacia ${linea.hasta}` : `Hacia ${linea.desde}`}
                </button>
              ))}
            </div>
          )}

          {puntos.length > 1 ? (
            <div className="recorrido-mapa">
              <Mapa recorrido={puntos} controlesZoom />
            </div>
          ) : (
            <p className="mensaje mensaje-aviso">El dibujo de este recorrido en el mapa todavía no está disponible. Abajo están sus calles en orden.</p>
          )}

          <section className="tarjeta">
            <h2>
              Por dónde pasa{largo ? <small> ({formatoDistancia(largo)})</small> : null}
            </h2>
            <ol className="calles">
              {actual?.calles.map((c) => (
                <li key={c.orden}>
                  <span className="calles-nombre">{c.calle}</span>
                  <span className="calles-comuna">{c.comuna}</span>
                </li>
              ))}
            </ol>
          </section>
          <p className="fuente">
            Fuente: Registro Nacional de Transporte Público de Pasajeros (MTT), julio de 2026. Mapa: © colaboradores de
            OpenStreetMap.
          </p>
        </>
      )}
    </Subpagina>
  );
}
