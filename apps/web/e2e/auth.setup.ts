import { expect, test as setup } from '@playwright/test';

import { USER_STATE } from './state';

// Inicia sesión una sola vez con el usuario del seed de desarrollo y guarda la sesión:
// los tests que no prueban el login la reutilizan (y no consumen el límite de intentos por IP).

setup('sesión del usuario común', async ({ page }) => {
  await page.goto('/ingresar');
  await page.getByLabel('Email').fill('usuario@tli.local');
  await page.getByLabel('Contraseña').fill('tli-dev-local-2026');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/mis-tickets$/);
  await page.context().storageState({ path: USER_STATE });
});
