import { expect, test } from '@playwright/test';

// Usuario del seed de desarrollo (packages/db/src/seed/dev.ts).
const USER = { email: 'usuario@tli.local', password: 'tli-dev-local-2026' };

test('un usuario propone una automatización y la encuentra en Mis tickets', async ({ page }) => {
  const subject = `Automatizar carga de stock ${Date.now()}`;
  await page.goto('/ingresar');
  await page.getByLabel('Email').fill(USER.email);
  await page.getByLabel('Contraseña').fill(USER.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/mis-tickets$/);

  await page.getByRole('link', { name: 'Nuevo ticket' }).first().click();
  await page.getByRole('button', { name: /^Automatización/ }).click();

  // Enviar vacío muestra los errores de validación en español.
  await page.getByRole('button', { name: 'Enviar ticket' }).click();
  await expect(page.getByText('Contá cómo se hace hoy')).toBeVisible();

  await page.getByLabel('Asunto').fill(subject);
  await page
    .getByLabel('Descripción')
    .fill('Todos los días copiamos a mano el stock que manda el cliente.');
  await page
    .getByLabel('¿Cómo se hace hoy?')
    .fill('Se descarga el Excel del mail y se carga a mano en el WMS.');
  await page.getByLabel('¿Cada cuánto?').selectOption('DAILY');
  await page.getByLabel('¿Cuántos minutos lleva cada vez?').fill('40');
  await page
    .getByLabel('¿Qué ganaríamos?')
    .fill('Ahorrar 40 minutos por día y evitar errores de tipeo.');
  await page.getByRole('button', { name: 'Enviar ticket' }).click();

  await expect(page.getByRole('heading', { name: /Ticket TLI-\d{6} creado/ })).toBeVisible();
  await page.getByRole('link', { name: 'Ir a Mis tickets' }).click();
  await expect(page.getByText(subject)).toBeVisible();

  await page.getByText(subject).click();
  await expect(page.getByRole('heading', { name: subject })).toBeVisible();
  await expect(page.getByText('Se descarga el Excel del mail')).toBeVisible();
});

test('un usuario adjunta una captura a un ticket de soporte', async ({ page }) => {
  // PNG mínimo válido (1x1).
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  const subject = `Error con captura ${Date.now()}`;
  await page.goto('/ingresar');
  await page.getByLabel('Email').fill(USER.email);
  await page.getByLabel('Contraseña').fill(USER.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/mis-tickets$/);

  await page.goto('/tickets/nuevo');
  await page.getByRole('button', { name: /^Soporte/ }).click();
  await page.getByLabel('Asunto').fill(subject);
  await page.getByLabel('Descripción').fill('Adjunto la captura del error que aparece.');
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'captura.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByText('captura.png')).toBeVisible();
  // Espera a que el antivirus libere el archivo (deja de decir "Subiendo…" / "Analizando…").
  await expect(page.getByText(/Subiendo|Analizando/)).toHaveCount(0, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Enviar ticket' }).click();

  await page.getByRole('link', { name: 'Ver ticket' }).click();
  await expect(page.getByRole('heading', { name: subject })).toBeVisible();
  await expect(page.getByRole('img', { name: 'captura.png' })).toBeVisible();
});
