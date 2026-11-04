/**
 * Fixtures et helpers partagés des tests E2E (agent H).
 *
 *  - `test` : test authentifié avec le compte de démo. La connexion n'a lieu qu'UNE fois par
 *    worker (fixture `demoState` de portée worker) : la session (cookie JWT) est ensuite injectée
 *    dans chaque contexte via `storageState`. Cela limite les connexions (le serveur rate-limite
 *    à 10 tentatives par minute et par IP) et accélère la suite.
 *  - `anonTest` : test sans session (pages d'authentification).
 *  - `login`, `register`, `skipOnboarding`, `gotoApp` : parcours réutilisables.
 */
import {
  test as base,
  expect,
  type BrowserContext,
  type Locator,
  type Page,
  type Request,
} from '@playwright/test';

export { expect };

export type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

export interface Credentials {
  email: string;
  password: string;
}

export interface RegisteredUser extends Credentials {
  name: string;
}

export const DEMO: Credentials = { email: 'demo@masrouf.tn', password: 'Demo1234!' };

export const EMPTY_STATE: StorageState = { cookies: [], origins: [] };

const APP_TIMEZONE = 'Africa/Tunis';

/** Date ISO (YYYY-MM-DD) dans le fuseau de l'application, décalée de `offsetDays` jours. */
export function isoDateInAppTz(offsetDays = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [y, m, d] = today.split('-').map(Number);
  const utc = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + offsetDays));
  return utc.toISOString().slice(0, 10);
}

/** Identifiant court et unique (libellés, e-mails) pour isoler les données d'un test. */
export function uniqueId(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Navigue puis attend l'hydratation (plus aucune requête en vol) : indispensable avant
 * d'utiliser les raccourcis clavier, qui sont branchés par des effets React côté client.
 */
export async function gotoApp(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

/** Connexion par le formulaire ; attend l'arrivée sur le tableau de bord. */
export async function login(page: Page, creds: Credentials = DEMO): Promise<void> {
  await page.goto('/connexion');
  await page.getByLabel('Adresse e-mail').fill(creds.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(creds.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/tableau-de-bord');
}

/**
 * Inscrit un nouvel utilisateur unique (`e2e-…@example.test`). L'application redirige vers le
 * tableau de bord, où s'ouvre l'onboarding (laissé ouvert : à fermer par l'appelant).
 */
export async function register(page: Page): Promise<RegisteredUser> {
  const id = uniqueId();
  const user: RegisteredUser = {
    name: `Testeur ${id}`,
    email: `e2e-${Date.now()}-${id}@example.test`,
    password: 'Test1234!',
  };
  await page.goto('/inscription');
  await page.getByLabel('Prénom').fill(user.name);
  await page.getByLabel('Adresse e-mail').fill(user.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await page.waitForURL('**/tableau-de-bord');
  return user;
}

export function onboardingDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Bienvenue sur Masrouf' });
}

/** Ferme l'onboarding d'un nouvel utilisateur avec « Passer » (attend l'enregistrement). */
export async function skipOnboarding(page: Page): Promise<void> {
  const dialog = onboardingDialog(page);
  await expect(dialog).toBeVisible();
  // « Passer » appelle la server action completeOnboardingAction (POST avec l'en-tête
  // Next-Action) : on attend sa réponse pour qu'une navigation immédiate ne l'interrompe pas.
  const saved = page.waitForResponse(
    (res) =>
      res.request().method() === 'POST' && res.request().headers()['next-action'] !== undefined,
  );
  await dialog.getByRole('button', { name: 'Passer' }).click();
  await expect(dialog).toBeHidden();
  await saved;
}

/** Toast sonner contenant `text` (dans la région « Notifications »). */
export function toast(page: Page, text: string | RegExp): Locator {
  return page
    .getByRole('region', { name: /Notifications/ })
    .getByRole('listitem')
    .filter({ hasText: text });
}

/**
 * Enregistre toutes les requêtes émises par la page qui ne visent pas `baseURL`
 * (les URL `data:` et `blob:` ne quittent pas le navigateur et sont ignorées).
 */
export function trackExternalRequests(page: Page, baseURL: string): string[] {
  const external: string[] = [];
  page.on('request', (req: Request) => {
    const url = req.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    if (!url.startsWith(baseURL)) external.push(url);
  });
  return external;
}

/** Test authentifié (compte de démo), session partagée par worker. */
export const test = base.extend<object, { demoState: StorageState }>({
  demoState: [
    async ({ browser }, provide, workerInfo) => {
      const baseURL = workerInfo.project.use.baseURL;
      const context = await browser.newContext({ baseURL, storageState: EMPTY_STATE });
      const page = await context.newPage();
      await login(page);
      const state = await context.storageState();
      await context.close();
      await provide(state);
    },
    { scope: 'worker' },
  ],
  storageState: async ({ demoState }, provide) => {
    await provide(demoState);
  },
});

/** Test sans session (contexte vierge). */
export const anonTest = base;
