import { expect, type Page } from '@playwright/test';
import { CLAVE, type CorreoDemo } from './api-simulada';

/** Entra con una cuenta de demostracion desde el formulario de acceso. */
export async function entrar(page: Page, correo: CorreoDemo): Promise<void> {
  await page.getByLabel('Correo electrónico').fill(correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

/**
 * Ninguna prueba debe dejar errores de JavaScript ni violaciones de la
 * politica de seguridad de contenido (CSP), que vite preview aplica igual
 * que Caddy en produccion.
 */
export function vigilarErrores(page: Page): () => void {
  const errores: string[] = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (mensaje) => {
    if (mensaje.type() === 'error' && /Content Security Policy/i.test(mensaje.text())) {
      errores.push(mensaje.text());
    }
  });
  return () => expect(errores, 'errores de JavaScript o de CSP en la pagina').toEqual([]);
}
