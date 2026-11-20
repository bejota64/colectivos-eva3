/** Mensaje breve que confirma una accion ("Tarifa guardada") y se va solo. */
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';

const Contexto = createContext<(texto: string) => void>(() => undefined);

export function ProveedorNotificaciones({ children }: { children: ReactNode }) {
  const [mensaje, setMensaje] = useState<{ texto: string; id: number } | null>(null);

  const notificar = useCallback((texto: string) => setMensaje({ texto, id: Date.now() }), []);

  useEffect(() => {
    if (!mensaje) return;
    const id = window.setTimeout(() => setMensaje(null), 4_000);
    return () => window.clearTimeout(id);
  }, [mensaje]);

  return (
    <Contexto value={notificar}>
      {children}
      <div role="status" aria-live="polite">
        {mensaje && (
          <p key={mensaje.id} className="notificacion">
            {mensaje.texto}
          </p>
        )}
      </div>
    </Contexto>
  );
}

export function useNotificar(): (texto: string) => void {
  return use(Contexto);
}
