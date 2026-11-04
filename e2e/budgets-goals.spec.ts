import { expect, gotoApp, test, toast } from './fixtures';

test.describe('Budgets', () => {
  test('affiche les barres de progression et une alerte', async ({ page }) => {
    await gotoApp(page, '/budgets');
    await expect(page.getByRole('heading', { level: 1, name: 'Budgets' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nouveau budget' }).first()).toBeVisible();

    const bars = page.getByRole('progressbar', { name: /^Progression du budget / });
    // Seed : 6 budgets (Courses, Restaurants, Cafés, Transport, Loisirs, Shopping).
    await expect(bars).toHaveCount(6);
    await expect(
      page.getByRole('progressbar', { name: 'Progression du budget Courses' }),
    ).toHaveAttribute('aria-valuenow', /\d+/);

    // Seed : au moins un budget en alerte (WARNING) et un dépassé (EXCEEDED) ce mois-ci.
    const banner = page.getByRole('status').filter({ hasText: /votre attention/ });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('(dépassé)');
  });
});

test.describe('Objectifs', () => {
  test('verser 50 DT sur un objectif met à jour la progression (puis Annuler)', async ({
    page,
  }) => {
    await gotoApp(page, '/objectifs');
    await expect(
      page.getByRole('heading', { level: 1, name: "Objectifs d'épargne" }),
    ).toBeVisible();

    const goal = "Fonds d'urgence";
    const card = page.getByRole('article', { name: goal });
    const ring = card.getByRole('progressbar', { name: `Progression de ${goal}` });
    await expect(ring).toBeVisible();
    const before = await ring.getAttribute('aria-valuetext');
    expect(before).toBeTruthy();

    await card.getByRole('button', { name: 'Verser' }).click();
    const dialog = page.getByRole('dialog', { name: `Verser sur « ${goal} »` });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Montant à verser').fill('50');
    await dialog.getByRole('button', { name: 'Verser', exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(ring).not.toHaveAttribute('aria-valuetext', before ?? '');
    const after = await ring.getAttribute('aria-valuetext');

    // Annuler le versement rétablit la progression initiale (données de démo inchangées).
    const added = toast(page, `Versement ajouté à « ${goal} ».`);
    await expect(added).toBeVisible();
    await added.getByRole('button', { name: 'Annuler' }).click();
    await expect(toast(page, 'Versement annulé.')).toBeVisible();
    await expect(ring).toHaveAttribute('aria-valuetext', before ?? '');
    expect(after).not.toBe(before);
  });

  test('simulateur « et si » : déplacer un curseur met à jour le message', async ({ page }) => {
    await gotoApp(page, '/objectifs');
    const whatIf = page.getByTestId('what-if');
    await expect(whatIf).toBeVisible();

    const message = whatIf.locator('p[aria-live="polite"]');
    await expect(message).toBeVisible();
    const initial = (await message.innerText()).trim();
    expect(initial).not.toBe('');

    const slider = whatIf.getByRole('slider').first();
    await expect(slider).toBeVisible();
    await slider.focus();
    // Pas de 5 % : 4 flèches = −20 %.
    for (let i = 0; i < 4; i += 1) await slider.press('ArrowRight');
    await expect(slider).toHaveValue('20');

    await expect(message).not.toHaveText(initial);
    await expect(message).toContainText('En réduisant');
    await expect(message).toContainText('20 %');
  });
});
