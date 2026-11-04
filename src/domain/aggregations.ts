/**
 * Agrégations du tableau de bord (pures) : séries mensuelles, répartition par catégorie,
 * évolution des dépenses, reste à dépenser.
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
import type { Category, CategorySlice, MonthTotals, TransactionType } from './types';

export const UNCATEGORIZED_LABEL = 'Sans catégorie';
export const UNCATEGORIZED_COLOR = '#8A8F98';
export const UNCATEGORIZED_ICON = 'CircleDashed';

/** Somme par jour et par type (sortie d'un `groupBy(['date', 'type'])`). */
export interface DailyTypeSum {
  date: ISODate;
  type: TransactionType;
  amount: Millimes;
}

/** Série mensuelle complète (mois sans transaction = 0), virements exclus. */
export function buildMonthlySeries(
  months: readonly YearMonth[],
  sums: readonly DailyTypeSum[],
): MonthTotals[] {
  const byMonth = new Map<YearMonth, { income: Millimes; expense: Millimes }>();
  for (const m of months) byMonth.set(m, { income: 0, expense: 0 });
  for (const s of sums) {
    const bucket = byMonth.get(monthOf(s.date));
    if (!bucket) continue;
    if (s.type === 'INCOME') bucket.income += s.amount;
    else if (s.type === 'EXPENSE') bucket.expense += s.amount;
  }
  return months.map((month) => {
    const b = byMonth.get(month) ?? { income: 0, expense: 0 };
    return { month, income: b.income, expense: b.expense, net: b.income - b.expense };
  });
}

/** Somme par catégorie (sortie d'un `groupBy(['categoryId'])`). */
export interface CategorySum {
  categoryId: string | null;
  amount: Millimes;
  count: number;
}

/**
 * Parts par catégorie, triées par montant décroissant. Les montants nuls sont ignorés ;
 * « Sans catégorie » regroupe les transactions non catégorisées (ou de catégorie inconnue).
 */
export function buildCategorySlices(
  sums: readonly CategorySum[],
  categories: ReadonlyMap<string, Category>,
): CategorySlice[] {
  const merged = new Map<string | null, { amount: Millimes; count: number }>();
  for (const s of sums) {
    if (s.amount <= 0) continue;
    const key = s.categoryId !== null && categories.has(s.categoryId) ? s.categoryId : null;
    const cur = merged.get(key) ?? { amount: 0, count: 0 };
    cur.amount += s.amount;
    cur.count += s.count;
    merged.set(key, cur);
  }
  let total = 0;
  for (const v of merged.values()) total += v.amount;

  const slices: CategorySlice[] = [];
  for (const [categoryId, v] of merged) {
    const c = categoryId === null ? undefined : categories.get(categoryId);
    slices.push({
      categoryId,
      name: c?.name ?? UNCATEGORIZED_LABEL,
      color: c?.color ?? UNCATEGORIZED_COLOR,
      icon: c?.icon ?? UNCATEGORIZED_ICON,
      amount: v.amount,
      share: total > 0 ? v.amount / total : 0,
      count: v.count,
    });
  }
  return slices.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'fr'));
}

/** Variation relative (courant − précédent) / précédent ; null sans référence. */
export function relativeChange(current: Millimes, previous: Millimes): number | null {
  if (previous <= 0) return null;
  return (current - previous) / previous;
}

/**
 * Jours restants dans `month` vu depuis `today`, aujourd'hui inclus :
 * mois courant → joursDuMois − jour + 1 ; mois futur → joursDuMois ; mois passé → 0.
 */
export function remainingDaysInMonth(month: YearMonth, today: ISODate): number {
  const { year, month: m } = parseYearMonth(month);
  const total = daysInMonth(year, m);
  const current = monthOf(today);
  if (month < current) return 0;
  if (month > current) return total;
  return total - parseISODate(today).day + 1;
}

/** Reste à dépenser par jour restant (0 si rien ne reste ou si le mois est terminé). */
export function dailyAllowance(
  remainingToSpend: Millimes,
  month: YearMonth,
  today: ISODate,
): Millimes {
  const days = remainingDaysInMonth(month, today);
  if (days <= 0 || remainingToSpend <= 0) return 0;
  return Math.floor(remainingToSpend / days);
}

/** Moyenne arithmétique arrondie au millime (0 pour une liste vide). */
export function averageMillimes(values: readonly Millimes[]): Millimes {
  if (values.length === 0) return 0;
  let total = 0;
  for (const v of values) total += v;
  return Math.round(total / values.length);
}

/** Somme par (catégorie, mois) des dépenses. */
export interface CategoryMonthSum {
  categoryId: string | null;
  month: YearMonth;
  amount: Millimes;
}

/** Regroupe des sommes journalières par catégorie en sommes mensuelles. */
export function categoryMonthSums(
  rows: readonly { categoryId: string | null; date: ISODate; amount: Millimes }[],
): CategoryMonthSum[] {
  const map = new Map<string, CategoryMonthSum>();
  for (const r of rows) {
    const month = monthOf(r.date);
    const key = `${r.categoryId ?? ''}|${month}`;
    const cur = map.get(key);
    if (cur) cur.amount += r.amount;
    else map.set(key, { categoryId: r.categoryId, month, amount: r.amount });
  }
  return [...map.values()];
}
