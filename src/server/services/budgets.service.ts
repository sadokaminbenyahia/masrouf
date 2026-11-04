// Propriétaire : agent A
import 'server-only';
import { computeAllBudgetProgress } from '@/domain/budgets';
import { addMonthsYM, monthEnd, monthOf, monthRange, monthStart, type YearMonth } from '@/domain/dates';
import { appError, err, ok, type Result } from '@/domain/result';
import type { Budget, BudgetProgress } from '@/domain/types';
import type { BudgetUpsertData } from '@/lib/schemas/budgets';
import { today } from '@/server/clock';
import { withPrismaErrors } from '@/server/repositories/_shared';
import * as budgetRepo from '@/server/repositories/budget.repo';
import * as categoryRepo from '@/server/repositories/category.repo';
import * as txRepo from '@/server/repositories/transaction.repo';

const notFound = () => err(appError('NOT_FOUND', 'Budget introuvable.'));
/** Mois précédents servant de référence au plafond de la projection. */
const HISTORY_MONTHS = 3;

export async function listBudgetProgress(
  userId: string,
  month: YearMonth,
): Promise<Result<BudgetProgress[]>> {
  const day = today();
  // Moyenne des 3 mois précédents : ne sert qu'à plafonner la projection du mois courant.
  const isCurrent = monthOf(day) === month;
  const [budgets, categories, sums, history] = await Promise.all([
    budgetRepo.listBudgets(userId),
    categoryRepo.listCategories(userId),
    txRepo.sumByCategory(userId, monthRange(month), 'EXPENSE'),
    isCurrent
      ? txRepo.sumByCategory(
          userId,
          {
            from: monthStart(addMonthsYM(month, -HISTORY_MONTHS)),
            to: monthEnd(addMonthsYM(month, -1)),
          },
          'EXPENSE',
        )
      : Promise.resolve([]),
  ]);
  const spentByCategory = new Map<string, number>();
  for (const s of sums) if (s.categoryId !== null) spentByCategory.set(s.categoryId, s.amount);
  const historicalAverageByCategory = new Map<string, number>();
  for (const s of history) {
    if (s.categoryId !== null) {
      historicalAverageByCategory.set(s.categoryId, Math.round(s.amount / HISTORY_MONTHS));
    }
  }
  return ok(
    computeAllBudgetProgress({
      budgets,
      categories: new Map(categories.map((c) => [c.id, c])),
      spentByCategory,
      month,
      today: day,
      historicalAverageByCategory,
    }),
  );
}

export async function upsertBudget(
  userId: string,
  input: BudgetUpsertData,
): Promise<Result<Budget>> {
  return withPrismaErrors(
    async () => {
      const category = await categoryRepo.findCategory(userId, input.categoryId);
      if (!category) {
        return err(
          appError('NOT_FOUND', 'Catégorie introuvable.', {
            categoryId: ['Catégorie introuvable.'],
          }),
        );
      }
      if (category.kind !== 'EXPENSE') {
        const message = 'Un budget s’applique à une catégorie de dépense.';
        return err(appError('VALIDATION', message, { categoryId: [message] }));
      }
      return ok(await budgetRepo.upsertBudget(userId, input.categoryId, input.amount));
    },
    { conflict: 'Un budget existe déjà pour cette catégorie.' },
  );
}

/** Renvoie le budget supprimé (pour « Annuler »). */
export async function deleteBudget(userId: string, id: string): Promise<Result<Budget>> {
  return withPrismaErrors(async () => {
    const budget = await budgetRepo.findBudget(userId, id);
    if (!budget) return notFound();
    return (await budgetRepo.deleteBudget(userId, id)) ? ok(budget) : notFound();
  });
}

export async function reorderBudgets(userId: string, ids: string[]): Promise<Result<void>> {
  return withPrismaErrors(async () => {
    const owned = new Set((await budgetRepo.listBudgets(userId)).map((b) => b.id));
    if (!ids.every((id) => owned.has(id))) return notFound();
    await budgetRepo.reorderBudgets(userId, ids);
    return ok(undefined);
  });
}
