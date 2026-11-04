// Propriétaire : agent A
import 'server-only';
import { computeAllBudgetProgress } from '@/domain/budgets';
import { monthRange, type YearMonth } from '@/domain/dates';
import { appError, err, ok, type Result } from '@/domain/result';
import type { Budget, BudgetProgress } from '@/domain/types';
import type { BudgetUpsertData } from '@/lib/schemas/budgets';
import { today } from '@/server/clock';
import { withPrismaErrors } from '@/server/repositories/_shared';
import * as budgetRepo from '@/server/repositories/budget.repo';
import * as categoryRepo from '@/server/repositories/category.repo';
import * as txRepo from '@/server/repositories/transaction.repo';

const notFound = () => err(appError('NOT_FOUND', 'Budget introuvable.'));

export async function listBudgetProgress(
  userId: string,
  month: YearMonth,
): Promise<Result<BudgetProgress[]>> {
  const [budgets, categories, sums] = await Promise.all([
    budgetRepo.listBudgets(userId),
    categoryRepo.listCategories(userId),
    txRepo.sumByCategory(userId, monthRange(month), 'EXPENSE'),
  ]);
  const spentByCategory = new Map<string, number>();
  for (const s of sums) if (s.categoryId !== null) spentByCategory.set(s.categoryId, s.amount);
  return ok(
    computeAllBudgetProgress({
      budgets,
      categories: new Map(categories.map((c) => [c.id, c])),
      spentByCategory,
      month,
      today: today(),
    }),
  );
}

export async function upsertBudget(userId: string, input: BudgetUpsertData): Promise<Result<Budget>> {
  return withPrismaErrors(
    async () => {
      const category = await categoryRepo.findCategory(userId, input.categoryId);
      if (!category) {
        return err(appError('NOT_FOUND', 'Catégorie introuvable.', { categoryId: ['Catégorie introuvable.'] }));
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
