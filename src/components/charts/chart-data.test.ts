import { describe, expect, it } from 'vitest';
import type { BalanceForecast, ForecastChartPoint } from '@/domain/ai/types';
import type { CategorySlice, MonthTotals } from '@/domain/types';
import {
  averageSavingsRate,
  computeSavingsRates,
  describeBreakdown,
  describeForecast,
  describeMonthly,
  describeSavingsRates,
  forecastMayGoNegative,
  OTHER_KEY,
  prepareDonutData,
  prepareForecastData,
  prepareMonthlyBars,
  savingsRate,
  slicesTotal,
  UNCATEGORIZED_KEY,
} from './chart-data';
import { categoryColor, chartVar } from './colors';
import { formatPercent } from './format';

const money = (m: number) => `${m / 1000} DT`;

function slice(id: string | null, amount: number, color = '#112233'): CategorySlice {
  return {
    categoryId: id,
    name: id ?? 'Sans catégorie',
    color,
    icon: 'Tag',
    amount,
    share: 0,
    count: 1,
  };
}

describe('colors', () => {
  it('cycle de palette borné à 8 et couleur de catégorie prioritaire', () => {
    expect(chartVar(0)).toBe('var(--chart-1)');
    expect(chartVar(7)).toBe('var(--chart-8)');
    expect(chartVar(8)).toBe('var(--chart-1)');
    expect(categoryColor('#AABBCC', 3)).toBe('#AABBCC');
    expect(categoryColor('rouge', 3)).toBe('var(--chart-4)');
    expect(categoryColor(null, 0)).toBe('var(--chart-1)');
  });
});

describe('formatPercent', () => {
  it('formate à la française avec signe optionnel', () => {
    expect(formatPercent(0.123)).toBe('12 %');
    expect(formatPercent(0.123, { signed: true })).toBe('+12 %');
    expect(formatPercent(-0.5, { signed: true })).toBe('−50 %');
    expect(formatPercent(0.1234, { decimals: 1 })).toBe('12,3 %');
    expect(formatPercent(0.001, { signed: true })).toBe('0 %');
  });
});

describe('prepareDonutData', () => {
  it('trie, recalcule les parts et écarte les montants nuls', () => {
    const data = prepareDonutData([
      slice('a', 1000),
      slice('b', 3000),
      slice('z', 0),
      slice(null, 1000),
    ]);
    expect(data.map((d) => d.key)).toEqual(['b', 'a', UNCATEGORIZED_KEY]);
    expect(data[0]?.share).toBeCloseTo(0.6);
    expect(slicesTotal([slice('a', 1000), slice('b', 3000)])).toBe(4000);
  });

  it('regroupe au-delà de maxSlices dans « Autres »', () => {
    const slices = Array.from({ length: 10 }, (_, i) => slice(`c${i}`, (10 - i) * 1000, 'x'));
    const data = prepareDonutData(slices, 7);
    expect(data).toHaveLength(8);
    const other = data[7];
    expect(other?.key).toBe(OTHER_KEY);
    expect(other?.slice).toBeNull();
    expect(other?.amount).toBe(3000 + 2000 + 1000);
    expect(other?.name).toBe('Autres (3)');
    // couleur de repli selon l'index d'origine, pas le rang
    expect(data[0]?.color).toBe('var(--chart-1)');
  });

  it('ne regroupe pas si une seule tranche dépasse', () => {
    const slices = Array.from({ length: 8 }, (_, i) => slice(`c${i}`, 1000 + i));
    expect(prepareDonutData(slices, 7)).toHaveLength(8);
  });

  it('décrit la répartition', () => {
    expect(describeBreakdown([], money)).toContain('aucune dépense');
    const text = describeBreakdown(
      prepareDonutData([slice('Courses', 3000), slice('Cafés', 1000)]),
      money,
    );
    expect(text).toBe(
      'Répartition des dépenses, total 4 DT : Courses 75 % (3 DT), Cafés 25 % (1 DT).',
    );
  });
});

const months: MonthTotals[] = [
  { month: '2026-10', income: 2_000_000, expense: 1_500_000, net: 500_000 },
  { month: '2026-09', income: 0, expense: 300_000, net: -300_000 },
  { month: '2026-11', income: 2_000_000, expense: 2_500_000, net: -500_000 },
];

describe('séries mensuelles', () => {
  it('trie chronologiquement et ajoute les libellés', () => {
    const data = prepareMonthlyBars(months);
    expect(data.map((d) => d.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(data[1]?.label).toBe('oct. 26');
    expect(data[1]?.longLabel).toBe('octobre 2026');
  });

  it('décrit la série', () => {
    const text = describeMonthly(prepareMonthlyBars(months), money);
    expect(text).toContain('de septembre 2026 à novembre 2026');
    expect(text).toContain('Mois le plus dépensier : novembre 2026 (2500 DT)');
    expect(describeMonthly([], money)).toContain('aucune donnée');
  });
});

describe("taux d'épargne", () => {
  it('calcule net / revenus, null sans revenu', () => {
    expect(savingsRate({ income: 2_000_000, net: 500_000 })).toBe(0.25);
    expect(savingsRate({ income: 0, net: -300_000 })).toBeNull();
    expect(computeSavingsRates(months).map((d) => d.rate)).toEqual([null, 0.25, -0.25]);
  });

  it('moyenne pondérée sur les mois avec revenus', () => {
    expect(averageSavingsRate(months)).toBe(0);
    expect(averageSavingsRate([{ month: '2026-01', income: 0, expense: 10, net: -10 }])).toBeNull();
  });

  it('décrit la courbe', () => {
    const text = describeSavingsRates(computeSavingsRates(months));
    expect(text).toContain('Dernier mois : −25 %');
    expect(text).toContain('Meilleur mois : octobre 2026 (25 %)');
    expect(describeSavingsRates([])).toContain('aucun revenu');
  });
});

describe('prévision', () => {
  const chart: ForecastChartPoint[] = [
    { month: '2026-10', actual: 1_000_000, expected: null, low: null, high: null },
    { month: '2026-11', actual: 1_200_000, expected: null, low: null, high: null },
    { month: '2026-12', actual: null, expected: 900_000, low: 700_000, high: 1_100_000 },
  ];

  it('relie la prévision au dernier solde réel', () => {
    const data = prepareForecastData(chart);
    expect(data[0]?.expected).toBeNull();
    expect(data[1]?.expected).toBe(1_200_000);
    expect(data[1]?.band).toEqual([1_200_000, 1_200_000]);
    expect(data[2]?.band).toEqual([700_000, 1_100_000]);
  });

  it('ne modifie pas un point réel ayant déjà une prévision', () => {
    const data = prepareForecastData([
      { month: '2026-11', actual: 5, expected: 6, low: 4, high: 8 },
      { month: '2026-12', actual: null, expected: 7, low: 3, high: 9 },
    ]);
    expect(data[0]?.expected).toBe(6);
    expect(data[0]?.band).toEqual([4, 8]);
  });

  const point = (expected: number, low: number) => ({
    date: '2026-11-30',
    expected,
    low,
    high: expected + 10,
  });
  const base: BalanceForecast = {
    reliability: 'MEDIUM',
    endOfMonth: point(1000, 500),
    months: [point(1000, 200)],
    chart,
    monthlyNetEstimate: 0,
    explanation: '',
  };

  it('détecte un passage sous zéro', () => {
    expect(forecastMayGoNegative(base)).toBe(false);
    expect(forecastMayGoNegative({ ...base, months: [point(100, -50)] })).toBe(true);
  });

  it('décrit la prévision', () => {
    const text = describeForecast(base, money);
    expect(text).toContain('Fin du mois : 1 DT');
    expect(text).toContain('Fiabilité moyenne');
  });
});

describe('sparklinePoints', () => {
  it('normalise sur la hauteur et gère les cas limites', async () => {
    const { sparklinePoints } = await import('./sparkline');
    expect(sparklinePoints([], 32)).toEqual([]);
    expect(sparklinePoints([5], 32)).toEqual([[50, 16]]);
    expect(sparklinePoints([1, 1], 32)).toEqual([
      [0, 16],
      [100, 16],
    ]);
    expect(sparklinePoints([0, 10], 32)).toEqual([
      [0, 30],
      [100, 2],
    ]);
  });
});
