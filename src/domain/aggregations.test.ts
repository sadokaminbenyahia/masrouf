import { describe, expect, it } from 'vitest';
import {
  UNCATEGORIZED_LABEL,
  averageMillimes,
  buildCategorySlices,
  buildMonthlySeries,
  categoryMonthSums,
  savingsGroupByMonth,
  comparisonPeriod,
  dailyAllowance,
  relativeChange,
  remainingDaysInMonth,
} from './aggregations';
import type { Category } from './types';

const cat = (id: string, name: string): Category => ({
  id,
  name,
  kind: 'EXPENSE',
  group: 'NEEDS',
  icon: 'Tag',
  color: '#123456',
  sortOrder: 0,
});

describe('buildMonthlySeries', () => {
  it('remplit les mois vides et exclut les virements', () => {
    const series = buildMonthlySeries(
      ['2026-09', '2026-10', '2026-11'],
      [
        { date: '2026-09-01', type: 'INCOME', amount: 2_600_000 },
        { date: '2026-09-03', type: 'EXPENSE', amount: 750_000 },
        { date: '2026-09-04', type: 'EXPENSE', amount: 50_000 },
        { date: '2026-09-05', type: 'TRANSFER', amount: 200_000 },
        { date: '2026-11-02', type: 'EXPENSE', amount: 3_500 },
        { date: '2025-01-01', type: 'EXPENSE', amount: 999 },
      ],
    );
    expect(series).toEqual([
      { month: '2026-09', income: 2_600_000, expense: 800_000, net: 1_800_000 },
      { month: '2026-10', income: 0, expense: 0, net: 0 },
      { month: '2026-11', income: 0, expense: 3_500, net: -3_500 },
    ]);
  });
});

describe('buildCategorySlices', () => {
  it('trie par montant, calcule les parts et regroupe « Sans catégorie »', () => {
    const cats = new Map([
      ['c1', cat('c1', 'Courses')],
      ['c2', cat('c2', 'Cafés')],
    ]);
    const slices = buildCategorySlices(
      [
        { categoryId: 'c2', amount: 100_000, count: 30 },
        { categoryId: 'c1', amount: 300_000, count: 10 },
        { categoryId: null, amount: 50_000, count: 2 },
        { categoryId: 'deleted', amount: 50_000, count: 1 },
        { categoryId: 'c1', amount: 0, count: 0 },
      ],
      cats,
    );
    expect(slices.map((s) => s.name)).toEqual(['Courses', 'Cafés', UNCATEGORIZED_LABEL]);
    expect(slices.map((s) => s.share)).toEqual([0.6, 0.2, 0.2]);
    expect(slices[2]).toMatchObject({ categoryId: null, amount: 100_000, count: 3 });
    expect(slices[0]).toMatchObject({ color: '#123456', icon: 'Tag', count: 10 });
  });

  it('liste vide', () => {
    expect(buildCategorySlices([], new Map())).toEqual([]);
  });

  it('départage les montants égaux par nom', () => {
    const cats = new Map([
      ['b', cat('b', 'Loyer')],
      ['a', cat('a', 'Factures')],
    ]);
    const slices = buildCategorySlices(
      [
        { categoryId: 'b', amount: 10, count: 1 },
        { categoryId: 'a', amount: 10, count: 1 },
      ],
      cats,
    );
    expect(slices.map((s) => s.name)).toEqual(['Factures', 'Loyer']);
  });
});

describe('relativeChange', () => {
  it('null sans référence', () => {
    expect(relativeChange(100, 0)).toBeNull();
    expect(relativeChange(150, 100)).toBe(0.5);
    expect(relativeChange(50, 100)).toBe(-0.5);
  });
});

describe('reste à dépenser par jour', () => {
  it('jours restants, aujourd’hui inclus', () => {
    expect(remainingDaysInMonth('2026-11', '2026-11-04')).toBe(27);
    expect(remainingDaysInMonth('2026-11', '2026-11-30')).toBe(1);
    expect(remainingDaysInMonth('2026-10', '2026-11-04')).toBe(0);
    expect(remainingDaysInMonth('2026-12', '2026-11-04')).toBe(31);
  });

  it('divise le reste par les jours restants (arrondi inférieur)', () => {
    expect(dailyAllowance(270_000, '2026-11', '2026-11-04')).toBe(10_000);
    expect(dailyAllowance(100_000, '2026-11', '2026-11-04')).toBe(3_703);
    expect(dailyAllowance(-5_000, '2026-11', '2026-11-04')).toBe(0);
    expect(dailyAllowance(100_000, '2026-10', '2026-11-04')).toBe(0);
  });
});

describe('averageMillimes / categoryMonthSums', () => {
  it('moyenne arrondie', () => {
    expect(averageMillimes([])).toBe(0);
    expect(averageMillimes([1, 2])).toBe(2);
    expect(averageMillimes([100, 200, 300])).toBe(200);
  });

  it('regroupe par catégorie et par mois', () => {
    const sums = categoryMonthSums([
      { categoryId: 'a', date: '2026-10-01', amount: 10 },
      { categoryId: 'a', date: '2026-10-15', amount: 5 },
      { categoryId: 'a', date: '2026-11-01', amount: 7 },
      { categoryId: null, date: '2026-11-02', amount: 3 },
    ]);
    expect(sums).toEqual([
      { categoryId: 'a', month: '2026-10', amount: 15 },
      { categoryId: 'a', month: '2026-11', amount: 7 },
      { categoryId: null, month: '2026-11', amount: 3 },
    ]);
  });
});

describe('comparisonPeriod', () => {
  it('mois en cours : mois précédent « à date » (mêmes jours)', () => {
    expect(comparisonPeriod('2026-11', '2026-11-04')).toEqual({
      range: { from: '2026-10-01', to: '2026-10-04' },
      label: 'vs 1–4 octobre',
    });
    expect(comparisonPeriod('2026-11', '2026-11-01').label).toBe('vs 1er octobre');
    // 31 mars → février borné à sa fin : mois entier.
    expect(comparisonPeriod('2026-03', '2026-03-31')).toEqual({
      range: { from: '2026-02-01', to: '2026-02-28' },
      label: 'vs février',
    });
    expect(comparisonPeriod('2026-01', '2026-01-15').range).toEqual({
      from: '2025-12-01',
      to: '2025-12-15',
    });
  });

  it('mois terminé : mois précédent entier', () => {
    expect(comparisonPeriod('2026-10', '2026-11-04')).toEqual({
      range: { from: '2026-09-01', to: '2026-09-30' },
      label: 'vs septembre',
    });
  });
});

describe('savingsGroupByMonth', () => {
  it('somme les dépenses du groupe SAVINGS par mois (0 si aucune), mois hors liste ignorés', () => {
    const cats = [
      { id: 'epargne', group: 'SAVINGS' as const },
      { id: 'courses', group: 'NEEDS' as const },
    ];
    const sums = [
      { categoryId: 'epargne', date: '2026-10-02', amount: 200_000 },
      { categoryId: 'epargne', date: '2026-10-20', amount: 50_000 },
      { categoryId: 'courses', date: '2026-10-05', amount: 90_000 },
      { categoryId: null, date: '2026-11-01', amount: 10_000 },
      { categoryId: 'epargne', date: '2026-08-01', amount: 999 },
    ];
    expect(savingsGroupByMonth(['2026-10', '2026-11'], sums, cats)).toEqual([
      { month: '2026-10', amount: 250_000 },
      { month: '2026-11', amount: 0 },
    ]);
  });
});
