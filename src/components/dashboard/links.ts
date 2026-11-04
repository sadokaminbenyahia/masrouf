/**
 * Construction PURE des liens vers /transactions filtrées (contrat d'URL de l'agent B :
 * ?categoryId=…&from=…&to=…&type=…&q=…&accountId=…, plus uncategorized=1).
 */
import { addDays, monthRange, type DateRange, type ISODate, type YearMonth } from '@/domain/dates';
import type { Anomaly } from '@/domain/ai/types';

export type TransactionsFilter = {
  q?: string;
  categoryId?: string;
  uncategorized?: boolean;
  type?: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  from?: ISODate;
  to?: ISODate;
  accountId?: string;
};

/** Ordre stable des paramètres (URL lisibles, tests déterministes). */
export function transactionsHref(filter: TransactionsFilter = {}): string {
  const params = new URLSearchParams();
  if (filter.q !== undefined && filter.q.trim() !== '') params.set('q', filter.q.trim());
  if (filter.categoryId !== undefined) params.set('categoryId', filter.categoryId);
  if (filter.uncategorized) params.set('uncategorized', '1');
  if (filter.accountId !== undefined) params.set('accountId', filter.accountId);
  if (filter.from !== undefined) params.set('from', filter.from);
  if (filter.to !== undefined) params.set('to', filter.to);
  if (filter.type !== undefined) params.set('type', filter.type);
  const qs = params.toString();
  return qs === '' ? '/transactions' : `/transactions?${qs}`;
}

/** Transactions d'une catégorie (ou « sans catégorie » si null) sur une période. */
export function categoryTransactionsHref(
  categoryId: string | null,
  range: DateRange,
  type: 'EXPENSE' | 'INCOME' = 'EXPENSE',
): string {
  return transactionsHref({
    ...(categoryId === null ? { uncategorized: true } : { categoryId }),
    from: range.from,
    to: range.to,
    type,
  });
}

/** Transactions d'un mois. */
export function monthTransactionsHref(month: YearMonth, type?: 'EXPENSE' | 'INCOME'): string {
  const range = monthRange(month);
  return transactionsHref({ from: range.from, to: range.to, ...(type ? { type } : {}) });
}

/** Une transaction précise : recherche par libellé le jour même. */
export function transactionLabelHref(label: string, date: ISODate): string {
  return transactionsHref({ q: label, from: date, to: date });
}

/** Transactions concernées par une anomalie (± 2 jours pour un doublon suspect). */
export function anomalyTransactionsHref(anomaly: Pick<Anomaly, 'kind' | 'date'>): string {
  const margin = anomaly.kind === 'DUPLICATE' ? 2 : 0;
  return transactionsHref({
    from: addDays(anomaly.date, -margin),
    to: addDays(anomaly.date, margin),
  });
}
