// Propriétaire : agent K — lectures agrégées pour l'assistant (toujours scopées userId)
import 'server-only';
import type { Prisma } from '@prisma/client';
import type { AiTransaction, ToolFilter } from '@/domain/ai/types';
import type { ISODate } from '@/domain/dates';
import type { Millimes } from '@/domain/money';
import { TRANSACTION_TYPES } from '@/domain/types';
import { prisma } from '@/server/db';
import { parseEnum } from './_shared';

/** Plafond des lignes renvoyées par une lecture (listes, groupements par libellé). */
const MAX_ROWS = 5_000;

/** WHERE d'un filtre d'outil : jamais de virement (sauf type explicite), toujours userId. */
export function toolWhere(userId: string, f: ToolFilter): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = {
    userId,
    date: { gte: f.range.from, lte: f.range.to },
    type: f.type ?? { in: ['EXPENSE', 'INCOME'] },
  };
  if (f.categoryIds && f.categoryIds.length > 0) where.categoryId = { in: f.categoryIds };
  const search = f.search?.trim();
  if (search) where.label = { contains: search };
  return where;
}

export async function sumAmount(
  userId: string,
  f: ToolFilter,
): Promise<{ total: Millimes; count: number }> {
  const r = await prisma.transaction.aggregate({
    where: toolWhere(userId, f),
    _sum: { amount: true },
    _count: { _all: true },
  });
  return { total: r._sum.amount ?? 0, count: r._count._all };
}

export async function sumByCategory(
  userId: string,
  f: ToolFilter,
): Promise<{ categoryId: string | null; total: Millimes; count: number }[]> {
  const rows = await prisma.transaction.groupBy({
    by: ['categoryId'],
    where: toolWhere(userId, f),
    _sum: { amount: true },
    _count: { _all: true },
  });
  return rows.map((r) => ({
    categoryId: r.categoryId,
    total: r._sum.amount ?? 0,
    count: r._count._all,
  }));
}

/** Noms des catégories de l'utilisateur (id → nom). */
export async function categoryNames(userId: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.category.findMany({
    where: { userId, id: { in: ids } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, r.name]));
}

/**
 * Sommes par jour et par type (agrégées en base) ; le regroupement mensuel se fait ensuite
 * en mémoire sur au plus 2 lignes par jour.
 */
export async function sumByDayAndType(
  userId: string,
  f: ToolFilter,
): Promise<{ date: ISODate; type: 'EXPENSE' | 'INCOME'; total: Millimes }[]> {
  const rows = await prisma.transaction.groupBy({
    by: ['date', 'type'],
    where: toolWhere(userId, f),
    _sum: { amount: true },
  });
  return rows.flatMap((r) =>
    r.type === 'EXPENSE' || r.type === 'INCOME'
      ? [{ date: r.date, type: r.type, total: r._sum.amount ?? 0 }]
      : [],
  );
}

/** Sommes par libellé exact (agrégées en base), triées par total décroissant. */
export async function sumByLabel(
  userId: string,
  f: ToolFilter,
): Promise<{ label: string; total: Millimes; count: number }[]> {
  const rows = await prisma.transaction.groupBy({
    by: ['label'],
    where: toolWhere(userId, f),
    _sum: { amount: true },
    _count: { _all: true },
    orderBy: { _sum: { amount: 'desc' } },
    take: MAX_ROWS,
  });
  return rows.map((r) => ({ label: r.label, total: r._sum.amount ?? 0, count: r._count._all }));
}

export async function listForTool(
  userId: string,
  f: ToolFilter,
  sort: 'AMOUNT_DESC' | 'DATE_DESC',
  limit: number,
): Promise<AiTransaction[]> {
  const rows = await prisma.transaction.findMany({
    where: toolWhere(userId, f),
    orderBy:
      sort === 'AMOUNT_DESC'
        ? [{ amount: 'desc' }, { date: 'desc' }]
        : [{ date: 'desc' }, { createdAt: 'desc' }],
    take: Math.min(Math.max(1, limit), 100),
    select: {
      id: true,
      date: true,
      amount: true,
      type: true,
      label: true,
      categoryId: true,
      accountId: true,
      recurringId: true,
    },
  });
  return rows.map((r) => ({ ...r, type: parseEnum(TRANSACTION_TYPES, r.type, 'Transaction.type') }));
}
