/**
 * Arranque comun de las tres apps: fuentes incluidas en el proyecto (sin
 * servidores externos), estilos base, sesion y notificaciones.
 */
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './estilos/base.css';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { ProveedorNotificaciones } from './componentes/Notificacion';
import { ProveedorSesion } from './sesion';

export function iniciarApp(app: ReactNode, base: string): void {
  const raiz = document.getElementById('raiz');
  if (!raiz) {
    throw new Error('Falta el elemento #raiz en el HTML');
  }
  createRoot(raiz).render(
    <StrictMode>
      <BrowserRouter basename={base}>
        <ProveedorSesion>
          <ProveedorNotificaciones>{app}</ProveedorNotificaciones>
        </ProveedorSesion>
      </BrowserRouter>
    </StrictMode>,
  );
}
