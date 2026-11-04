import { describe, expect, it } from 'vitest';
import {
  budgetLevel,
  computeAllBudgetProgress,
  computeBudgetProgress,
  isBudgetAlert,
  projectSpending,
  summarizeBudgets,
} from './budgets';
import type { Budget, Category } from './types';

const category = (id: string, name = id): Category => ({
  id,
  name,
  kind: 'EXPENSE',
  group: 'WANTS',
  icon: 'Tag',
  color: '#000000',
  sortOrder: 0,
});
const budget = (id: string, categoryId: string, amount: number, sortOrder = 0): Budget => ({
  id,
  categoryId,
  amount,
  sortOrder,
});

describe('budgetLevel', () => {
  it('OK < 80 % ≤ WARNING < 100 % ≤ EXCEEDED', () => {
    expect(budgetLevel(0)).toBe('OK');
    expect(budgetLevel(0.7999)).toBe('OK');
    expect(budgetLevel(0.8)).toBe('WARNING');
    expect(budgetLevel(0.9999)).toBe('WARNING');
    expect(budgetLevel(1)).toBe('EXCEEDED');
    expect(budgetLevel(2.5)).toBe('EXCEEDED');
  });
});

describe('projectSpending', () => {
  it('projette au rythme actuel pour le mois courant uniquement', () => {
    expect(projectSpending(100_000, '2026-11', '2026-11-10')).toBe(300_000);
    expect(projectSpending(0, '2026-11', '2026-11-01')).toBe(0);
    expect(projectSpending(100_000, '2026-10', '2026-11-10')).toBeNull();
    expect(projectSpending(100_000, '2026-12', '2026-11-10')).toBeNull();
  });
});

describe('computeBudgetProgress', () => {
  it('calcule restant, ratio, niveau et dépassement projeté', () => {
    const p = computeBudgetProgress({
      budget: budget('b', 'c', 150_000),
      category: category('c'),
      month: '2026-11',
      spent: 60_000,
      today: '2026-11-10',
    });
    expect(p.remaining).toBe(90_000);
    expect(p.ratio).toBeCloseTo(0.4);
    expect(p.level).toBe('OK');
    expect(p.projected).toBe(180_000);
    expect(p.projectedOverrun).toBe(true);
    expect(isBudgetAlert(p)).toBe(true);
  });

  it('pas de dépassement « projeté » quand il est déjà effectif', () => {
    const p = computeBudgetProgress({
      budget: budget('b', 'c', 100_000),
      category: category('c'),
      month: '2026-10',
      spent: 120_000,
      today: '2026-11-10',
    });
    expect(p.level).toBe('EXCEEDED');
    expect(p.remaining).toBe(-20_000);
    expect(p.projected).toBeNull();
    expect(p.projectedOverrun).toBe(false);
    expect(isBudgetAlert(p)).toBe(true);
  });

  it('budget à zéro : garde-fou sans division par zéro', () => {
    const base = { category: category('c'), month: '2026-10', today: '2026-11-10' };
    expect(computeBudgetProgress({ ...base, budget: budget('b', 'c', 0), spent: 0 }).ratio).toBe(0);
    expect(computeBudgetProgress({ ...base, budget: budget('b', 'c', 0), spent: 5 }).level).toBe(
      'EXCEEDED',
    );
  });
});

describe('computeAllBudgetProgress / summarizeBudgets', () => {
  it('trie par sortOrder, ignore les catégories inconnues', () => {
    const list = computeAllBudgetProgress({
      budgets: [budget('b2', 'c2', 100_000, 1), budget('b1', 'c1', 200_000, 0), budget('bx', 'x', 5)],
      categories: new Map([
        ['c1', category('c1', 'Courses')],
        ['c2', category('c2', 'Cafés')],
      ]),
      spentByCategory: new Map([['c2', 85_000]]),
      month: '2026-09',
      today: '2026-11-04',
    });
    expect(list.map((p) => p.budget.id)).toEqual(['b1', 'b2']);
    expect(list.map((p) => p.level)).toEqual(['OK', 'WARNING']);
    expect(list.filter(isBudgetAlert).map((p) => p.budget.id)).toEqual(['b2']);
    expect(summarizeBudgets(list)).toEqual({ budgeted: 300_000, spent: 85_000, remaining: 215_000 });
    expect(summarizeBudgets([])).toBeNull();
  });

  it('à sortOrder égal, trie par nom de catégorie', () => {
    const list = computeAllBudgetProgress({
      budgets: [budget('b', 'cb', 1), budget('a', 'ca', 1)],
      categories: new Map([
        ['cb', category('cb', 'Shopping')],
        ['ca', category('ca', 'Cafés')],
      ]),
      spentByCategory: new Map(),
      month: '2026-11',
      today: '2026-11-04',
    });
    expect(list.map((p) => p.category.name)).toEqual(['Cafés', 'Shopping']);
  });
});
