/**
 * Groupement visuel par jour (tableau trié par date) : fonctions pures.
 */
import type { ISODate } from '@/domain/dates';
import type { Millimes } from '@/domain/money';
import type { Transaction } from '@/domain/types';

export interface DayGroup {
  date: ISODate;
  items: Transaction[];
  income: Millimes;
  expense: Millimes;
  /** revenus − dépenses (les virements sont exclus) */
  net: Millimes;
}

/**
 * Regroupe les transactions CONSÉCUTIVES ayant la même date, en conservant l'ordre reçu
 * (l'ordre du serveur fait foi : date croissante ou décroissante).
 */
export function groupByDay(items: readonly Transaction[]): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: DayGroup | null = null;
  for (const t of items) {
    if (!current || current.date !== t.date) {
      current = { date: t.date, items: [], income: 0, expense: 0, net: 0 };
      groups.push(current);
    }
    current.items.push(t);
    if (t.type === 'INCOME') current.income += t.amount;
    if (t.type === 'EXPENSE') current.expense += t.amount;
    current.net = current.income - current.expense;
  }
  return groups;
}
