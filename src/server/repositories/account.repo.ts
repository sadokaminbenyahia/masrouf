import 'server-only';
import type { Account as AccountRow } from '@prisma/client';
import type { AccountTypeSum, IncomingTransferSum } from '@/domain/accounts';
import { ACCOUNT_TYPES, TRANSACTION_TYPES, type Account, type AccountType } from '@/domain/types';
import { prisma } from '@/server/db';
import { parseEnum, type Db } from './_shared';

export function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    type: parseEnum(ACCOUNT_TYPES, row.type, 'Account.type'),
    initialBalance: row.initialBalance,
    color: row.color,
    archived: row.archived,
    sortOrder: row.sortOrder,
  };
}

export async function listAccounts(
  userId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<Account[]> {
  const rows = await prisma.account.findMany({
    where: { userId, ...(opts.includeArchived === true ? {} : { archived: false }) },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toAccount);
}

export async function findAccount(
  userId: string,
  id: string,
  db: Db = prisma,
): Promise<Account | null> {
  const row = await db.account.findFirst({ where: { id, userId } });
  return row ? toAccount(row) : null;
}

/** Identifiants (parmi `ids`) appartenant à l'utilisateur. */
export async function ownedAccountIds(
  userId: string,
  ids: readonly string[],
  db: Db = prisma,
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db.account.findMany({
    where: { userId, id: { in: [...new Set(ids)] } },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

export async function nextSortOrder(userId: string, db: Db = prisma): Promise<number> {
  const agg = await db.account.aggregate({ where: { userId }, _max: { sortOrder: true } });
  return (agg._max.sortOrder ?? -1) + 1;
}

export async function createAccount(
  userId: string,
  data: {
    name: string;
    type: AccountType;
    initialBalance: number;
    color: string;
    sortOrder: number;
  },
  db: Db = prisma,
): Promise<Account> {
  return toAccount(await db.account.create({ data: { ...data, userId } }));
}

/** Mise à jour scopée ; null si le compte n'appartient pas à l'utilisateur. */
export async function updateAccount(
  userId: string,
  id: string,
  data: Partial<{
    name: string;
    type: AccountType;
    initialBalance: number;
    color: string;
    archived: boolean;
  }>,
): Promise<Account | null> {
  const { count } = await prisma.account.updateMany({ where: { id, userId }, data });
  return count === 0 ? null : findAccount(userId, id);
}

export async function deleteAccount(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.account.deleteMany({ where: { id, userId } });
  return count > 0;
}

/** Transactions liées au compte (source ou destination d'un virement) et règles récurrentes. */
export async function countAccountUsage(
  userId: string,
  id: string,
): Promise<{ transactions: number; recurring: number }> {
  const [transactions, recurring] = await Promise.all([
    prisma.transaction.count({
      where: { userId, OR: [{ accountId: id }, { transferAccountId: id }] },
    }),
    prisma.recurringRule.count({ where: { userId, accountId: id } }),
  ]);
  return { transactions, recurring };
}

/** Applique l'ordre donné (index = sortOrder) aux comptes de l'utilisateur. */
export async function reorderAccounts(userId: string, ids: readonly string[]): Promise<void> {
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.account.updateMany({ where: { id, userId }, data: { sortOrder: index } }),
    ),
  );
}

/** Agrégats SQL nécessaires au calcul des soldes (pas de chargement des transactions). */
export async function balanceAggregates(
  userId: string,
): Promise<{ sums: AccountTypeSum[]; incoming: IncomingTransferSum[] }> {
  const [byType, incoming] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['accountId', 'type'],
      where: { userId },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ['transferAccountId'],
      where: { userId, type: 'TRANSFER', transferAccountId: { not: null } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);
  return {
    sums: byType.map((g) => ({
      accountId: g.accountId,
      type: parseEnum(TRANSACTION_TYPES, g.type, 'Transaction.type'),
      amount: g._sum.amount ?? 0,
      count: g._count._all,
    })),
    incoming: incoming.flatMap((g) =>
      g.transferAccountId === null
        ? []
        : [
            {
              transferAccountId: g.transferAccountId,
              amount: g._sum.amount ?? 0,
              count: g._count._all,
            },
          ],
    ),
  };
}
