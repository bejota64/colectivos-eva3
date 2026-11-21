/**
 * «¿Qué colectivo me sirve?»: busca entre los recorridos inscritos en el
 * Registro Nacional de Transporte Publico (MTT), aunque la linea todavia no
 * use la aplicacion. Por calle, lugar, numero de linea o cerca de uno.
 */
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { LocateFixed, Search } from 'lucide-react';
import { api } from '../comun/api';
import { MensajeError } from '../comun/componentes/Formulario';
import { Cargando } from '../comun/componentes/OtraApp';
import { formatoDistancia } from '../comun/formato';
import { textoDeError, useDatos } from '../comun/ganchos';
import type { LineaCatalogo } from '../comun/tipos';
import { ConsentimientoUbicacion, ubicacionAceptada } from './ConsentimientoUbicacion';
import { Subpagina } from './Subpagina';

const EJEMPLOS = ['Concha y Toro', 'Hospital Sótero', 'Vicuña Mackenna', '4008'];

export function Recorridos() {
  const [parametros, setParametros] = useSearchParams();
  const buscar = parametros.get('buscar') ?? '';
  const comuna = parametros.get('comuna') ?? '';
  const [texto, setTexto] = useState(buscar);
  const [cercanas, setCercanas] = useState<LineaCatalogo[] | null>(null);
  const [errorCerca, setErrorCerca] = useState('');
  const [buscandoCerca, setBuscandoCerca] = useState(false);
  const [verPermiso, setVerPermiso] = useState(false);

  const comunas = useDatos(() => api<{ comuna: string; lineas: number }[]>('/catalogo/comunas'), 'comunas');
  const lineas = useDatos(
    () =>
      buscar || comuna
        ? api<LineaCatalogo[]>('/catalogo/lineas', { consulta: { buscar: buscar || undefined, comuna: comuna || undefined } })
        : Promise.resolve(null),
    `${buscar}|${comuna}`,
  );

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    setCercanas(null);
    const siguiente = new URLSearchParams(parametros);
    if (texto.trim().length >= 2) siguiente.set('buscar', texto.trim());
    else siguiente.delete('buscar');
    setParametros(siguiente);
  }

  function elegirComuna(valor: string) {
    setCercanas(null);
    const siguiente = new URLSearchParams(parametros);
    if (valor) siguiente.set('comuna', valor);
    else siguiente.delete('comuna');
    setParametros(siguiente);
  }

  function cercaDeMi() {
    if (!ubicacionAceptada()) {
      setVerPermiso(true);
      return;
    }
    setErrorCerca('');
    setBuscandoCerca(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          setCercanas(
            await api<LineaCatalogo[]>('/catalogo/lineas/cercanas', {
              consulta: { latitud: coords.latitude, longitud: coords.longitude, radio_m: 500 },
            }),
          );
        } catch (e) {
          setErrorCerca(textoDeError(e));
        } finally {
          setBuscandoCerca(false);
        }
      },
      () => {
        setErrorCerca('No pudimos saber dónde estás. Revisa que el navegador tenga permiso de ubicación.');
        setBuscandoCerca(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  const resultado = cercanas ?? lineas.datos;

  return (
    <Subpagina titulo="¿Qué colectivo me sirve?">
      <section className="tarjeta buscador">
        <form className="buscador-form" onSubmit={enviar} role="search">
          <label htmlFor="buscar-recorrido" className="buscador-etiqueta">
            Escribe una calle, un lugar o el número de la línea
          </label>
          <div className="buscador-fila">
            <input
              id="buscar-recorrido"
              className="entrada"
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Por ejemplo: Concha y Toro"
              maxLength={60}
              enterKeyHint="search"
            />
            <button type="submit" className="boton boton-oscuro" aria-label="Buscar">
              <Search size={20} aria-hidden="true" />
            </button>
          </div>
        </form>
        {!buscar && !comuna && !cercanas && (
          <p className="buscador-ejemplos">
            Prueba con:{' '}
            {EJEMPLOS.map((e, i) => (
              <span key={e}>
                <button
                  type="button"
                  className="boton-enlace"
                  onClick={() => {
                    setTexto(e);
                    setParametros(new URLSearchParams({ buscar: e }));
                  }}
                >
                  {e}
                </button>
                {i < EJEMPLOS.length - 1 ? ', ' : ''}
              </span>
            ))}
          </p>
        )}
        <div className="buscador-fila">
          <select className="entrada" value={comuna} onChange={(e) => elegirComuna(e.target.value)} aria-label="Comuna">
            <option value="">Todas las comunas</option>
            {comunas.datos?.map((c) => (
              <option key={c.comuna} value={c.comuna}>
                {c.comuna} ({c.lineas})
              </option>
            ))}
          </select>
          <button type="button" className="boton boton-secundario" onClick={cercaDeMi} disabled={buscandoCerca}>
            <LocateFixed size={18} aria-hidden="true" />
            {buscandoCerca ? 'Buscando…' : 'Cerca de mí'}
          </button>
        </div>
      </section>

      <MensajeError>{lineas.error || errorCerca}</MensajeError>
      {lineas.cargando && (buscar || comuna) && !cercanas && <Cargando texto="Buscando recorridos…" />}

      {resultado && (
        <p className="resultado-resumen">
          {cercanas
            ? cercanas.length === 0
              ? 'No encontramos recorridos a menos de 500 m de ti.'
              : `${cercanas.length} ${cercanas.length === 1 ? 'recorrido pasa' : 'recorridos pasan'} a menos de 500 m de ti`
            : resultado.length === 0
              ? 'No encontramos recorridos con esa búsqueda. Prueba con el nombre de una calle.'
              : `${resultado.length === 30 ? 'Los primeros 30' : resultado.length} ${resultado.length === 1 ? 'recorrido' : 'recorridos'}`}
        </p>
      )}

      <ul className="lineas">
        {resultado?.map((linea) => (
          <li key={linea.id}>
            <Link className="linea" to={`/recorridos/${linea.id}`}>
              <span className="linea-numero">{linea.numero_linea ?? '–'}</span>
              <span className="linea-datos">
                <b>
                  {linea.desde} <span aria-hidden="true">–</span> {linea.hasta}
                </b>
                <span>{linea.comunas.join(', ')}</span>
                <span className="linea-etiquetas">
                  {linea.empresa && <span>{linea.empresa}</span>}
                  {linea.circular && <span className="pildora pildora-gris">Circuito</span>}
                  {linea.alternativo && <span className="pildora pildora-ambar">Recorrido alternativo</span>}
                  {linea.tipo_servicio === 'rural' && <span className="pildora pildora-gris">Rural</span>}
                  {linea.distancia_m !== undefined && <span className="pildora pildora-verde">A {formatoDistancia(linea.distancia_m)}</span>}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="fuente">
        Recorridos inscritos en el Registro Nacional de Transporte Público de Pasajeros (Ministerio de Transportes), julio de
        2026.
      </p>

      <ConsentimientoUbicacion
        abierto={verPermiso}
        alAceptar={() => {
          setVerPermiso(false);
          cercaDeMi();
        }}
        alCancelar={() => setVerPermiso(false)}
      />
    </Subpagina>
  );
}
