import 'server-only';
import type { Prisma, Transaction as TransactionRow } from '@prisma/client';
import type { CategorySum, DailyTypeSum } from '@/domain/aggregations';
import type { DateRange, ISODate } from '@/domain/dates';
import { amountBounds, type TypeSum } from '@/domain/transactions';
import {
  CATEGORY_SOURCES,
  TRANSACTION_TYPES,
  type CategorySource,
  type Transaction,
  type TransactionQuery,
  type TransactionType,
} from '@/domain/types';
import { prisma } from '@/server/db';
import { chunk, parseEnum, parseNullableEnum, type Db } from './_shared';
import { connectOrCreateTags } from './tag.repo';

/** Plafond des lectures non paginées. */
export const MAX_RANGE_ROWS = 20_000;
/** Taille des lots pour les clauses `IN` (limite de variables SQLite). */
const IN_CHUNK = 500;

const WITH_TAGS = { tags: { select: { name: true }, orderBy: { name: 'asc' } } } as const;
type RowWithTags = TransactionRow & { tags: { name: string }[] };

export function toTransaction(row: RowWithTags): Transaction {
  return {
    id: row.id,
    accountId: row.accountId,
    categoryId: row.categoryId,
    type: parseEnum(TRANSACTION_TYPES, row.type, 'Transaction.type'),
    amount: row.amount,
    date: row.date,
    label: row.label,
    note: row.note,
    tags: row.tags.map((t) => t.name),
    transferAccountId: row.transferAccountId,
    recurringId: row.recurringId,
    categorySource: parseNullableEnum(CATEGORY_SOURCES, row.categorySource, 'Transaction.categorySource'),
    aiConfidence: row.aiConfidence,
    createdAt: row.createdAt.toISOString(),
  };
}

export type TransactionFilter = Omit<TransactionQuery, 'page' | 'pageSize' | 'sort'>;

/** Clause WHERE d'un filtre de transactions (toujours scopée sur l'utilisateur). */
export function buildWhere(userId: string, f: TransactionFilter): Prisma.TransactionWhereInput {
  const and: Prisma.TransactionWhereInput[] = [{ userId }];
  const search = f.search?.trim();
  if (search) and.push({ OR: [{ label: { contains: search } }, { note: { contains: search } }] });
  if (f.types && f.types.length > 0) and.push({ type: { in: f.types } });
  if (f.accountIds && f.accountIds.length > 0) {
    and.push({
      OR: [
        { accountId: { in: f.accountIds } },
        { type: 'TRANSFER', transferAccountId: { in: f.accountIds } },
      ],
    });
  }
  const hasCategories = f.categoryIds !== undefined && f.categoryIds.length > 0;
  if (hasCategories && f.uncategorized === true) {
    and.push({ OR: [{ categoryId: { in: f.categoryIds } }, { categoryId: null }] });
  } else if (hasCategories) {
    and.push({ categoryId: { in: f.categoryIds } });
  } else if (f.uncategorized === true) {
    and.push({ categoryId: null });
  }
  const tag = f.tag?.trim();
  if (tag) and.push({ tags: { some: { userId, name: tag } } });
  if (f.from !== undefined || f.to !== undefined) {
    and.push({
      date: { ...(f.from !== undefined ? { gte: f.from } : {}), ...(f.to !== undefined ? { lte: f.to } : {}) },
    });
  }
  const bounds = amountBounds(f.minAmount, f.maxAmount);
  if (bounds.gte !== undefined || bounds.lte !== undefined) and.push({ amount: bounds });
  return { AND: and };
}

export async function findPage(
  userId: string,
  query: TransactionQuery,
  window: { skip: number; take: number },
): Promise<{ items: Transaction[]; total: number; sums: TypeSum[] }> {
  const where = buildWhere(userId, query);
  const { field, direction } = query.sort;
  const primary: Prisma.TransactionOrderByWithRelationInput =
    field === 'amount' ? { amount: direction } : field === 'label' ? { label: direction } : { date: direction };
  // Départage stable pour une pagination déterministe.
  const orderBy: Prisma.TransactionOrderByWithRelationInput[] = [
    primary,
    ...(field === 'date' ? [] : [{ date: 'desc' as const }]),
    { createdAt: direction },
    { id: direction },
  ];
  const [rows, total, groups] = await Promise.all([
    prisma.transaction.findMany({ where, orderBy, skip: window.skip, take: window.take, include: WITH_TAGS }),
    prisma.transaction.count({ where }),
    prisma.transaction.groupBy({
      by: ['type'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);
  return {
    items: rows.map(toTransaction),
    total,
    sums: groups.map((g) => ({
      type: parseEnum(TRANSACTION_TYPES, g.type, 'Transaction.type'),
      amount: g._sum.amount ?? 0,
      count: g._count._all,
    })),
  };
}

export async function findTransaction(userId: string, id: string, db: Db = prisma): Promise<Transaction | null> {
  const row = await db.transaction.findFirst({ where: { id, userId }, include: WITH_TAGS });
  return row ? toTransaction(row) : null;
}

export async function findTransactionsByIds(
  userId: string,
  ids: readonly string[],
  db: Db = prisma,
): Promise<Transaction[]> {
  const out: Transaction[] = [];
  for (const part of chunk([...new Set(ids)], IN_CHUNK)) {
    const rows = await db.transaction.findMany({
      where: { userId, id: { in: part } },
      include: WITH_TAGS,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    out.push(...rows.map(toTransaction));
  }
  return out;
}

/** L'identifiant est-il déjà pris (tous utilisateurs confondus : c'est une clé primaire) ? */
export async function transactionIdExists(id: string): Promise<boolean> {
  const row = await prisma.transaction.findUnique({ where: { id }, select: { id: true } });
  return row !== null;
}

export interface TransactionWriteData {
  accountId: string;
  categoryId: string | null;
  type: TransactionType;
  amount: number;
  date: ISODate;
  label: string;
  note: string | null;
  transferAccountId: string | null;
  recurringId: string | null;
  importHash: string | null;
  categorySource: CategorySource | null;
  aiConfidence: number | null;
}

export async function createTransaction(
  userId: string,
  data: TransactionWriteData & { id?: string; tags: readonly string[] },
  db: Db = prisma,
): Promise<Transaction> {
  const { tags, ...fields } = data;
  const row = await db.transaction.create({
    data: {
      ...fields,
      userId,
      ...(tags.length > 0 ? { tags: { connectOrCreate: connectOrCreateTags(userId, tags) } } : {}),
    },
    include: WITH_TAGS,
  });
  return toTransaction(row);
}

/** Mise à jour scopée par (id, userId) ; lève P2025 si la transaction n'existe pas. */
export async function updateTransaction(
  userId: string,
  id: string,
  data: Partial<Omit<TransactionWriteData, 'importHash'>>,
  tags?: readonly string[],
): Promise<Transaction> {
  const row = await prisma.transaction.update({
    where: { id, userId },
    data: {
      ...data,
      ...(tags !== undefined
        ? { tags: { set: [], connectOrCreate: connectOrCreateTags(userId, tags) } }
        : {}),
    },
    include: WITH_TAGS,
  });
  return toTransaction(row);
}

export async function deleteTransactions(userId: string, ids: readonly string[]): Promise<number> {
  let count = 0;
  await prisma.$transaction(async (tx) => {
    for (const part of chunk([...new Set(ids)], IN_CHUNK)) {
      const r = await tx.transaction.deleteMany({ where: { userId, id: { in: part } } });
      count += r.count;
    }
  });
  return count;
}

export async function setCategory(
  userId: string,
  ids: readonly string[],
  categoryId: string | null,
  categorySource: CategorySource | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const part of chunk([...new Set(ids)], IN_CHUNK)) {
      await tx.transaction.updateMany({
        where: { userId, id: { in: part } },
        data: { categoryId, categorySource, aiConfidence: null },
      });
    }
  });
}

/** Lecture non paginée d'une période (ordre chronologique), plafonnée à `limit`. */
export async function findInRange(
  userId: string,
  range: Partial<DateRange>,
  filter: { types?: readonly TransactionType[]; categoryIds?: readonly string[] } = {},
  limit: number = MAX_RANGE_ROWS,
): Promise<Transaction[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      ...dateWhere(range),
      ...(filter.types && filter.types.length > 0 ? { type: { in: [...filter.types] } } : {}),
      ...(filter.categoryIds && filter.categoryIds.length > 0
        ? { categoryId: { in: [...filter.categoryIds] } }
        : {}),
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    take: limit,
    include: WITH_TAGS,
  });
  return rows.map(toTransaction);
}

function dateWhere(range: Partial<DateRange>): { date?: { gte?: string; lte?: string } } {
  if (range.from === undefined && range.to === undefined) return {};
  return {
    date: {
      ...(range.from !== undefined ? { gte: range.from } : {}),
      ...(range.to !== undefined ? { lte: range.to } : {}),
    },
  };
}

/** Empreintes d'import déjà présentes pour l'utilisateur. */
export async function existingImportHashes(
  userId: string,
  hashes: readonly string[],
  db: Db = prisma,
): Promise<Set<string>> {
  const out = new Set<string>();
  for (const part of chunk([...new Set(hashes)], IN_CHUNK)) {
    const rows = await db.transaction.findMany({
      where: { userId, importHash: { in: part } },
      select: { importHash: true },
    });
    for (const r of rows) if (r.importHash !== null) out.add(r.importHash);
  }
  return out;
}

/** Revenus/dépenses d'une période (pour la détection de doublons à l'import). */
export async function findFlowsForDuplicates(
  userId: string,
  range: DateRange,
  db: Db = prisma,
): Promise<{ date: ISODate; amount: number; type: TransactionType; label: string }[]> {
  const rows = await db.transaction.findMany({
    where: { userId, type: { in: ['EXPENSE', 'INCOME'] }, date: { gte: range.from, lte: range.to } },
    select: { date: true, amount: true, type: true, label: true },
  });
  return rows.map((r) => ({ ...r, type: parseEnum(TRANSACTION_TYPES, r.type, 'Transaction.type') }));
}

/** Insertion en masse (sans tags). */
export async function createManyTransactions(
  userId: string,
  rows: readonly TransactionWriteData[],
  db: Db = prisma,
): Promise<number> {
  let count = 0;
  for (const part of chunk(rows, IN_CHUNK)) {
    const r = await db.transaction.createMany({ data: part.map((d) => ({ ...d, userId })) });
    count += r.count;
  }
  return count;
}

// ───────────────────────── Agrégats ─────────────────────────

export async function sumByType(
  userId: string,
  range: DateRange,
  types: readonly TransactionType[] = ['EXPENSE', 'INCOME'],
): Promise<TypeSum[]> {
  const groups = await prisma.transaction.groupBy({
    by: ['type'],
    where: { userId, type: { in: [...types] }, date: { gte: range.from, lte: range.to } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return groups.map((g) => ({
    type: parseEnum(TRANSACTION_TYPES, g.type, 'Transaction.type'),
    amount: g._sum.amount ?? 0,
    count: g._count._all,
  }));
}

export async function sumByCategory(
  userId: string,
  range: DateRange,
  type: 'EXPENSE' | 'INCOME',
): Promise<CategorySum[]> {
  const groups = await prisma.transaction.groupBy({
    by: ['categoryId'],
    where: { userId, type, date: { gte: range.from, lte: range.to } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return groups.map((g) => ({
    categoryId: g.categoryId,
    amount: g._sum.amount ?? 0,
    count: g._count._all,
  }));
}

/** Sommes par (catégorie, jour) — agrégées ensuite par mois dans le domaine. */
export async function sumByCategoryAndDay(
  userId: string,
  range: DateRange,
  type: 'EXPENSE' | 'INCOME',
): Promise<{ categoryId: string | null; date: ISODate; amount: number }[]> {
  const groups = await prisma.transaction.groupBy({
    by: ['categoryId', 'date'],
    where: { userId, type, date: { gte: range.from, lte: range.to } },
    _sum: { amount: true },
  });
  return groups.map((g) => ({ categoryId: g.categoryId, date: g.date, amount: g._sum.amount ?? 0 }));
}

/** Sommes par (jour, type) des revenus et dépenses — agrégées par mois dans le domaine. */
export async function sumByDayAndType(userId: string, range: DateRange): Promise<DailyTypeSum[]> {
  const groups = await prisma.transaction.groupBy({
    by: ['date', 'type'],
    where: { userId, type: { in: ['EXPENSE', 'INCOME'] }, date: { gte: range.from, lte: range.to } },
    _sum: { amount: true },
  });
  return groups.map((g) => ({
    date: g.date,
    type: parseEnum(TRANSACTION_TYPES, g.type, 'Transaction.type'),
    amount: g._sum.amount ?? 0,
  }));
}

export async function topTransactions(
  userId: string,
  range: DateRange,
  type: 'EXPENSE' | 'INCOME',
  limit: number,
): Promise<Transaction[]> {
  const rows = await prisma.transaction.findMany({
    where: { userId, type, date: { gte: range.from, lte: range.to } },
    orderBy: [{ amount: 'desc' }, { date: 'desc' }, { id: 'asc' }],
    take: limit,
    include: WITH_TAGS,
  });
  return rows.map(toTransaction);
}

/** Dates et règle liée de transactions (pour les conseils). */
export async function findDatesByIds(
  userId: string,
  ids: readonly string[],
): Promise<Map<string, { date: ISODate; recurringId: string | null }>> {
  const out = new Map<string, { date: ISODate; recurringId: string | null }>();
  for (const part of chunk([...new Set(ids)], IN_CHUNK)) {
    const rows = await prisma.transaction.findMany({
      where: { userId, id: { in: part } },
      select: { id: true, date: true, recurringId: true },
    });
    for (const r of rows) out.set(r.id, { date: r.date, recurringId: r.recurringId });
  }
  return out;
}
