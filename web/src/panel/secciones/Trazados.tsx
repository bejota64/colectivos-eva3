/**
 * Trazados que funcionan con la aplicacion (CU-13, administrador). Un
 * trazado nuevo se crea a partir de una linea del registro oficial del MTT:
 * el recorrido de ida y vuelta se copia del catalogo, no se dibuja a mano.
 * La API y la base vuelven a comprobar todo (07_administracion.sql).
 */
import { useState, type FormEvent } from 'react';
import { Plus, Search } from 'lucide-react';
import { api } from '../../comun/api';
import { Dialogo } from '../../comun/componentes/Dialogo';
import { Campo, MensajeError } from '../../comun/componentes/Formulario';
import { Mapa } from '../../comun/componentes/Mapa';
import { useNotificar } from '../../comun/componentes/Notificacion';
import { textoDeError, useDatos } from '../../comun/ganchos';
import type {
  DetalleLineaCatalogo,
  LineaCatalogo,
  RepresentanteAdministracion,
  TrazadoAdministracion,
} from '../../comun/tipos';
import { Encabezado } from '../App';

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function Trazados() {
  const notificar = useNotificar();
  const trazados = useDatos(() => api<TrazadoAdministracion[]>('/administracion/trazados'), 'administracion/trazados');
  const [nuevo, setNuevo] = useState(false);
  const [desactivando, setDesactivando] = useState<TrazadoAdministracion | null>(null);
  const [cambiando, setCambiando] = useState<TrazadoAdministracion | null>(null);
  const [error, setError] = useState('');

  async function cambiarActivo(t: TrazadoAdministracion, activo: boolean) {
    setError('');
    try {
      await api(`/administracion/trazados/${t.id}`, { metodo: 'PATCH', cuerpo: { activo } });
      notificar(activo ? `Trazado ${t.codigo} activado` : `Trazado ${t.codigo} desactivado`);
      trazados.recargar();
    } catch (e) {
      setError(textoDeError(e));
    }
    setDesactivando(null);
  }

  return (
    <div className="p-seccion">
      <Encabezado
        titulo="Trazados"
        detalle="Recorridos que funcionan con la aplicación. Cada uno sale de una línea del registro oficial del MTT y tiene un representante a cargo."
      >
        <button type="button" className="boton boton-principal" onClick={() => setNuevo(true)}>
          <Plus size={18} aria-hidden="true" />
          Nuevo trazado
        </button>
      </Encabezado>

      <section className="p-tarjeta" aria-label="Trazados">
        <MensajeError>{trazados.error || error}</MensajeError>
        {trazados.datos?.length === 0 && <p className="p-nada">Todavía no hay trazados. Crea el primero desde el registro del MTT.</p>}
        {trazados.datos && trazados.datos.length > 0 && (
          <div className="p-tabla-contenedor">
            <table className="p-tabla">
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Trazado</th>
                  <th scope="col">Representante</th>
                  <th scope="col">Flota</th>
                  <th scope="col">Estado</th>
                  <th scope="col">
                    <span className="solo-lector">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {trazados.datos.map((t) => (
                  <tr key={t.id} className={t.activo ? '' : 'p-fila-apagada'}>
                    <th scope="row" className="p-sin-salto">
                      {t.codigo}
                    </th>
                    <td>
                      <span className="p-celda-doble">
                        {t.nombre}
                        <small>{t.comuna}</small>
                      </span>
                    </td>
                    <td>
                      <span className="p-celda-doble">
                        {t.representante.nombre_completo}
                        {!t.representante.activo && <small className="p-alerta">Cuenta desactivada</small>}
                      </span>
                    </td>
                    <td className="p-sin-salto">
                      {plural(t.vehiculos, 'auto', 'autos')}, {plural(t.conductores, 'conductor', 'conductores')}
                    </td>
                    <td>
                      {!t.activo ? (
                        <span className="pildora pildora-gris">Inactivo</span>
                      ) : t.en_servicio > 0 ? (
                        <span className="pildora pildora-azul">{t.en_servicio} en servicio</span>
                      ) : (
                        <span className="pildora pildora-verde">Activo</span>
                      )}
                    </td>
                    <td className="p-acciones-fila">
                      <button type="button" className="boton boton-texto p-boton-chico" onClick={() => setCambiando(t)}>
                        Cambiar representante
                      </button>
                      <button
                        type="button"
                        className="boton boton-secundario p-boton-chico"
                        onClick={() => (t.activo ? setDesactivando(t) : void cambiarActivo(t, true))}
                        disabled={t.activo && t.en_servicio > 0}
                        title={t.activo && t.en_servicio > 0 ? 'Tiene colectivos en servicio' : undefined}
                      >
                        {t.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialogo
        abierto={desactivando !== null}
        alCerrar={() => setDesactivando(null)}
        forma="centro"
        titulo={`¿Desactivar el trazado ${desactivando?.codigo ?? ''}?`}
        descripcion={
          <p>
            Deja de aparecer a los pasajeros, sus conductores no pueden iniciar jornadas y su representante deja de verlo
            en el panel. No se borra nada: tarifas, flota y reportes vuelven al activarlo.
          </p>
        }
      >
        <div className="dialogo-acciones">
          <button type="button" className="boton boton-peligro" onClick={() => desactivando && void cambiarActivo(desactivando, false)}>
            Desactivar
          </button>
          <button type="button" className="boton boton-secundario" onClick={() => setDesactivando(null)}>
            Cancelar
          </button>
        </div>
      </Dialogo>

      <CambiarRepresentante
        trazado={cambiando}
        alCerrar={() => setCambiando(null)}
        alGuardar={() => {
          setCambiando(null);
          trazados.recargar();
        }}
      />
      <NuevoTrazado
        abierto={nuevo}
        alCerrar={() => setNuevo(false)}
        alGuardar={() => {
          setNuevo(false);
          trazados.recargar();
        }}
      />
    </div>
  );
}

/** Representantes con la cuenta activa, para asignarles un trazado. */
function useRepresentantesActivos(clave: string) {
  const representantes = useDatos(() => api<RepresentanteAdministracion[]>('/administracion/representantes'), clave);
  return { ...representantes, activos: representantes.datos?.filter((r) => r.activo) ?? [] };
}

function SelectorRepresentante({
  valor,
  alCambiar,
  representantes,
}: {
  valor: string;
  alCambiar(id: string): void;
  representantes: RepresentanteAdministracion[];
}) {
  return (
    <div className="campo">
      <label htmlFor="representante">Representante</label>
      <select id="representante" className="entrada" value={valor} onChange={(e) => alCambiar(e.target.value)} required>
        <option value="" disabled>
          Elige un representante
        </option>
        {representantes.map((r) => (
          <option key={r.id} value={r.id}>
            {r.nombre_completo} ({r.correo_electronico})
          </option>
        ))}
      </select>
    </div>
  );
}

function CambiarRepresentante({
  trazado,
  alCerrar,
  alGuardar,
}: {
  trazado: TrazadoAdministracion | null;
  alCerrar(): void;
  alGuardar(): void;
}) {
  const notificar = useNotificar();
  const representantes = useRepresentantesActivos(`representantes:${trazado?.id ?? ''}`);
  const [elegido, setElegido] = useState('');
  const [error, setError] = useState('');
  const actual = trazado?.representante.id ?? '';
  const valor = elegido || actual;

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    if (!trazado) return;
    setError('');
    try {
      await api(`/administracion/trazados/${trazado.id}`, { metodo: 'PATCH', cuerpo: { representante_id: valor } });
      const nombre = representantes.activos.find((r) => r.id === valor)?.nombre_completo ?? 'el nuevo representante';
      notificar(`${trazado.codigo} ahora está a cargo de ${nombre}`);
      setElegido('');
      alGuardar();
    } catch (e) {
      setError(textoDeError(e));
    }
  }

  return (
    <Dialogo
      abierto={trazado !== null}
      alCerrar={() => {
        setElegido('');
        setError('');
        alCerrar();
      }}
      forma="centro"
      titulo={`Representante del ${trazado?.codigo ?? ''}`}
      descripcion={<p>El nuevo representante verá este trazado en su panel. El anterior deja de verlo.</p>}
    >
      <form className="formulario" onSubmit={(e) => void guardar(e)}>
        <SelectorRepresentante valor={valor} alCambiar={setElegido} representantes={representantes.activos} />
        <MensajeError>{representantes.error || error}</MensajeError>
        <div className="dialogo-acciones">
          <button type="submit" className="boton boton-principal" disabled={!valor || valor === actual}>
            Cambiar representante
          </button>
          <button type="button" className="boton boton-secundario" onClick={alCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

// ---------- Trazado nuevo: 1) elegir la linea del registro, 2) completar los datos ----------

function NuevoTrazado({ abierto, alCerrar, alGuardar }: { abierto: boolean; alCerrar(): void; alGuardar(): void }) {
  const [lineaId, setLineaId] = useState<number | null>(null);

  function cerrar() {
    setLineaId(null);
    alCerrar();
  }

  return (
    <Dialogo
      abierto={abierto}
      alCerrar={cerrar}
      forma="centro"
      ancho="amplio"
      titulo="Nuevo trazado"
      descripcion={
        lineaId === null ? (
          <p>Busca la línea en el registro del MTT. Su recorrido real de ida y vuelta se copia al trazado.</p>
        ) : undefined
      }
    >
      {lineaId === null ? (
        <BuscarLinea alElegir={setLineaId} />
      ) : (
        <DatosTrazado
          key={lineaId}
          lineaId={lineaId}
          alVolver={() => setLineaId(null)}
          alGuardar={() => {
            setLineaId(null);
            alGuardar();
          }}
        />
      )}
    </Dialogo>
  );
}

function BuscarLinea({ alElegir }: { alElegir(id: number): void }) {
  const [texto, setTexto] = useState('');
  const [buscar, setBuscar] = useState('');
  const [comuna, setComuna] = useState('');
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
    setBuscar(texto.trim().length >= 2 ? texto.trim() : '');
  }

  return (
    <div className="p-catalogo">
      <form className="p-catalogo-busqueda" onSubmit={enviar} role="search">
        <Campo
          etiqueta="Número de línea, calle o lugar"
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Por ejemplo 4001 o Concha y Toro"
        />
        <div className="campo">
          <label htmlFor="comuna-catalogo">Comuna</label>
          <select id="comuna-catalogo" className="entrada" value={comuna} onChange={(e) => setComuna(e.target.value)}>
            <option value="">Todas</option>
            {comunas.datos?.map((c) => (
              <option key={c.comuna} value={c.comuna}>
                {c.comuna}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="boton boton-secundario">
          <Search size={18} aria-hidden="true" />
          Buscar
        </button>
      </form>
      <MensajeError>{lineas.error || comunas.error}</MensajeError>
      {lineas.datos?.length === 0 && <p className="p-nada">No hay líneas con esa búsqueda.</p>}
      {lineas.datos && lineas.datos.length > 0 && (
        <ul className="p-catalogo-lista" aria-label="Líneas del registro">
          {lineas.datos.map((l) => (
            <li key={l.id}>
              <button type="button" className="p-catalogo-linea" onClick={() => alElegir(l.id)} disabled={!l.tiene_trazado}>
                <b>{l.nombre}</b>
                <span>
                  {l.desde} – {l.hasta}
                </span>
                <small>{l.tiene_trazado ? l.comunas.join(', ') : 'Sin recorrido dibujado: no se puede usar todavía'}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DatosTrazado({ lineaId, alVolver, alGuardar }: { lineaId: number; alVolver(): void; alGuardar(): void }) {
  const notificar = useNotificar();
  const detalle = useDatos(() => api<DetalleLineaCatalogo>(`/catalogo/lineas/${lineaId}`), String(lineaId));
  const representantes = useRepresentantesActivos('representantes:nuevo-trazado');
  const linea = detalle.datos;

  if (!linea) {
    return (
      <>
        <MensajeError>{detalle.error}</MensajeError>
        {!detalle.error && <p className="p-nada">Cargando la línea…</p>}
      </>
    );
  }
  return (
    <FormularioTrazado
      linea={linea}
      representantes={representantes.activos}
      errorRepresentantes={representantes.error}
      alVolver={alVolver}
      alGuardar={(codigo) => {
        notificar(`Trazado ${codigo} creado con el recorrido de la ${linea.nombre}`);
        alGuardar();
      }}
    />
  );
}

function FormularioTrazado({
  linea,
  representantes,
  errorRepresentantes,
  alVolver,
  alGuardar,
}: {
  linea: DetalleLineaCatalogo;
  representantes: RepresentanteAdministracion[];
  errorRepresentantes: string | null;
  alVolver(): void;
  alGuardar(codigo: string): void;
}) {
  const [codigo, setCodigo] = useState(linea.numero_linea ?? '');
  const [nombre, setNombre] = useState(`${linea.desde} - ${linea.hasta}`.slice(0, 80));
  const [comuna, setComuna] = useState(linea.comuna_origen);
  const [origen, setOrigen] = useState(linea.desde);
  const [destino, setDestino] = useState(linea.hasta);
  const [representante, setRepresentante] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const ida = linea.sentidos.find((s) => s.sentido === 'ida');
  const vuelta = linea.sentidos.find((s) => s.sentido === 'vuelta');
  const dibujada = (ida?.puntos.length ?? 0) > 1 && (vuelta?.puntos.length ?? 0) > 1;
  const recorrido = (ida?.puntos ?? []).map((p, i) => ({ ...p, orden: i + 1 }));
  const largo = recorrido.at(-1)?.distancia_acumulada_m;

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setError('');
    try {
      const creado = await api<TrazadoAdministracion>('/administracion/trazados', {
        metodo: 'POST',
        cuerpo: {
          codigo: codigo.trim().toUpperCase(),
          nombre: nombre.trim(),
          comuna: comuna.trim(),
          representante_id: representante,
          linea_catalogo_id: linea.id,
          origen: origen.trim(),
          destino: destino.trim(),
        },
      });
      alGuardar(creado.codigo);
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="formulario" onSubmit={(e) => void guardar(e)}>
      <div className="p-linea-elegida">
        <div>
          <b>{linea.nombre}</b>
          <span>
            {linea.empresa ? `${linea.empresa.replace(/\.$/, '')}. ` : ''}Folio {linea.folio}
            {linea.flota_vigente ? `, ${linea.flota_vigente} autos inscritos` : ''}
            {largo ? `. Ida de ${(largo / 1000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} km` : ''}
          </span>
        </div>
        <button type="button" className="boton boton-texto p-boton-chico" onClick={alVolver}>
          Elegir otra línea
        </button>
      </div>
      {dibujada ? (
        <div className="p-mapa-vista">
          <Mapa recorrido={recorrido} />
        </div>
      ) : (
        <MensajeError>
          Esta línea no tiene su recorrido dibujado en ambos sentidos, así que no se puede crear desde el panel. Elige otra
          línea.
        </MensajeError>
      )}

      <div className="p-dos-columnas">
        <Campo
          etiqueta="Código"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^0-9A-Z-]/g, '').slice(0, 10))}
          pattern="[0-9A-Z][0-9A-Z\-]{0,9}"
          required
          ayuda="El número que lleva el letrero, por ejemplo 4001."
        />
        <Campo etiqueta="Comuna" value={comuna} onChange={(e) => setComuna(e.target.value)} minLength={3} maxLength={60} required />
      </div>
      <Campo etiqueta="Nombre del trazado" value={nombre} onChange={(e) => setNombre(e.target.value)} minLength={3} maxLength={80} required />
      <div className="p-dos-columnas">
        <Campo etiqueta="Origen de la ida" value={origen} onChange={(e) => setOrigen(e.target.value)} minLength={3} maxLength={80} required />
        <Campo etiqueta="Destino de la ida" value={destino} onChange={(e) => setDestino(e.target.value)} minLength={3} maxLength={80} required />
      </div>
      {representantes.length === 0 && !errorRepresentantes ? (
        <p className="mensaje mensaje-aviso">
          No hay representantes con la cuenta activa. Crea uno en la sección Representantes y vuelve aquí.
        </p>
      ) : (
        <SelectorRepresentante valor={representante} alCambiar={setRepresentante} representantes={representantes} />
      )}
      <MensajeError>{errorRepresentantes || error}</MensajeError>
      <div className="dialogo-acciones">
        <button type="submit" className="boton boton-principal" disabled={enviando || !dibujada || !representante}>
          Crear trazado
        </button>
        <button type="button" className="boton boton-secundario" onClick={alVolver}>
          Volver
        </button>
      </div>
    </form>
  );
}
