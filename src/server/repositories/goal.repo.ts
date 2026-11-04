import 'server-only';
import type { Goal as GoalRow } from '@prisma/client';
import { isISODate } from '@/domain/dates';
import type { Goal } from '@/domain/types';
import { prisma } from '@/server/db';
import { DataIntegrityError } from './_shared';

export function toGoal(row: GoalRow): Goal {
  if (row.targetDate !== null && !isISODate(row.targetDate)) {
    throw new DataIntegrityError(`Date cible invalide : « ${row.targetDate} »`);
  }
  return {
    id: row.id,
    name: row.name,
    targetAmount: row.targetAmount,
    savedAmount: row.savedAmount,
    targetDate: row.targetDate,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sortOrder,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export async function listGoals(userId: string): Promise<Goal[]> {
  const rows = await prisma.goal.findMany({
    where: { userId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(toGoal);
}

export async function findGoal(userId: string, id: string): Promise<Goal | null> {
  const row = await prisma.goal.findFirst({ where: { id, userId } });
  return row ? toGoal(row) : null;
}

export interface GoalData {
  name: string;
  targetAmount: number;
  savedAmount: number;
  targetDate: string | null;
  icon: string;
  color: string;
  completedAt: Date | null;
}

export async function createGoal(userId: string, data: GoalData): Promise<Goal> {
  return prisma.$transaction(async (tx) => {
    const agg = await tx.goal.aggregate({ where: { userId }, _max: { sortOrder: true } });
    const row = await tx.goal.create({
      data: { ...data, userId, sortOrder: (agg._max.sortOrder ?? -1) + 1 },
    });
    return toGoal(row);
  });
}

export async function updateGoal(
  userId: string,
  id: string,
  data: Partial<GoalData>,
): Promise<Goal | null> {
  const { count } = await prisma.goal.updateMany({ where: { id, userId }, data });
  return count === 0 ? null : findGoal(userId, id);
}

/**
 * Écriture conditionnelle (optimiste) du montant épargné : n'aboutit que si la valeur en base
 * vaut encore `expectedSaved`. Renvoie false en cas de modification concurrente.
 */
export async function compareAndSetSaved(
  userId: string,
  id: string,
  expectedSaved: number,
  next: { savedAmount: number; completedAt: Date | null },
): Promise<boolean> {
  const { count } = await prisma.goal.updateMany({
    where: { id, userId, savedAmount: expectedSaved },
    data: next,
  });
  return count > 0;
}

export async function deleteGoal(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.goal.deleteMany({ where: { id, userId } });
  return count > 0;
}

export async function reorderGoals(userId: string, ids: readonly string[]): Promise<void> {
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.goal.updateMany({ where: { id, userId }, data: { sortOrder: index } }),
    ),
  );
}
