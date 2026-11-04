import { expect, gotoApp, test } from './fixtures';

/*
 * Projet « mobile » (Pixel 7). Le projet « desktop » de playwright.config.ts n'exclut pas les
 * fichiers *.mobile.spec.ts : on les ignore explicitement hors mobile.
 */
test.skip(({ isMobile }) => !isMobile, 'Parcours réservé au projet mobile (Pixel 7).');

test.describe('Mobile : navigation, thème et mode discret', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, '/tableau-de-bord');
  });

  test('nav du bas visible ; « Ajouter une transaction » ouvre la feuille', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Navigation mobile' });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link', { name: /Accueil/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: 'Transactions' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Budgets' })).toBeVisible();
    // La barre latérale desktop est masquée.
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeHidden();

    await nav.getByRole('button', { name: 'Ajouter une transaction' }).click();
    const sheet = page.getByRole('dialog', { name: 'Nouvelle transaction' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel('Décrivez la transaction')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Enregistrer' })).toBeAttached();
  });

  test('bascule du thème sombre', async ({ page }) => {
    const html = page.locator('html');
    await expect(html).not.toHaveClass(/\bdark\b/);
    await page.getByRole('button', { name: 'Changer de thème' }).click();
    await expect(html).toHaveClass(/\bdark\b/);
    // Le choix est conservé au rechargement.
    await page.reload();
    await expect(html).toHaveClass(/\bdark\b/);
    await page.getByRole('button', { name: 'Changer de thème' }).click();
    await expect(html).not.toHaveClass(/\bdark\b/);
  });

  test('mode discret : « Masquer les montants » masque les montants', async ({ page }) => {
    const balance = page.getByTestId('kpi-balance');
    await expect(balance).toContainText(/\d\s*DT/);
    await expect(page.locator('[data-slot="money"][data-discreet="true"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Masquer les montants' }).click();
    await expect(page.getByRole('button', { name: 'Afficher les montants' })).toBeVisible();
    await expect(page.locator('[data-slot="money"][data-discreet="true"]').first()).toBeVisible();
    await expect(page.getByText('Montant masqué').first()).toBeAttached();
    // Plus aucun montant chiffré visible dans les KPI.
    await expect(balance).toContainText('••• DT');
    await expect(balance).not.toContainText(/\d\s*DT/);

    await page.getByRole('button', { name: 'Afficher les montants' }).click();
    await expect(page.getByRole('button', { name: 'Masquer les montants' })).toBeVisible();
    await expect(page.locator('[data-slot="money"][data-discreet="true"]')).toHaveCount(0);
  });
});
