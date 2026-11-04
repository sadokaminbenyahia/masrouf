/**
 * Taux d'épargne : UNE seule définition pour toute l'application (conseils, résumé mensuel,
 * score de santé, simulateur, assistant).
 *
 *   épargne = revenus − (dépenses − dépenses du groupe Épargne)
 *   taux    = épargne / revenus           (null si revenus = 0)
 *
 * Les versements vers une catégorie du groupe SAVINGS (« Épargne ») SONT de l'épargne : ils ne
 * diminuent pas le taux. Les virements entre comptes sont exclus en amont (ni revenu ni dépense).
 */
import { monthOf, type ISODate, type YearMonth } from './dates';
import type { Millimes } from './money';
import type { MonthTotals } from './types';

export interface SavingsTotals {
  income: Millimes;
  expense: Millimes;
  /** Part des dépenses affectée à des catégories du groupe SAVINGS */
  savingsGroupExpense: Millimes;
}

/** Montant épargné : revenus − dépenses hors épargne. */
export function savedAmount(t: SavingsTotals): Millimes {
  return t.income - (t.expense - t.savingsGroupExpense);
}

/** Taux d'épargne (peut être négatif) ; null si aucun revenu. */
export function savingsRate(t: SavingsTotals): number | null {
  if (!(t.income > 0)) return null;
  return savedAmount(t) / t.income;
}

export interface MonthSavings extends SavingsTotals {
  month: YearMonth;
}

export interface AverageSavingsOptions {
  /** Jour courant : le mois de `today` est partiel */
  today?: ISODate;
  /** Écarte le mois courant (partiel) et les mois futurs ; défaut true si `today` est fourni */
  excludePartialCurrent?: boolean;
}

/**
 * Taux d'épargne moyen sur plusieurs mois, pondéré par les revenus (Σ épargne / Σ revenus).
 * Le mois courant partiel est exclu par défaut quand `today` est fourni. null sans revenu.
 */
export function averageSavingsRate(
  months: readonly MonthSavings[],
  opts: AverageSavingsOptions = {},
): number | null {
  const exclude = opts.today !== undefined && opts.excludePartialCurrent !== false;
  const current = opts.today === undefined ? null : monthOf(opts.today);
  const kept = months.filter((m) => !exclude || current === null || m.month < current);
  const total = kept.reduce(
    (acc, m) => ({
      income: acc.income + m.income,
      expense: acc.expense + m.expense,
      savingsGroupExpense: acc.savingsGroupExpense + m.savingsGroupExpense,
    }),
    { income: 0, expense: 0, savingsGroupExpense: 0 },
  );
  return savingsRate(total);
}

/** Associe à chaque mois ses dépenses du groupe Épargne (0 si absentes). */
export function withSavingsGroup(
  monthly: readonly MonthTotals[],
  groupSpendingByMonth: ReadonlyMap<YearMonth, Millimes>,
): MonthSavings[] {
  return monthly.map((m) => ({
    month: m.month,
    income: m.income,
    expense: m.expense,
    savingsGroupExpense: groupSpendingByMonth.get(m.month) ?? 0,
  }));
}

/** Taux d'épargne de chaque mois (null pour un mois sans revenu), pour les graphiques. */
export function monthlySavingsRates(
  monthly: readonly MonthTotals[],
  groupSpendingByMonth: ReadonlyMap<YearMonth, Millimes>,
): { month: YearMonth; rate: number | null }[] {
  return withSavingsGroup(monthly, groupSpendingByMonth).map((m) => ({
    month: m.month,
    rate: savingsRate(m),
  }));
}
