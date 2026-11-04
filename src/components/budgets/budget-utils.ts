/**
 * Fonctions pures de la page Budgets : textes de progression, niveaux, résumé du mois,
 * mises à jour optimistes du cache et suggestions applicables.
 */
import type { BudgetSuggestion } from '@/domain/ai/types';
import {
  addMonthsYM,
  diffDays,
  isYearMonth,
  monthEnd,
  monthOf,
  monthRange,
  type ISODate,
  type YearMonth,
} from '@/domain/dates';
import { formatMoney, type Millimes } from '@/domain/money';
import type { BudgetLevel, BudgetProgress, Category } from '@/domain/types';

export const WARNING_RATIO = 0.8;

/** Même règle que le service : OK < 80 % ≤ WARNING < 100 % ≤ EXCEEDED. */
export function levelFromRatio(ratio: number): BudgetLevel {
  if (ratio >= 1) return 'EXCEEDED';
  if (ratio >= WARNING_RATIO) return 'WARNING';
  return 'OK';
}

export function ratioOf(spent: Millimes, amount: Millimes): number {
  return amount > 0 ? spent / amount : spent > 0 ? Infinity : 0;
}

/** Pourcentage affiché (arrondi, non borné). */
export function percentOf(ratio: number): number {
  return Number.isFinite(ratio) ? Math.round(ratio * 100) : 100;
}

/** Largeur de barre, bornée à 0..100. */
export function barPercent(ratio: number): number {
  if (!Number.isFinite(ratio)) return 100;
  return Math.min(100, Math.max(0, ratio * 100));
}

/** Mois maximal sélectionnable : mois courant + 1. */
export function maxBudgetMonth(today: ISODate): YearMonth {
  return addMonthsYM(monthOf(today), 1);
}

/** `?mois=AAAA-MM` valide et ≤ max, sinon mois courant. */
export function parseMonthParam(raw: string | undefined, today: ISODate): YearMonth {
  const current = monthOf(today);
  if (!raw || !isYearMonth(raw)) return current;
  return raw > maxBudgetMonth(today) ? current : raw;
}

/** Jours restants (aujourd'hui compris) si `month` est le mois en cours, sinon null. */
export function daysLeftInMonth(month: YearMonth, today: ISODate): number | null {
  if (monthOf(today) !== month) return null;
  return diffDays(today, monthEnd(month)) + 1;
}

export function formatDays(n: number): string {
  return n <= 1 ? `${n} jour` : `${n} jours`;
}

export type BudgetStatus =
  | { kind: 'REMAINING'; remaining: Millimes; daysLeft: number | null }
  | { kind: 'OVER'; over: Millimes };

export function budgetStatus(p: BudgetProgress, today: ISODate): BudgetStatus {
  const remaining = p.budget.amount - p.spent;
  if (remaining < 0) return { kind: 'OVER', over: -remaining };
  return { kind: 'REMAINING', remaining, daysLeft: daysLeftInMonth(p.month, today) };
}

const money0 = (m: Millimes) => formatMoney(m, { decimals: 0 });

/** Texte complet lisible sans couleur : « 320 / 400 DT · reste 80 DT · 9 jours ». */
export function budgetStatusText(p: BudgetProgress, today: ISODate): string {
  const head = `${formatMoney(p.spent, { decimals: 0, hideCurrency: true })} / ${money0(p.budget.amount)}`;
  const status = budgetStatus(p, today);
  if (status.kind === 'OVER') return `${head} · dépassé de ${money0(status.over)}`;
  const parts = [head, `reste ${money0(status.remaining)}`];
  if (status.daysLeft !== null) parts.push(formatDays(status.daysLeft));
  return parts.join(' · ');
}

/** aria-valuetext de la barre : « 320 DT sur 400 DT ». */
export function progressValueText(spent: Millimes, amount: Millimes, discreet = false): string {
  const pct = percentOf(ratioOf(spent, amount));
  if (discreet) return `${pct} % du plafond`;
  const base = `${money0(spent)} sur ${money0(amount)}`;
  return spent > amount ? `${base}, dépassé de ${money0(spent - amount)}` : base;
}

/** Texte de projection, uniquement si le rythme mène au dépassement. */
export function projectionText(p: BudgetProgress): string | null {
  if (!p.projectedOverrun || p.projected === null) return null;
  return `À ce rythme : ${money0(p.projected)} en fin de mois`;
}

export const LEVEL_LABELS: Record<BudgetLevel, string> = {
  OK: 'Dans le budget',
  WARNING: '80 % du plafond atteint',
  EXCEEDED: 'Plafond dépassé',
};

/** Lien vers les transactions de la catégorie sur le mois. */
export function budgetTransactionsHref(categoryId: string, month: YearMonth): string {
  const { from, to } = monthRange(month);
  const params = new URLSearchParams({ categoryId, from, to });
  return `/transactions?${params.toString()}`;
}

export interface BudgetSummary {
  budgeted: Millimes;
  spent: Millimes;
  remaining: Millimes;
  ratio: number;
  level: BudgetLevel;
  count: number;
}

export function summarizeBudgets(list: readonly BudgetProgress[]): BudgetSummary {
  let budgeted = 0;
  let spent = 0;
  for (const p of list) {
    budgeted += p.budget.amount;
    spent += p.spent;
  }
  const ratio = ratioOf(spent, budgeted);
  return {
    budgeted,
    spent,
    remaining: budgeted - spent,
    ratio,
    level: levelFromRatio(ratio),
    count: list.length,
  };
}

/** Budgets à ≥ 80 %, du plus critique au moins critique. */
export function budgetAlerts(list: readonly BudgetProgress[]): BudgetProgress[] {
  return list.filter((p) => p.level !== 'OK').sort((a, b) => b.ratio - a.ratio);
}

/** « 2 budgets demandent votre attention : Restaurants (dépassé), Cafés (85 %). » */
export function alertSummaryText(alerts: readonly BudgetProgress[]): string {
  if (alerts.length === 0) return '';
  const items = alerts
    .map((p) =>
      p.level === 'EXCEEDED'
        ? `${p.category.name} (dépassé)`
        : `${p.category.name} (${percentOf(p.ratio)} %)`,
    )
    .join(', ');
  const head =
    alerts.length === 1
      ? '1 budget demande votre attention'
      : `${alerts.length} budgets demandent votre attention`;
  return `${head} : ${items}.`;
}

/** Recalcule une progression avec un nouveau plafond (mise à jour optimiste). */
export function withBudgetAmount(p: BudgetProgress, amount: Millimes): BudgetProgress {
  const ratio = ratioOf(p.spent, amount);
  return {
    ...p,
    budget: { ...p.budget, amount },
    remaining: amount - p.spent,
    ratio,
    level: levelFromRatio(ratio),
    projectedOverrun: p.projected !== null && p.projected > amount,
  };
}

const OPTIMISTIC_PREFIX = 'optimistic-';

export function isOptimisticBudgetId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_PREFIX);
}

/** Progression provisoire d'un budget en cours de création (dépenses inconnues : 0). */
export function optimisticProgress(
  category: Category,
  amount: Millimes,
  month: YearMonth,
  sortOrder: number,
): BudgetProgress {
  return {
    budget: {
      id: `${OPTIMISTIC_PREFIX}${category.id}`,
      categoryId: category.id,
      amount,
      sortOrder,
    },
    category,
    month,
    spent: 0,
    remaining: amount,
    ratio: 0,
    level: 'OK',
    projected: null,
    projectedOverrun: false,
  };
}

/** Catégories de dépense sans budget, dans l'ordre des catégories. */
export function categoriesWithoutBudget(
  categories: readonly Category[],
  list: readonly BudgetProgress[],
): Category[] {
  const budgeted = new Set(list.map((p) => p.budget.categoryId));
  return categories
    .filter((c) => c.kind === 'EXPENSE' && !budgeted.has(c.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'fr'));
}

export interface ApplicableSuggestion {
  suggestion: BudgetSuggestion;
  category: Category;
}

/** Suggestions IA pour des catégories de dépense existantes et encore sans budget. */
export function applicableSuggestions(
  suggestions: readonly BudgetSuggestion[],
  categories: readonly Category[],
  list: readonly BudgetProgress[],
): ApplicableSuggestion[] {
  const available = new Map(categoriesWithoutBudget(categories, list).map((c) => [c.id, c]));
  const out: ApplicableSuggestion[] = [];
  for (const suggestion of suggestions) {
    const category = available.get(suggestion.categoryId);
    if (category && suggestion.amount > 0) out.push({ suggestion, category });
  }
  return out;
}

/** Trie une liste selon l'ordre d'ids donné (réordonnancement optimiste). */
export function sortByIds(
  list: readonly BudgetProgress[],
  ids: readonly string[],
): BudgetProgress[] {
  const rank = new Map(ids.map((id, i) => [id, i]));
  return [...list]
    .sort(
      (a, b) =>
        (rank.get(a.budget.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b.budget.id) ?? Number.MAX_SAFE_INTEGER),
    )
    .map((p, i) => ({ ...p, budget: { ...p.budget, sortOrder: i } }));
}
