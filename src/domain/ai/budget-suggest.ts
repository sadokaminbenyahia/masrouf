// Propriétaire : agent J. Suggestions de budgets : 70e centile des dépenses mensuelles par
// catégorie sur les 6 derniers mois complets au plus, arrondi supérieur à 5 DT.
import { monthOf } from '../dates';
import { formatMoney } from '../money';
import { completeHistoryMonths } from './forecast';
import { ceilTo, floorTo, mean, quantile, sum } from './stats';
import { nameKey } from './text';
import type { BudgetSuggestInput, BudgetSuggestion } from './types';

const MAX_MONTHS = 6;
const MIN_MONTHS_WITH_DATA = 2;
const PERCENTILE = 0.7;
const STEP = 5_000;
const MAX_INCOME_SHARE = 0.9;
/** L'épargne est un objectif, pas un plafond : pas de budget suggéré. */
const EXCLUDED_NAMES = new Set(['epargne']);

/**
 * Un budget par catégorie de dépense ayant au moins 2 mois de données sur la fenêtre :
 * 70e centile des totaux mensuels depuis le premier mois de dépense de la catégorie (mois
 * sans dépense ensuite comptés à 0), arrondi au 5 DT supérieur.
 * Si la somme dépasse 90 % du revenu mensuel, les montants sont réduits proportionnellement
 * (arrondis au 5 DT inférieur, 5 DT au minimum). Tri par montant décroissant.
 */
export function suggestBudgets(input: BudgetSuggestInput): BudgetSuggestion[] {
  const expenses = input.transactions.filter(
    (t) => t.type === 'EXPENSE' && t.categoryId !== null && t.date <= input.today,
  );
  let firstDate: string | null = null;
  for (const t of input.transactions) {
    if (t.type !== 'TRANSFER' && (firstDate === null || t.date < firstDate)) firstDate = t.date;
  }
  const months = completeHistoryMonths(input.today, firstDate, MAX_MONTHS);
  if (months.length === 0) return [];
  const index = new Map(months.map((m, i) => [m, i]));

  const totals = new Map<string, number[]>();
  for (const t of expenses) {
    const i = index.get(monthOf(t.date));
    if (i === undefined || t.categoryId === null) continue;
    const row = totals.get(t.categoryId) ?? months.map(() => 0);
    row[i] = (row[i] ?? 0) + t.amount;
    totals.set(t.categoryId, row);
  }

  const suggestions: (BudgetSuggestion & { avg: number; months: number })[] = [];
  for (const c of input.categories) {
    if (c.kind !== 'EXPENSE' || EXCLUDED_NAMES.has(nameKey(c.name))) continue;
    const full = totals.get(c.id);
    if (!full || full.filter((v) => v > 0).length < MIN_MONTHS_WITH_DATA) continue;
    // Fenêtre propre à la catégorie : à partir de son premier mois de dépense.
    const row = full.slice(full.findIndex((v) => v > 0));
    const amount = ceilTo(quantile(row, PERCENTILE), STEP);
    if (amount <= 0) continue;
    suggestions.push({ categoryId: c.id, amount, basis: '', avg: mean(row), months: row.length });
  }

  const total = sum(suggestions.map((s) => s.amount));
  const income = input.monthlyIncome;
  const reduce = income !== null && income > 0 && total > MAX_INCOME_SHARE * income;
  const factor = reduce ? (MAX_INCOME_SHARE * income) / total : 1;
  return suggestions
    .map(({ categoryId, amount, avg, months: n }) => {
      const window = `de vos ${n} derniers mois complets`;
      const final = reduce ? Math.max(STEP, floorTo(amount * factor, STEP)) : amount;
      const avgText = formatMoney(Math.round(avg), { decimals: 0 });
      const basis = reduce
        ? `70e centile ${window} (moyenne ${avgText}), réduit pour rester sous 90 % de votre revenu`
        : `70e centile ${window} (moyenne ${avgText})`;
      return { categoryId, amount: final, basis };
    })
    .sort((a, b) => b.amount - a.amount || a.categoryId.localeCompare(b.categoryId));
}
