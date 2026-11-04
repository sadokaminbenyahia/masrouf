import { describe, expect, it } from 'vitest';
import {
  averageSavingsRate,
  monthlySavingsRates,
  savedAmount,
  savingsRate,
  withSavingsGroup,
} from './savings';

describe('savingsRate', () => {
  it('les versements vers le groupe Épargne sont de l’épargne', () => {
    const t = { income: 2_000_000, expense: 1_800_000, savingsGroupExpense: 300_000 };
    expect(savedAmount(t)).toBe(500_000);
    expect(savingsRate(t)).toBeCloseTo(0.25);
  });

  it('négatif si dépenses > revenus ; null sans revenu', () => {
    expect(savingsRate({ income: 1_000, expense: 1_500, savingsGroupExpense: 0 })).toBeCloseTo(-0.5);
    expect(savingsRate({ income: 0, expense: 1_500, savingsGroupExpense: 0 })).toBeNull();
  });
});

describe('averageSavingsRate', () => {
  const months = [
    { month: '2026-09', income: 2_000_000, expense: 1_500_000, savingsGroupExpense: 0 },
    { month: '2026-10', income: 2_000_000, expense: 2_000_000, savingsGroupExpense: 500_000 },
    // Mois courant partiel : salaire reçu, peu de dépenses → taux trompeur.
    { month: '2026-11', income: 2_000_000, expense: 100_000, savingsGroupExpense: 0 },
  ];

  it('pondéré par les revenus, mois courant partiel exclu par défaut', () => {
    expect(averageSavingsRate(months, { today: '2026-11-04' })).toBeCloseTo(0.25);
    expect(
      averageSavingsRate(months, { today: '2026-11-04', excludePartialCurrent: false }),
    ).toBeCloseTo((500_000 + 500_000 + 1_900_000) / 6_000_000);
    expect(averageSavingsRate(months)).toBeCloseTo(2_900_000 / 6_000_000);
  });

  it('null s’il ne reste aucun revenu', () => {
    expect(averageSavingsRate([], { today: '2026-11-04' })).toBeNull();
    expect(averageSavingsRate(months.slice(2), { today: '2026-11-04' })).toBeNull();
  });
});

describe('monthlySavingsRates', () => {
  it('taux par mois, groupe Épargne inclus', () => {
    const monthly = [
      { month: '2026-09', income: 1_000_000, expense: 900_000, net: 100_000 },
      { month: '2026-10', income: 0, expense: 50_000, net: -50_000 },
    ];
    const groups = new Map([['2026-09', 100_000]]);
    expect(withSavingsGroup(monthly, groups)[1]?.savingsGroupExpense).toBe(0);
    const rates = monthlySavingsRates(monthly, groups);
    expect(rates[0]?.rate).toBeCloseTo(0.2);
    expect(rates[1]).toEqual({ month: '2026-10', rate: null });
  });
});
