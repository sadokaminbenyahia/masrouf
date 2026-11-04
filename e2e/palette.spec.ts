import { type Page } from '@playwright/test';
import { expect, gotoApp, test } from './fixtures';

async function openPalette(page: Page) {
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Palette de commandes' });
  await expect(palette).toBeVisible();
  const input = palette.getByPlaceholder('Rechercher une page, une action…');
  await expect(input).toBeFocused();
  return { palette, input };
}

test.describe('Palette de commandes', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, '/tableau-de-bord');
  });

  test('Ctrl+K, « budg » puis Entrée → /budgets', async ({ page }) => {
    // BUG: dès 3 caractères, l'entrée « Demander à l'assistant : budg » (groupe « Intelligence »,
    // forceMount, rendu en tête de liste) est sélectionnée par défaut : Entrée mène à
    // /assistant?q=budg au lieu de /budgets. Fichier probable :
    // src/components/command-palette/command-palette.tsx.
    test.fail();
    const { palette, input } = await openPalette(page);
    await input.fill('budg');
    await expect(palette.getByRole('option', { name: /Budgets/ }).first()).toBeVisible();
    // L'option active (aria-selected) doit être la page Budgets.
    await expect(palette.getByRole('option', { selected: true })).toContainText('Budgets', {
      timeout: 5_000,
    });
    await input.press('Enter');
    await expect(page).toHaveURL(/\/budgets$/, { timeout: 5_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Budgets' })).toBeVisible();
    await expect(palette).toBeHidden();
  });

  test('Ctrl+K, « budg » puis choix de « Budgets » → /budgets', async ({ page }) => {
    const { palette, input } = await openPalette(page);
    await input.fill('budg');
    const budgets = palette.getByRole('option', { name: /^Budgets/ });
    await expect(budgets).toBeVisible();
    await budgets.click();
    await page.waitForURL('**/budgets');
    await expect(page.getByRole('heading', { level: 1, name: 'Budgets' })).toBeVisible();
    await expect(palette).toBeHidden();
  });

  test('« café 4 » propose « Ajouter « café 4 » » qui ouvre l’ajout rapide prérempli', async ({
    page,
  }) => {
    const { palette, input } = await openPalette(page);
    await input.fill('café 4');
    const add = palette.getByRole('option', { name: 'Ajouter « café 4 »' });
    await expect(add).toBeVisible();
    await add.click();
    await expect(palette).toBeHidden();

    const dialog = page.getByRole('dialog', { name: 'Nouvelle transaction' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Décrivez la transaction')).toHaveValue('café 4');
    await expect(dialog.getByText('Analysé automatiquement')).toBeVisible();
    await expect(dialog.getByLabel('Montant', { exact: true })).toHaveValue('4');
    await expect(dialog.getByLabel('Libellé', { exact: true })).toHaveValue('Café');
  });
});
