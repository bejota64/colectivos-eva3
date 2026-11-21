import { expect, test } from '@playwright/test';
import { simularApi } from './api-simulada';
import { entrar, vigilarErrores } from './ayudas';

test.describe('App del pasajero', () => {
  test('entra, avisa que espera, se sube, se baja y califica el viaje', async ({ page }) => {
    const sinErrores = vigilarErrores(page);
    await simularApi(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Mira dónde viene tu colectivo' })).toBeVisible();
    await entrar(page, 'pasajero1@colectivos.ejemplo.cl');

    // Sin permiso de ubicacion todavia: ve el proximo colectivo, pero sin minutos.
    await expect(page.getByRole('button', { name: 'Al Hospital' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Próximo: ZZZZ01')).toBeVisible();
    await expect(page.getByText('Sin ubicación')).toBeVisible();
    await expect(page.getByText('Recorrido completo')).toBeVisible();

    await page.getByRole('radio', { name: '2' }).check({ force: true });
    await page.getByRole('button', { name: /^Estoy esperando/ }).click();
    const permiso = page.getByRole('dialog', { name: '¿Nos dejas usar tu ubicación?' });
    await expect(permiso).toContainText('Se borra a los 20 minutos');
    await permiso.getByRole('button', { name: 'Aceptar' }).click();

    // Con la ubicacion, el aviso sale solo y aparecen los minutos.
    await expect(page.getByText('Avisaste que esperas')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'El más cercano llega en 4 min' })).toBeVisible();
    await expect(page.getByText(/Avisaste por 2 personas\. Tu aviso vence en 15 minutos/)).toBeVisible();
    // Mientras espera no puede cambiar de sentido por error.
    await expect(page.getByRole('button', { name: 'A la Plaza' })).toBeDisabled();

    await page.getByRole('button', { name: /Me subí al ZZZZ01/ }).click();
    await expect(page.getByRole('heading', { name: 'Vas en el ZZZZ01' })).toBeVisible();

    await page.getByRole('button', { name: /Ya bajé/ }).click();
    const calificar = page.getByRole('dialog', { name: 'Califica tu viaje' });
    await calificar.getByRole('radio', { name: '5 estrellas' }).check({ force: true });
    await calificar.getByRole('button', { name: 'Enviar calificación' }).click();
    await expect(calificar.getByLabel('Calificaste con 5 de 5 estrellas')).toBeVisible();
    await calificar.getByRole('button', { name: 'Listo' }).click();
    await expect(page.getByRole('button', { name: /^Estoy esperando/ })).toBeVisible();
    sinErrores();
  });

  test('cambia de sentido con un toque y el letrero muestra el nuevo destino', async ({ page }) => {
    await simularApi(page, { sesion: 'pasajero1@colectivos.ejemplo.cl' });
    await page.goto('/');
    await expect(page.locator('.inicio-letrero')).toContainText('Hospital Sótero del Río');
    await page.getByRole('button', { name: 'A la Plaza' }).click();
    await expect(page.getByRole('button', { name: 'A la Plaza' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.inicio-letrero')).toContainText('Plaza de Puente Alto');
  });

  test('la primera vez explica en cuatro pasos cómo se usa', async ({ page }) => {
    await simularApi(page, { sesion: 'pasajero1@colectivos.ejemplo.cl', conGuia: true });
    await page.goto('/');
    const guia = page.getByRole('dialog', { name: 'Así funciona' });
    await expect(guia).toContainText('Paso 1 de 4');
    await expect(guia.getByRole('heading', { name: 'Elige hacia dónde vas' })).toBeVisible();
    for (let paso = 2; paso <= 4; paso++) {
      await guia.getByRole('button', { name: 'Siguiente' }).click();
      await expect(guia).toContainText(`Paso ${paso} de 4`);
    }
    await guia.getByRole('button', { name: 'Entendido' }).click();
    await expect(guia).toBeHidden();

    // No vuelve a aparecer al recargar, pero se puede abrir desde el menú.
    await page.reload();
    await expect(page.getByText('Próximo: ZZZZ01')).toBeVisible();
    await expect(guia).toBeHidden();
    await page.getByRole('button', { name: 'Menú' }).click();
    await page.getByRole('button', { name: '¿Cómo funciona?' }).click();
    await expect(guia).toContainText('Paso 1 de 4');
  });

  test('busca qué colectivo le sirve entre los recorridos reales del registro', async ({ page }) => {
    const sinErrores = vigilarErrores(page);
    await simularApi(page, { sesion: 'pasajero1@colectivos.ejemplo.cl' });
    await page.goto('/');
    await page.getByRole('link', { name: '¿Qué colectivo me sirve?' }).click();
    await expect(page.getByRole('heading', { name: '¿Qué colectivo me sirve?' })).toBeVisible();

    await page.getByLabel('Escribe una calle, un lugar o el número de la línea').fill('eduardo cordero');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText(/\d+ recorridos?$/)).toBeVisible();
    const linea = page.getByRole('link', { name: /Arturo Prat.*Ramon Corvalan Melgarejo/ }).first();
    await expect(linea).toContainText('4008');
    await linea.click();

    await expect(page.getByRole('heading', { name: 'Línea 4008' })).toBeVisible();
    await expect(page.getByText('ESTRELLAS LTDA.')).toBeVisible();
    await expect(page.locator('.recorrido-mapa .leaflet-interactive').first()).toBeVisible();
    const calles = page.locator('.calles li');
    await expect(calles.first()).toContainText('Arturo Prat');
    await expect(page.getByText("Av. Libertador Bernardo O'Higgins").first()).toBeVisible();

    // La vuelta tiene sus propias calles.
    await page.getByRole('button', { name: 'Hacia Arturo Prat' }).click();
    await expect(calles.first()).toContainText('Doctor Ramon Corvalan');
    sinErrores();
  });

  test('busca líneas que pasan cerca, con su distancia', async ({ page }) => {
    await simularApi(page, { sesion: 'pasajero1@colectivos.ejemplo.cl' });
    await page.addInitScript(() => window.localStorage.setItem('colectivos.ubicacion', 'aceptada'));
    await page.goto('/recorridos');
    await page.getByRole('button', { name: 'Cerca de mí' }).click();
    await expect(page.getByText(/recorridos? pasan? a menos de 500 m de ti/)).toBeVisible();
    await expect(page.locator('.lineas .pildora-verde').first()).toContainText(/^A \d+ m$/);
  });

  test('califica un viaje reciente y reporta un problema', async ({ page }) => {
    await simularApi(page, { sesion: 'pasajero1@colectivos.ejemplo.cl' });
    await page.goto('/viajes');
    await expect(page.getByRole('heading', { name: 'Mis viajes' })).toBeVisible();
    await expect(page.getByText('Respuesta del trazado')).toBeVisible();
    await expect(page.getByText('El plazo para calificar este viaje terminó.')).toBeVisible();

    await page.getByRole('radio', { name: '4 estrellas' }).check({ force: true });
    await page.getByRole('button', { name: 'Enviar calificación' }).click();
    await expect(page.getByLabel('Calificaste con 4 de 5 estrellas')).toBeVisible();

    await page.getByRole('button', { name: 'Felicitar o reportar un problema' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Reportar un problema' });
    await expect(dialogo).toContainText('El conductor no verá quién lo escribió');
    await dialogo.getByLabel('Motivo').selectOption('trato_al_pasajero');
    await dialogo.getByLabel('Cuéntanos qué pasó').fill('No respondió el saludo y cerró la puerta muy fuerte.');
    await dialogo.getByRole('button', { name: 'Enviar queja' }).click();
    await expect(page.getByText('Enviaste una queja')).toBeVisible();
  });

  test('el registro explica cada requisito antes de enviar', async ({ page }) => {
    await simularApi(page);
    await page.goto('/');
    await page.getByRole('tab', { name: 'Crear cuenta' }).click();
    const crear = page.getByRole('button', { name: 'Crear cuenta', exact: true });
    await page.getByLabel('Nombre y apellido').fill('Camila Rojas');
    await page.getByLabel('Correo electrónico').fill('camila@ejemplo.cl');
    await page.getByLabel('Contraseña', { exact: true }).fill('corta');
    await expect(page.getByText('Muy corta: usa al menos 12 caracteres')).toBeVisible();
    await crear.click();
    await expect(page.getByRole('alert')).toContainText('al menos 12 caracteres');

    await page.getByLabel('Contraseña', { exact: true }).fill('una frase larga y facil');
    await crear.click();
    await expect(page.getByRole('alert')).toContainText('debes aceptar los términos');

    // Con todo en orden se envia; la API simulada responde que el correo ya existe.
    await page.getByRole('checkbox').check();
    await crear.click();
    await expect(page.getByRole('alert')).toHaveText('Ya existe una cuenta con ese correo');
  });

  test('una cuenta de conductor no puede usar la app del pasajero', async ({ page }) => {
    await simularApi(page);
    await page.goto('/');
    await entrar(page, 'conductor1@colectivos.ejemplo.cl');
    await expect(page.getByRole('heading', { name: 'Esta app no es para tu cuenta' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir a la app del conductor' })).toHaveAttribute('href', '/conductor/');
  });

  test('una contraseña equivocada muestra el error de la API', async ({ page }) => {
    await simularApi(page);
    await page.goto('/');
    await page.getByLabel('Correo electrónico').fill('pasajero1@colectivos.ejemplo.cl');
    await page.getByLabel('Contraseña', { exact: true }).fill('no-es-la-clave-correcta');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos');
  });
  test('con más de una línea en la app, elige la suya y la recuerda', async ({ page }) => {
    const sinErrores = vigilarErrores(page);
    await simularApi(page, { sesion: 'pasajero1@colectivos.ejemplo.cl', variosTrazados: true });
    await page.goto('/');
    const letrero = page.getByRole('button', { name: /^Línea 9001 hacia .*Cambiar de línea$/ });
    await expect(letrero).toBeVisible();
    await letrero.click();

    const lineas = page.getByRole('dialog', { name: '¿En qué línea vas?' });
    await expect(lineas.getByRole('button', { name: /9001/ })).toHaveAttribute('aria-pressed', 'true');
    await lineas.getByRole('button', { name: /4008/ }).click();

    await expect(page.getByRole('button', { name: /^Línea 4008 hacia Ramon Corvalan Melgarejo/ })).toBeVisible();
    await expect(page.getByText('$1.300')).toBeVisible();

    // Al volver a abrir la app sigue en la misma línea.
    await page.reload();
    await expect(page.getByRole('button', { name: /^Línea 4008 hacia/ })).toBeVisible();
    sinErrores();
  });
});
