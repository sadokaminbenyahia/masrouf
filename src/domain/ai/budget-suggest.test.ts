import { describe, expect, it } from 'vitest';
import { suggestBudgets } from './budget-suggest';
import { DEFAULT_TEST_CATEGORIES, categoryId } from './__fixtures__/categories';
import { tx } from './__fixtures__/series';
import type { AiTransaction } from './types';

const TODAY = '2026-11-04';

function monthly(category: string, dinarsByMonth: Record<string, number>): AiTransaction[] {
  return Object.entries(dinarsByMonth).map(([ym, d]) => tx(`${ym}-12`, d, category, category));
}

const anchor = tx('2026-05-02', 1, 'Ouverture', 'Divers');

describe('suggestBudgets', () => {
  it('70e centile sur 6 mois complets, arrondi supérieur à 5 DT', () => {
    const txs = [
      anchor,
      ...monthly('Courses', { '2026-05': 300, '2026-06': 320, '2026-07': 410, '2026-08': 350, '2026-09': 390, '2026-10': 360 }),
      // mois courant ignoré
      tx('2026-11-02', 900, 'Courses', 'Courses'),
    ];
    const s = suggestBudgets({ today: TODAY, transactions: txs, categories: DEFAULT_TEST_CATEGORIES, monthlyIncome: null });
    const courses = s.find((x) => x.categoryId === categoryId('Courses'));
    // valeurs triées 300 320 350 360 390 410 → q70 = 375 → 375 DT
    expect(courses?.amount).toBe(375_000);
    expect(courses?.basis).toContain('70e centile de vos 6 derniers mois complets');
  });

  it('ignore les catégories avec moins de 2 mois de données et l’épargne', () => {
    const txs = [
      anchor,
      ...monthly('Loisirs', { '2026-09': 80 }),
      ...monthly('Épargne', { '2026-08': 200, '2026-09': 200, '2026-10': 200 }),
      ...monthly('Cafés', { '2026-09': 61, '2026-10': 72 }),
    ];
    const s = suggestBudgets({ today: TODAY, transactions: txs, categories: DEFAULT_TEST_CATEGORIES, monthlyIncome: null });
    expect(s.map((x) => x.categoryId)).toEqual([categoryId('Cafés')]);
    // mois sans dépense comptés à 0 : 0 0 0 0 61 72 → q70 = 61 + 0,5 × 11 → 66,5 → 70 DT
    expect(s[0]?.amount).toBe(70_000);
  });

  it('réduit proportionnellement si la somme dépasse 90 % du revenu', () => {
    const txs = [
      anchor,
      ...monthly('Courses', { '2026-09': 600, '2026-10': 600 }),
      ...monthly('Loyer', { '2026-09': 900, '2026-10': 900 }),
    ];
    const s = suggestBudgets({ today: TODAY, transactions: txs, categories: DEFAULT_TEST_CATEGORIES, monthlyIncome: 1_000_000 });
    const sum = s.reduce((a, b) => a + b.amount, 0);
    expect(sum).toBeLessThanOrEqual(900_000);
    for (const x of s) {
      expect(x.amount % 5000).toBe(0);
      expect(x.basis).toContain('90 %');
    }
    expect(s[0]?.categoryId).toBe(categoryId('Loyer'));
  });

  it('aucun mois complet : aucune suggestion', () => {
    const txs = [tx('2026-11-01', 50, 'Courses', 'Courses')];
    expect(suggestBudgets({ today: TODAY, transactions: txs, categories: DEFAULT_TEST_CATEGORIES, monthlyIncome: null })).toEqual([]);
  });

  it('un seul mois complet : formulation au singulier', () => {
    const txs = [tx('2026-10-01', 50, 'Courses', 'Courses'), tx('2026-10-15', 40, 'Courses', 'Courses')];
    const s = suggestBudgets({ today: TODAY, transactions: txs, categories: DEFAULT_TEST_CATEGORIES, monthlyIncome: null });
    // Un seul mois : la règle des 2 mois de données exclut la catégorie.
    expect(s).toEqual([]);
  });
});
