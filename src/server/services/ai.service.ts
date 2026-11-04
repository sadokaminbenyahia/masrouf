// Propriétaire : agent J. NE DOIT PAS importer transactions.service, import.service ni
// dashboard.service (cycle, CONTRACTS §9).
import 'server-only';
import type { z } from 'zod';
import {
  addMonthsYM,
  monthEnd,
  monthOf,
  monthStart,
  type ISODate,
  type YearMonth,
} from '@/domain/dates';
import { appError, err, ok, type Result } from '@/domain/result';
import type {
  AiCategory,
  AiTransaction,
  Anomaly,
  AssistantAnswer,
  BalanceForecast,
  BudgetSuggestion,
  CategorizeInput,
  CategorizerModel,
  CategoryPrediction,
  FinanceTools,
  HealthScore,
  MonthlySummary,
  ParseEntryResult,
  RecurringCandidate,
  TrainingSample,
  WhatIfResult,
} from '@/domain/ai/types';
import { capMerchants } from '@/domain/ai/categorizer';
import type { Category, MonthTotals, RecurringRule } from '@/domain/types';
import type { WhatIfActionData } from '@/lib/schemas/ai';
import { aiEngine } from '@/server/ai/engine';
import {
  anomaliesSchema,
  assistantAnswerSchema,
  balanceForecastSchema,
  budgetSuggestionsSchema,
  categorizerModelSchema,
  healthScoreSchema,
  legacyMerchantMapSchema,
  monthlySummarySchema,
  nullablePredictionSchema,
  parseEntryResultSchema,
  predictionListSchema,
  recurringCandidatesSchema,
  whatIfResultSchema,
} from '@/server/ai/output-schemas';
import { today } from '@/server/clock';
import { listAiTransactions, listTrainingSamples } from '@/server/repositories/ai-data.repo';
import { loadAiModel, saveAiModel } from '@/server/repositories/ai-model.repo';
import { addDismissedKey, listDismissedKeys } from '@/server/repositories/dismissed.repo';
import { aiLimiter } from '@/server/security/rate-limit';
import { listAccounts } from './accounts.service';
import { listBudgetProgress } from './budgets.service';
import { listCategories } from './categories.service';
import { createFinanceTools } from './finance-tools';
import { listGoals } from './goals.service';
import { listRecurring } from './recurring.service';

/** Seuil de confiance minimal pour appliquer automatiquement une catégorie. */
export const AUTO_CATEGORIZE_THRESHOLD = 0.55;

const MODEL_KIND = 'categorizer';
const MAX_CACHED_MODELS = 500;
/** Nombre maximal de clés de conseils / anomalies ignorées par utilisateur. */
export const MAX_DISMISSED_KEYS = 1_000;
const INTERNAL_MESSAGE = 'Une erreur inattendue est survenue.';

// ───────────────────────── Outils internes ─────────────────────────

function internal<T>(context: string, e: unknown): Result<T> {
  console.error(`[ai] ${context}`, e);
  return err(appError('INTERNAL', INTERNAL_MESSAGE));
}

/** Exécute `fn` ; toute exception imprévue est journalisée et convertie en INTERNAL. */
async function guard<T>(context: string, fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    return internal(context, e);
  }
}

/** Valide une sortie du moteur ; un échec est journalisé et renvoyé en INTERNAL. */
function validated<T>(schema: z.ZodType<T>, value: unknown, context: string): Result<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return ok(parsed.data);
  return internal(`sortie invalide (${context})`, parsed.error.issues.slice(0, 5));
}

function retryIn(retryAfterMs: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return `${seconds} seconde${seconds > 1 ? 's' : ''}`;
}

function rateLimited(userId: string): Result<never> | null {
  const r = aiLimiter.check(`ai:${userId}`);
  if (r.allowed) return null;
  return err(
    appError(
      'RATE_LIMITED',
      `Trop de demandes à l’assistant. Réessayez dans ${retryIn(r.retryAfterMs)}.`,
    ),
  );
}

/**
 * Limite de débit des opérations IA de masse (catégorisation groupée, aperçu d'import) :
 * clé `ai:bulk:${userId}`, distincte de celle de l'assistant.
 */
export function bulkRateLimited(userId: string): Result<never> | null {
  const r = aiLimiter.check(`ai:bulk:${userId}`);
  if (r.allowed) return null;
  return err(
    appError(
      'RATE_LIMITED',
      `Trop d’opérations groupées. Réessayez dans ${retryIn(r.retryAfterMs)}.`,
    ),
  );
}

/** Outils de l'assistant dont chaque échec est journalisé (puis relancé : l'assistant s'excuse). */
function loggedTools(tools: FinanceTools): FinanceTools {
  const log =
    <A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        return await fn(...args);
      } catch (e) {
        console.error(`[ai] outil de l’assistant en échec (${name})`, e);
        throw e;
      }
    };
  return {
    sumTransactions: log('sumTransactions', tools.sumTransactions.bind(tools)),
    breakdownByCategory: log('breakdownByCategory', tools.breakdownByCategory.bind(tools)),
    monthlyTotals: log('monthlyTotals', tools.monthlyTotals.bind(tools)),
    listTransactions: log('listTransactions', tools.listTransactions.bind(tools)),
    topMerchants: log('topMerchants', tools.topMerchants.bind(tools)),
    budgetStatus: log('budgetStatus', tools.budgetStatus.bind(tools)),
    goals: log('goals', tools.goals.bind(tools)),
    balances: log('balances', tools.balances.bind(tools)),
    forecast: log('forecast', tools.forecast.bind(tools)),
    recurring: log('recurring', tools.recurring.bind(tools)),
  };
}

const toAiCategory = (c: Category): AiCategory => ({ id: c.id, name: c.name, kind: c.kind });

async function aiCategories(userId: string): Promise<Result<Category[]>> {
  return listCategories(userId);
}

/** Transactions des `months` derniers mois complets + mois courant jusqu'à aujourd'hui. */
function historyRange(t: ISODate, months: number) {
  return { from: monthStart(addMonthsYM(monthOf(t), -months)), to: t };
}

/** Totaux mensuels (virements exclus) des mois donnés, à partir du premier mois de données. */
function monthlyTotals(txs: readonly AiTransaction[], months: readonly YearMonth[]): MonthTotals[] {
  const first = txs.reduce<string | null>(
    (min, t) => (t.type !== 'TRANSFER' && (min === null || t.date < min) ? t.date : min),
    null,
  );
  const firstMonth = first === null ? null : monthOf(first);
  const map = new Map<YearMonth, MonthTotals>(
    months
      .filter((m) => firstMonth !== null && m >= firstMonth)
      .map((m) => [m, { month: m, income: 0, expense: 0, net: 0 }]),
  );
  for (const t of txs) {
    const row = map.get(monthOf(t.date));
    if (!row || t.type === 'TRANSFER') continue;
    if (t.type === 'INCOME') row.income += t.amount;
    else row.expense += t.amount;
    row.net = row.income - row.expense;
  }
  return [...map.values()];
}

function monthsBack(t: ISODate, complete: number, includeCurrent: boolean): YearMonth[] {
  const current = monthOf(t);
  const out: YearMonth[] = [];
  for (let i = complete; i >= 1; i--) out.push(addMonthsYM(current, -i));
  if (includeCurrent) out.push(current);
  return out;
}

/** Équivalent mensuel d'une règle récurrente. */
function monthlyEquivalent(r: RecurringRule): number {
  switch (r.frequency) {
    case 'WEEKLY':
      return (r.amount * 52) / 12;
    case 'MONTHLY':
      return r.amount;
    case 'QUARTERLY':
      return r.amount / 3;
    case 'YEARLY':
      return r.amount / 12;
  }
}

// ───────────────────────── Modèle de catégorisation ─────────────────────────

const modelCache = new Map<string, CategorizerModel>();

function cacheModel(userId: string, model: CategorizerModel): void {
  modelCache.delete(userId);
  if (modelCache.size >= MAX_CACHED_MODELS) {
    const oldest = modelCache.keys().next();
    if (!oldest.done) modelCache.delete(oldest.value);
  }
  modelCache.set(userId, model);
}

/**
 * Persiste le modèle. Il n'est PAS revalidé par Zod ici (coût en O(taille du modèle) à chaque
 * correction) : il sort du moteur, et la validation a lieu au chargement depuis la base.
 */
async function persistModel(userId: string, model: CategorizerModel): Promise<CategorizerModel> {
  modelCache.delete(userId);
  await saveAiModel(userId, MODEL_KIND, aiEngine.categorizerVersion, JSON.stringify(model));
  cacheModel(userId, model);
  return model;
}

/** JSON du modèle stocké ; null (journalisé) s'il est illisible, ce qui déclenche un réentraînement. */
function parseStoredModel(userId: string, data: string): unknown {
  try {
    return JSON.parse(data);
  } catch (e) {
    console.warn(`[ai] modèle stocké illisible (JSON) pour ${userId} : réentraînement`, e);
    return null;
  }
}

/**
 * Réentraîne depuis les transactions confirmées. Les associations marchand → catégorie
 * issues des corrections (ancien modèle) sont conservées si la catégorie existe encore.
 */
async function rebuildModel(
  userId: string,
  previous: unknown,
): Promise<Result<{ model: CategorizerModel; samples: number }>> {
  const samples = await listTrainingSamples(userId);
  let model = aiEngine.trainCategorizer(samples);
  const legacy = legacyMerchantMapSchema.safeParse(previous);
  if (legacy.success) {
    const cats = await aiCategories(userId);
    if (!cats.ok) return cats;
    const ids = new Set(cats.value.map((c) => c.id));
    const kept = Object.fromEntries(
      Object.entries(legacy.data.merchantMap).filter(([, cid]) => ids.has(cid)),
    );
    model = capMerchants({ ...model, merchantMap: { ...kept, ...model.merchantMap } });
  }
  const saved = await persistModel(userId, model);
  return ok({ model: saved, samples: samples.length });
}

/** Modèle de l'utilisateur : cache mémoire, sinon base (validé Zod), sinon réentraîné. */
async function getModel(userId: string): Promise<Result<CategorizerModel>> {
  const cached = modelCache.get(userId);
  if (cached) return ok(cached);
  const stored = await loadAiModel(userId, MODEL_KIND);
  const raw = stored ? parseStoredModel(userId, stored.data) : null;
  if (stored && stored.version === aiEngine.categorizerVersion) {
    const parsed = categorizerModelSchema.safeParse(raw);
    if (parsed.success && parsed.data.version === aiEngine.categorizerVersion) {
      cacheModel(userId, parsed.data);
      return ok(parsed.data);
    }
    console.warn(`[ai] modèle invalide pour ${userId} : réentraînement`);
  }
  const rebuilt = await rebuildModel(userId, raw);
  return rebuilt.ok ? ok(rebuilt.value.model) : rebuilt;
}

// ───────────────────────── Catégorisation ─────────────────────────

export async function predictCategory(
  userId: string,
  input: CategorizeInput,
): Promise<Result<CategoryPrediction | null>> {
  return guard('predictCategory', async () => {
    if (input.type === 'TRANSFER') return ok(null);
    const [model, cats] = await Promise.all([getModel(userId), aiCategories(userId)]);
    if (!model.ok) return model;
    if (!cats.ok) return cats;
    const p = aiEngine.categorize(model.value, input, cats.value.map(toAiCategory));
    return validated(nullablePredictionSchema, p, 'categorize');
  });
}

/** Prédictions en lot (aperçu d'import) : soumis à la limite de débit des opérations de masse. */
export async function predictCategories(
  userId: string,
  inputs: CategorizeInput[],
): Promise<Result<(CategoryPrediction | null)[]>> {
  if (inputs.length === 0) return ok([]);
  const limited = bulkRateLimited(userId);
  if (limited) return limited;
  return guard('predictCategories', async () => {
    const [model, cats] = await Promise.all([getModel(userId), aiCategories(userId)]);
    if (!model.ok) return model;
    if (!cats.ok) return cats;
    const categories = cats.value.map(toAiCategory);
    const out = inputs.map((i) =>
      i.type === 'TRANSFER' ? null : aiEngine.categorize(model.value, i, categories),
    );
    return validated(predictionListSchema, out, 'categorize (lot)');
  });
}

export interface CorrectionItem {
  sample: TrainingSample;
  previousCategoryId: string | null;
}

/**
 * Apprend un lot de corrections : le modèle est chargé une fois, mis à jour en lot (une seule
 * copie) et persisté UNE fois. Les virements sont ignorés.
 */
export async function learnFromCorrections(
  userId: string,
  items: readonly CorrectionItem[],
): Promise<Result<void>> {
  return guard('learnFromCorrections', async () => {
    const useful = items.filter((i) => i.sample.type !== 'TRANSFER');
    if (useful.length === 0) return ok(undefined);
    const model = await getModel(userId);
    if (!model.ok) return model;
    const next = aiEngine.learnCorrections(model.value, useful);
    if (next !== model.value) await persistModel(userId, next);
    return ok(undefined);
  });
}

export async function learnFromCorrection(
  userId: string,
  sample: TrainingSample,
  previousCategoryId: string | null,
): Promise<Result<void>> {
  return learnFromCorrections(userId, [{ sample, previousCategoryId }]);
}

/** Réentraîne entièrement le modèle (après import massif, seed…). */
export async function retrainCategorizer(userId: string): Promise<Result<{ samples: number }>> {
  return guard('retrainCategorizer', async () => {
    const stored = modelCache.has(userId) ? null : await loadAiModel(userId, MODEL_KIND);
    const previous =
      modelCache.get(userId) ?? (stored ? parseStoredModel(userId, stored.data) : null);
    const rebuilt = await rebuildModel(userId, previous);
    return rebuilt.ok ? ok({ samples: rebuilt.value.samples }) : rebuilt;
  });
}

// ───────────────────────── Saisie, anomalies, prévisions, suggestions ─────────────────────────

export async function parseNaturalEntry(
  userId: string,
  text: string,
): Promise<Result<ParseEntryResult>> {
  const limited = rateLimited(userId);
  if (limited) return limited;
  return guard('parseNaturalEntry', async () => {
    const [model, cats, accounts] = await Promise.all([
      getModel(userId),
      aiCategories(userId),
      listAccounts(userId, { includeArchived: false }),
    ]);
    if (!model.ok) return model;
    if (!cats.ok) return cats;
    if (!accounts.ok) return accounts;
    const result = aiEngine.parseEntry(text, {
      today: today(),
      categories: cats.value.map(toAiCategory),
      accounts: accounts.value.map((a) => ({ id: a.id, name: a.name, type: a.type })),
      model: model.value,
    });
    return validated(parseEntryResultSchema, result, 'parseEntry');
  });
}

export async function getAnomalies(userId: string): Promise<Result<Anomaly[]>> {
  return guard('getAnomalies', async () => {
    const t = today();
    const [txs, cats, rules, dismissed] = await Promise.all([
      listAiTransactions(userId, historyRange(t, 6)),
      aiCategories(userId),
      listRecurring(userId),
      listDismissedKeys(userId),
    ]);
    if (!cats.ok) return cats;
    if (!rules.ok) return rules;
    const anomalies = aiEngine.detectAnomalies({
      today: t,
      transactions: txs,
      categories: cats.value.map(toAiCategory),
      recurring: rules.value,
      dismissedKeys: dismissed,
    });
    return validated(anomaliesSchema, anomalies, 'detectAnomalies');
  });
}

export async function dismissInsight(userId: string, key: string): Promise<Result<void>> {
  return guard('dismissInsight', async () => {
    const existing = await listDismissedKeys(userId);
    if (existing.includes(key)) return ok(undefined);
    if (existing.length >= MAX_DISMISSED_KEYS) {
      return err(
        appError(
          'VALIDATION',
          `Vous avez déjà masqué ${MAX_DISMISSED_KEYS} conseils ou alertes : impossible d’en masquer davantage.`,
        ),
      );
    }
    await addDismissedKey(userId, key);
    return ok(undefined);
  });
}

export async function getForecast(userId: string): Promise<Result<BalanceForecast>> {
  return guard('getForecast', async () => {
    const t = today();
    // 24 mois : la saisonnalité de la prévision s'active à partir de 13 mois d'historique.
    const [accounts, history, rules] = await Promise.all([
      listAccounts(userId, { includeArchived: false }),
      listAiTransactions(userId, historyRange(t, 24)),
      listRecurring(userId),
    ]);
    if (!accounts.ok) return accounts;
    if (!rules.ok) return rules;
    const currentBalance = accounts.value.reduce((s, a) => s + a.balance, 0);
    const forecast = aiEngine.forecastBalance({
      today: t,
      currentBalance,
      history,
      recurring: rules.value,
    });
    return validated(balanceForecastSchema, forecast, 'forecastBalance');
  });
}

export async function getRecurringSuggestions(
  userId: string,
): Promise<Result<RecurringCandidate[]>> {
  return guard('getRecurringSuggestions', async () => {
    const t = today();
    const [txs, rules] = await Promise.all([
      listAiTransactions(userId, historyRange(t, 12)),
      listRecurring(userId),
    ]);
    if (!rules.ok) return rules;
    const candidates = aiEngine.detectRecurring({
      today: t,
      transactions: txs,
      existing: rules.value,
    });
    return validated(recurringCandidatesSchema, candidates, 'detectRecurring');
  });
}

export async function getBudgetSuggestions(userId: string): Promise<Result<BudgetSuggestion[]>> {
  return guard('getBudgetSuggestions', async () => {
    const t = today();
    const [txs, cats] = await Promise.all([
      listAiTransactions(userId, historyRange(t, 6)),
      aiCategories(userId),
    ]);
    if (!cats.ok) return cats;
    const incomes = monthlyTotals(txs, monthsBack(t, 6, false))
      .map((m) => m.income)
      .filter((v) => v > 0);
    const monthlyIncome =
      incomes.length > 0 ? Math.round(incomes.reduce((a, b) => a + b, 0) / incomes.length) : null;
    const suggestions = aiEngine.suggestBudgets({
      today: t,
      transactions: txs,
      categories: cats.value.map(toAiCategory),
      monthlyIncome,
    });
    return validated(budgetSuggestionsSchema, suggestions, 'suggestBudgets');
  });
}

// ───────────────────────── Assistant, résumé, simulateur, santé ─────────────────────────

export async function askAssistant(
  userId: string,
  question: string,
): Promise<Result<AssistantAnswer>> {
  const limited = rateLimited(userId);
  if (limited) return limited;
  return guard('askAssistant', async () => {
    const [cats, accounts, goals] = await Promise.all([
      aiCategories(userId),
      listAccounts(userId, { includeArchived: false }),
      listGoals(userId),
    ]);
    if (!cats.ok) return cats;
    if (!accounts.ok) return accounts;
    if (!goals.ok) return goals;
    const tools = loggedTools(
      createFinanceTools(userId, {
        forecast: async () => {
          const r = await getForecast(userId);
          if (!r.ok) throw new Error(r.error.message);
          return r.value;
        },
      }),
    );
    const answer = await aiEngine.ask(
      question,
      {
        today: today(),
        categories: cats.value.map(toAiCategory),
        accounts: accounts.value.map((a) => ({ id: a.id, name: a.name })),
        goals: goals.value.map((g) => ({ id: g.id, name: g.name })),
      },
      tools,
    );
    return validated(assistantAnswerSchema, answer, 'ask');
  });
}

export async function getExampleQuestions(): Promise<string[]> {
  return aiEngine.exampleQuestions();
}

export async function getMonthlySummary(
  userId: string,
  month: YearMonth,
): Promise<Result<MonthlySummary>> {
  return guard('getMonthlySummary', async () => {
    const [txs, cats, budgets, goals] = await Promise.all([
      listAiTransactions(userId, { from: monthStart(addMonthsYM(month, -3)), to: monthEnd(month) }),
      aiCategories(userId),
      listBudgetProgress(userId, month),
      listGoals(userId),
    ]);
    if (!cats.ok) return cats;
    if (!budgets.ok) return budgets;
    if (!goals.ok) return goals;
    const summary = aiEngine.monthlySummary({
      month,
      today: today(),
      transactions: txs,
      categories: cats.value.map(toAiCategory),
      budgets: budgets.value,
      goals: goals.value,
      seed: userId,
    });
    return validated(monthlySummarySchema, summary, 'monthlySummary');
  });
}

export async function simulateWhatIf(
  userId: string,
  input: WhatIfActionData,
): Promise<Result<WhatIfResult>> {
  const limited = rateLimited(userId);
  if (limited) return limited;
  return guard('simulateWhatIf', async () => {
    const t = today();
    const [goals, cats, txs] = await Promise.all([
      listGoals(userId),
      aiCategories(userId),
      listAiTransactions(userId, historyRange(t, 6)),
    ]);
    if (!goals.ok) return goals;
    if (!cats.ok) return cats;
    const goal = goals.value.find((g) => g.id === input.goalId);
    if (!goal) return err(appError('NOT_FOUND', 'Objectif introuvable.'));

    // Moyenne mensuelle des 3 derniers mois complets, par catégorie de dépense.
    const last3 = new Set(monthsBack(t, 3, false));
    const covered = monthlyTotals(txs, [...last3]).length;
    const divisor = Math.max(1, covered);
    const spent = new Map<string, number>();
    for (const tx of txs) {
      if (tx.type !== 'EXPENSE' || tx.categoryId === null || !last3.has(monthOf(tx.date))) continue;
      spent.set(tx.categoryId, (spent.get(tx.categoryId) ?? 0) + tx.amount);
    }
    const categorySpending = cats.value
      .filter((c) => c.kind === 'EXPENSE' && (spent.get(c.id) ?? 0) > 0)
      .map((c) => ({
        categoryId: c.id,
        name: c.name,
        monthlyAverage: Math.round((spent.get(c.id) ?? 0) / divisor),
      }));

    const result = aiEngine.simulateWhatIf({
      today: t,
      goal: {
        id: goal.id,
        name: goal.name,
        targetAmount: goal.targetAmount,
        savedAmount: goal.savedAmount,
        targetDate: goal.targetDate,
      },
      monthly: monthlyTotals(txs, monthsBack(t, 6, true)),
      categorySpending,
      adjustments: input.adjustments,
      extraMonthlySaving: input.extraMonthlySaving,
    });
    return validated(whatIfResultSchema, result, 'simulateWhatIf');
  });
}

export async function getHealthScore(userId: string): Promise<Result<HealthScore>> {
  return guard('getHealthScore', async () => {
    const t = today();
    const [txs, accounts, rules, cats, budgets, goals] = await Promise.all([
      listAiTransactions(userId, historyRange(t, 6)),
      listAccounts(userId, { includeArchived: false }),
      listRecurring(userId),
      aiCategories(userId),
      listBudgetProgress(userId, monthOf(t)),
      listGoals(userId),
    ]);
    if (!accounts.ok) return accounts;
    if (!rules.ok) return rules;
    if (!cats.ok) return cats;
    if (!budgets.ok) return budgets;
    if (!goals.ok) return goals;

    const monthly = monthlyTotals(txs, monthsBack(t, 6, true));
    const fixedMonthlyCharges = Math.round(
      rules.value
        .filter((r) => r.active && r.type === 'EXPENSE')
        .reduce((s, r) => s + monthlyEquivalent(r), 0),
    );

    // Dépenses mensuelles moyennes par groupe 50/30/20, sur les mois complets couverts.
    const complete = new Set(monthsBack(t, 6, false));
    const coveredMonths = Math.max(1, monthlyTotals(txs, [...complete]).length);
    const groupOf = new Map(cats.value.map((c) => [c.id, c.group]));
    const groups = { needs: 0, wants: 0, savings: 0 };
    for (const tx of txs) {
      if (tx.type !== 'EXPENSE' || !complete.has(monthOf(tx.date))) continue;
      const group = tx.categoryId === null ? 'WANTS' : (groupOf.get(tx.categoryId) ?? 'WANTS');
      if (group === 'NEEDS') groups.needs += tx.amount;
      else if (group === 'SAVINGS') groups.savings += tx.amount;
      else groups.wants += tx.amount;
    }

    const score = aiEngine.healthScore({
      today: t,
      monthly,
      totalBalance: accounts.value.reduce((s, a) => s + a.balance, 0),
      fixedMonthlyCharges,
      groupSpending: {
        needs: Math.round(groups.needs / coveredMonths),
        wants: Math.round(groups.wants / coveredMonths),
        savings: Math.round(groups.savings / coveredMonths),
      },
      budgets: budgets.value,
      goals: goals.value,
    });
    return validated(healthScoreSchema, score, 'healthScore');
  });
}
