import {
  DEMO,
  anonTest,
  expect,
  login,
  onboardingDialog,
  register,
  test as demoTest,
} from './fixtures';

anonTest.describe('Authentification', () => {
  anonTest('redirige vers /connexion sans session', async ({ page }) => {
    await page.goto('/tableau-de-bord');
    await expect(page).toHaveURL(/\/connexion/);
    await expect(page.getByRole('heading', { level: 1, name: 'Connexion' })).toBeVisible();
  });

  anonTest('connexion avec le compte de démo', async ({ page }) => {
    await login(page, DEMO);
    await expect(page).toHaveURL(/\/tableau-de-bord$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeVisible();
  });

  anonTest('mauvais mot de passe : message d’erreur', async ({ page }) => {
    await page.goto('/connexion');
    await page.getByLabel('Adresse e-mail').fill(DEMO.email);
    await page.getByLabel('Mot de passe', { exact: true }).fill('MauvaisMotDePasse1');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByText('Adresse e-mail ou mot de passe incorrect.')).toBeVisible();
    await expect(page).toHaveURL(/\/connexion/);
  });

  anonTest(
    'inscription puis onboarding (Suivant… Terminer) → tableau de bord',
    async ({ page }) => {
      await register(page);
      const dialog = onboardingDialog(page);
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Passer' })).toBeVisible();

      // Étapes 1 → 4 : bienvenue, comptes, budgets, première action.
      for (let step = 1; step <= 3; step += 1) {
        await expect(dialog.getByText(`Étape ${step} sur 4`)).toBeVisible();
        await dialog.getByRole('button', { name: 'Suivant' }).click();
      }
      await expect(dialog.getByText('Étape 4 sur 4')).toBeVisible();
      await dialog.getByRole('button', { name: 'Terminer' }).click();

      await expect(dialog).toBeHidden();
      await expect(page).toHaveURL(/\/tableau-de-bord$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeVisible();

      // L'onboarding est marqué comme terminé : il ne réapparaît pas au rechargement.
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(onboardingDialog(page)).toBeHidden();
    },
  );
});

demoTest.describe('Déconnexion', () => {
  demoTest('menu utilisateur → Se déconnecter', async ({ page }) => {
    await page.goto('/tableau-de-bord');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /menu utilisateur/i }).click();
    await page.getByRole('menuitem', { name: 'Se déconnecter', exact: true }).click();
    await expect(page).toHaveURL(/\/connexion/);

    // La session est bien fermée.
    await page.goto('/transactions');
    await expect(page).toHaveURL(/\/connexion/);
  });
});
