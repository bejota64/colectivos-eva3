import { useState, type FormEvent } from 'react';
import { Dialogo } from '../comun/componentes/Dialogo';
import { Campo, CampoClave, MensajeError } from '../comun/componentes/Formulario';
import { FormularioAcceso } from '../comun/componentes/FormularioAcceso';
import { Cordillera, IlustracionColectivo } from '../comun/componentes/Ilustraciones';
import { Marca } from '../comun/componentes/Letrero';
import { textoDeError } from '../comun/ganchos';
import { useSesion } from '../comun/sesion';

type Pestana = 'entrar' | 'registro';

export function Acceso() {
  const [pestana, setPestana] = useState<Pestana>('entrar');

  return (
    <div className="acceso">
      <section className="acceso-portada">
        <Marca app="Pasajero" oscura />
        <div className="acceso-portada-texto">
          <h1>Mira dónde viene tu colectivo</h1>
          <p>Y avisa que lo estás esperando: el conductor sabe cuánta gente hay en tu esquina antes de llegar.</p>
        </div>
        <div className="acceso-escena" aria-hidden="true">
          <Cordillera className="acceso-cordillera" />
          <IlustracionColectivo className="acceso-colectivo" />
          <div className="acceso-calle" />
        </div>
      </section>

      <section className="acceso-tarjeta" aria-label={pestana === 'entrar' ? 'Entrar' : 'Crear cuenta'}>
        <div className="pestanas" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={pestana === 'entrar'}
            className="pestana"
            onClick={() => setPestana('entrar')}
          >
            Entrar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pestana === 'registro'}
            className="pestana"
            onClick={() => setPestana('registro')}
          >
            Crear cuenta
          </button>
        </div>
        {pestana === 'entrar' ? (
          <FormularioAcceso
            pie={
              <p className="acceso-pie">
                ¿Primera vez?{' '}
                <button type="button" className="boton-enlace" onClick={() => setPestana('registro')}>
                  Crea tu cuenta gratis
                </button>
              </p>
            }
          />
        ) : (
          <FormularioRegistro />
        )}
      </section>
    </div>
  );
}

function FormularioRegistro() {
  const { registrar } = useSesion();
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [verPrivacidad, setVerPrivacidad] = useState(false);

  /** Mismas reglas que RegistroDto de la API, para avisar antes de enviar. */
  function revisar(): string {
    if (nombre.trim().length < 3) return 'Escribe tu nombre y apellido.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) return 'Revisa el correo: debe tener la forma nombre@dominio.cl.';
    if (clave.length < 12) return 'La contraseña debe tener al menos 12 caracteres.';
    if (!acepta) return 'Para crear la cuenta debes aceptar los términos y la política de privacidad.';
    return '';
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const problema = revisar();
    if (problema) {
      setError(problema);
      return;
    }
    setError('');
    setEnviando(true);
    try {
      await registrar({
        nombre_completo: nombre.trim(),
        correo_electronico: correo.trim(),
        contrasena: clave,
        acepta_terminos: acepta,
      });
    } catch (e) {
      setError(textoDeError(e));
      setEnviando(false);
    }
  }

  return (
    <form className="formulario" onSubmit={(e) => void enviar(e)} noValidate>
      <Campo
        etiqueta="Nombre y apellido"
        name="nombre"
        autoComplete="name"
        required
        minLength={3}
        maxLength={120}
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
      />
      <Campo
        etiqueta="Correo electrónico"
        type="email"
        name="correo"
        autoComplete="email"
        inputMode="email"
        required
        value={correo}
        onChange={(e) => setCorreo(e.target.value)}
      />
      <CampoClave valor={clave} alCambiar={setClave} nueva />
      <label className="casilla">
        <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} required />
        <span>
          Acepto los términos de uso y la{' '}
          <button type="button" className="boton-enlace" onClick={() => setVerPrivacidad(true)}>
            política de privacidad
          </button>
        </span>
      </label>
      <MensajeError>{error}</MensajeError>
      <button type="submit" className="boton boton-principal boton-ancho boton-grande" disabled={enviando}>
        {enviando ? 'Creando tu cuenta…' : 'Crear cuenta'}
      </button>
      <PoliticaPrivacidad abierta={verPrivacidad} alCerrar={() => setVerPrivacidad(false)} />
    </form>
  );
}

/** Resumen en lenguaje simple de que datos se usan y para que (Ley 21.719). */
export function PoliticaPrivacidad({ abierta, alCerrar }: { abierta: boolean; alCerrar(): void }) {
  return (
    <Dialogo abierto={abierta} alCerrar={alCerrar} titulo="Cómo usamos tus datos">
      <div className="texto-legal">
        <p>
          <b>Tu cuenta:</b> nombre, correo y una contraseña que se guarda cifrada. Nadie, ni siquiera el equipo,
          puede leerla.
        </p>
        <p>
          <b>Tu ubicación:</b> solo si das permiso, y solo mientras la app está abierta. Se usa para calcular cuánto
          falta para que llegue el colectivo y en qué tramo del recorrido esperas. Los conductores ven cuántas personas
          esperan en cada tramo, nunca quién eres ni tu punto exacto.
        </p>
        <p>
          <b>Tus viajes:</b> cuándo subiste y a qué colectivo, para que puedas calificarlo o reportarlo.
        </p>
        <p>
          <b>Tus derechos:</b> puedes retirar el permiso de ubicación y eliminar tu cuenta cuando quieras, desde Mi
          cuenta.
        </p>
      </div>
      <button type="button" className="boton boton-oscuro boton-ancho" onClick={alCerrar}>
        Entendido
      </button>
    </Dialogo>
  );
}
