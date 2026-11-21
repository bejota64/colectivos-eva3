/**
 * Lineas del catalogo oficial en el mapa principal: la lista para elegir una
 * (las de la zona, o las que pasan donde se toco el mapa) y la ficha de la
 * elegida, con su ida y su vuelta.
 */
import { Link } from 'react-router';
import { BusFront, Info } from 'lucide-react';
import { Letrero } from '../comun/componentes/Letrero';
import type { LineaCatalogo, NombreSentido, Trazado } from '../comun/tipos';

/**
 * Trazado de la app que corresponde a una linea del catalogo. El panel
 * propone como codigo del trazado el numero de la linea, asi que se comparan.
 */
export function trazadoDeLinea(trazados: Trazado[], numeroLinea: string | null): Trazado | null {
  if (!numeroLinea) return null;
  const numero = numeroLinea.trim().toUpperCase();
  return trazados.find((t) => t.codigo.trim().toUpperCase() === numero) ?? null;
}

function enumerar(partes: string[]): string {
  return new Intl.ListFormat('es', { type: 'conjunction' }).format(partes);
}

export function ListaLineas({ lineas, alElegir }: { lineas: LineaCatalogo[]; alElegir(linea: LineaCatalogo): void }) {
  return (
    <ul className="lineas-app">
      {lineas.map((l) => (
        <li key={l.id}>
          <button type="button" onClick={() => alElegir(l)}>
            <Letrero codigo={l.numero_linea ?? '—'} chico />
            <span>
              <b>
                {l.desde} – {l.hasta}
              </b>
              {/* Una misma linea puede tener un trazado alternativo con los mismos terminales. */}
              <small>
                {l.alternativo ? 'Trazado alternativo. ' : ''}
                {enumerar(l.comunas)}
              </small>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Sentidos que se dibujan al resaltar la linea, con el color de cada uno. */
export function textoSentido(linea: LineaCatalogo, sentido: NombreSentido, sentidos: NombreSentido[]): string {
  if (linea.circular && sentidos.length === 1) return `Recorrido circular desde ${linea.desde}`;
  return sentido === 'ida' ? `Ida: hacia ${linea.hasta}` : `Vuelta: hacia ${linea.desde}`;
}

export function FichaLinea({
  linea,
  sentidos,
  enApp,
  listo,
  alVerEnMapa,
  alVerColectivos,
}: {
  linea: LineaCatalogo;
  /** Los sentidos que tiene dibujados (cuando ya cargo su recorrido). */
  sentidos: NombreSentido[] | null;
  enApp: boolean;
  /** El recorrido completo ya llego y se puede encuadrar. */
  listo: boolean;
  alVerEnMapa(): void;
  alVerColectivos?(): void;
}) {
  const dibujados = sentidos ?? (linea.circular ? ['ida'] : ['ida', 'vuelta']);
  const empresa = linea.empresa?.replace(/\.$/, '');
  return (
    <>
      <ul className="linea-sentidos">
        {dibujados.map((s) => (
          <li key={s}>
            <span className={`muestra muestra-${s}`} aria-hidden="true" />
            {textoSentido(linea, s, dibujados)}
          </li>
        ))}
      </ul>
      <p className="linea-datos">
        {linea.alternativo ? 'Trazado alternativo. ' : ''}
        {empresa ? `${empresa}. ` : ''}
        {linea.comunas.length > 0 ? `Pasa por ${enumerar(linea.comunas)}.` : ''}
      </p>
      {enApp ? (
        <p className="aviso-catalogo aviso-catalogo-app">
          <BusFront size={18} aria-hidden="true" />
          Esta línea usa la aplicación: puedes ver dónde vienen sus colectivos.
        </p>
      ) : (
        <p className="aviso-catalogo">
          <Info size={18} aria-hidden="true" />
          Esta línea todavía no usa la aplicación: puedes ver por dónde pasa, pero no dónde vienen sus autos.
        </p>
      )}
      <div className="dialogo-acciones">
        {enApp && alVerColectivos && (
          <button type="button" className="boton boton-principal boton-ancho" onClick={alVerColectivos}>
            Ver sus colectivos
          </button>
        )}
        <button
          type="button"
          className={`boton ${enApp ? 'boton-secundario' : 'boton-principal'} boton-ancho`}
          onClick={alVerEnMapa}
          disabled={!listo}
        >
          {listo ? 'Ver el recorrido en el mapa' : 'Cargando el recorrido…'}
        </button>
        <Link className="boton boton-texto" to={`/recorridos/${linea.id}`}>
          Calles por donde pasa
        </Link>
      </div>
    </>
  );
}
