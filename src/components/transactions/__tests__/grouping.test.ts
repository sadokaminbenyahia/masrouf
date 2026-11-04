import { describe, expect, it } from 'vitest';
import { groupByDay } from '../grouping';
import { pluralize } from '../text';
import { tx } from './fixtures';

describe('groupByDay', () => {
  it('regroupe les jours consécutifs avec leurs totaux (virements exclus)', () => {
    const groups = groupByDay([
      tx({ id: '1', date: '2026-11-04', type: 'EXPENSE', amount: 3_500 }),
      tx({ id: '2', date: '2026-11-04', type: 'INCOME', amount: 10_000 }),
      tx({ id: '3', date: '2026-11-04', type: 'TRANSFER', amount: 50_000 }),
      tx({ id: '4', date: '2026-11-03', type: 'EXPENSE', amount: 2_000 }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      date: '2026-11-04',
      income: 10_000,
      expense: 3_500,
      net: 6_500,
    });
    expect(groups[0]?.items.map((t) => t.id)).toEqual(['1', '2', '3']);
    expect(groups[1]).toMatchObject({ date: '2026-11-03', net: -2_000 });
  });

  it('conserve l’ordre reçu (tri croissant) et gère la liste vide', () => {
    expect(groupByDay([])).toEqual([]);
    const groups = groupByDay([
      tx({ id: '1', date: '2026-11-01' }),
      tx({ id: '2', date: '2026-11-02' }),
    ]);
    expect(groups.map((g) => g.date)).toEqual(['2026-11-01', '2026-11-02']);
  });
});

describe('pluralize', () => {
  it('accorde selon le nombre', () => {
    expect(pluralize(0, 'transaction', 'transactions')).toBe('0 transaction');
    expect(pluralize(1, 'transaction', 'transactions')).toBe('1 transaction');
    expect(pluralize(2, 'transaction', 'transactions')).toBe('2 transactions');
  });
});
