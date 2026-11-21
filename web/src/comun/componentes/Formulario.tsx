import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { fortalezaClave } from '../formato';

interface PropsCampo extends InputHTMLAttributes<HTMLInputElement> {
  etiqueta: string;
  ayuda?: ReactNode;
}

export function Campo({ etiqueta, ayuda, id, ...resto }: PropsCampo) {
  const generado = useId();
  const idCampo = id ?? generado;
  return (
    <div className="campo">
      <label htmlFor={idCampo}>{etiqueta}</label>
      <input id={idCampo} className="entrada" aria-describedby={ayuda ? `${idCampo}-ayuda` : undefined} {...resto} />
      {ayuda && (
        <span id={`${idCampo}-ayuda`} className="campo-ayuda">
          {ayuda}
        </span>
      )}
    </div>
  );
}

interface PropsClave {
  etiqueta?: string;
  valor: string;
  alCambiar(valor: string): void;
  /** En el registro se muestra el medidor; al entrar, no. */
  nueva?: boolean;
  name?: string;
  /** Largo minimo de una contrasena nueva: 12, o 15 para representantes y administradores. */
  minimo?: number;
}

const TEXTO_FORTALEZA = ['', '', 'Aceptable', 'Buena', 'Muy buena'];

export function CampoClave({ etiqueta = 'Contraseña', valor, alCambiar, nueva, name = 'contrasena', minimo = 12 }: PropsClave) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const corta = valor.length > 0 && valor.length < minimo;
  const fortaleza = corta ? 1 : fortalezaClave(valor);
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <div className="clave">
        <input
          id={id}
          name={name}
          className="entrada"
          type={visible ? 'text' : 'password'}
          value={valor}
          onChange={(e) => alCambiar(e.target.value)}
          autoComplete={nueva ? 'new-password' : 'current-password'}
          minLength={nueva ? minimo : undefined}
          maxLength={64}
          required
          aria-describedby={nueva ? `${id}-fuerza` : undefined}
        />
        <button
          type="button"
          className="boton boton-texto"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
        >
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {nueva && (
        <>
          <div className="medidor" aria-hidden="true">
            <i className={fortaleza >= 3 ? 'listo' : ''} style={{ width: `${fortaleza * 25}%` }} />
          </div>
          <span id={`${id}-fuerza`} className="campo-ayuda">
            {!valor
              ? `Entre ${minimo} y 64 caracteres. Una frase corta es fácil de recordar.`
              : corta
                ? `Muy corta: usa al menos ${minimo} caracteres`
                : TEXTO_FORTALEZA[fortaleza]}
          </span>
        </>
      )}
    </div>
  );
}

export function MensajeError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="mensaje mensaje-error" role="alert">
      {children}
    </p>
  );
}
