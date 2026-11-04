import { describe, expect, it } from 'vitest';
import { formatMoney } from '../money';
import type { MonthTotals } from '../types';
import { baselineMonthlySaving, monthsToReach, simulateWhatIf } from './simulator';
import type { WhatIfInput } from './types';

const TODAY = '2026-03-18';
const mt = (month: string, income: number, expense: number): MonthTotals => ({
  month,
  income,
  expense,
  net: income - expense,
});

const MONTHLY = [
  mt('2025-11', 2_000_000, 2_500_000),
  mt('2025-12', 2_000_000, 1_700_000),
  mt('2026-01', 2_000_000, 1_600_000),
  mt('2026-02', 2_000_000, 1_650_000),
  mt('2026-03', 2_000_000, 2_100_000),
];

function input(over: Partial<WhatIfInput> = {}): WhatIfInput {
  return {
    today: TODAY,
    goal: { id: 'g1', name: 'Voyage à Djerba', targetAmount: 1_500_000, savedAmount: 600_000, targetDate: null },
    monthly: MONTHLY,
    categorySpending: [
      { categoryId: 'resto', name: 'Restaurants', monthlyAverage: 200_000 },
      { categoryId: 'cafes', name: 'Cafés', monthlyAverage: 90_000 },
    ],
    adjustments: [{ categoryId: 'resto', percent: 20 }],
    extraMonthlySaving: 60_000,
    ...over,
  };
}

describe('baselineMonthlySaving', () => {
  it('médiane des 3 derniers mois complets (mois courant exclu)', () => {
    // nets : 300 000, 400 000, 350 000 → médiane 350 000
    expect(baselineMonthlySaving(MONTHLY, TODAY)).toBe(350_000);
  });
  it('utilise le mois courant à défaut de mois complets', () => {
    expect(baselineMonthlySaving([mt('2026-03', 1_000_000, 800_000)], TODAY)).toBe(200_000);
  });
  it('médiane paire et liste vide', () => {
    expect(baselineMonthlySaving([mt('2026-01', 100, 0), mt('2026-02', 300, 0)], TODAY)).toBe(200);
    expect(baselineMonthlySaving([], TODAY)).toBe(0);
  });
});

describe('monthsToReach', () => {
  it('cas limites', () => {
    expect(monthsToReach(0, 0)).toBe(0);
    expect(monthsToReach(1000, 0)).toBeNull();
    expect(monthsToReach(1000, -5)).toBeNull();
    expect(monthsToReach(1000, 300)).toBe(4);
    expect(monthsToReach(1_000_000, 1)).toBeNull();
  });
});

describe('simulateWhatIf', () => {
  it('scénario chiffré à la main', () => {
    const r = simulateWhatIf(input());
    expect(r.baselineMonthlySaving).toBe(350_000);
    // 350 000 + 20 % × 200 000 + 60 000
    expect(r.scenarioMonthlySaving).toBe(450_000);
    // reste 900 000 : ⌈900/350⌉ = 3 mois ; ⌈900/450⌉ = 2 mois
    expect(r.baselineDate).toBe('2026-06-18');
    expect(r.scenarioDate).toBe('2026-05-18');
    expect(r.monthsSaved).toBe(1);
    expect(r.timeline).toHaveLength(12);
    expect(r.timeline[0]).toEqual({ month: '2026-04', baseline: 950_000, scenario: 1_050_000 });
    expect(r.timeline[1]).toEqual({ month: '2026-05', baseline: 1_300_000, scenario: 1_500_000 });
    expect(r.timeline[2]?.baseline).toBe(1_500_000);
    expect(r.message).toBe(
      `En réduisant Restaurants de 20 % et épargnant ${formatMoney(60_000, { decimals: 0 })} de plus par mois, vous atteignez « Voyage à Djerba » en mai 2026, 1 mois plus tôt.`,
    );
    for (const p of r.timeline) {
      expect(Number.isSafeInteger(p.baseline)).toBe(true);
      expect(Number.isSafeInteger(p.scenario)).toBe(true);
    }
  });

  it('épargne ≤ 0 : jamais atteint (dates null)', () => {
    const r = simulateWhatIf(
      input({ monthly: [mt('2026-01', 1_000, 2_000)], adjustments: [], extraMonthlySaving: 0 }),
    );
    expect(r.baselineMonthlySaving).toBe(-1_000);
    expect(r.baselineDate).toBeNull();
    expect(r.scenarioDate).toBeNull();
    expect(r.monthsSaved).toBeNull();
    expect(r.timeline).toHaveLength(12);
    expect(r.timeline.every((p) => p.baseline === 600_000)).toBe(true);
    expect(r.message).toMatch(/ne serait pas atteint/);
  });

  it('scénario insuffisant malgré les réglages', () => {
    const r = simulateWhatIf(
      input({ monthly: [mt('2026-01', 0, 500_000)], adjustments: [{ categoryId: 'cafes', percent: 50 }], extraMonthlySaving: 0 }),
    );
    expect(r.scenarioMonthlySaving).toBe(-455_000);
    expect(r.message).toMatch(/resterait de/);
  });

  it('seul le scénario atteint l’objectif : mois gagnés non calculables', () => {
    const r = simulateWhatIf(input({ monthly: [mt('2026-02', 1_000_000, 1_000_000)] }));
    expect(r.baselineDate).toBeNull();
    expect(r.scenarioDate).not.toBeNull();
    expect(r.monthsSaved).toBeNull();
    expect(r.message).toMatch(/alors qu'au rythme actuel/);
  });

  it('objectif déjà atteint', () => {
    const r = simulateWhatIf(
      input({ goal: { id: 'g', name: 'Vélo', targetAmount: 500_000, savedAmount: 700_000, targetDate: null } }),
    );
    expect(r.baselineDate).toBe(TODAY);
    expect(r.scenarioDate).toBe(TODAY);
    expect(r.monthsSaved).toBe(0);
    expect(r.message).toMatch(/déjà atteint/);
    expect(r.timeline.every((p) => p.baseline === 700_000)).toBe(true);
  });

  it('sans réglage : rythme actuel ; échéance tenue ou non', () => {
    const r = simulateWhatIf(
      input({
        adjustments: [],
        extraMonthlySaving: 0,
        goal: { id: 'g', name: 'Voyage', targetAmount: 1_500_000, savedAmount: 600_000, targetDate: '2026-12-01' },
      }),
    );
    expect(r.monthsSaved).toBe(0);
    expect(r.message).toMatch(/^À votre rythme actuel/);
    expect(r.message).toMatch(/échéance \(décembre 2026\) est tenue/);
    const late = simulateWhatIf(
      input({
        adjustments: [],
        extraMonthlySaving: 0,
        goal: { id: 'g', name: 'Voyage', targetAmount: 1_500_000, savedAmount: 600_000, targetDate: '2026-04-01' },
      }),
    );
    expect(late.message).toMatch(/il faudra épargner davantage/);
  });

  it('même échéance malgré un réglage ; réglages ignorés ou bornés', () => {
    const r = simulateWhatIf(
      input({
        adjustments: [
          { categoryId: 'cafes', percent: 1 },
          { categoryId: 'inconnue', percent: 50 },
          { categoryId: 'resto', percent: 0 },
        ],
        extraMonthlySaving: 0,
      }),
    );
    expect(r.scenarioMonthlySaving).toBe(350_900);
    expect(r.monthsSaved).toBe(0);
    expect(r.message).toMatch(/à la même échéance/);
    const capped = simulateWhatIf(input({ adjustments: [{ categoryId: 'resto', percent: 150 }], extraMonthlySaving: 0 }));
    expect(capped.scenarioMonthlySaving).toBe(550_000);
  });

  it('projection prolongée jusqu’à l’atteinte, plafonnée à 120 mois', () => {
    const long = simulateWhatIf(
      input({
        goal: { id: 'g', name: 'Maison', targetAmount: 11_100_000, savedAmount: 600_000, targetDate: null },
        adjustments: [],
        extraMonthlySaving: 0,
      }),
    );
    // 10 500 000 / 350 000 = 30 mois
    expect(long.timeline).toHaveLength(30);
    const never = simulateWhatIf(
      input({
        goal: { id: 'g', name: 'Île', targetAmount: 100_000_000_000, savedAmount: 0, targetDate: null },
        adjustments: [],
        extraMonthlySaving: 0,
      }),
    );
    expect(never.baselineDate).toBeNull();
    expect(never.timeline).toHaveLength(12);
  });
});
