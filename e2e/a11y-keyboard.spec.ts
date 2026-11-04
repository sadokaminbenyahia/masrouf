import { type Page } from '@playwright/test';
import { expect, gotoApp, test } from './fixtures';

/** Nom accessible (aria-label) du <nav> qui contient l'élément actif, s'il y en a un. */
async function activeNavLabel(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.activeElement?.closest('nav')?.getAttribute('aria-label') ?? null,
  );
}

test.describe('Navigation au clavier', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, '/tableau-de-bord');
  });

  test('lien d’évitement « Aller au contenu » puis Tab vers la navigation', async ({ page }) => {
    // Premier arrêt de tabulation : le lien d'évitement.
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Aller au contenu' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();

    // Tab suivants : la navigation principale est atteinte en quelques pressions.
    let reached: string | null = null;
    for (let i = 0; i < 6 && reached === null; i += 1) {
      await page.keyboard.press('Tab');
      reached = await activeNavLabel(page);
    }
    expect(reached).toBe('Navigation principale');
    await expect(
      page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link').first(),
    ).toBeVisible();

    // Activer le lien d'évitement donne le focus au contenu principal.
    await skip.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    await expect(page).toHaveURL(/#contenu$/);
  });

  test('raccourci « g » puis « t » → /transactions', async ({ page }) => {
    await page.keyboard.press('g');
    await page.keyboard.press('t');
    await page.waitForURL('**/transactions');
    await expect(page.getByRole('heading', { level: 1, name: 'Transactions' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    await expect(nav.getByRole('link', { name: 'Transactions' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('« Maj + ? » ouvre l’aide des raccourcis', async ({ page }) => {
    await page.keyboard.press('Shift+?');
    const help = page.getByRole('dialog', { name: 'Raccourcis clavier' });
    await expect(help).toBeVisible();
    await expect(help).toContainText('Ouvrir la palette de commandes');
    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();
  });
});
