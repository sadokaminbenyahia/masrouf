/**
 * Propositions de budgets de l'onboarding, dérivées de la règle 50/30/20 :
 * une part des 50 % « besoins » et des 30 % « envies », arrondie à 5 DT.
 */
import type { Millimes } from '@/domain/money';
import type { Category } from '@/domain/types';

export interface BudgetProposalSpec {
  categoryName: string;
  /** Part du revenu mensuel */
  share: number;
  group: 'NEEDS' | 'WANTS';
}

export const BUDGET_PROPOSAL_SPECS: readonly BudgetProposalSpec[] = [
  { categoryName: 'Courses', share: 0.15, group: 'NEEDS' },
  { categoryName: 'Transport', share: 0.07, group: 'NEEDS' },
  { categoryName: 'Restaurants', share: 0.06, group: 'WANTS' },
  { categoryName: 'Loisirs', share: 0.05, group: 'WANTS' },
];

export const ROUNDING_STEP: Millimes = 5_000;

export interface BudgetProposal {
  categoryId: string;
  categoryName: string;
  icon: string;
  color: string;
  group: 'NEEDS' | 'WANTS';
  share: number;
  amount: Millimes;
}

/** Arrondi au multiple de 5 DT le plus proche (minimum 5 DT). */
export function roundToStep(m: Millimes, step: Millimes = ROUNDING_STEP): Millimes {
  return Math.max(step, Math.round(m / step) * step);
}

export function proposeBudgets(
  income: Millimes,
  categories: readonly Category[],
): BudgetProposal[] {
  if (!Number.isFinite(income) || income <= 0) return [];
  const out: BudgetProposal[] = [];
  for (const spec of BUDGET_PROPOSAL_SPECS) {
    const cat = categories.find((c) => c.kind === 'EXPENSE' && c.name === spec.categoryName);
    if (!cat) continue;
    out.push({
      categoryId: cat.id,
      categoryName: cat.name,
      icon: cat.icon,
      color: cat.color,
      group: spec.group,
      share: spec.share,
      amount: roundToStep(income * spec.share),
    });
  }
  return out;
}

/** Répartition 50/30/20 du revenu (repères affichés). */
export function split503020(income: Millimes): {
  needs: Millimes;
  wants: Millimes;
  savings: Millimes;
} {
  const needs = Math.round(income * 0.5);
  const wants = Math.round(income * 0.3);
  return { needs, wants, savings: income - needs - wants };
}
