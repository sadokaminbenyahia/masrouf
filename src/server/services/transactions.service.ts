// Propriétaire : agent A
import 'server-only';
import type { DateRange } from '@/domain/dates';
import type { Result } from '@/domain/result';
import type { Paginated, Transaction, TransactionTotals, TransactionType } from '@/domain/types';
import type {
  TransactionInputData,
  TransactionPatchData,
  TransactionQueryData,
  TransactionSnapshotData,
} from '@/lib/schemas/transactions';
import { notImplemented } from './_stub';

export type TransactionPage = Paginated<Transaction> & { totals: TransactionTotals };

/** Pagination côté serveur + totaux du filtre courant. */
export async function listTransactions(
  _userId: string,
  _query: TransactionQueryData,
): Promise<Result<TransactionPage>> {
  return notImplemented('listTransactions');
}
export async function getTransaction(_userId: string, _id: string): Promise<Result<Transaction>> {
  return notImplemented('getTransaction');
}
/** Si `categoryId` est undefined (et type ≠ TRANSFER), la catégorie est prédite par l'IA (categorySource = 'AI'). */
export async function createTransaction(
  _userId: string,
  _input: TransactionInputData,
): Promise<Result<Transaction>> {
  return notImplemented('createTransaction');
}
/** Si la catégorie change, l'IA apprend la correction (categorySource = 'USER'). */
export async function updateTransaction(
  _userId: string,
  _id: string,
  _patch: TransactionPatchData,
): Promise<Result<{ before: Transaction; after: Transaction }>> {
  return notImplemented('updateTransaction');
}
/** Renvoie l'instantané nécessaire à « Annuler ». */
export async function deleteTransaction(
  _userId: string,
  _id: string,
): Promise<Result<TransactionSnapshotData>> {
  return notImplemented('deleteTransaction');
}
export async function restoreTransaction(
  _userId: string,
  _snapshot: TransactionSnapshotData,
): Promise<Result<Transaction>> {
  return notImplemented('restoreTransaction');
}
export async function duplicateTransaction(
  _userId: string,
  _id: string,
  _date?: string,
): Promise<Result<Transaction>> {
  return notImplemented('duplicateTransaction');
}
export async function bulkDeleteTransactions(
  _userId: string,
  _ids: string[],
): Promise<Result<TransactionSnapshotData[]>> {
  return notImplemented('bulkDeleteTransactions');
}
export async function bulkCategorize(
  _userId: string,
  _ids: string[],
  _categoryId: string | null,
): Promise<Result<{ before: Transaction[]; after: Transaction[] }>> {
  return notImplemented('bulkCategorize');
}
/** Lecture non paginée (≤ 20 000 lignes) pour l'IA et les agrégats. */
export async function getTransactionsInRange(
  _userId: string,
  _range: DateRange,
  _filter?: { types?: TransactionType[]; categoryIds?: string[] },
): Promise<Result<Transaction[]>> {
  return notImplemented('getTransactionsInRange');
}
/** CSV (séparateur « ; », UTF-8 avec BOM, montants « 12,500 »). */
export async function exportTransactionsCsv(
  _userId: string,
  _range?: Partial<DateRange>,
): Promise<Result<string>> {
  return notImplemented('exportTransactionsCsv');
}
