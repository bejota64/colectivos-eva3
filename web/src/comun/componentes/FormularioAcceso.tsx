import { useState, type FormEvent, type ReactNode } from 'react';
import { textoDeError } from '../ganchos';
import { useSesion } from '../sesion';
import { Campo, CampoClave, MensajeError } from './Formulario';

/** Formulario para entrar, igual en las tres apps (cambia el texto del boton). */
export function FormularioAcceso({ textoBoton = 'Entrar', pie }: { textoBoton?: string; pie?: ReactNode }) {
  const { entrar } = useSesion();
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await entrar(correo, clave);
    } catch (e) {
      setError(textoDeError(e));
      setEnviando(false);
    }
  }

  return (
    <form className="formulario" onSubmit={(e) => void enviar(e)} noValidate={false}>
      <Campo
        etiqueta="Correo electrónico"
        type="email"
        name="correo"
        autoComplete="username"
        inputMode="email"
        required
        value={correo}
        onChange={(e) => setCorreo(e.target.value)}
      />
      <CampoClave valor={clave} alCambiar={setClave} />
      <MensajeError>{error}</MensajeError>
      <button type="submit" className="boton boton-principal boton-ancho boton-grande" disabled={enviando}>
        {enviando ? 'Entrando…' : textoBoton}
      </button>
      {pie}
    </form>
  );
}
