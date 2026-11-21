/** Datos de la cuenta y derechos del titular: permiso de ubicacion y eliminacion (Ley 21.719). */
import { useState, type FormEvent } from 'react';
import { MapPin, ShieldCheck } from 'lucide-react';
import { api, ErrorApi } from '../comun/api';
import { Dialogo } from '../comun/componentes/Dialogo';
import { Campo, CampoClave, MensajeError } from '../comun/componentes/Formulario';
import { useNotificar } from '../comun/componentes/Notificacion';
import { iniciales } from '../comun/formato';
import { textoDeError } from '../comun/ganchos';
import { preferencias } from '../comun/geo';
import { useSesion, useUsuario } from '../comun/sesion';
import { PoliticaPrivacidad } from './Acceso';
import { Subpagina } from './Subpagina';

export function Cuenta() {
  const usuario = useUsuario();
  const { salir, actualizarUsuario } = useSesion();
  const notificar = useNotificar();
  const [nombre, setNombre] = useState(usuario.nombre_completo);
  const [telefono, setTelefono] = useState('');
  const [errorDatos, setErrorDatos] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [ubicacion, setUbicacion] = useState(() => preferencias.leer('ubicacion') === 'aceptada');
  const [errorUbicacion, setErrorUbicacion] = useState('');
  const [verPrivacidad, setVerPrivacidad] = useState(false);
  const [verEliminar, setVerEliminar] = useState(false);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setErrorDatos('');
    try {
      const perfil = await api<{ nombre_completo: string; telefono: string | null }>('/usuarios/yo', {
        metodo: 'PATCH',
        cuerpo: { nombre_completo: nombre.trim(), ...(telefono.trim() ? { telefono: telefono.trim() } : {}) },
      });
      actualizarUsuario({ nombre_completo: perfil.nombre_completo });
      setTelefono(perfil.telefono ?? '');
      notificar('Datos guardados');
    } catch (e) {
      setErrorDatos(textoDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarUbicacion() {
    setErrorUbicacion('');
    try {
      if (ubicacion) {
        try {
          await api('/usuarios/yo/consentimientos/geolocalizacion', { metodo: 'DELETE' });
        } catch (e) {
          // 404: no habia un permiso vigente, que es justo lo que se queria.
          if (!(e instanceof ErrorApi && e.estado === 404)) throw e;
        }
        preferencias.guardar('ubicacion', null);
        setUbicacion(false);
        notificar('Permiso de ubicación retirado');
      } else {
        await api('/usuarios/yo/consentimientos/geolocalizacion', { metodo: 'POST' });
        preferencias.guardar('ubicacion', 'aceptada');
        setUbicacion(true);
        notificar('Permiso de ubicación activado');
      }
    } catch (e) {
      setErrorUbicacion(textoDeError(e));
    }
  }

  return (
    <Subpagina titulo="Mi cuenta">
      <section className="tarjeta perfil">
        <span className="avatar avatar-grande">{iniciales(usuario.nombre_completo)}</span>
        <div>
          <p className="perfil-nombre">{usuario.nombre_completo}</p>
          <p className="perfil-correo">{usuario.correo_electronico}</p>
        </div>
      </section>

      <section className="tarjeta">
        <h2>Tus datos</h2>
        <form className="formulario" onSubmit={(e) => void guardar(e)}>
          <Campo
            etiqueta="Nombre y apellido"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoComplete="name"
            minLength={3}
            maxLength={120}
            required
          />
          <Campo
            etiqueta="Teléfono (opcional)"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+56 9 1234 5678"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            ayuda="Entre 8 y 15 dígitos. El correo no se puede cambiar."
          />
          <MensajeError>{errorDatos}</MensajeError>
          <button type="submit" className="boton boton-oscuro" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>
      </section>

      <section className="tarjeta">
        <h2>Privacidad</h2>
        <div className="permiso">
          <MapPin size={22} aria-hidden="true" />
          <div>
            <p className="permiso-titulo">Ubicación</p>
            <p className="permiso-estado">
              {ubicacion
                ? 'Activa. Se usa solo con la app abierta, para calcular tiempos y ubicar tu aviso.'
                : 'Sin permiso. Puedes ver el mapa, pero no los minutos ni avisar que esperas.'}
            </p>
          </div>
        </div>
        <MensajeError>{errorUbicacion}</MensajeError>
        <button type="button" className={`boton ${ubicacion ? 'boton-secundario' : 'boton-principal'}`} onClick={() => void cambiarUbicacion()}>
          {ubicacion ? 'Retirar permiso' : 'Dar permiso de ubicación'}
        </button>
        <button type="button" className="boton boton-texto permiso-politica" onClick={() => setVerPrivacidad(true)}>
          <ShieldCheck size={18} aria-hidden="true" />
          Cómo usamos tus datos
        </button>
      </section>

      <section className="tarjeta">
        <button type="button" className="boton boton-secundario boton-ancho" onClick={() => void salir()}>
          Cerrar sesión
        </button>
      </section>

      <section className="tarjeta zona-peligro">
        <h2>Eliminar cuenta</h2>
        <p>
          Se borran tu nombre, correo y teléfono, se retiran tus permisos y se cierran tus sesiones. Tus viajes quedan
          sin datos que te identifiquen. No se puede deshacer.
        </p>
        <button type="button" className="boton boton-peligro" onClick={() => setVerEliminar(true)}>
          Eliminar mi cuenta
        </button>
      </section>

      <PoliticaPrivacidad abierta={verPrivacidad} alCerrar={() => setVerPrivacidad(false)} />
      <EliminarCuenta abierto={verEliminar} alCerrar={() => setVerEliminar(false)} />
    </Subpagina>
  );
}

function EliminarCuenta({ abierto, alCerrar }: { abierto: boolean; alCerrar(): void }) {
  const { salir } = useSesion();
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function eliminar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setError('');
    try {
      await api('/usuarios/yo', { metodo: 'DELETE', cuerpo: { contrasena: clave } });
      preferencias.guardar('ubicacion', null);
      preferencias.guardar('sentido', null);
      // La API ya cerro todas las sesiones; esto limpia la pantalla.
      await salir().catch(() => undefined);
    } catch (e) {
      setError(textoDeError(e));
      setEnviando(false);
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="¿Eliminar tu cuenta?"
      descripcion={<p>Escribe tu contraseña para confirmar que eres tú.</p>}
    >
      <form className="formulario" onSubmit={(e) => void eliminar(e)}>
        <CampoClave valor={clave} alCambiar={setClave} />
        <MensajeError>{error}</MensajeError>
        <button type="submit" className="boton boton-peligro boton-ancho" disabled={enviando || clave.length === 0}>
          {enviando ? 'Eliminando…' : 'Eliminar mi cuenta para siempre'}
        </button>
        <button type="button" className="boton boton-texto" onClick={alCerrar}>
          No, conservarla
        </button>
      </form>
    </Dialogo>
  );
}
