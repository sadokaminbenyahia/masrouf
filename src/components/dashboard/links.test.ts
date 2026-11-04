import { describe, expect, it } from 'vitest';
import {
  anomalyTransactionsHref,
  categoryTransactionsHref,
  monthTransactionsHref,
  transactionLabelHref,
  transactionsHref,
} from './links';

describe('liens vers les transactions', () => {
  it('sans filtre', () => {
    expect(transactionsHref()).toBe('/transactions');
    expect(transactionsHref({ q: '   ' })).toBe('/transactions');
  });

  it('catégorie et période', () => {
    expect(categoryTransactionsHref('cat_1', { from: '2026-11-01', to: '2026-11-30' })).toBe(
      '/transactions?categoryId=cat_1&from=2026-11-01&to=2026-11-30&type=EXPENSE',
    );
  });

  it('sans catégorie', () => {
    expect(categoryTransactionsHref(null, { from: '2026-11-01', to: '2026-11-30' })).toBe(
      '/transactions?uncategorized=1&from=2026-11-01&to=2026-11-30&type=EXPENSE',
    );
  });

  it('mois', () => {
    expect(monthTransactionsHref('2026-02')).toBe('/transactions?from=2026-02-01&to=2026-02-28');
    expect(monthTransactionsHref('2026-02', 'INCOME')).toBe(
      '/transactions?from=2026-02-01&to=2026-02-28&type=INCOME',
    );
  });

  it('libellé encodé', () => {
    expect(transactionLabelHref('Café & thé', '2026-11-03')).toBe(
      '/transactions?q=Caf%C3%A9+%26+th%C3%A9&from=2026-11-03&to=2026-11-03',
    );
  });

  it('anomalies : jour même ou ± 2 jours pour un doublon', () => {
    expect(anomalyTransactionsHref({ kind: 'UNUSUAL_AMOUNT', date: '2026-11-03' })).toBe(
      '/transactions?from=2026-11-03&to=2026-11-03',
    );
    expect(anomalyTransactionsHref({ kind: 'DUPLICATE', date: '2026-11-01' })).toBe(
      '/transactions?from=2026-10-30&to=2026-11-03',
    );
  });
});
