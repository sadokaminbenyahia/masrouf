# CONTRACTS.md : contrats entre modules

Ce document est la source de vérité pour tous les agents. **Les signatures dans le code font foi.**
Les fichiers « contrat » existent déjà, compilent et contiennent des stubs `notImplemented()` à remplacer.
Lisez aussi `ARCHITECTURE.md` (couches) et `FEATURES.md` (périmètre).

---

## 0. Règles communes (non négociables)

1. **Ne touchez que vos fichiers** (§1).
   - Un fichier partagé (§1.0) ne se modifie pas. Si vous avez besoin d'un changement, contournez-le et signalez-le dans vos « points ouverts ».
   - N'installez **aucune** dépendance (`npm install` interdit). Les dépendances disponibles figurent dans `package.json`. S'il en manque une, signalez-le.
2. **TypeScript strict, aucun `any`**, aucune `!` (non-null assertion). Préférez `import type` pour les types. ESLint fait respecter les couches.
3. **Montants** : entiers en millimes partout.
   - Affichage **uniquement** via `<Money>` (UI) ou `formatMoney` (texte). Ne créez aucune autre fonction de formatage.
   - Saisie via `<AmountInput>` ou `parseAmountInput`.
4. **Dates** : chaînes `YYYY-MM-DD` (`src/domain/dates.ts`). Jamais `new Date('YYYY-MM-DD')` pour un calcul.
   - « Aujourd'hui » vient du serveur : `today()` de `src/server/clock.ts`, passé en prop aux composants clients.
5. **Erreurs** :
   - Les services renvoient `Result<T>` (`ok`/`err`/`appError` de `src/domain/result.ts`) ; on ne lève pas d'exception pour un cas métier.
   - Les actions renvoient `ActionResult<T>`.
   - Côté client : `unwrap()` + `errorMessage()` de `src/lib/query.ts`.
6. **Sécurité** :
   - Toute requête Prisma filtre par `userId`.
   - Avant d'écrire une référence (accountId, categoryId, transferAccountId, recurringId), vérifiez qu'elle appartient à l'utilisateur ; sinon renvoyez `NOT_FOUND`.
   - Utilisez `findFirst({ where: { id, userId } })` et `updateMany/deleteMany({ where: { id, userId } })`, jamais `update({ where: { id } })` seul.
7. **UI** :
   - Textes en **français** (vouvoiement sobre, jamais culpabilisant) ; icônes `lucide-react`.
   - Tout doit fonctionner au clavier et porter des attributs aria.
   - Respectez `prefers-reduced-motion` via `useReducedMotion` de framer-motion.
   - Mobile d'abord : pas de scroll horizontal de page, cibles ≥ 44 px.
8. **Composants** : Server Components par défaut. `'use client'` seulement si nécessaire. Les pages RSC appellent les **services** directement avec `await requireUserId()`. Les composants clients appellent les **server actions** via TanStack Query.
9. **États** : chaque page fournit un `loading.tsx` (skeletons aux dimensions du contenu final), un état vide soigné et une gestion d'erreur (`error.tsx` global fourni par F, toasts pour les mutations).
10. **Rapport final de chaque agent** :
    - la liste des fichiers créés ou modifiés ;
    - les choix faits ;
    - les points ouverts.
    - Ne lancez pas `npm run build` en parallèle des autres agents (verrou `.next`).
    - Vérifiez vos fichiers avec `npx tsc --noEmit 2>&1 | grep <vos-dossiers>` et `npx eslint <vos-fichiers>`. Les autres agents travaillent en même temps : leurs erreurs ne vous concernent pas.
    - **Ne faites aucun commit git** : l'orchestrateur s'en charge.

---

## 1. Propriété des fichiers

### 1.0 Fichiers partagés (orchestrateur ; lecture seule pour les agents)

- `prisma/schema.prisma`, `package.json`, configurations (`tsconfig`, `eslint`, `next.config`, `vitest`, `playwright`), `.github/`
- `src/domain/{money,dates,periods,result,types}.ts`
- `src/domain/ai/{types,engine,local-engine,_stub}.ts`
- `src/lib/schemas/**`, `src/lib/query.ts`, `src/lib/events.ts`, `src/lib/utils.ts`, `src/lib/hooks/use-reference-data.ts`
- `src/server/{db,clock}.ts`, `src/server/auth/{config,session,password}.ts`, `src/server/actions/safe-action.ts`, `src/server/security/**`, `src/server/ai/engine.ts`, `src/server/repositories/dismissed.repo.ts`
- `src/app/actions/*.ts`, **sauf** `ai.ts` (J) et `auth.ts` (F), qui ne contiennent que de la délégation fine
- `src/proxy.ts`, `src/app/api/auth/**`

### 1.1 Répartition

| Agent                                    | Fichiers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** Domaine + données                  | `src/domain/{accounts,transactions,budgets,goals,recurring,insights,aggregations,default-categories}.ts`, `src/domain/csv/{hash,export}.ts`, `src/server/repositories/*.repo.ts` (sauf `dismissed`, `ai-model`), `src/server/services/{user,accounts,categories,transactions,import,recurring,budgets,goals,dashboard}.service.ts`, `src/app/api/export/route.ts`, `prisma/seed.ts`                                                                                                                                                                                                                                         |
| **B** Comptes + Transactions             | `src/app/(app)/transactions/**`, `src/app/(app)/comptes/**`, `src/components/transactions/**`, `src/components/accounts/**`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **C** Import CSV + Récurrents            | `src/app/(app)/import/**`, `src/app/(app)/recurrents/**`, `src/components/import/**`, `src/components/recurring/**`, `src/domain/csv/{parse,mapping}.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **D** Budgets + Objectifs + « et si »    | `src/app/(app)/budgets/**`, `src/app/(app)/objectifs/**`, `src/components/budgets/**`, `src/components/goals/**`, `src/components/dnd/**`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **E** Tableau de bord + Analyses         | `src/app/(app)/tableau-de-bord/**`, `src/app/(app)/analyses/**`, `src/components/dashboard/**`, `src/components/charts/**`, `src/components/insights/**`                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **F** Design system + Shell + Auth + PWA | `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/app/{error,not-found,global-error,loading}.tsx`, `src/app/manifest.ts`, `src/app/offline/**`, `src/app/(auth)/**`, `src/app/(app)/layout.tsx`, `src/app/(app)/{error,loading}.tsx`, `src/app/(app)/parametres/**`, `src/app/actions/auth.ts`, `src/server/services/auth.service.ts`, `src/components/ui/**`, `src/components/layout/**`, `src/components/shared/**`, `src/components/providers.tsx`, `src/components/onboarding/**`, `src/components/settings/**`, `src/lib/toast.ts`, `src/lib/hooks/**` (sauf `use-reference-data.ts`), `public/**` |
| **J** Moteur IA (1)                      | `src/domain/ai/{text,stats,keywords,categorizer,nl-entry,anomalies,recurring-detect,forecast,budget-suggest}.ts`, `src/server/services/ai.service.ts`, `src/server/repositories/{ai-model,ai-data}.repo.ts`, `src/server/ai/**` (sauf `engine.ts`), `src/app/actions/ai.ts`                                                                                                                                                                                                                                                                                                                                                 |
| **K** Assistant + Résumé + Palette       | `src/domain/ai/assistant/**`, `src/domain/ai/{summary,simulator,health}.ts`, `src/server/services/finance-tools.ts`, `src/server/repositories/assistant.repo.ts`, `src/app/(app)/assistant/**`, `src/components/assistant/**`, `src/components/command-palette/**`                                                                                                                                                                                                                                                                                                                                                          |
| **G / H** (phase 3)                      | `src/**/*.test.ts(x)`, `tests/**` (G) ; `e2e/**` (H)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Les tests unitaires d'un module (`*.test.ts` à côté du fichier) peuvent être écrits par son propriétaire dès la phase 2.

---

## 2. Routes (App Router, slugs français)

Toutes les pages authentifiées sont sous `src/app/(app)/`. Leur layout (F) vérifie la session et rend le shell.

| Route                                | Propriétaire | `<h1>`                             | Contenu                                                                                                                                                     |
| ------------------------------------ | ------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/connexion`, `/inscription`         | F            | « Connexion », « Créer un compte » | formulaires auth                                                                                                                                            |
| `/tableau-de-bord`                   | E            | « Tableau de bord »                | reste à dépenser, solde, mois vs précédent, camembert, 12 mois, top 5, alertes budgets, conseils, anomalies, aperçu de la prévision, score de santé (carte) |
| `/transactions`                      | B            | « Transactions »                   | tableau TanStack, filtres (URL `?categoryId=…&from=…&to=…&type=…&q=…&accountId=…`), édition inline, sélection multiple                                      |
| `/comptes`                           | B            | « Comptes »                        | cartes de comptes, soldes, création/édition/archivage                                                                                                       |
| `/import`                            | C            | « Importer un relevé »             | assistant en 4 étapes : fichier → colonnes → aperçu/doublons → confirmation                                                                                 |
| `/recurrents`                        | C            | « Dépenses récurrentes »           | règles, prochaines échéances, total mensuel, suggestions IA (`getRecurringSuggestionsAction`)                                                               |
| `/budgets`                           | D            | « Budgets »                        | budgets du mois (sélecteur ‹ mois ›), barres, alertes 80/100 %, projection, glisser-déposer, suggestions IA                                                 |
| `/objectifs`                         | D            | « Objectifs d'épargne »            | objectifs, versements, glisser-déposer, **simulateur « et si »**                                                                                            |
| `/analyses`                          | E            | « Analyses »                       | prévision détaillée (graphique + intervalle), score de santé détaillé, anomalies, conseils, sélecteur de période + répartition interactive                  |
| `/assistant`                         | K            | « Assistant »                      | résumé mensuel en tête + questions/réponses                                                                                                                 |
| `/parametres`                        | F            | « Paramètres »                     | profil, thème, mode discret, catégories (CRUD), export CSV, relancer l'onboarding                                                                           |
| `/offline`                           | F            | « Hors ligne »                     | page de repli du service worker                                                                                                                             |
| `/api/export/transactions?from=&to=` | A            | —                                  | `GET` → CSV (auth requise)                                                                                                                                  |

---

## 3. Composants partagés (F) : API à respecter

```tsx
// src/components/ui/*         : shadcn/ui « new-york », écrit à la main (registre inaccessible), Radix via `radix-ui`
//   button (variants: default|secondary|outline|ghost|destructive|link ; sizes: default|sm|lg|icon),
//   input, label, textarea, select, dialog, sheet, dropdown-menu, popover, command (cmdk), tabs, card,
//   badge, progress, skeleton, switch, checkbox, tooltip, table, separator, alert, scroll-area, toggle-group, sonner
// Imports : `import { Button } from '@/components/ui/button'` etc. (API shadcn standard)

// src/components/shared/money.tsx  ('use client', respecte le mode discret)
<Money value={millimes} type?: TransactionType sign?: 'auto'|'always'|'never' decimals?: 0|3 compact?: boolean className?: string />
//  type EXPENSE → couleur dépense + « − » ; INCOME → couleur revenu + « + » ; sinon neutre. Toujours `tabular-nums`.

// src/components/shared/amount-input.tsx  ('use client')
<AmountInput id?: string value: number | null onChange: (m: number | null) => void
             aria-invalid?, aria-describedby?, placeholder?, autoFocus?, className? />
//  inputMode="decimal", accepte « 12,5+3 », suffixe « DT », valide au blur via parseAmountInput.

// src/components/shared/empty-state.tsx
<EmptyState icon: LucideIcon title: string description?: string action?: ReactNode className? />

// src/components/shared/page-header.tsx
<PageHeader title: string description?: string actions?: ReactNode />   // rend le <h1>

// src/components/shared/period-picker.tsx  ('use client')
<PeriodPicker today: ISODate value: Period onChange: (p: Period) => void presets?: PeriodPreset[] />
//  chips de presets (src/domain/periods.ts) + « Personnalisé » (2 champs date).

// src/components/shared/month-switcher.tsx  ('use client')
<MonthSwitcher value: YearMonth onChange: (m: YearMonth) => void max?: YearMonth />   // ‹ mars 2026 ›

// src/components/shared/category-icon.tsx
<CategoryIcon icon: string color: string size?: 'sm'|'md'|'lg' />     // registre fixe d'icônes lucide par nom
<CategoryBadge category: Category | null />                             // « Sans catégorie » si null
export const CATEGORY_ICON_NAMES: string[]                              // pour les sélecteurs d'icône

// src/components/shared/skeletons.tsx
<CardSkeleton />, <TableSkeleton rows?: number />, <ChartSkeleton height?: number />

// src/components/shared/confirm-dialog.tsx  (pour les actions IRRÉVERSIBLES uniquement)
<ConfirmDialog open onOpenChange title description confirmLabel destructive? onConfirm />

// src/components/shared/ai-badge.tsx : marque les contenus produits par l'IA
<AiBadge label?: string /* défaut « Suggestion » */ confidence?: number />   // icône Sparkles

// src/lib/toast.ts  (wrappers sonner)
toastSuccess(message: string): void
toastError(message: string): void
toastUndo(message: string, onUndo: () => void | Promise<void>, opts?: { duration?: number /* 6000 */ }): void
//  → bouton « Annuler » dans le toast

// src/lib/hooks/use-hotkey.ts
useHotkey(combo: string /* 'n', 'mod+k', 'g t', 'shift+?' */, handler: (e: KeyboardEvent) => void,
          opts?: { enabled?: boolean; allowInInputs?: boolean }): void   // ignoré dans les champs par défaut

// src/lib/hooks/use-discreet-mode.ts
useDiscreetMode(): { discreet: boolean; toggle: () => void }            // contexte fourni par <Providers>

// src/components/providers.tsx : QueryClientProvider, ThemeProvider (next-themes, attribute="class"),
//   TooltipProvider, DiscreetModeProvider, <Toaster /> (sonner, position bottom-center mobile)
```

### Tokens de design (F, `globals.css`, Tailwind v4 `@theme inline`, variables CSS shadcn)

`--background --foreground --card --card-foreground --popover --primary --primary-foreground --secondary --muted --muted-foreground --accent --destructive --border --input --ring --income --expense --warning --success --chart-1 … --chart-8`, en clair et sombre (`.dark`).

| Rôle                          | Clair     | Sombre    |
| ----------------------------- | --------- | --------- |
| Fond                          | `#FAFAF7` | `#0F1216` |
| Surface                       | `#FFFFFF` | `#171B21` |
| Bordure                       | `#E4E2DC` | `#2A3038` |
| Texte                         | `#1A1D21` | `#ECEDEE` |
| Texte secondaire              | `#5B6470` | `#9AA3AE` |
| Primaire (bleu Sidi Bou Saïd) | `#1F5FAD` | `#6AA6F0` |
| Revenu                        | `#15803D` | `#4ADE80` |
| Dépense                       | `#B42318` | `#F97066` |
| Alerte                        | `#B54708` | `#FDB022` |

Classes utilitaires : `text-income`, `text-expense`, `bg-warning`… La police est IBM Plex Sans via `next/font/google` (auto-hébergée). Les chiffres utilisent `tabular-nums`.

### Composants exportés entre agents

| Export                                                                                                                                                         | Fichier (propriétaire)                                   | Utilisé par                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------- |
| `QuickAddTransaction` (aucune prop) : dialog/sheet d'ajout (ouvert par la barre du haut, la nav mobile, la palette), écoute `QUICK_ADD_EVENT` et la touche `N` | `src/components/transactions/quick-add.tsx` (B)          | layout (F)                                  |
| `TransactionForm` `{ defaultValues?: Partial<TransactionInput>; onSuccess?: (t: Transaction) => void; today: ISODate }`                                        | `src/components/transactions/transaction-form.tsx` (B)   | B                                           |
| `CommandPalette` `{ today: ISODate }` : Ctrl/⌘+K, écoute `COMMAND_PALETTE_EVENT`                                                                               | `src/components/command-palette/command-palette.tsx` (K) | layout (F)                                  |
| `MonthlySummaryCard` `{ summary: MonthlySummary }`                                                                                                             | `src/components/assistant/monthly-summary-card.tsx` (K)  | assistant (K), éventuellement dashboard (E) |
| `HealthScoreCard` `{ score: HealthScore; compact?: boolean }`                                                                                                  | `src/components/insights/health-score-card.tsx` (E)      | E                                           |
| `ForecastChart` `{ forecast: BalanceForecast; height?: number }`                                                                                               | `src/components/charts/forecast-chart.tsx` (E)           | E                                           |
| `WhatIfSimulator` `{ goals: GoalProgress[]; categories: Category[] }`                                                                                          | `src/components/goals/what-if-simulator.tsx` (D)         | D                                           |

Pour ouvrir l'ajout rapide ou la palette depuis n'importe où, utilisez `openQuickAdd({ prefill?, text? })` et `openCommandPalette()` de `src/lib/events.ts`. Pour les données de référence côté client : `useAccounts`, `useCategories`, `useTags`, `useCategoryMap`, `useAccountMap` (`src/lib/hooks/use-reference-data.ts`). Les clés de cache sont dans `queryKeys` (`src/lib/query.ts`). Après une mutation, invalidez les clés concernées : `transactions`, `accounts`, `dashboard`, `budgets`.

---

## 4. Services (`src/server/services/*.service.ts`) et server actions (`src/app/actions/*.ts`)

Les signatures exactes sont dans les fichiers. Résumé :

| Service (propriétaire) | Fonctions                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user` (A)             | `getProfile`, `updateProfile`, `completeOnboarding`, `resetOnboarding`, `bootstrapUser(userId)` (catégories par défaut + comptes « Espèces » et « Banque », idempotent), `deleteAllUserData`                                                                                                                                                                                  |
| `accounts` (A)         | `listAccounts(userId, {includeArchived})` → `AccountWithBalance[]` trié par `sortOrder`, `createAccount`, `updateAccount`, `deleteAccount` (CONFLICT s'il y a des transactions), `reorderAccounts`                                                                                                                                                                            |
| `categories` (A)       | `listCategories`, `createCategory` (CONFLICT si le nom existe), `updateCategory`, `deleteCategory`, `listTags`                                                                                                                                                                                                                                                                |
| `transactions` (A)     | `listTransactions(userId, query)` → `Paginated<Transaction> & { totals }`, `getTransaction`, `createTransaction`, `updateTransaction` → `{before, after}`, `deleteTransaction` → snapshot, `restoreTransaction(snapshot)` (recrée avec le **même id**), `duplicateTransaction`, `bulkDeleteTransactions`, `bulkCategorize`, `getTransactionsInRange`, `exportTransactionsCsv` |
| `import` (A)           | `previewImport` → `ImportPreviewRow[]`, `commitImport` → `{created, skipped}`                                                                                                                                                                                                                                                                                                 |
| `recurring` (A)        | `listRecurring`, `createRecurring`, `updateRecurring`, `deleteRecurring`, `materializeDueRecurring(userId, today)`                                                                                                                                                                                                                                                            |
| `budgets` (A)          | `listBudgetProgress(userId, month)`, `upsertBudget`, `deleteBudget`, `reorderBudgets`                                                                                                                                                                                                                                                                                         |
| `goals` (A)            | `listGoals`, `createGoal`, `updateGoal`, `deleteGoal`, `contributeToGoal`, `reorderGoals`                                                                                                                                                                                                                                                                                     |
| `dashboard` (A)        | `getDashboard(userId, month?)` (matérialise d'abord les récurrences), `getCategoryBreakdown`, `getMonthlySeries`                                                                                                                                                                                                                                                              |
| `auth` (F)             | `registerUser(input)` : hash bcrypt, puis `bootstrapUser` ; CONFLICT si l'e-mail est pris (message générique) ; rate-limité par IP                                                                                                                                                                                                                                            |
| `ai` (J)               | `predictCategory`, `predictCategories`, `learnFromCorrection`, `retrainCategorizer`, `parseNaturalEntry`, `getAnomalies`, `dismissInsight`, `getForecast`, `getRecurringSuggestions`, `getBudgetSuggestions`, `askAssistant`, `getExampleQuestions`, `getMonthlySummary`, `simulateWhatIf`, `getHealthScore`                                                                  |
| `finance-tools` (K)    | `createFinanceTools(userId, deps: { forecast }): FinanceTools`                                                                                                                                                                                                                                                                                                                |

### Règles métier transverses

- **Création d'une transaction** : si `categoryId === undefined` et `type !== 'TRANSFER'`, `createTransaction` appelle `ai.predictCategory`. La catégorie prédite est appliquée si `confidence ≥ AUTO_CATEGORIZE_THRESHOLD`, avec `categorySource = 'AI'` et `aiConfidence`. Si `categoryId` vaut `null`, on enregistre explicitement « sans catégorie ».
- **Changement de catégorie** (`updateTransaction`, `bulkCategorize`) : `categorySource = 'USER'`, puis `ai.learnFromCorrection(userId, sample, before.categoryId)`.
- **Apprentissage** : seules les catégories confirmées par l'utilisateur servent à apprendre (`categorySource` ∈ `USER | IMPORT | SEED | RECURRING`), jamais `AI` seul, pour éviter l'auto-renforcement.
- **TRANSFER** : `categoryId` est null. Il est exclu des statistiques revenus/dépenses, mais compte dans les soldes : −amount sur `accountId`, +amount sur `transferAccountId`.
- **Solde d'un compte** = `initialBalance` + Σrevenus − Σdépenses − Σvirements sortants + Σvirements entrants.
- **Budgets** : `level` vaut `OK` en dessous de 80 %, `WARNING` de 80 % à 100 % exclu, `EXCEEDED` à partir de 100 %. Pour le mois en cours, `projected = spent / jourÉcoulé × joursDuMois`.
- **Doublons à l'import** : `importHash = computeImportHash({date, amount, type, label})`. Le hash est un FNV-1a sur `date|amount|type|libellé normalisé`, sans accents, en minuscules, sans chiffres de référence de 4 caractères ou plus. Une ligne est `EXISTING` si le hash existe pour l'utilisateur, ou si une transaction a le même montant, le même type et la même date à ±1 jour avec un libellé normalisé égal. Une ligne est `IN_FILE` si elle répète une ligne précédente du fichier.
- **Conseils** (`src/domain/insights.ts`, A) :
  - **50/30/20** : besoins ≤ 50 %, envies ≤ 30 %, épargne ≥ 20 % du revenu du mois. L'épargne vaut revenus − dépenses + dépenses du groupe SAVINGS.
  - **Catégorie en hausse** : +30 % par rapport à la moyenne des 3 mois précédents, avec au moins 30 DT d'écart.
  - **Abonnement oublié** : paiements récurrents détectés (`detectRecurring` de `src/domain/ai/recurring-detect.ts`), qui ne correspondent à aucune `RecurringRule` et sont actifs depuis au moins 3 mois.
  - Chaque `Insight` a une `key` stable. On filtre les clés présentes dans `listDismissedKeys`.

---

## 5. CSV (`src/domain/csv`)

```ts
// parse.ts (C)
export function detectDelimiter(text: string): ';' | ',' | '\t';
export function parseCsv(
  text: string,
  opts?: { delimiter?: string },
): Result<{ headers: string[]; rows: string[][]; delimiter: string }, string>; // RFC 4180 : guillemets, "" échappés, CRLF, BOM

// mapping.ts (C)
export type DateFormat = 'DMY' | 'YMD' | 'MDY';
export interface ColumnMapping {
  date: number;
  label: number;
  amount: number | null; // montant signé (négatif = dépense)
  debit: number | null;
  credit: number | null; // OU deux colonnes
  note: number | null;
  dateFormat: DateFormat;
}
export function guessMapping(headers: string[], sample: string[][]): ColumnMapping; // « Date », « Libellé », « Débit », « Crédit », « Montant »…
export function parseDateCell(raw: string, format: DateFormat): ISODate | null; // 12/03/2026, 2026-03-12, 12-03-26, 12.03.2026
export function parseAmountCell(raw: string): Millimes | null; // signé : « -1 234,500 », « 12.5 », « (45,000) », « 45,000 DT »
export function applyMapping(
  rows: string[][],
  mapping: ColumnMapping,
): { rows: ImportRow[]; errors: { index: number; message: string }[] };

// hash.ts (A)
export function computeImportHash(row: {
  date: ISODate;
  amount: Millimes;
  type: 'EXPENSE' | 'INCOME';
  label: string;
}): string;
export function normalizeForHash(label: string): string;

// export.ts (A)
export function transactionsToCsv(
  rows: Transaction[],
  lookups: { accounts: Map<string, string>; categories: Map<string, string> },
): string;
```

Le parsing et le mapping tournent **côté client** (le domaine est pur). Seules les lignes normalisées (`ImportRow[]`) sont envoyées à `previewImportAction`, qui renvoie doublons et suggestions. La confirmation passe par `commitImportAction`. Les encodages autres que UTF-8 sont décodés côté client avec `TextDecoder('windows-1252')` si l'UTF-8 produit des caractères `�`.

---

## 6. IA locale (`src/domain/ai`)

- `engine.ts` : l'interface `AIEngine`. `local-engine.ts` la compose à partir des fonctions ci-dessous (noms **imposés**).
- `src/server/ai/engine.ts` exporte `aiEngine`, le seul point d'injection.

| Fichier (agent)           | Exports imposés                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `text.ts` (J)             | `normalizeLabel(raw)`, `tokenize(raw): string[]`, `merchantKey(raw)`                                                                      |
| `stats.ts` (J)            | `mean`, `median`, `mad`, `quantile(values, q)`, `stdDev`, `linearRegression(xs, ys) → {slope, intercept, residualStd}`, `ewma`            |
| `keywords.ts` (J)         | `CATEGORY_KEYWORDS: Record<string /* nom de catégorie par défaut */, string[]>` (règles de démarrage, marchands tunisiens)                |
| `categorizer.ts` (J)      | `CATEGORIZER_VERSION`, `trainCategorizer`, `learnCorrection`, `categorize`                                                                |
| `nl-entry.ts` (J)         | `parseEntry(text, ctx)`                                                                                                                   |
| `anomalies.ts` (J)        | `detectAnomalies(input)`                                                                                                                  |
| `recurring-detect.ts` (J) | `detectRecurring(input)`                                                                                                                  |
| `forecast.ts` (J)         | `forecastBalance(input)`                                                                                                                  |
| `budget-suggest.ts` (J)   | `suggestBudgets(input)`                                                                                                                   |
| `assistant/index.ts` (K)  | `askAssistant(question, ctx, tools)`, `EXAMPLE_QUESTIONS` ; sous-modules libres (`intents.ts`, `entities.ts`, `periods.ts`, `answers.ts`) |
| `summary.ts` (K)          | `generateMonthlySummary(input)`                                                                                                           |
| `simulator.ts` (K)        | `simulateWhatIf(input)`                                                                                                                   |
| `health.ts` (K)           | `computeHealthScore(input)`                                                                                                               |

### Spécifications clés (détails dans le rapport IA joint aux prompts de J et K)

- **Montants en langage naturel**, à partager entre J et K. K peut importer `extractAmount` de J (`nl-entry.ts`) ou réutiliser `parseMoneyTerm` de `money.ts`.
  - « 3,500 » = 3500 et « 3.5 » = 3500.
  - « 2400 » sans unité = 2 400 000.
  - « 500 millimes » = 500.
  - « 1 200 » = 1 200 000.
  - Les chiffres collés à des lettres ne sont pas des montants (« 9ahwa »).
- **Dates relatives** : aujourd'hui, hier, avant-hier, « il y a N jours », jour de semaine (le plus récent passé), « le 1er », « le 15 », « 12/03 », « 12 mars ».
- **Assistant** :
  - Toujours répondre avec `understood: false` et 3 à 4 `suggestions` quand l'intention n'est pas reconnue.
  - Ne jamais inventer de chiffres : tout chiffre vient d'un appel à `FinanceTools`.
  - `href` pointe vers `/transactions?…` avec les filtres de la question.
- **Déterminisme** : aucune fonction IA ne lit l'horloge ni `Math.random`. `today` et `seed` sont passés en entrée.
- **Validation des sorties** : `ai.service` (J) valide chaque sortie du moteur avec des schémas Zod (`src/server/ai/output-schemas.ts`) avant de la renvoyer. Le modèle chargé depuis `AiModel.data` est validé de la même façon ; s'il est invalide, on le réentraîne.
- **Rate limiting** : `aiLimiter.check(\`ai:${userId}\`)`dans`ai.service`pour`askAssistant`, `parseNaturalEntry`et`simulateWhatIf`. En cas de dépassement : `RATE_LIMITED`.

---

## 7. Noms accessibles (contrat pour les tests E2E, agent H)

| Élément                  | Nom accessible / sélecteur                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Liens de navigation      | « Tableau de bord », « Transactions », « Comptes », « Budgets », « Objectifs », « Récurrents », « Import », « Analyses », « Assistant », « Paramètres »                                                                                                                                                                                                                                                                                                          |
| Connexion                | champs « Adresse e-mail », « Mot de passe » ; bouton « Se connecter » ; lien « Créer un compte »                                                                                                                                                                                                                                                                                                                                                                 |
| Inscription              | champs « Prénom », « Adresse e-mail », « Mot de passe » ; bouton « Créer mon compte »                                                                                                                                                                                                                                                                                                                                                                            |
| Déconnexion              | bouton (menu utilisateur) « Se déconnecter »                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Onboarding               | dialog « Bienvenue sur Masrouf » ; boutons « Suivant », « Passer », « Terminer »                                                                                                                                                                                                                                                                                                                                                                                 |
| Ajout rapide             | bouton « Ajouter une transaction » : barre du haut sur desktop (`role="banner"`, texte visible « Ajouter »), bouton central de la nav mobile ; pas de bouton flottant (touche `N`) ; dialog « Nouvelle transaction » ; champ « Décrivez la transaction » (langage naturel, Entrée pour analyser) ; champs « Montant », « Libellé », « Date », « Catégorie », « Compte » ; groupe radio « Type » (« Dépense », « Revenu », « Virement ») ; bouton « Enregistrer » |
| Toasts                   | bouton « Annuler » ; région `aria-live` (sonner)                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Tableau des transactions | `role="table"` nommé « Transactions » ; champ de recherche « Rechercher une transaction » ; une ligne par transaction ; bouton de ligne « Actions pour <libellé> » → menu « Modifier », « Dupliquer », « Supprimer » ; édition inline : double-clic ou `Entrée` sur une cellule, `Échap` pour annuler                                                                                                                                                            |
| Palette                  | `Ctrl+K` ; dialog « Palette de commandes » ; champ placeholder « Rechercher une page, une action… »                                                                                                                                                                                                                                                                                                                                                              |
| Assistant                | champ « Votre question » ; bouton « Envoyer » ; réponse `data-testid="assistant-answer"` (`aria-live="polite"`) ; suggestions = boutons                                                                                                                                                                                                                                                                                                                          |
| Résumé mensuel           | `data-testid="monthly-summary"`                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Import                   | input fichier « Fichier CSV » ; boutons « Continuer », « Importer N transactions »                                                                                                                                                                                                                                                                                                                                                                               |
| Budgets / Objectifs      | bouton « Nouveau budget », « Nouvel objectif » ; poignées de glisser-déposer « Réordonner <nom> » ; simulateur `data-testid="what-if"`                                                                                                                                                                                                                                                                                                                           |
| Tableau de bord          | `data-testid="kpi-balance"`, `"kpi-month-expense"`, `"chart-categories"`, `"chart-12-months"`, `"top-expenses"`, `"health-score"`, `"forecast"`                                                                                                                                                                                                                                                                                                                  |
| Thème                    | bouton « Changer de thème » ; mode discret : bouton « Masquer les montants » / « Afficher les montants »                                                                                                                                                                                                                                                                                                                                                         |

---

## 8. Données de démo (seed, A)

- **Utilisatrice** : `demo@masrouf.tn` / `Demo1234!`, prénom « Yasmine », `onboardedAt` renseigné.
- **Comptes** : « Espèces » (CASH), « BIAT » (BANK), « Carte Visa » (CARD).
- **Catégories par défaut** (`src/domain/default-categories.ts`, utilisées aussi par `bootstrapUser`, noms **exacts**) :
  - Dépenses :
    - Courses (NEEDS, ShoppingCart)
    - Restaurants (WANTS, UtensilsCrossed)
    - Cafés (WANTS, Coffee)
    - Transport (NEEDS, Bus)
    - Carburant (NEEDS, Fuel)
    - Loyer (NEEDS, House)
    - Factures (NEEDS, Zap)
    - Télécom (NEEDS, Smartphone)
    - Santé (NEEDS, HeartPulse)
    - Shopping (WANTS, ShoppingBag)
    - Loisirs (WANTS, Clapperboard)
    - Abonnements (WANTS, Repeat)
    - Éducation (NEEDS, GraduationCap)
    - Famille & cadeaux (WANTS, Gift)
    - Épargne (SAVINGS, PiggyBank)
    - Divers (WANTS, Tag)
  - Revenus : Salaire (Banknote), Freelance (Briefcase), Autres revenus (Coins).
- **Historique** : 6 mois jusqu'à aujourd'hui, générés **relativement à la date du jour** avec un PRNG à graine fixe.
  - Revenus : salaire ≈ 2 600 DT le 1er.
  - Charges : loyer 750 DT le 3, Internet Ooredoo 45 DT puis **49 DT** le dernier mois (hausse d'abonnement), STEG tous les 2 mois, SONEDE trimestrielle, salle de sport 60 DT/mois.
  - Courant : courses 2 à 3 fois par semaine (Carrefour, Monoprix, Aziza, Magasin Général), cafés quasi quotidiens 1,5 à 4,5 DT, louage/taxi/métro, carburant (Agil, Shell), restaurants.
  - Cas particuliers : un abonnement streaming (non déclaré en récurrent → « abonnement oublié »), **une dépense inhabituelle** (restaurant 380 DT) et **un doublon** (même café deux fois le même jour), plusieurs retraits DAB sous forme de virements BIAT → Espèces.
- **Budgets** : 6 (Courses 450, Restaurants 150, Cafés 90, Transport 120, Loisirs 100, Shopping 150 DT). Au moins un en WARNING et un EXCEEDED ce mois-ci.
- **Objectifs** : « Voyage à Djerba » (1 500 DT, date dans 5 mois, 600 DT épargnés), « Fonds d'urgence » (6 000 DT, sans date, 2 100 DT).
- **Récurrences** : Loyer, Internet Ooredoo, Salle de sport, Salaire.
- **Après le seed** : entraîner le catégoriseur. Appelez la fonction pure `trainCategorizer` et écrivez dans `AiModel` (kind `categorizer`), ou laissez `ai.service` le faire paresseusement.
- Le seed est **idempotent** : il supprime puis recrée l'utilisatrice démo.

---

## 9. Graphe d'imports entre services (anti-cycles)

- `accounts`, `categories`, `budgets`, `goals`, `recurring`, `user` (A) n'importent **que** des repositories et le domaine, jamais d'autres services, sauf `user` → `categories`/`accounts` pour `bootstrapUser`.
- `transactions` et `import` (A) peuvent importer `ai.service` (J) et les services ci-dessus.
- `dashboard` (A) peut importer les services ci-dessus, mais **pas** `ai.service`.
- `ai.service` (J) peut importer `accounts`, `categories`, `budgets`, `goals` et `recurring`, `finance-tools` (K) et ses propres repositories (`ai-model.repo.ts`, `ai-data.repo.ts`). Il ne doit **jamais** importer `transactions`, `import` ni `dashboard`.
- `finance-tools` (K) peut importer `accounts`, `budgets`, `goals`, `recurring` et son propre `src/server/repositories/assistant.repo.ts`. La prévision lui est injectée via `deps.forecast`.
- `auth.service` (F) → `user.service` (`bootstrapUser`).
- Les modules marqués `import 'server-only'` ne sont pas importables par `prisma/seed.ts`, qui tourne sous tsx hors de Next : le seed utilise son propre `PrismaClient` et le domaine. En Vitest, `server-only` est remplacé par un module vide.
