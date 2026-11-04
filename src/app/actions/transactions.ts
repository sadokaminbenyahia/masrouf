'use server';
import { z } from 'zod';
import type { ActionResult } from '@/domain/result';
import type { Transaction } from '@/domain/types';
import { idSchema, isoDateSchema } from '@/lib/schemas/common';
import {
  transactionInputSchema,
  transactionPatchSchema,
  transactionQuerySchema,
  transactionSnapshotSchema,
  type TransactionInput,
  type TransactionPatch,
  type TransactionQueryInput,
  type TransactionSnapshot,
  type TransactionSnapshotData,
} from '@/lib/schemas/transactions';
import { validatedAction } from '@/server/actions/safe-action';
import * as tx from '@/server/services/transactions.service';
import { revalidateApp } from './_revalidate';

export type { TransactionPage } from '@/server/services/transactions.service';

export async function listTransactionsAction(
  query: TransactionQueryInput,
): Promise<ActionResult<tx.TransactionPage>> {
  return validatedAction(transactionQuerySchema, query, (q, userId) =>
    tx.listTransactions(userId, q),
  );
}

export async function createTransactionAction(
  input: TransactionInput,
): Promise<ActionResult<Transaction>> {
  const r = await validatedAction(transactionInputSchema, input, (d, userId) =>
    tx.createTransaction(userId, d),
  );
  if (r.ok) revalidateApp();
  return r;
}

export async function updateTransactionAction(
  id: string,
  patch: TransactionPatch,
): Promise<ActionResult<{ before: Transaction; after: Transaction }>> {
  const r = await validatedAction(
    z.object({ id: idSchema, patch: transactionPatchSchema }),
    { id, patch },
    (d, userId) => tx.updateTransaction(userId, d.id, d.patch),
  );
  if (r.ok) revalidateApp();
  return r;
}

export async function deleteTransactionAction(
  id: string,
): Promise<ActionResult<TransactionSnapshotData>> {
  const r = await validatedAction(idSchema, id, (d, userId) => tx.deleteTransaction(userId, d));
  if (r.ok) revalidateApp();
  return r;
}

export async function restoreTransactionAction(
  snapshot: TransactionSnapshot,
): Promise<ActionResult<Transaction>> {
  const r = await validatedAction(transactionSnapshotSchema, snapshot, (d, userId) =>
    tx.restoreTransaction(userId, d),
  );
  if (r.ok) revalidateApp();
  return r;
}

export async function restoreTransactionsAction(
  snapshots: TransactionSnapshot[],
): Promise<ActionResult<Transaction[]>> {
  const r = await validatedAction(
    z.array(transactionSnapshotSchema).min(1).max(500),
    snapshots,
    async (list, userId) => {
      const restored: Transaction[] = [];
      for (const s of list) {
        const one = await tx.restoreTransaction(userId, s);
        if (!one.ok) return one;
        restored.push(one.value);
      }
      return { ok: true as const, value: restored };
    },
  );
  if (r.ok) revalidateApp();
  return r;
}

export async function duplicateTransactionAction(
  id: string,
  date?: string,
): Promise<ActionResult<Transaction>> {
  const r = await validatedAction(
    z.object({ id: idSchema, date: isoDateSchema.optional() }),
    { id, date },
    (d, userId) => tx.duplicateTransaction(userId, d.id, d.date),
  );
  if (r.ok) revalidateApp();
  return r;
}

export async function bulkDeleteTransactionsAction(
  ids: string[],
): Promise<ActionResult<TransactionSnapshotData[]>> {
  const r = await validatedAction(z.array(idSchema).min(1).max(500), ids, (d, userId) =>
    tx.bulkDeleteTransactions(userId, d),
  );
  if (r.ok) revalidateApp();
  return r;
}

export async function bulkCategorizeAction(
  ids: string[],
  categoryId: string | null,
): Promise<ActionResult<{ before: Transaction[]; after: Transaction[] }>> {
  const r = await validatedAction(
    z.object({ ids: z.array(idSchema).min(1).max(500), categoryId: idSchema.nullable() }),
    { ids, categoryId },
    (d, userId) => tx.bulkCategorize(userId, d.ids, d.categoryId),
  );
  if (r.ok) revalidateApp();
  return r;
}
