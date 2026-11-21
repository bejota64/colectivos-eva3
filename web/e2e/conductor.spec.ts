import { expect, test } from '@playwright/test';
import { simularApi } from './api-simulada';
import { entrar, vigilarErrores } from './ayudas';

test.describe('App del conductor', () => {
  test('acepta la ubicación, inicia la jornada, cuenta pasajeros y la termina', async ({ page }) => {
    const sinErrores = vigilarErrores(page);
    const estado = await simularApi(page, { sinConsentimiento: true });
    await page.goto('/conductor/');
    await expect(page.getByRole('heading', { name: 'Entra para iniciar tu jornada' })).toBeVisible();
    await entrar(page, 'conductor1@colectivos.ejemplo.cl');

    await expect(page.getByRole('heading', { name: 'Hola, Pedro' })).toBeVisible();
    await page.getByRole('radio', { name: /ZZZZ01/ }).check({ force: true });
    await page.getByRole('radio', { name: /Hacia Hospital Sótero del Río/ }).check({ force: true });
    await page.getByRole('button', { name: 'Iniciar jornada' }).click();

    // La API pide consentimiento la primera vez.
    await page.getByRole('dialog', { name: 'Tu ubicación durante la jornada' }).getByRole('button', { name: 'Aceptar e iniciar jornada' }).click();
    await expect(page.getByRole('heading', { name: 'Asientos libres' })).toBeVisible();
    await expect(page.getByText('En el mapa')).toBeVisible({ timeout: 10_000 });

    // Los botones dicen lo que pasó, no «+» y «−».
    await page.getByRole('button', { name: /Se subió alguien/ }).click();
    await expect(page.locator('.c-cifra b')).toHaveText('3');
    await expect.poll(() => estado.jornada?.asientos_disponibles).toBe(3);
    await page.getByRole('button', { name: /Se bajó alguien/ }).click();
    await expect.poll(() => estado.jornada?.asientos_disponibles).toBe(4);
    await expect(page.getByText('340 m')).toBeVisible();

    await page.getByRole('button', { name: 'Terminar jornada' }).click();
    const confirmar = page.getByRole('dialog', { name: '¿Terminar la jornada?' });
    // «Seguir» no termina nada.
    await confirmar.getByRole('button', { name: 'Seguir' }).click();
    await expect(confirmar).toBeHidden();
    expect(estado.jornada).not.toBeNull();

    await page.getByRole('button', { name: 'Terminar jornada' }).click();
    await confirmar.getByRole('button', { name: 'Terminar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Jornada terminada' })).toBeVisible();
    expect(estado.jornada).toBeNull();
    await expect(page.getByRole('button', { name: 'Abrir una nueva jornada' })).toBeVisible();
    sinErrores();
  });

  test('retoma la jornada abierta y cambia de sentido al llegar al final', async ({ page }) => {
    const estado = await simularApi(page, { sesion: 'conductor1@colectivos.ejemplo.cl', conJornada: true });
    await page.goto('/conductor/');
    await expect(page.locator('.c-ruta-actual .letrero')).toContainText('Hospital Sótero del Río');
    await expect(page.getByRole('button', { name: 'Al Hospital' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'A la Plaza' }).click();
    await page.getByRole('dialog', { name: '¿Cambiar a «A la Plaza»?' }).getByRole('button', { name: 'Sí, cambiar' }).click();
    await expect(page.locator('.c-ruta-actual .letrero')).toContainText('Plaza de Puente Alto');
    await expect(page.getByRole('button', { name: 'A la Plaza' })).toHaveAttribute('aria-pressed', 'true');
    expect(estado.jornada?.sentido_id).toBe('00000000-0000-4000-8000-000000000102');
  });
});
