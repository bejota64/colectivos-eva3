/**
 * Permiso para usar la ubicacion (regla 14 del diseno y Ley 21.719): se pide
 * la primera vez que se usa algo que la envia, no al registrarse. El texto
 * es el validado en el prototipo de la EVA 2.
 */
import { useState } from 'react';
import { api } from '../comun/api';
import { Dialogo } from '../comun/componentes/Dialogo';
import { MensajeError } from '../comun/componentes/Formulario';
import { textoDeError } from '../comun/ganchos';
import { preferencias } from '../comun/geo';

export function ubicacionAceptada(): boolean {
  return preferencias.leer('ubicacion') === 'aceptada';
}

export function olvidarUbicacion(): void {
  preferencias.guardar('ubicacion', null);
}

interface Props {
  abierto: boolean;
  alAceptar(): void;
  alCancelar(): void;
}

export function ConsentimientoUbicacion({ abierto, alAceptar, alCancelar }: Props) {
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function aceptar() {
    setError('');
    setEnviando(true);
    try {
      await api('/usuarios/yo/consentimientos/geolocalizacion', { metodo: 'POST' });
      preferencias.guardar('ubicacion', 'aceptada');
      alAceptar();
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      alCerrar={alCancelar}
      titulo="¿Nos dejas usar tu ubicación?"
      descripcion={<p>La usamos solo para avisar al conductor dónde estás esperando y para calcular cuánto falta. Se borra a los 20 minutos.</p>}
    >
      <ul className="lista-garantias">
        <li>Solo mientras tienes la app abierta.</li>
        <li>El conductor ve cuántas personas esperan en un tramo, nunca quién eres.</li>
        <li>Puedes retirar el permiso cuando quieras en Mi cuenta.</li>
      </ul>
      <MensajeError>{error}</MensajeError>
      <div className="dialogo-acciones">
        <button type="button" className="boton boton-principal boton-ancho boton-grande" disabled={enviando} onClick={() => void aceptar()}>
          Aceptar
        </button>
        <button type="button" className="boton boton-texto" onClick={alCancelar}>
          Ahora no
        </button>
      </div>
    </Dialogo>
  );
}
