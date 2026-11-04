/**
 * Budgets mensuels : niveau d'alerte et projection de fin de mois (pur).
 *  - OK < 80 % ≤ WARNING < 100 % ≤ EXCEEDED
 *  - mois en cours (dès le 7e jour et 25 % du mois) : projected = spent + rythme × joursRestants
 */
import {
  daysInMonth,
  monthOf,
  parseISODate,
  parseYearMonth,
  type ISODate,
  type YearMonth,
} from './dates';
import type { Millimes } from './money';
import type { Budget, BudgetLevel, BudgetProgress, Category } from './types';

export const BUDGET_WARNING_RATIO = 0.8;
export const BUDGET_EXCEEDED_RATIO = 1;

export function budgetLevel(ratio: number): BudgetLevel {
  if (ratio >= BUDGET_EXCEEDED_RATIO) return 'EXCEEDED';
  if (ratio >= BUDGET_WARNING_RATIO) return 'WARNING';
  return 'OK';
}

/** Pas de projection avant ce jour du mois… */
export const PROJECTION_MIN_DAY = 7;
/** … ni tant que cette part du mois n'est pas écoulée (rythme trop peu fiable). */
export const PROJECTION_MIN_ELAPSED_RATIO = 0.25;
/** Le rythme journalier est plafonné à ce multiple de la moyenne journalière historique. */
export const PROJECTION_MAX_PACE_FACTOR = 2;

/**
 * Dépense projetée en fin de mois. Uniquement pour le mois de `today`, à partir du 7e jour ET
 * d'un quart du mois écoulé (null sinon, et pour un mois passé ou futur).
 * projected = spent + max(0, rythme × joursRestants), où rythme = dépense moyenne par jour
 * écoulé, plafonnée à 2× la moyenne journalière historique (`historicalMonthlyAverage`,
 * moyenne mensuelle des mois précédents) si elle est fournie et positive.
 */
export function projectSpending(
  spent: Millimes,
  month: YearMonth,
  today: ISODate,
  historicalMonthlyAverage?: Millimes | null,
): Millimes | null {
  if (monthOf(today) !== month) return null;
  const { year, month: m } = parseYearMonth(month);
  const days = daysInMonth(year, m);
  const elapsed = parseISODate(today).day;
  if (elapsed < PROJECTION_MIN_DAY || elapsed / days < PROJECTION_MIN_ELAPSED_RATIO) return null;
  let pace = spent / elapsed;
  if (historicalMonthlyAverage !== undefined && historicalMonthlyAverage !== null) {
    if (historicalMonthlyAverage > 0) {
      pace = Math.min(pace, (PROJECTION_MAX_PACE_FACTOR * historicalMonthlyAverage) / days);
    }
  }
  return Math.round(spent + Math.max(0, pace * (days - elapsed)));
}

export function computeBudgetProgress(input: {
  budget: Budget;
  category: Category;
  month: YearMonth;
  spent: Millimes;
  today: ISODate;
  /** Dépense mensuelle moyenne des mois précédents (plafonne le rythme de la projection) */
  historicalMonthlyAverage?: Millimes | null;
}): BudgetProgress {
  const { budget, category, month, spent, today } = input;
  // Le plafond est toujours > 0 (validé par Zod) ; garde-fou contre la division par zéro.
  const ratio = budget.amount > 0 ? spent / budget.amount : spent > 0 ? 1 : 0;
  const projected = projectSpending(spent, month, today, input.historicalMonthlyAverage);
  return {
    budget,
    category,
    month,
    spent,
    remaining: budget.amount - spent,
    ratio,
    level: budgetLevel(ratio),
    projected,
    projectedOverrun: projected !== null && projected > budget.amount && spent < budget.amount,
  };
}

/**
 * Progression de tous les budgets d'un mois, triée par `sortOrder`. Les budgets dont la
 * catégorie est introuvable sont ignorés.
 */
export function computeAllBudgetProgress(input: {
  budgets: readonly Budget[];
  categories: ReadonlyMap<string, Category>;
  spentByCategory: ReadonlyMap<string, Millimes>;
  month: YearMonth;
  today: ISODate;
  /** Dépense mensuelle moyenne par catégorie sur les mois précédents (optionnel) */
  historicalAverageByCategory?: ReadonlyMap<string, Millimes>;
}): BudgetProgress[] {
  const out: BudgetProgress[] = [];
  for (const budget of input.budgets) {
    const category = input.categories.get(budget.categoryId);
    if (!category) continue;
    out.push(
      computeBudgetProgress({
        budget,
        category,
        month: input.month,
        spent: input.spentByCategory.get(budget.categoryId) ?? 0,
        today: input.today,
        historicalMonthlyAverage: input.historicalAverageByCategory?.get(budget.categoryId) ?? null,
      }),
    );
  }
  return sortBudgetProgress(out);
}

export function sortBudgetProgress(list: readonly BudgetProgress[]): BudgetProgress[] {
  return [...list].sort(
    (a, b) =>
      a.budget.sortOrder - b.budget.sortOrder ||
      a.category.name.localeCompare(b.category.name, 'fr'),
  );
}

/** Budgets à signaler : WARNING, EXCEEDED, ou dépassement projeté. */
export function isBudgetAlert(p: BudgetProgress): boolean {
  return p.level !== 'OK' || p.projectedOverrun;
}

export interface BudgetSummary {
  budgeted: Millimes;
  spent: Millimes;
  remaining: Millimes;
}

export function summarizeBudgets(list: readonly BudgetProgress[]): BudgetSummary | null {
  if (list.length === 0) return null;
  let budgeted = 0;
  let spent = 0;
  for (const p of list) {
    budgeted += p.budget.amount;
    spent += p.spent;
  }
  return { budgeted, spent, remaining: budgeted - spent };
}
