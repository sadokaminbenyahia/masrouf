import { describe, expect, it } from 'vitest';
import type { BalanceForecast, ForecastChartPoint } from '@/domain/ai/types';
import type { CategorySlice, MonthTotals } from '@/domain/types';
import {
  computeSavingsRates,
  describeBreakdown,
  describeForecast,
  describeMonthly,
  describeSavingsRates,
  forecastHasHistory,
  forecastIsEmpty,
  forecastMayGoNegative,
  moneyTicks,
  niceTicks,
  OTHER_KEY,
  periodSavingsRate,
  prepareDonutData,
  prepareForecastData,
  prepareMonthlyBars,
  savingsRateTicks,
  slicesTotal,
  TODAY_LABEL,
  trimLeadingEmptyMonths,
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
    expect(formatPercent(0.123)).toBe('12 %');
    expect(formatPercent(0.123, { signed: true })).toBe('+12 %');
    expect(formatPercent(-0.5, { signed: true })).toBe('−50 %');
    expect(formatPercent(0.1234, { decimals: 1 })).toBe('12,3 %');
    expect(formatPercent(0.001, { signed: true })).toBe('0 %');
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
      'Répartition des dépenses, total 4 DT : Courses 75 % (3 DT), Cafés 25 % (1 DT).',
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

describe('mois vides en tête de série', () => {
  it('commence au premier mois avec des données', () => {
    const series: MonthTotals[] = [
      { month: '2026-07', income: 0, expense: 0, net: 0 },
      { month: '2026-08', income: 0, expense: 0, net: 0 },
      { month: '2026-09', income: 0, expense: 300_000, net: -300_000 },
      { month: '2026-10', income: 0, expense: 0, net: 0 },
      { month: '2026-11', income: 1_000, expense: 0, net: 1_000 },
    ];
    expect(trimLeadingEmptyMonths(series).map((m) => m.month)).toEqual([
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(trimLeadingEmptyMonths(series.slice(0, 2))).toEqual([]);
  });
});

describe("taux d'épargne", () => {
  it('définition du domaine, null sans revenu, mois en cours exclu', () => {
    expect(computeSavingsRates(months).map((d) => d.rate)).toEqual([null, 0.25, -0.25]);
    const withCurrent = computeSavingsRates(months, '2026-11');
    expect(withCurrent.map((d) => d.rate)).toEqual([null, 0.25, null]);
    expect(withCurrent.map((d) => d.partial)).toEqual([false, false, true]);
    // Les versements vers le groupe « Épargne » ne réduisent pas le taux
    const groups = new Map([['2026-10', 500_000]]);
    expect(computeSavingsRates(months, '2026-11', groups)[1]?.rate).toBe(0.5);
  });

  it('moyenne des mois terminés (mois en cours exclu)', () => {
    // Σ (revenus − dépenses) / Σ revenus sur septembre et octobre : (−300 + 500) / 2000
    expect(periodSavingsRate(months, '2026-11-04')).toBeCloseTo(0.1);
    // novembre terminé : (−300 + 500 − 500) / 4000
    expect(periodSavingsRate(months, '2026-12-01')).toBeCloseTo(-0.075);
    expect(
      periodSavingsRate([{ month: '2026-01', income: 0, expense: 10, net: -10 }], '2026-02-01'),
    ).toBeNull();
  });

  it('graduations en % entiers par pas de 10 %, incluant 0 et le repère', () => {
    const ticks = savingsRateTicks(computeSavingsRates(months), 0.2);
    expect(ticks[0]).toBeLessThanOrEqual(-0.25);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(0.3);
    expect(ticks).toContain(0);
    for (const t of ticks) expect(Math.abs(Math.round(t * 100) % 10)).toBe(0);
  });

  it('décrit la courbe', () => {
    const text = describeSavingsRates(computeSavingsRates(months));
    expect(text).toContain('Dernier mois : −25 %');
    expect(text).toContain('Meilleur mois : octobre 2026 (25 %)');
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

  it('ancien format : point d’ancrage déjà fourni (expected = actual)', () => {
    const data = prepareForecastData([
      { month: '2026-09', actual: 900, expected: null, low: null, high: null },
      { month: '2026-10', actual: 1_000, expected: 1_000, low: 1_000, high: 1_000 },
      { month: '2026-11', actual: null, expected: 1_100, low: 900, high: 1_300 },
    ]);
    expect(data).toHaveLength(3);
    expect(data[1]?.expected).toBe(1_000);
    expect(data.some((d) => d.today)).toBe(false);
  });

  it('solde du jour sur le mois courant : point « auj. » puis fin de mois prévue', () => {
    const data = prepareForecastData([
      { month: '2026-09', actual: 900, expected: null, low: null, high: null },
      // ancrage de l'ancien format, à ignorer : la prévision part d'aujourd'hui
      { month: '2026-10', actual: 1_000, expected: 1_000, low: 1_000, high: 1_000 },
      { month: '2026-11', actual: 1_050, expected: 1_200, low: 1_100, high: 1_300 },
      { month: '2026-12', actual: null, expected: 1_400, low: 1_000, high: 1_800 },
    ]);
    expect(data.map((d) => d.label)).toEqual([
      'sept. 26',
      'oct. 26',
      TODAY_LABEL,
      'nov. 26',
      'déc. 26',
    ]);
    expect(new Set(data.map((d) => d.key)).size).toBe(data.length);
    expect(data[1]?.expected).toBeNull();
    expect(data[1]?.band).toBeNull();
    const today = data[2];
    expect(today).toMatchObject({ today: true, actual: 1_050, expected: 1_050 });
    expect(today?.longLabel).toBe("Aujourd'hui");
    const dated = prepareForecastData(
      [{ month: '2026-11', actual: 1_050, expected: 1_200, low: 1_100, high: 1_300 }],
      '2026-11-04',
    );
    expect(dated[0]?.longLabel).toMatch(/^Aujourd'hui \(4.novembre\)$/);
    expect(today?.band).toEqual([1_050, 1_050]);
    expect(data[3]).toMatchObject({ actual: null, expected: 1_200, band: [1_100, 1_300] });
  });

  it('détecte une prévision sans historique (nouvel utilisateur)', () => {
    const empty = [
      { month: '2026-10', actual: 0, expected: 0, low: 0, high: 0 },
      { month: '2026-11', actual: null, expected: 0, low: 0, high: 0 },
    ];
    expect(forecastHasHistory({ chart: empty })).toBe(false);
    expect(forecastIsEmpty({ chart: empty, reliability: 'LOW' })).toBe(true);
    expect(forecastIsEmpty({ chart: empty, reliability: 'MEDIUM' })).toBe(false);
    expect(forecastIsEmpty({ chart, reliability: 'LOW' })).toBe(false);
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

describe('graduations rondes', () => {
  it('pas ronds en dinars, couvrant les données', () => {
    expect(moneyTicks([3_250_000, 1_500_000, -200_000])).toEqual([
      -1_000_000, 0, 1_000_000, 2_000_000, 3_000_000, 4_000_000,
    ]);
    expect(moneyTicks([2_600_000])).toEqual([0, 1_000_000, 2_000_000, 3_000_000]);
    const t = moneyTicks([5_229_000, 3_700_000, 6_537_000], false);
    expect(t[0]).toBeLessThanOrEqual(3_700_000);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(6_537_000);
    expect(t.length).toBeLessThanOrEqual(6);
    for (const v of t) expect(v % 500_000).toBe(0);
  });

  it('cas limites', () => {
    expect(niceTicks(0, 0, { unit: 1000 })).toEqual([0, 1000]);
    expect(niceTicks(0, 3, { unit: 1 })).toEqual([0, 1, 2, 3]);
    expect(niceTicks(0, 0.43, { unit: 0.1, allowQuarter: false })).toEqual([
      0, 0.1, 0.2, 0.3, 0.4, 0.5,
    ]);
    expect(niceTicks(Number.NaN, 1, { unit: 1 })).toEqual([0]);
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
