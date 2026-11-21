/**
 * Cuentas de representante (CU-13, administrador). El rol lo pone la base
 * de datos: el formulario no puede pedir otro. La contrasena inicial se
 * entrega en persona y nunca queda en la auditoria.
 */
import { useState, type FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import { api } from '../../comun/api';
import { Dialogo } from '../../comun/componentes/Dialogo';
import { Campo, CampoClave, MensajeError } from '../../comun/componentes/Formulario';
import { useNotificar } from '../../comun/componentes/Notificacion';
import { textoDeError, useDatos } from '../../comun/ganchos';
import type { RepresentanteAdministracion } from '../../comun/tipos';
import { Encabezado } from '../App';

const LARGO_MINIMO_CLAVE = 15;

export function Representantes() {
  const notificar = useNotificar();
  const representantes = useDatos(
    () => api<RepresentanteAdministracion[]>('/administracion/representantes'),
    'administracion/representantes',
  );
  const [nuevo, setNuevo] = useState(false);
  const [desactivando, setDesactivando] = useState<RepresentanteAdministracion | null>(null);
  const [error, setError] = useState('');

  async function cambiarActivo(r: RepresentanteAdministracion, activo: boolean) {
    setError('');
    try {
      await api(`/administracion/representantes/${r.id}`, { metodo: 'PATCH', cuerpo: { activo } });
      notificar(activo ? `Cuenta de ${r.nombre_completo} activada` : `Cuenta de ${r.nombre_completo} desactivada`);
      representantes.recargar();
    } catch (e) {
      setError(textoDeError(e));
    }
    setDesactivando(null);
  }

  return (
    <div className="p-seccion">
      <Encabezado
        titulo="Representantes"
        detalle="Quienes administran un trazado: ven su panel, su flota, sus tarifas y los reportes de sus pasajeros."
      >
        <button type="button" className="boton boton-principal" onClick={() => setNuevo(true)}>
          <UserPlus size={18} aria-hidden="true" />
          Nuevo representante
        </button>
      </Encabezado>

      <section className="p-tarjeta" aria-label="Representantes">
        <MensajeError>{representantes.error || error}</MensajeError>
        {representantes.datos?.length === 0 && <p className="p-nada">Todavía no hay representantes. Crea la primera cuenta.</p>}
        {representantes.datos && representantes.datos.length > 0 && (
          <div className="p-tabla-contenedor">
            <table className="p-tabla">
              <thead>
                <tr>
                  <th scope="col">Representante</th>
                  <th scope="col">Correo</th>
                  <th scope="col">Trazados</th>
                  <th scope="col">Estado</th>
                  <th scope="col">
                    <span className="solo-lector">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {representantes.datos.map((r) => (
                  <tr key={r.id} className={r.activo ? '' : 'p-fila-apagada'}>
                    <th scope="row">{r.nombre_completo}</th>
                    <td>{r.correo_electronico}</td>
                    <td>
                      {r.trazados.length === 0
                        ? 'Sin trazado'
                        : r.trazados.map((t) => (t.activo ? t.codigo : `${t.codigo} (inactivo)`)).join(', ')}
                    </td>
                    <td>
                      <span className={`pildora ${r.activo ? 'pildora-verde' : 'pildora-gris'}`}>
                        {r.activo ? 'Activa' : 'Desactivada'}
                      </span>
                    </td>
                    <td className="p-acciones-fila">
                      <button
                        type="button"
                        className="boton boton-secundario p-boton-chico"
                        onClick={() => (r.activo ? setDesactivando(r) : void cambiarActivo(r, true))}
                      >
                        {r.activo ? 'Desactivar' : 'Activar'}
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
        titulo={`¿Desactivar la cuenta de ${desactivando?.nombre_completo ?? ''}?`}
        descripcion={
          <>
            <p>No podrá volver a entrar al panel y la sesión que tenga abierta se cierra al tiro.</p>
            <p>Sus trazados siguen funcionando para pasajeros y conductores. Para pasarlos a otra persona, usa «Cambiar representante» en Trazados.</p>
          </>
        }
      >
        <div className="dialogo-acciones">
          <button type="button" className="boton boton-peligro" onClick={() => desactivando && void cambiarActivo(desactivando, false)}>
            Desactivar cuenta
          </button>
          <button type="button" className="boton boton-secundario" onClick={() => setDesactivando(null)}>
            Cancelar
          </button>
        </div>
      </Dialogo>

      <NuevoRepresentante
        abierto={nuevo}
        alCerrar={() => setNuevo(false)}
        alGuardar={() => {
          setNuevo(false);
          representantes.recargar();
        }}
      />
    </div>
  );
}

function NuevoRepresentante({ abierto, alCerrar, alGuardar }: { abierto: boolean; alCerrar(): void; alGuardar(): void }) {
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
      await api('/administracion/representantes', {
        metodo: 'POST',
        cuerpo: { nombre_completo: nombre.trim(), correo_electronico: correo.trim(), contrasena: clave },
      });
      notificar(`Cuenta de ${nombre.trim()} creada. Entrégale el correo y la contraseña en persona.`);
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
      titulo="Nuevo representante"
      descripcion={<p>Con este correo y esta contraseña entra al panel. Después asígnale un trazado.</p>}
    >
      <form className="formulario" onSubmit={(e) => void guardar(e)}>
        <Campo etiqueta="Nombre y apellido" value={nombre} onChange={(e) => setNombre(e.target.value)} minLength={3} maxLength={120} required />
        <Campo etiqueta="Correo electrónico" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
        <CampoClave etiqueta="Contraseña inicial" valor={clave} alCambiar={setClave} nueva minimo={LARGO_MINIMO_CLAVE} />
        <MensajeError>{error}</MensajeError>
        <div className="dialogo-acciones">
          <button type="submit" className="boton boton-principal" disabled={enviando || clave.length < LARGO_MINIMO_CLAVE}>
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
