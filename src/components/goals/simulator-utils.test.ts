import { describe, expect, it } from 'vitest';
import type { WhatIfResult } from '@/domain/ai/types';
import type { Category, CategorySlice, GoalProgress } from '@/domain/types';
import {
  buildWhatIfInput,
  clampPercent,
  describeOutcome,
  eligibleGoals,
  estimatedSaving,
  fixedChargeCategoryIds,
  monthsSavedLabel,
  percentValueText,
  selectSimulatorCategories,
  simulatorRange,
  whatIfErrorMessage,
} from './simulator-utils';

const DT = 1000;

const cat = (
  id: string,
  group: Category['group'],
  kind: Category['kind'] = 'EXPENSE',
): Category => ({
  id,
  name: id,
  kind,
  group,
  icon: 'Tag',
  color: '#1F5FAD',
  sortOrder: 0,
});
const slice = (categoryId: string | null, amount: number): CategorySlice => ({
  categoryId,
  name: categoryId ?? 'Sans catégorie',
  color: '#000000',
  icon: 'Tag',
  amount,
  share: 0,
  count: 1,
});

describe('période', () => {
  it('prend les 3 derniers mois complets', () => {
    expect(simulatorRange('2026-11-04')).toEqual({ from: '2026-08-01', to: '2026-10-31' });
    expect(simulatorRange('2026-02-10')).toEqual({ from: '2025-11-01', to: '2026-01-31' });
  });
});

describe('sélection des catégories', () => {
  const categories = [
    cat('loyer', 'NEEDS'),
    cat('courses', 'NEEDS'),
    cat('restaurants', 'WANTS'),
    cat('cafes', 'WANTS'),
    cat('transport', 'NEEDS'),
    cat('shopping', 'WANTS'),
    cat('loisirs', 'WANTS'),
    cat('epargne', 'SAVINGS'),
  ];
  const slices = [
    slice('loyer', 2250 * DT),
    slice('epargne', 3000 * DT),
    slice(null, 900 * DT),
    slice('courses', 1200 * DT),
    slice('restaurants', 450 * DT),
    slice('cafes', 270 * DT),
    slice('transport', 360 * DT),
    slice('shopping', 300 * DT),
    slice('loisirs', 150 * DT),
  ];
  it('garde les 6 plus coûteuses, envies en premier, moyenne mensuelle', () => {
    const selected = selectSimulatorCategories(slices, categories);
    expect(selected.map((c) => c.categoryId)).toEqual([
      'restaurants',
      'shopping',
      'cafes',
      'loyer',
      'courses',
      'transport',
    ]);
    expect(selected[0]?.monthlyAverage).toBe(150 * DT);
  });
  it('exclut les besoins à charge fixe (échéance récurrente ou catégorie par défaut)', () => {
    const withFixedIcon = categories.map((c) =>
      c.id === 'transport' ? { ...c, icon: 'Smartphone' } : c,
    );
    const selected = selectSimulatorCategories(slices, withFixedIcon, {
      fixedCategoryIds: new Set(['loyer', 'restaurants']),
    });
    // « loyer » (besoin récurrent) et « transport » (icône Télécom) sont exclus ; une envie
    // récurrente (« restaurants ») reste réductible.
    expect(selected.map((c) => c.categoryId)).toEqual([
      'restaurants',
      'shopping',
      'cafes',
      'loisirs',
      'courses',
    ]);
  });
  it('déduit les charges fixes des échéances récurrentes actives', () => {
    expect(
      fixedChargeCategoryIds([
        { categoryId: 'loyer', type: 'EXPENSE', active: true },
        { categoryId: 'loyer', type: 'EXPENSE', active: true },
        { categoryId: 'salaire', type: 'INCOME', active: true },
        { categoryId: 'gym', type: 'EXPENSE', active: false },
        { categoryId: null, type: 'EXPENSE', active: true },
      ]),
    ).toEqual(['loyer']);
  });
  it('ignore les catégories de revenu', () => {
    const selected = selectSimulatorCategories(
      [slice('salaire', 100 * DT)],
      [cat('salaire', 'INCOME', 'INCOME')],
    );
    expect(selected).toEqual([]);
  });
});

describe('paramètres', () => {
  it('normalise les réductions et l’épargne supplémentaire', () => {
    expect(buildWhatIfInput('g1', { b: 20, a: 0, c: 57 }, null)).toEqual({
      goalId: 'g1',
      adjustments: [
        { categoryId: 'b', percent: 20 },
        { categoryId: 'c', percent: 50 },
      ],
      extraMonthlySaving: 0,
    });
    expect(clampPercent(12)).toBe(10);
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(percentValueText(20)).toBe('20 %');
    expect(estimatedSaving(150 * DT, 20)).toBe(30 * DT);
  });
  it('exclut les objectifs atteints', () => {
    const base = { remaining: 100, status: 'ON_TRACK' } as const;
    const goals = [
      { ...base, id: 'a' },
      { ...base, id: 'b', status: 'COMPLETED', remaining: 0 },
    ] as unknown as GoalProgress[];
    expect(eligibleGoals(goals).map((g) => g.id)).toEqual(['a']);
  });
});

describe('lecture du résultat', () => {
  const result = (extra: Partial<WhatIfResult>): WhatIfResult => ({
    baselineMonthlySaving: 200 * DT,
    scenarioMonthlySaving: 260 * DT,
    baselineDate: '2027-05-01',
    scenarioDate: '2027-03-01',
    monthsSaved: 2,
    timeline: [],
    message: '',
    ...extra,
  });
  it('compare les dates', () => {
    expect(describeOutcome(result({}))).toEqual({
      kind: 'COMPARED',
      baselineMonth: '2027-05',
      scenarioMonth: '2027-03',
      monthsSaved: 2,
    });
    expect(describeOutcome(result({ monthsSaved: null })).kind).toBe('COMPARED');
  });
  it('gère « jamais atteint »', () => {
    expect(describeOutcome(result({ baselineDate: null, scenarioDate: null })).kind).toBe('NEVER');
    expect(describeOutcome(result({ baselineDate: null })).kind).toBe('NOW_REACHABLE');
    expect(describeOutcome(result({ scenarioDate: null })).kind).toBe('SCENARIO_NEVER');
  });
  it('libellés et erreurs', () => {
    expect(monthsSavedLabel(2)).toBe('2 mois plus tôt');
    expect(monthsSavedLabel(-1)).toBe('1 mois plus tard');
    expect(monthsSavedLabel(0)).toBe('Même échéance');
    expect(whatIfErrorMessage('RATE_LIMITED', 'x')).toContain('patientez');
    expect(whatIfErrorMessage('NOT_FOUND', 'x')).toContain('n’existe plus');
    expect(whatIfErrorMessage('INTERNAL', 'Erreur')).toBe('Erreur');
  });
});
