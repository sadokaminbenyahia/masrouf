import 'server-only';
import type { Budget as BudgetRow } from '@prisma/client';
import type { Budget } from '@/domain/types';
import { prisma } from '@/server/db';

export function toBudget(row: BudgetRow): Budget {
  return { id: row.id, categoryId: row.categoryId, amount: row.amount, sortOrder: row.sortOrder };
}

export async function listBudgets(userId: string): Promise<Budget[]> {
  const rows = await prisma.budget.findMany({
    where: { userId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(toBudget);
}

export async function findBudget(userId: string, id: string): Promise<Budget | null> {
  const row = await prisma.budget.findFirst({ where: { id, userId } });
  return row ? toBudget(row) : null;
}

/** Crée ou met à jour le plafond d'une catégorie (unique par utilisateur et catégorie). */
export async function upsertBudget(
  userId: string,
  categoryId: string,
  amount: number,
): Promise<Budget> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.budget.findFirst({ where: { userId, categoryId } });
    if (existing) {
      const row = await tx.budget.update({ where: { id: existing.id, userId }, data: { amount } });
      return toBudget(row);
    }
    const agg = await tx.budget.aggregate({ where: { userId }, _max: { sortOrder: true } });
    const row = await tx.budget.create({
      data: { userId, categoryId, amount, sortOrder: (agg._max.sortOrder ?? -1) + 1 },
    });
    return toBudget(row);
  });
}

export async function deleteBudget(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.budget.deleteMany({ where: { id, userId } });
  return count > 0;
}

export async function reorderBudgets(userId: string, ids: readonly string[]): Promise<void> {
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.budget.updateMany({ where: { id, userId }, data: { sortOrder: index } }),
    ),
  );
}
