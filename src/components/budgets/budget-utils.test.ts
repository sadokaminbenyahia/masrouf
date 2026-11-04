import { describe, expect, it } from 'vitest';
import type { BudgetSuggestion } from '@/domain/ai/types';
import type { BudgetProgress, Category } from '@/domain/types';
import { resolveAmount } from './amount';
import {
  alertSummaryText,
  applicableSuggestions,
  barPercent,
  budgetAlerts,
  budgetStatusText,
  budgetTransactionsHref,
  categoriesWithoutBudget,
  daysLeftInMonth,
  isOptimisticBudgetId,
  levelFromRatio,
  maxBudgetMonth,
  optimisticProgress,
  parseMonthParam,
  progressValueText,
  projectionText,
  sortByIds,
  summarizeBudgets,
  withBudgetAmount,
} from './budget-utils';

const DT = 1000;
/** Remplace les espaces insécables de formatMoney pour des attentes lisibles. */
const n = (s: string | null) => (s === null ? null : s.replace(/\u00a0/g, ' '));
const TODAY = '2026-11-22';

function category(id: string, name: string, extra: Partial<Category> = {}): Category {
  return {
    id,
    name,
    kind: 'EXPENSE',
    group: 'WANTS',
    icon: 'Tag',
    color: '#1F5FAD',
    sortOrder: 0,
    ...extra,
  };
}

function progress(
  id: string,
  name: string,
  spent: number,
  amount: number,
  extra: Partial<BudgetProgress> = {},
): BudgetProgress {
  const ratio = spent / amount;
  return {
    budget: { id, categoryId: `cat-${id}`, amount, sortOrder: 0 },
    category: category(`cat-${id}`, name),
    month: '2026-11',
    spent,
    remaining: amount - spent,
    ratio,
    level: levelFromRatio(ratio),
    projected: null,
    projectedOverrun: false,
    ...extra,
  };
}

describe('niveaux', () => {
  it('suit la règle OK < 80 % ≤ WARNING < 100 % ≤ EXCEEDED', () => {
    expect(levelFromRatio(0.79)).toBe('OK');
    expect(levelFromRatio(0.8)).toBe('WARNING');
    expect(levelFromRatio(0.999)).toBe('WARNING');
    expect(levelFromRatio(1)).toBe('EXCEEDED');
  });
  it('borne la largeur de barre', () => {
    expect(barPercent(1.4)).toBe(100);
    expect(barPercent(-1)).toBe(0);
    expect(barPercent(0.42)).toBeCloseTo(42);
    expect(barPercent(Infinity)).toBe(100);
  });
});

describe('mois', () => {
  it('limite au mois courant + 1', () => {
    expect(maxBudgetMonth('2026-12-15')).toBe('2027-01');
    expect(parseMonthParam('2026-12', TODAY)).toBe('2026-12');
    expect(parseMonthParam('2027-01', TODAY)).toBe('2026-11');
    expect(parseMonthParam('2025-03', TODAY)).toBe('2025-03');
    expect(parseMonthParam('n’importe quoi', TODAY)).toBe('2026-11');
    expect(parseMonthParam(undefined, TODAY)).toBe('2026-11');
  });
  it('compte les jours restants, aujourd’hui compris, uniquement pour le mois en cours', () => {
    expect(daysLeftInMonth('2026-11', TODAY)).toBe(9);
    expect(daysLeftInMonth('2026-11', '2026-11-30')).toBe(1);
    expect(daysLeftInMonth('2026-10', TODAY)).toBeNull();
  });
});

describe('textes de progression', () => {
  it('reste et jours', () => {
    expect(n(budgetStatusText(progress('b1', 'Courses', 320 * DT, 400 * DT), TODAY))).toBe(
      '320 / 400 DT · reste 80 DT · 9 jours',
    );
  });
  it('dépassement', () => {
    expect(n(budgetStatusText(progress('b1', 'Courses', 445 * DT, 400 * DT), TODAY))).toBe(
      '445 / 400 DT · dépassé de 45 DT',
    );
  });
  it('mois passé : pas de jours', () => {
    const p = { ...progress('b1', 'Courses', 100 * DT, 400 * DT), month: '2026-10' };
    expect(n(budgetStatusText(p, TODAY))).toBe('100 / 400 DT · reste 300 DT');
  });
  it('aria-valuetext', () => {
    expect(n(progressValueText(320 * DT, 400 * DT))).toBe('320 DT sur 400 DT');
    expect(n(progressValueText(445 * DT, 400 * DT))).toBe('445 DT sur 400 DT, dépassé de 45 DT');
    expect(n(progressValueText(320 * DT, 400 * DT, true))).toBe('80 % du plafond');
  });
  it('projection seulement si dépassement prévu', () => {
    const base = progress('b1', 'Courses', 200 * DT, 400 * DT);
    expect(n(projectionText(base))).toBeNull();
    expect(n(projectionText({ ...base, projected: 430 * DT, projectedOverrun: true }))).toBe(
      'À ce rythme : 430 DT en fin de mois',
    );
  });
  it('lien vers les transactions du mois', () => {
    expect(budgetTransactionsHref('cat_1', '2026-02')).toBe(
      '/transactions?categoryId=cat_1&from=2026-02-01&to=2026-02-28',
    );
  });
});

describe('résumé et alertes', () => {
  const list = [
    progress('b1', 'Courses', 300 * DT, 450 * DT),
    progress('b2', 'Restaurants', 180 * DT, 150 * DT),
    progress('b3', 'Cafés', 77 * DT, 90 * DT),
  ];
  it('totalise le mois', () => {
    const s = summarizeBudgets(list);
    expect(s.budgeted).toBe(690 * DT);
    expect(s.spent).toBe(557 * DT);
    expect(s.remaining).toBe(133 * DT);
    expect(s.level).toBe('WARNING');
    expect(summarizeBudgets([]).ratio).toBe(0);
  });
  it('trie les alertes et les résume', () => {
    const alerts = budgetAlerts(list);
    expect(alerts.map((a) => a.category.name)).toEqual(['Restaurants', 'Cafés']);
    expect(alertSummaryText(alerts)).toBe(
      '2 budgets demandent votre attention : Restaurants (dépassé), Cafés (86 %).',
    );
    expect(alertSummaryText(alerts.slice(1))).toBe(
      '1 budget demande votre attention : Cafés (86 %).',
    );
    expect(alertSummaryText([])).toBe('');
  });
});

describe('mises à jour optimistes', () => {
  it('recalcule ratio, niveau et projection avec un nouveau plafond', () => {
    const p = progress('b1', 'Courses', 320 * DT, 400 * DT, { projected: 430 * DT });
    const raised = withBudgetAmount(p, 500 * DT);
    expect(raised.budget.amount).toBe(500 * DT);
    expect(raised.remaining).toBe(180 * DT);
    expect(raised.level).toBe('OK');
    expect(raised.projectedOverrun).toBe(false);
    const lowered = withBudgetAmount(p, 300 * DT);
    expect(lowered.level).toBe('EXCEEDED');
    expect(lowered.projectedOverrun).toBe(true);
  });
  it('crée une progression provisoire identifiable', () => {
    const p = optimisticProgress(category('c1', 'Loisirs'), 100 * DT, '2026-11', 3);
    expect(isOptimisticBudgetId(p.budget.id)).toBe(true);
    expect(isOptimisticBudgetId('ckx123')).toBe(false);
    expect(p.remaining).toBe(100 * DT);
  });
  it('réordonne selon les ids', () => {
    const list = [progress('a', 'A', 0, DT), progress('b', 'B', 0, DT), progress('c', 'C', 0, DT)];
    const sorted = sortByIds(list, ['c', 'a', 'b']);
    expect(sorted.map((p) => p.budget.id)).toEqual(['c', 'a', 'b']);
    expect(sorted.map((p) => p.budget.sortOrder)).toEqual([0, 1, 2]);
  });
});

describe('catégories et suggestions', () => {
  const cats = [
    category('cat-b1', 'Courses', { sortOrder: 0 }),
    category('cat-x', 'Loisirs', { sortOrder: 2 }),
    category('cat-y', 'Cafés', { sortOrder: 1 }),
    category('cat-inc', 'Salaire', { kind: 'INCOME', group: 'INCOME' }),
  ];
  const list = [progress('b1', 'Courses', 0, DT)];
  it('liste les catégories de dépense sans budget', () => {
    expect(categoriesWithoutBudget(cats, list).map((c) => c.name)).toEqual(['Cafés', 'Loisirs']);
  });
  it('ne garde que les suggestions applicables', () => {
    const suggestions: BudgetSuggestion[] = [
      { categoryId: 'cat-b1', amount: 450 * DT, basis: 'x' },
      { categoryId: 'cat-x', amount: 120 * DT, basis: '70e centile de vos 6 derniers mois' },
      { categoryId: 'cat-inc', amount: 10 * DT, basis: 'x' },
      { categoryId: 'inconnue', amount: 10 * DT, basis: 'x' },
      { categoryId: 'cat-y', amount: 0, basis: 'x' },
    ];
    expect(applicableSuggestions(suggestions, cats, list).map((s) => s.category.name)).toEqual([
      'Loisirs',
    ]);
  });
});

describe('resolveAmount', () => {
  it('le texte brut fait foi, sinon la valeur connue', () => {
    expect(resolveAmount('12,5+3', null)).toEqual({ ok: true, value: 15_500 });
    expect(resolveAmount('', 4000)).toEqual({ ok: true, value: 4000 });
    expect(resolveAmount(null, null)).toEqual({ ok: false, error: 'Montant requis.' });
    expect(resolveAmount('abc', 4000).ok).toBe(false);
  });
});
