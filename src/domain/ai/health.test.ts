import { describe, expect, it } from 'vitest';
import type { BudgetProgress, GoalProgress, MonthTotals } from '../types';
import { computeHealthScore, HEALTH_WEIGHTS } from './health';
import type { HealthInput } from './types';

const TODAY = '2026-03-18';
const mt = (month: string, income: number, expense: number): MonthTotals => ({
  month,
  income,
  expense,
  net: income - expense,
});

function budget(level: BudgetProgress['level']): BudgetProgress {
  return {
    budget: { id: 'b', categoryId: 'c', amount: 100_000, sortOrder: 0 },
    category: {
      id: 'c',
      name: 'C',
      kind: 'EXPENSE',
      group: 'WANTS',
      icon: 'Tag',
      color: '#000000',
      sortOrder: 0,
    },
    month: '2026-03',
    spent: 0,
    remaining: 0,
    ratio: 0,
    level,
    projected: null,
    projectedOverrun: false,
  };
}

function goal(status: GoalProgress['status'], ratio: number): GoalProgress {
  return {
    id: 'g',
    name: 'G',
    targetAmount: 1_000_000,
    savedAmount: Math.round(ratio * 1_000_000),
    targetDate: null,
    icon: 'PiggyBank',
    color: '#000000',
    sortOrder: 0,
    completedAt: null,
    ratio,
    remaining: 0,
    monthlyNeeded: null,
    monthsLeft: null,
    status,
  };
}

const BASE: HealthInput = {
  today: TODAY,
  monthly: [
    mt('2025-12', 2_000_000, 1_600_000),
    mt('2026-01', 2_000_000, 1_600_000),
    mt('2026-02', 2_000_000, 1_600_000),
    mt('2026-03', 500_000, 900_000),
  ],
  totalBalance: 4_800_000,
  fixedMonthlyCharges: 700_000,
  groupSpending: { needs: 800_000, wants: 500_000, savings: 300_000 },
  budgets: [budget('OK'), budget('WARNING'), budget('OK'), budget('EXCEEDED')],
  goals: [goal('ON_TRACK', 0.6)],
};

const byKey = (s: ReturnType<typeof computeHealthScore>, key: string) =>
  s.components.find((c) => c.key === key);

describe('computeHealthScore', () => {
  it('cas complet calculé à la main', () => {
    const s = computeHealthScore(BASE);
    expect(byKey(s, 'SAVINGS_RATE')?.score).toBe(100); // 20 %
    expect(byKey(s, 'EMERGENCY_FUND')?.score).toBe(60); // 3 mois
    expect(byKey(s, 'FIXED_CHARGES')?.score).toBe(100); // 35 %
    expect(byKey(s, 'BUDGET_DISCIPLINE')?.score).toBe(75); // 3/4
    expect(byKey(s, 'STABILITY')?.score).toBe(100); // CV 0
    expect(byKey(s, 'TREND')?.score).toBe(80); // stable
    expect(byKey(s, 'GOALS')?.score).toBe(88); // 70 + 30 × 0,6
    // 25 + 12 + 15 + 11,25 + 10 + 8 + 4,4 = 85,65
    expect(s.score).toBe(86);
    expect(s.grade).toBe('EXCELLENT');
    expect(s.components.reduce((sum, c) => sum + c.weight, 0)).toBeCloseTo(1, 10);
    expect(s.topAdvice).toMatch(/fonds d’urgence/);
    expect(s.summary).toMatch(/excellente \(86\/100\)/);
  });

  it('données manquantes : sous-scores écartés et poids renormalisés', () => {
    const s = computeHealthScore({
      ...BASE,
      totalBalance: 5_400_000,
      monthly: [mt('2026-01', 2_000_000, 1_800_000), mt('2026-02', 2_000_000, 1_800_000)],
      budgets: [],
      goals: [],
    });
    expect(s.components.map((c) => c.key)).toEqual([
      'SAVINGS_RATE',
      'EMERGENCY_FUND',
      'FIXED_CHARGES',
    ]);
    const total =
      HEALTH_WEIGHTS.SAVINGS_RATE + HEALTH_WEIGHTS.EMERGENCY_FUND + HEALTH_WEIGHTS.FIXED_CHARGES;
    expect(byKey(s, 'SAVINGS_RATE')?.weight).toBeCloseTo(0.25 / total, 10);
    // épargne 10 % → 50 ; couverture 5 400/1 800 = 3 mois → 60 ; charges 35 % → 100
    expect(byKey(s, 'SAVINGS_RATE')?.score).toBe(50);
    expect(byKey(s, 'EMERGENCY_FUND')?.score).toBe(60);
    // (12,5 + 12 + 15) / 0,6 = 65,83
    expect(s.score).toBe(66);
  });

  it('aucune donnée : score neutre', () => {
    const s = computeHealthScore({ ...BASE, monthly: [], budgets: [], goals: [] });
    expect(s.score).toBe(50);
    expect(s.components).toHaveLength(0);
    expect(s.grade).toBe('MOYEN');
  });

  it('situation fragile : épargne négative, solde négatif, charges lourdes, dépenses en hausse', () => {
    const s = computeHealthScore({
      ...BASE,
      monthly: [
        mt('2025-12', 1_000_000, 800_000),
        mt('2026-01', 1_000_000, 1_000_000),
        mt('2026-02', 1_000_000, 1_600_000),
      ],
      totalBalance: -200_000,
      fixedMonthlyCharges: 800_000,
      budgets: [budget('EXCEEDED')],
      goals: [goal('OVERDUE', 0.1), goal('AT_RISK', 0.5)],
    });
    expect(byKey(s, 'SAVINGS_RATE')?.score).toBe(0);
    expect(byKey(s, 'SAVINGS_RATE')?.explanation).toMatch(/négative/);
    expect(byKey(s, 'EMERGENCY_FUND')?.score).toBe(0);
    expect(byKey(s, 'FIXED_CHARGES')?.score).toBe(0);
    expect(byKey(s, 'BUDGET_DISCIPLINE')?.score).toBe(0);
    expect(byKey(s, 'TREND')?.score).toBe(0);
    expect(byKey(s, 'GOALS')?.explanation).toMatch(/en retard/);
    expect(s.grade).toBe('FRAGILE');
  });

  it('fonds d’urgence au-delà de 3 mois et objectifs atteints', () => {
    const s = computeHealthScore({
      ...BASE,
      totalBalance: 7_200_000,
      goals: [goal('COMPLETED', 1), goal('NO_DEADLINE', 0.5)],
      budgets: [budget('OK')],
    });
    expect(byKey(s, 'EMERGENCY_FUND')?.score).toBe(80); // 4,5 mois
    expect(byKey(s, 'GOALS')?.score).toBe(88); // (100 + 75) / 2
    expect(byKey(s, 'BUDGET_DISCIPLINE')?.explanation).toMatch(/Aucun/);
  });

  it('tout au vert : conseil de maintien', () => {
    const s = computeHealthScore({
      ...BASE,
      totalBalance: 20_000_000,
      monthly: [
        mt('2025-12', 2_000_000, 1_000_000),
        mt('2026-01', 2_000_000, 950_000),
        mt('2026-02', 2_000_000, 900_000),
      ],
      budgets: [budget('OK')],
      goals: [goal('COMPLETED', 1)],
    });
    expect(s.score).toBe(100);
    expect(s.topAdvice).toMatch(/continuez/);
  });

  it('score toujours entier entre 0 et 100', () => {
    for (let i = 0; i < 60; i++) {
      const inc = (i * 7919) % 3_000_000;
      const exp = (i * 104_729) % 3_500_000;
      const s = computeHealthScore({
        ...BASE,
        monthly: [
          mt('2025-12', inc, exp),
          mt('2026-01', inc, exp + i * 1000),
          mt('2026-02', inc / 2, exp),
        ],
        totalBalance: (i - 30) * 100_000,
        fixedMonthlyCharges: i * 20_000,
      });
      expect(Number.isInteger(s.score)).toBe(true);
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
      for (const c of s.components) expect(Number.isInteger(c.score)).toBe(true);
    }
  });
});
