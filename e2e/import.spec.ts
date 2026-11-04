import path from 'node:path';
import { anonTest as test, expect, register, skipOnboarding } from './fixtures';

const CSV = path.join(__dirname, 'fixtures', 'releve.csv');

test.describe('Import CSV', () => {
  test('fichier → colonnes → aperçu avec doublon → import → résumé', async ({ page }) => {
    // Utilisateur neuf : aucune transaction existante, donc seul le doublon interne au fichier
    // est signalé, et le test reste rejouable sur la même base.
    await register(page);
    await skipOnboarding(page);

    await page.goto('/import');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: 'Importer un relevé' })).toBeVisible();

    // Étape 1 : fichier. Une fois lu, l'assistant passe seul à l'étape « Colonnes ».
    await page.getByLabel('Fichier CSV').setInputFiles(CSV);

    // Étape 2 : colonnes (devinées automatiquement : Date, Libellé, Débit, Crédit).
    await expect(page.getByRole('region', { name: 'Colonnes du fichier' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Aperçu de l’interprétation' })).toBeVisible();
    const toPreview = page.getByRole('button', { name: 'Continuer' });
    await expect(toPreview).toBeEnabled();
    await toPreview.click();

    // Étape 3 : aperçu, doublon détecté dans le fichier (et décoché par défaut).
    const preview = page.getByRole('table', { name: 'Aperçu de l’import' });
    await expect(preview).toBeVisible();
    await expect(preview.getByText('Doublon dans le fichier')).toHaveCount(1);
    await expect(preview.getByText('Déjà importée')).toHaveCount(0);

    const importButton = page.getByRole('button', { name: /^Importer \d+ transactions?$/ });
    await expect(importButton).toHaveText(/Importer 4 transactions/);
    await importButton.click();

    // Étape 4 : résumé.
    await expect(page.getByText('Import terminé')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'transactions créées' })).toHaveText(
      '4 transactions créées.',
    );
    await page.getByRole('link', { name: 'Voir les transactions' }).click();
    await page.waitForURL(/\/transactions/);
    await expect(
      page.getByRole('table', { name: 'Transactions' }).getByText('CARREFOUR LA MARSA'),
    ).toHaveCount(1);
  });
});
