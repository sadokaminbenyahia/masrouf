import { expect, gotoApp, test } from './fixtures';

test.describe('Tableau de bord', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, '/tableau-de-bord');
    await expect(page.getByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeVisible();
  });

  test('affiche les KPI, graphiques, top dépenses, score de santé et prévision', async ({
    page,
  }) => {
    for (const id of [
      'kpi-balance',
      'kpi-month-expense',
      'chart-categories',
      'chart-12-months',
      'top-expenses',
      'health-score',
      'forecast',
    ]) {
      await expect(page.getByTestId(id), id).toBeVisible();
    }
    // Les KPI affichent des montants en dinars.
    await expect(page.getByTestId('kpi-balance')).toContainText('DT');
    await expect(page.getByTestId('kpi-month-expense')).toContainText('DT');
    // Les sections IA ne sont pas en erreur.
    await expect(page.getByTestId('forecast')).not.toHaveAttribute('role', 'alert');
    await expect(page.getByTestId('health-score')).not.toHaveAttribute('role', 'alert');
  });

  test('clic sur une catégorie de la légende → transactions filtrées', async ({ page }) => {
    const legend = page
      .getByTestId('chart-categories')
      .getByRole('list', { name: 'Légende des catégories' });
    const first = legend.getByRole('button', { name: /voir les transactions/ }).first();
    await expect(first).toBeVisible();
    await first.click();

    await page.waitForURL(/\/transactions\?.*categoryId=/);
    const url = new URL(page.url());
    expect(url.searchParams.get('categoryId')).toBeTruthy();
    expect(url.searchParams.get('type')).toBe('EXPENSE');
    await expect(page.getByRole('heading', { level: 1, name: 'Transactions' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Transactions' })).toBeVisible();
  });
});
