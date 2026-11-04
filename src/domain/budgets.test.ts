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
    expect(projectSpending(0, '2026-11', '2026-11-10')).toBe(0);
    expect(projectSpending(100_000, '2026-10', '2026-11-10')).toBeNull();
    expect(projectSpending(100_000, '2026-12', '2026-11-10')).toBeNull();
  });

  it('aucune projection avant le 7e jour ni avant un quart du mois écoulé', () => {
    expect(projectSpending(50_000, '2026-11', '2026-11-01')).toBeNull();
    expect(projectSpending(50_000, '2026-11', '2026-11-06')).toBeNull();
    // 30 jours : le 7 = 23 % < 25 % ; le 8 = 27 %.
    expect(projectSpending(70_000, '2026-11', '2026-11-07')).toBeNull();
    expect(projectSpending(80_000, '2026-11', '2026-11-08')).toBe(300_000);
    // Février (28 jours) : le 7 = 25 %.
    expect(projectSpending(70_000, '2026-02', '2026-02-07')).toBe(280_000);
  });

  it('rythme plafonné à 2× la moyenne journalière historique', () => {
    // Gros achat ponctuel : 300 DT le 10 novembre, habituellement 150 DT par mois.
    // Rythme brut 30 DT/j, plafonné à 2 × 150/30 = 10 DT/j → 300 + 10 × 20 = 500 DT.
    expect(projectSpending(300_000, '2026-11', '2026-11-10', 150_000)).toBe(500_000);
    expect(projectSpending(300_000, '2026-11', '2026-11-10')).toBe(900_000);
    // Moyenne nulle ou absente : pas de plafond ; rythme sous le plafond : inchangé.
    expect(projectSpending(300_000, '2026-11', '2026-11-10', 0)).toBe(900_000);
    expect(projectSpending(30_000, '2026-11', '2026-11-10', 150_000)).toBe(90_000);
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
      budgets: [
        budget('b2', 'c2', 100_000, 1),
        budget('b1', 'c1', 200_000, 0),
        budget('bx', 'x', 5),
      ],
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
    expect(summarizeBudgets(list)).toEqual({
      budgeted: 300_000,
      spent: 85_000,
      remaining: 215_000,
    });
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
