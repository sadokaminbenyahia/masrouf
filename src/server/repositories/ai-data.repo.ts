// Propriétaire : agent J. Lectures seules pour le moteur IA, toujours scopées sur userId.
import 'server-only';
import type { DateRange, YearMonth } from '@/domain/dates';
import { monthOf } from '@/domain/dates';
import type { AiTransaction, TrainingSample } from '@/domain/ai/types';
import { TRANSACTION_TYPES, type CategorySource } from '@/domain/types';
import { prisma } from '@/server/db';
import { parseEnum } from './_shared';

/** Sources de catégorie confirmées par l'utilisateur (jamais `AI` seul : pas d'auto-renforcement). */
export const TRAINING_SOURCES: readonly CategorySource[] = ['USER', 'IMPORT', 'SEED', 'RECURRING'];
/** Plafond d'échantillons pour un réentraînement complet (les plus récents). */
export const MAX_TRAINING_SAMPLES = 20_000;
/** Plafond de transactions lues pour une analyse IA (les plus récentes de la période). */
export const MAX_AI_TRANSACTIONS = 20_000;

/** Type lu en base : une valeur inconnue est une corruption (DataIntegrityError), jamais masquée. */
const asType = (t: string) => parseEnum(TRANSACTION_TYPES, t, 'Transaction.type');

const aiSelect = {
  id: true,
  date: true,
  amount: true,
  type: true,
  label: true,
  categoryId: true,
  accountId: true,
  recurringId: true,
} as const;

/**
 * Transactions de l'utilisateur sur une période inclusive (tous types ; les algorithmes
 * filtrent), en ordre chronologique. Au plus `limit` lignes : les plus récentes sont gardées.
 */
export async function listAiTransactions(
  userId: string,
  range: DateRange,
  limit: number = MAX_AI_TRANSACTIONS,
): Promise<AiTransaction[]> {
  const rows = await prisma.transaction.findMany({
    where: { userId, date: { gte: range.from, lte: range.to } },
    select: aiSelect,
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    take: limit,
  });
  return rows.reverse().map((r) => ({ ...r, type: asType(r.type) }));
}

/** Date de la première transaction (hors virements), ou null. */
export async function firstTransactionDate(userId: string): Promise<string | null> {
  const row = await prisma.transaction.findFirst({
    where: { userId, type: { in: ['EXPENSE', 'INCOME'] } },
    select: { date: true },
    orderBy: { date: 'asc' },
  });
  return row?.date ?? null;
}

/** Échantillons d'apprentissage : catégorie confirmée, revenus et dépenses uniquement. */
export async function listTrainingSamples(
  userId: string,
  limit: number = MAX_TRAINING_SAMPLES,
): Promise<TrainingSample[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      categoryId: { not: null },
      categorySource: { in: [...TRAINING_SOURCES] },
      type: { in: ['EXPENSE', 'INCOME'] },
    },
    select: { label: true, amount: true, type: true, categoryId: true },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    take: limit,
  });
  const out: TrainingSample[] = [];
  for (const r of rows) {
    if (r.categoryId === null) continue;
    out.push({ label: r.label, amount: r.amount, type: asType(r.type), categoryId: r.categoryId });
  }
  return out;
}

export interface MonthlyCategoryTotal {
  month: YearMonth;
  categoryId: string | null;
  type: 'EXPENSE' | 'INCOME';
  total: number;
  count: number;
}

/** Totaux mensuels par catégorie et par sens (virements exclus) sur une période inclusive. */
export async function monthlyCategoryTotals(
  userId: string,
  range: DateRange,
): Promise<MonthlyCategoryTotal[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: range.from, lte: range.to },
      type: { in: ['EXPENSE', 'INCOME'] },
    },
    select: { date: true, amount: true, type: true, categoryId: true },
  });
  const map = new Map<string, MonthlyCategoryTotal>();
  for (const r of rows) {
    const type = r.type === 'INCOME' ? 'INCOME' : 'EXPENSE';
    const month = monthOf(r.date);
    const key = `${month}|${type}|${r.categoryId ?? ''}`;
    const cur = map.get(key);
    if (cur) {
      cur.total += r.amount;
      cur.count++;
    } else {
      map.set(key, { month, categoryId: r.categoryId, type, total: r.amount, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}
