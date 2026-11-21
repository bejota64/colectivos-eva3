/** Autos y conductores del trazado (CU-12). Solo el representante crea cuentas de conductor. */
import { useState, type FormEvent } from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { api } from '../../comun/api';
import { Dialogo } from '../../comun/componentes/Dialogo';
import { Campo, CampoClave, MensajeError } from '../../comun/componentes/Formulario';
import { Patente } from '../../comun/componentes/Letrero';
import { useNotificar } from '../../comun/componentes/Notificacion';
import { textoDeError, useDatos } from '../../comun/ganchos';
import type { Conductor, Vehiculo } from '../../comun/tipos';
import { Encabezado, useTrazado } from '../App';

type Pestana = 'vehiculos' | 'conductores';
const ANIO_MAXIMO = new Date().getFullYear() + 1;

export function Flota() {
  const { trazado } = useTrazado();
  const [pestana, setPestana] = useState<Pestana>('vehiculos');
  const [agregar, setAgregar] = useState(false);
  const base = `/trazados/${trazado.id}`;

  return (
    <div className="p-seccion">
      <Encabezado titulo="Flota" detalle="Autos que pueden trabajar en el trazado y cuentas de sus conductores.">
        <button type="button" className="boton boton-principal" onClick={() => setAgregar(true)}>
          <Plus size={18} aria-hidden="true" />
          {pestana === 'vehiculos' ? 'Agregar auto' : 'Agregar conductor'}
        </button>
      </Encabezado>
      <div className="p-pestanas" role="tablist" aria-label="Flota">
        <button type="button" role="tab" aria-selected={pestana === 'vehiculos'} onClick={() => setPestana('vehiculos')}>
          Autos
        </button>
        <button type="button" role="tab" aria-selected={pestana === 'conductores'} onClick={() => setPestana('conductores')}>
          Conductores
        </button>
      </div>
      {pestana === 'vehiculos' ? (
        <Vehiculos base={base} agregar={agregar} alCerrarAgregar={() => setAgregar(false)} />
      ) : (
        <Conductores base={base} agregar={agregar} alCerrarAgregar={() => setAgregar(false)} />
      )}
    </div>
  );
}

function EstadoFlota({ activo, enServicio, inactivo }: { activo: boolean; enServicio: boolean; inactivo: string }) {
  if (!activo) return <span className="pildora pildora-gris">{inactivo}</span>;
  if (enServicio) return <span className="pildora pildora-azul">En servicio</span>;
  return <span className="pildora pildora-verde">{inactivo === 'Inactivo' ? 'Activo' : 'Habilitado'}</span>;
}

function Vehiculos({ base, agregar, alCerrarAgregar }: { base: string; agregar: boolean; alCerrarAgregar(): void }) {
  const notificar = useNotificar();
  const vehiculos = useDatos(() => api<Vehiculo[]>(`${base}/vehiculos`), `${base}/vehiculos`);
  const [error, setError] = useState('');

  async function cambiarActivo(v: Vehiculo) {
    setError('');
    try {
      await api(`${base}/vehiculos/${v.id}`, { metodo: 'PATCH', cuerpo: { activo: !v.activo } });
      notificar(v.activo ? `${v.patente} desactivado` : `${v.patente} activado`);
      vehiculos.recargar();
    } catch (e) {
      setError(textoDeError(e));
    }
  }

  return (
    <section className="p-tarjeta" aria-label="Autos">
      <MensajeError>{vehiculos.error || error}</MensajeError>
      {vehiculos.datos?.length === 0 && <p className="p-nada">Todavía no hay autos. Agrega el primero.</p>}
      {vehiculos.datos && vehiculos.datos.length > 0 && (
        <div className="p-tabla-contenedor">
          <table className="p-tabla">
            <thead>
              <tr>
                <th scope="col">Patente</th>
                <th scope="col">Auto</th>
                <th scope="col" className="p-num">Año</th>
                <th scope="col" className="p-num">Asientos</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="solo-lector">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {vehiculos.datos.map((v) => (
                <tr key={v.id} className={v.activo ? '' : 'p-fila-apagada'}>
                  <th scope="row">
                    <Patente>{v.patente}</Patente>
                  </th>
                  <td>
                    {v.marca} {v.modelo}
                  </td>
                  <td className="p-num">{v.anio}</td>
                  <td className="p-num">{v.capacidad}</td>
                  <td>
                    <EstadoFlota activo={v.activo} enServicio={v.en_servicio} inactivo="Inactivo" />
                  </td>
                  <td className="p-acciones-fila">
                    <button
                      type="button"
                      className="boton boton-secundario p-boton-chico"
                      onClick={() => void cambiarActivo(v)}
                      disabled={v.en_servicio}
                      title={v.en_servicio ? 'Está en una jornada abierta' : undefined}
                    >
                      {v.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NuevoVehiculo
        abierto={agregar}
        base={base}
        alCerrar={alCerrarAgregar}
        alGuardar={() => {
          alCerrarAgregar();
          vehiculos.recargar();
        }}
      />
    </section>
  );
}

function NuevoVehiculo({ abierto, base, alCerrar, alGuardar }: { abierto: boolean; base: string; alCerrar(): void; alGuardar(): void }) {
  const notificar = useNotificar();
  const [patente, setPatente] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [anio, setAnio] = useState('');
  const [capacidad, setCapacidad] = useState('4');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setError('');
    try {
      await api(`${base}/vehiculos`, {
        metodo: 'POST',
        cuerpo: { patente, marca: marca.trim(), modelo: modelo.trim(), anio: Number(anio), capacidad: Number(capacidad) },
      });
      notificar(`${patente} agregado a la flota`);
      setPatente('');
      setMarca('');
      setModelo('');
      setAnio('');
      alGuardar();
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo abierto={abierto} alCerrar={alCerrar} forma="centro" titulo="Agregar auto">
      <form className="formulario" onSubmit={(e) => void guardar(e)}>
        <Campo
          etiqueta="Patente"
          value={patente}
          onChange={(e) => setPatente(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          pattern="[A-Z]{2}[0-9]{4}|[A-Z]{4}[0-9]{2}"
          required
          placeholder="BBBB12"
          ayuda="Sin guiones ni puntos: AA1234 o BBBB12."
        />
        <div className="p-dos-columnas">
          <Campo etiqueta="Marca" value={marca} onChange={(e) => setMarca(e.target.value)} minLength={2} maxLength={40} required />
          <Campo etiqueta="Modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} maxLength={40} required />
        </div>
        <div className="p-dos-columnas">
          <Campo
            etiqueta="Año"
            type="number"
            min={2000}
            max={ANIO_MAXIMO}
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
            required
          />
          <div className="campo">
            <label htmlFor="capacidad">Asientos para pasajeros</label>
            <select id="capacidad" className="entrada" value={capacidad} onChange={(e) => setCapacidad(e.target.value)}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
        <MensajeError>{error}</MensajeError>
        <div className="dialogo-acciones">
          <button type="submit" className="boton boton-principal" disabled={enviando}>
            Agregar auto
          </button>
          <button type="button" className="boton boton-secundario" onClick={alCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

function Conductores({ base, agregar, alCerrarAgregar }: { base: string; agregar: boolean; alCerrarAgregar(): void }) {
  const notificar = useNotificar();
  const conductores = useDatos(() => api<Conductor[]>(`${base}/conductores`), `${base}/conductores`);
  const [error, setError] = useState('');
  const [deshabilitando, setDeshabilitando] = useState<Conductor | null>(null);
  const [claveDe, setClaveDe] = useState<Conductor | null>(null);

  async function cambiarHabilitado(c: Conductor, habilitado: boolean) {
    setError('');
    try {
      await api(`${base}/conductores/${c.usuario_id}`, { metodo: 'PATCH', cuerpo: { habilitado } });
      notificar(habilitado ? `${c.nombre_completo} habilitado` : `${c.nombre_completo} deshabilitado`);
      conductores.recargar();
    } catch (e) {
      setError(textoDeError(e));
    }
    setDeshabilitando(null);
  }

  return (
    <section className="p-tarjeta" aria-label="Conductores">
      <MensajeError>{conductores.error || error}</MensajeError>
      {conductores.datos?.length === 0 && <p className="p-nada">Todavía no hay conductores. Crea la primera cuenta.</p>}
      {conductores.datos && conductores.datos.length > 0 && (
        <div className="p-tabla-contenedor">
          <table className="p-tabla">
            <thead>
              <tr>
                <th scope="col">Conductor</th>
                <th scope="col">Correo</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="solo-lector">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {conductores.datos.map((c) => (
                <tr key={c.usuario_id} className={c.habilitado ? '' : 'p-fila-apagada'}>
                  <th scope="row">{c.nombre_completo}</th>
                  <td>{c.correo_electronico}</td>
                  <td>
                    <EstadoFlota activo={c.habilitado} enServicio={c.en_servicio} inactivo="Deshabilitado" />
                  </td>
                  <td className="p-acciones-fila">
                    <button type="button" className="boton boton-texto p-boton-chico" onClick={() => setClaveDe(c)}>
                      <KeyRound size={16} aria-hidden="true" />
                      Nueva contraseña
                    </button>
                    <button
                      type="button"
                      className="boton boton-secundario p-boton-chico"
                      onClick={() => (c.habilitado ? setDeshabilitando(c) : void cambiarHabilitado(c, true))}
                    >
                      {c.habilitado ? 'Deshabilitar' : 'Habilitar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialogo
        abierto={deshabilitando !== null}
        alCerrar={() => setDeshabilitando(null)}
        forma="centro"
        titulo={`¿Deshabilitar a ${deshabilitando?.nombre_completo ?? ''}?`}
        descripcion={
          <p>
            No podrá iniciar jornadas. Si está trabajando ahora, su jornada se cierra en su siguiente acción. Puedes
            volver a habilitarlo cuando quieras.
          </p>
        }
      >
        <div className="dialogo-acciones">
          <button
            type="button"
            className="boton boton-peligro"
            onClick={() => deshabilitando && void cambiarHabilitado(deshabilitando, false)}
          >
            Deshabilitar
          </button>
          <button type="button" className="boton boton-secundario" onClick={() => setDeshabilitando(null)}>
            Cancelar
          </button>
        </div>
      </Dialogo>

      <NuevaContrasena conductor={claveDe} base={base} alCerrar={() => setClaveDe(null)} />
      <NuevoConductor
        abierto={agregar}
        base={base}
        alCerrar={alCerrarAgregar}
        alGuardar={() => {
          alCerrarAgregar();
          conductores.recargar();
        }}
      />
    </section>
  );
}

function NuevaContrasena({ conductor, base, alCerrar }: { conductor: Conductor | null; base: string; alCerrar(): void }) {
  const notificar = useNotificar();
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    if (!conductor) return;
    setError('');
    try {
      await api(`${base}/conductores/${conductor.usuario_id}/contrasena`, { metodo: 'POST', cuerpo: { contrasena: clave } });
      notificar('Contraseña cambiada. Entrégasela al conductor en persona.');
      setClave('');
      alCerrar();
    } catch (e) {
      setError(textoDeError(e));
    }
  }

  return (
    <Dialogo
      abierto={conductor !== null}
      alCerrar={alCerrar}
      forma="centro"
      titulo="Nueva contraseña"
      descripcion={<p>Para {conductor?.nombre_completo}. Sus sesiones abiertas se cierran y deberá entrar con la nueva.</p>}
    >
      <form className="formulario" onSubmit={(e) => void guardar(e)}>
        <CampoClave etiqueta="Contraseña nueva" valor={clave} alCambiar={setClave} nueva />
        <MensajeError>{error}</MensajeError>
        <div className="dialogo-acciones">
          <button type="submit" className="boton boton-principal" disabled={clave.length < 12}>
            Cambiar contraseña
          </button>
          <button type="button" className="boton boton-secundario" onClick={alCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

function NuevoConductor({ abierto, base, alCerrar, alGuardar }: { abierto: boolean; base: string; alCerrar(): void; alGuardar(): void }) {
  const notificar = useNotificar();
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setError('');
    try {
      await api(`${base}/conductores`, {
        metodo: 'POST',
        cuerpo: { nombre_completo: nombre.trim(), correo_electronico: correo.trim(), contrasena: clave },
      });
      notificar(`Cuenta de ${nombre.trim()} creada`);
      setNombre('');
      setCorreo('');
      setClave('');
      alGuardar();
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      alCerrar={alCerrar}
      forma="centro"
      titulo="Agregar conductor"
      descripcion={<p>Crea su cuenta y entrégale el correo y la contraseña en persona. Podrá usar la app del conductor.</p>}
    >
      <form className="formulario" onSubmit={(e) => void guardar(e)}>
        <Campo etiqueta="Nombre y apellido" value={nombre} onChange={(e) => setNombre(e.target.value)} minLength={3} maxLength={120} required />
        <Campo etiqueta="Correo electrónico" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
        <CampoClave etiqueta="Contraseña inicial" valor={clave} alCambiar={setClave} nueva />
        <MensajeError>{error}</MensajeError>
        <div className="dialogo-acciones">
          <button type="submit" className="boton boton-principal" disabled={enviando}>
            Crear cuenta
          </button>
          <button type="button" className="boton boton-secundario" onClick={alCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </Dialogo>
  );
}
