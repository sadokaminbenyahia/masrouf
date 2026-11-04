import { type Page } from '@playwright/test';
import { expect, gotoApp, test, trackExternalRequests } from './fixtures';

async function ask(page: Page, question: string): Promise<void> {
  const field = page.getByLabel('Votre question');
  await field.fill(question);
  await page.getByRole('button', { name: 'Envoyer' }).click();
}

test.describe('Assistant (IA locale)', () => {
  let external: string[] = [];

  test.beforeEach(async ({ page, baseURL }) => {
    expect(baseURL).toBeTruthy();
    external = trackExternalRequests(page, baseURL ?? '');
  });

  test.afterEach(() => {
    // Preuve que l'IA est locale : aucune requête ne quitte l'origine de l'application.
    expect(external, `requêtes externes : ${external.join(', ')}`).toEqual([]);
  });

  test('affiche le résumé mensuel', async ({ page }) => {
    await gotoApp(page, '/assistant');
    await expect(page.getByRole('heading', { level: 1, name: 'Assistant' })).toBeVisible();
    const summary = page.getByTestId('monthly-summary');
    await expect(summary).toBeVisible();
    await expect(summary).not.toHaveAttribute('role', 'alert');
    await expect(summary).toContainText('DT');
  });

  test('question comprise : dépenses en restaurants ce trimestre', async ({ page }) => {
    await gotoApp(page, '/assistant');
    await ask(page, "combien j'ai dépensé en restaurants ce trimestre ?");

    const answer = page.getByTestId('assistant-answer');
    await expect(answer).toHaveAttribute('aria-live', 'polite');
    await expect(answer.getByRole('article', { name: 'Réponse de l’assistant' })).toBeVisible();
    await expect(answer).toContainText('DT');
    await expect(answer).toContainText('Restaurants');
  });

  test('question incomprise → suggestions cliquables → nouvelle réponse', async ({ page }) => {
    await gotoApp(page, '/assistant');
    await ask(page, 'quelle heure est-il ?');

    const first = page.getByTestId('assistant-answer');
    await expect(first.getByRole('article', { name: 'Réponse de l’assistant' })).toBeVisible();
    await expect(first).toContainText('Essayez :');
    const suggestions = first.getByRole('listitem').getByRole('button');
    const count = await suggestions.count();
    expect(count).toBeGreaterThanOrEqual(3);
    expect(count).toBeLessThanOrEqual(4);

    const suggestion = suggestions.first();
    const text = (await suggestion.innerText()).trim();
    expect(text).not.toBe('');
    await suggestion.click();

    // Deux échanges dans l'historique ; la réponse « live » est la nouvelle.
    const history = page.getByRole('list', { name: 'Historique de la conversation' });
    await expect(history.getByRole('article', { name: 'Réponse de l’assistant' })).toHaveCount(2);
    const latest = page.getByTestId('assistant-answer');
    await expect(latest).toHaveCount(1);
    await expect(history.getByText(text, { exact: true }).first()).toBeVisible();
    await expect(latest.getByRole('article', { name: 'Réponse de l’assistant' })).toBeVisible();
    await expect(latest).not.toContainText('Essayez :');
  });

  test('?q= pose automatiquement la question', async ({ page }) => {
    const question = "combien j'ai dépensé en restaurants ce trimestre ?";
    await page.goto(`/assistant?q=${encodeURIComponent(question)}`);
    const answer = page.getByTestId('assistant-answer');
    await expect(answer.getByRole('article', { name: 'Réponse de l’assistant' })).toBeVisible();
    await expect(answer).toContainText('Restaurants');
    await expect(page.getByText(question)).toBeVisible();
    // La question est retirée de l'URL une fois posée.
    await expect(page).toHaveURL(/\/assistant$/);
  });
});
