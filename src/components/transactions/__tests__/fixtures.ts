import type { TransactionPage } from '@/app/actions/transactions';
import type { Transaction } from '@/domain/types';

export function tx(overrides: Partial<Transaction> & { id: string }): Transaction {
  return {
    accountId: 'acc1',
    categoryId: 'cat1',
    type: 'EXPENSE',
    amount: 1_000,
    date: '2026-11-04',
    label: 'Café',
    note: null,
    tags: [],
    transferAccountId: null,
    recurringId: null,
    categorySource: 'USER',
    aiConfidence: null,
    createdAt: '2026-11-04T08:00:00.000Z',
    ...overrides,
  };
}

export function pageOf(
  items: Transaction[],
  extra: Partial<TransactionPage> = {},
): TransactionPage {
  let income = 0;
  let expense = 0;
  for (const t of items) {
    if (t.type === 'INCOME') income += t.amount;
    if (t.type === 'EXPENSE') expense += t.amount;
  }
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 25,
    pageCount: 1,
    totals: { income, expense, net: income - expense, count: items.length },
    ...extra,
  };
}
