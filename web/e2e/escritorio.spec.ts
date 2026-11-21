import { expect, test } from '@playwright/test';
import { simularApi } from './api-simulada';

/**
 * Las apps del pasajero y del conductor se usan sobre todo en el celular,
 * pero tambien se abren en un computador (por ejemplo, para crear la cuenta).
 * D-06: en un computador el formulario de acceso del pasajero quedaba de unos
 * 120 px de ancho, porque su margen se calculaba sobre el ancho de la pagina.
 */
test.describe('Acceso en computador', () => {
  for (const [nombre, ruta] of [
    ['pasajero', '/'],
    ['conductor', '/conductor/'],
    ['panel', '/panel/'],
  ] as const) {
    test(`el formulario de acceso del ${nombre} tiene un ancho usable`, async ({ page }) => {
      await simularApi(page);
      await page.goto(ruta);
      const correo = page.getByLabel('Correo electrónico');
      await expect(correo).toBeVisible();
      const caja = await correo.boundingBox();
      expect(caja?.width ?? 0).toBeGreaterThanOrEqual(300);
    });
  }
});
