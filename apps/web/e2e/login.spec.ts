import { expect, test } from '@playwright/test';

// Usuario del seed de desarrollo (packages/db/src/seed/dev.ts).
const USER = { email: 'usuario@tli.local', password: 'tli-dev-local-2026' };

test('credenciales incorrectas muestran un error genérico', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/ingresar$/);
  await page.getByLabel('Email').fill(USER.email);
  await page.getByLabel('Contraseña').fill('no-es-la-clave');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('alert')).toContainText('No pudimos iniciar sesión');
});

test('un usuario común ingresa, no ve administración y cierra sesión', async ({ page }) => {
  await page.goto('/ingresar');
  await page.getByLabel('Email').fill(USER.email);
  await page.getByLabel('Contraseña').fill(USER.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();

  await expect(page.getByRole('heading', { name: /Hola, Usuario/ })).toBeVisible();
  await expect(page.getByText('Administración')).toHaveCount(0);

  // Entrar por URL a una sección de admin no muestra datos.
  await page.goto('/admin/usuarios');
  await expect(page.getByText('No tenés permiso para ver esta sección.')).toBeVisible();

  await page.getByRole('button', { name: 'Menú de usuario' }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/ingresar$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/ingresar$/);
});
