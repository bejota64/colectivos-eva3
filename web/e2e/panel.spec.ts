import { expect, test } from '@playwright/test';
import { simularApi } from './api-simulada';
import { entrar, vigilarErrores } from './ayudas';

test.describe('Panel del representante', () => {
  test('entra y ve el resumen del trazado; cierra una jornada', async ({ page }) => {
    const sinErrores = vigilarErrores(page);
    await simularApi(page);
    await page.goto('/panel/');
    await expect(page.getByRole('heading', { name: 'Tu trazado, en una sola pantalla' })).toBeVisible();
    await entrar(page, 'representante@colectivos.ejemplo.cl');

    await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible();
    await expect(page).toHaveURL(/\/panel\/resumen$/);
    const cifras = page.locator('.p-cifras');
    await expect(cifras).toContainText('Colectivos en servicio');
    await expect(cifras.locator('.p-cifra').first()).toContainText('3');
    await expect(cifras.locator('.p-cifra').nth(1)).toContainText('8');
    await expect(page.getByRole('table')).toContainText('Pedro Muñoz Díaz');

    await page.getByRole('button', { name: 'Cerrar', exact: true }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar jornada' }).click();
    await expect(page.locator('.p-jornadas li')).toHaveCount(2);
    sinErrores();
  });

  test('la demanda marca la hora con más espera', async ({ page }) => {
    await simularApi(page, { sesion: 'representante@colectivos.ejemplo.cl' });
    await page.goto('/panel/demanda');
    await expect(page.getByRole('heading', { name: 'Personas esperando por hora' })).toBeVisible();
    await expect(page.getByText('La hora con más espera fue las 18:00, con 22 personas.')).toBeVisible();
    await expect(page.getByRole('button', { name: '18:00, 22 personas' })).toHaveClass(/pico/);
  });

  test('responde y cierra una queja', async ({ page }) => {
    await simularApi(page, { sesion: 'representante@colectivos.ejemplo.cl' });
    await page.goto('/panel/reportes');
    await expect(page.getByRole('heading', { name: 'Uso del celular al manejar' })).toBeVisible();
    await page.getByLabel('Respuesta al pasajero').fill('Hablamos con el conductor y quedó registrada una amonestación.');
    await page.getByRole('button', { name: 'Responder y cerrar' }).click();
    await expect(page.getByText('Reporte respondido y cerrado')).toBeVisible();
    await expect(page.locator('.p-bandeja-item')).toHaveCount(1);
  });

  test('agrega una tarifa nocturna y un auto', async ({ page }) => {
    await simularApi(page, { sesion: 'representante@colectivos.ejemplo.cl' });
    await page.goto('/panel/tarifas');
    await page.getByRole('button', { name: 'Nueva tarifa' }).click();
    const tarifa = page.getByRole('dialog', { name: 'Nueva tarifa' });
    await tarifa.getByLabel('Nombre').fill('Nocturna');
    await expect(tarifa.getByText('Ya existe una tarifa con este nombre')).toBeVisible();
    await tarifa.getByLabel('Monto en pesos').fill('2000');
    await tarifa.getByRole('button', { name: 'Reemplazar tarifa' }).click();
    await expect(page.locator('.p-tarifa').filter({ hasText: 'Nocturna' })).toContainText('$2.000');

    await page.getByRole('link', { name: 'Flota' }).click();
    await page.getByRole('button', { name: 'Agregar auto' }).click();
    const auto = page.getByRole('dialog', { name: 'Agregar auto' });
    await auto.getByLabel('Patente').fill('zz-zz-06');
    await expect(auto.getByLabel('Patente')).toHaveValue('ZZZZ06');
    await auto.getByLabel('Marca').fill('Kia');
    await auto.getByLabel('Modelo').fill('Morning');
    await auto.getByLabel('Año').fill('2022');
    await auto.getByRole('button', { name: 'Agregar auto' }).click();
    await expect(page.getByRole('table')).toContainText('ZZZZ06');
  });

  test('un pasajero no puede usar el panel', async ({ page }) => {
    await simularApi(page, { sesion: 'pasajero1@colectivos.ejemplo.cl' });
    await page.goto('/panel/tarifas');
    await expect(page.getByRole('heading', { name: 'Esta app no es para tu cuenta' })).toBeVisible();
  });
});

test.describe('Panel del administrador (CU-13 y CU-14)', () => {
  test('entra a Trazados; no ve las secciones del representante; revisa la auditoría', async ({ page }) => {
    const sinErrores = vigilarErrores(page);
    await simularApi(page, { sesion: 'admin@colectivos.ejemplo.cl' });
    await page.goto('/panel/');
    await expect(page.getByRole('heading', { name: 'Trazados' })).toBeVisible();
    await expect(page).toHaveURL(/\/panel\/trazados$/);
    await expect(page.getByRole('link', { name: 'Tarifas' })).toHaveCount(0);

    const fila9001 = page.getByRole('row').filter({ hasText: '9001' });
    await expect(fila9001).toContainText('Héctor Fuentes Lagos');
    await expect(fila9001).toContainText('3 en servicio');
    // Con colectivos en servicio no se puede desactivar.
    await expect(fila9001.getByRole('button', { name: 'Desactivar' })).toBeDisabled();

    await page.getByRole('link', { name: 'Auditoría' }).click();
    await expect(page.getByRole('table')).toContainText('Inicio de sesión fallido');
    sinErrores();
  });

  test('crea un trazado desde una línea del registro del MTT', async ({ page }) => {
    const sinErrores = vigilarErrores(page);
    const estado = await simularApi(page, { sesion: 'admin@colectivos.ejemplo.cl' });
    await page.goto('/panel/trazados');
    await page.getByRole('button', { name: 'Nuevo trazado' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Nuevo trazado' });

    await dialogo.getByLabel('Número de línea, calle o lugar').fill('4008');
    await dialogo.getByRole('button', { name: 'Buscar' }).click();
    await dialogo.getByRole('button', { name: /Línea 4008/ }).click();

    // Se ve el recorrido real y los datos vienen llenos desde el registro.
    await expect(dialogo.locator('.p-mapa-vista .leaflet-container')).toBeVisible();
    await expect(dialogo.getByLabel('Código')).toHaveValue('4008');
    await expect(dialogo.getByLabel('Origen de la ida')).toHaveValue('Arturo Prat');
    await expect(dialogo.getByRole('button', { name: 'Crear trazado' })).toBeDisabled();

    await dialogo.getByLabel('Representante').selectOption({ label: 'Marcela Vidal Rojas (representante2@colectivos.ejemplo.cl)' });
    await dialogo.getByRole('button', { name: 'Crear trazado' }).click();

    await expect(page.getByText('Trazado 4008 creado con el recorrido de la Línea 4008')).toBeVisible();
    const fila = page.getByRole('row').filter({ hasText: '4008' });
    await expect(fila).toContainText('Marcela Vidal Rojas');
    await expect(fila).toContainText('Activo');
    expect(estado.trazadosAdmin.find((t) => t.codigo === '4008')?.sentidos).toEqual([
      { sentido: 'ida', origen: 'Arturo Prat', destino: 'Ramon Corvalan Melgarejo' },
      { sentido: 'vuelta', origen: 'Ramon Corvalan Melgarejo', destino: 'Arturo Prat' },
    ]);
    sinErrores();
  });

  test('crea un representante, le pasa un trazado y desactiva una cuenta', async ({ page }) => {
    const sinErrores = vigilarErrores(page);
    await simularApi(page, { sesion: 'admin@colectivos.ejemplo.cl' });
    await page.goto('/panel/representantes');
    await page.getByRole('button', { name: 'Nuevo representante' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Nuevo representante' });
    await dialogo.getByLabel('Nombre y apellido').fill('Rosa Pérez Lagos');
    await dialogo.getByLabel('Correo electrónico').fill('rosa.perez@colectivos.ejemplo.cl');
    await dialogo.getByLabel('Contraseña inicial').fill('trompo-nube-1');
    await expect(dialogo.getByText('Muy corta: usa al menos 15 caracteres')).toBeVisible();
    await expect(dialogo.getByRole('button', { name: 'Crear cuenta' })).toBeDisabled();
    await dialogo.getByLabel('Contraseña inicial').fill('trompo-nube-cerro-lila');
    await dialogo.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Rosa Pérez Lagos' })).toContainText('Sin trazado');

    // El trazado 9002 pasa a la cuenta nueva.
    await page.getByRole('link', { name: 'Trazados' }).click();
    await page.getByRole('row').filter({ hasText: '9002' }).getByRole('button', { name: 'Cambiar representante' }).click();
    const cambio = page.getByRole('dialog', { name: 'Representante del 9002' });
    await cambio.getByLabel('Representante').selectOption({ label: 'Rosa Pérez Lagos (rosa.perez@colectivos.ejemplo.cl)' });
    await cambio.getByRole('button', { name: 'Cambiar representante' }).click();
    await expect(page.getByRole('row').filter({ hasText: '9002' })).toContainText('Rosa Pérez Lagos');

    // Desactivar la cuenta que quedó sin trazado.
    await page.getByRole('link', { name: 'Representantes' }).click();
    const marcela = page.getByRole('row').filter({ hasText: 'Marcela Vidal Rojas' });
    await expect(marcela).toContainText('Sin trazado');
    await marcela.getByRole('button', { name: 'Desactivar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Desactivar cuenta' }).click();
    await expect(marcela).toContainText('Desactivada');
    await expect(marcela.getByRole('button', { name: 'Activar' })).toBeVisible();
    sinErrores();
  });
});
