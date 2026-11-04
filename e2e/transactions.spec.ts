import { type Locator, type Page } from '@playwright/test';
import { expect, gotoApp, isoDateInAppTz, test, toast, uniqueId } from './fixtures';

function quickAddDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Nouvelle transaction' });
}

/** Saisie en langage naturel dans l'ajout rapide (Entrée pour analyser). */
async function describeTransaction(dialog: Locator, text: string): Promise<void> {
  await dialog.getByLabel('Décrivez la transaction').fill(text);
  await dialog.getByLabel('Décrivez la transaction').press('Enter');
  await expect(dialog.getByText('Analysé automatiquement')).toBeVisible();
}

/** Crée une transaction (dépense) avec un libellé unique via le bouton d'ajout rapide. */
async function createTransaction(page: Page, label: string, amount = '12,345'): Promise<void> {
  await page.getByRole('button', { name: 'Ajouter une transaction', exact: true }).click();
  const dialog = quickAddDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Montant', { exact: true }).fill(amount);
  await dialog.getByLabel('Libellé', { exact: true }).fill(label);
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();
  await expect(toast(page, 'Transaction ajoutée')).toBeVisible();
}

function transactionsTable(page: Page): Locator {
  return page.getByRole('table', { name: 'Transactions' });
}

function rowFor(page: Page, label: string): Locator {
  return transactionsTable(page).getByRole('row').filter({ hasText: label });
}

function labelCell(row: Locator, label: string): Locator {
  return row.getByRole('cell').filter({ hasText: label });
}

test.describe('Transactions', () => {
  test('ajout rapide : la touche N ouvre la saisie', async ({ page }) => {
    await gotoApp(page, '/transactions');
    await page.keyboard.press('n');
    const dialog = quickAddDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Décrivez la transaction')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('ajout rapide : le bouton « Ajouter une transaction » ouvre la saisie', async ({ page }) => {
    await gotoApp(page, '/tableau-de-bord');
    await page.getByRole('button', { name: 'Ajouter une transaction', exact: true }).click();
    const dialog = quickAddDialog(page);
    await expect(dialog).toBeVisible();
    for (const label of ['Montant', 'Libellé', 'Date', 'Catégorie', 'Compte']) {
      await expect(dialog.getByLabel(label, { exact: true }), label).toBeVisible();
    }
    await expect(dialog.getByRole('radiogroup', { name: 'Type' })).toBeVisible();
    await expect(dialog.getByRole('radio', { name: 'Dépense' })).toBeChecked();
  });

  test('langage naturel « café 3,500 hier » → formulaire prérempli ; Enregistrer puis Annuler', async ({
    page,
  }) => {
    await gotoApp(page, '/transactions');
    await page.keyboard.press('n');
    const dialog = quickAddDialog(page);
    await describeTransaction(dialog, 'café 3,500 hier');

    await expect(dialog.getByLabel('Montant', { exact: true })).toHaveValue('3,500');
    await expect(dialog.getByLabel('Libellé', { exact: true })).toHaveValue('Café');
    await expect(dialog.getByLabel('Date', { exact: true })).toHaveValue(isoDateInAppTz(-1));
    await expect(dialog.getByRole('radio', { name: 'Dépense' })).toBeChecked();

    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(dialog).toBeHidden();
    const added = toast(page, 'Transaction ajoutée');
    await expect(added).toBeVisible();
    await added.getByRole('button', { name: 'Annuler' }).click();
    await expect(toast(page, 'Ajout annulé')).toBeVisible();
  });

  test('langage naturel « salaire 2400 le 1er » → Revenu de 2400', async ({ page }) => {
    await gotoApp(page, '/transactions');
    await page.keyboard.press('n');
    const dialog = quickAddDialog(page);
    await describeTransaction(dialog, 'salaire 2400 le 1er');

    await expect(dialog.getByRole('radio', { name: 'Revenu' })).toBeChecked();
    await expect(dialog.getByLabel('Montant', { exact: true })).toHaveValue('2400');
    await expect(dialog.getByLabel('Date', { exact: true })).toHaveValue(/^\d{4}-\d{2}-01$/);
  });

  test('recherche d’une transaction', async ({ page }) => {
    const label = `E2E recherche ${uniqueId()}`;
    await gotoApp(page, '/transactions');
    await createTransaction(page, label);

    const search = page.getByRole('searchbox', { name: 'Rechercher une transaction' });
    await search.fill(label);
    await search.press('Enter');
    await expect(page).toHaveURL(/[?&]q=/);
    await expect(rowFor(page, label)).toHaveCount(1);
    // Une seule ligne de données (+ la ligne d'en-tête, éventuellement un séparateur de date).
    await expect(
      transactionsTable(page).getByRole('button', { name: /^Actions pour / }),
    ).toHaveCount(1);
  });

  test('édition inline d’un libellé (double-clic, Entrée ; Échap annule)', async ({ page }) => {
    const label = `E2E édition ${uniqueId()}`;
    const edited = `${label} modifié`;
    await gotoApp(page, '/transactions');
    await createTransaction(page, label);
    await gotoApp(page, `/transactions?q=${encodeURIComponent(label)}`);

    const row = rowFor(page, label);
    await expect(row).toHaveCount(1);

    // Échap annule l'édition.
    await labelCell(row, label).dblclick();
    let editor = transactionsTable(page).getByRole('textbox', { name: 'Libellé' });
    await expect(editor).toBeFocused();
    await editor.fill('ne doit pas être enregistré');
    await editor.press('Escape');
    await expect(editor).toBeHidden();
    await expect(labelCell(row, label)).toBeVisible();

    // Entrée sur la cellule active ouvre l'éditeur ; Entrée valide.
    await labelCell(row, label).click();
    await page.keyboard.press('Enter');
    editor = transactionsTable(page).getByRole('textbox', { name: 'Libellé' });
    await expect(editor).toBeFocused();
    await editor.fill(edited);
    await editor.press('Enter');
    await expect(editor).toBeHidden();
    await expect(rowFor(page, edited)).toHaveCount(1);

    // La modification est persistée.
    await gotoApp(page, `/transactions?q=${encodeURIComponent(edited)}`);
    await expect(rowFor(page, edited)).toHaveCount(1);
  });

  test('suppression via le menu de ligne, puis Annuler restaure', async ({ page }) => {
    const label = `E2E suppression ${uniqueId()}`;
    await gotoApp(page, '/transactions');
    await createTransaction(page, label);
    await gotoApp(page, `/transactions?q=${encodeURIComponent(label)}`);
    await expect(rowFor(page, label)).toHaveCount(1);

    await page.getByRole('button', { name: `Actions pour ${label}` }).click();
    await page.getByRole('menuitem', { name: 'Supprimer' }).click();
    await expect(rowFor(page, label)).toHaveCount(0);

    const deleted = toast(page, 'Transaction supprimée');
    await expect(deleted).toBeVisible();
    await deleted.getByRole('button', { name: 'Annuler' }).click();
    await expect(rowFor(page, label)).toHaveCount(1);

    // La restauration est persistée.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(rowFor(page, label)).toHaveCount(1);
  });
});
