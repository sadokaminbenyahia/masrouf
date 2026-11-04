'use client';
/**
 * Mutations des transactions depuis le tableau : optimistes (cache de la page courante),
 * rollback + toast d'erreur en cas d'échec, toast « Annuler » en cas de succès.
 */
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import {
  bulkCategorizeAction,
  bulkDeleteTransactionsAction,
  deleteTransactionAction,
  duplicateTransactionAction,
  restoreTransactionAction,
  restoreTransactionsAction,
  updateTransactionAction,
  type TransactionPage,
} from '@/app/actions/transactions';
import type { ISODate } from '@/domain/dates';
import type { Transaction } from '@/domain/types';
import { errorMessage, unwrap } from '@/lib/query';
import type { TransactionPatch } from '@/lib/schemas/transactions';
import { toastError, toastSuccess, toastUndo } from '@/lib/toast';
import { invalidateFinanceQueries } from './cache';
import { buildUndoPatch, patchPage, removeFromPage } from './optimistic';

interface CacheContext {
  key: QueryKey;
  previous: TransactionPage | undefined;
}

export function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n > 1 ? plural : singular}`;
}

export function useTransactionMutations(pageKey: QueryKey) {
  const queryClient = useQueryClient();

  async function optimistic(
    update: (page: TransactionPage) => TransactionPage,
  ): Promise<CacheContext> {
    const key = pageKey;
    await queryClient.cancelQueries({ queryKey: key });
    const previous = queryClient.getQueryData<TransactionPage>(key);
    if (previous) queryClient.setQueryData<TransactionPage>(key, update(previous));
    return { key, previous };
  }

  function rollback(ctx: CacheContext | undefined): void {
    if (ctx?.previous) queryClient.setQueryData<TransactionPage>(ctx.key, ctx.previous);
  }

  const settle = () => invalidateFinanceQueries(queryClient);

  /** Rejoue une opération d'annulation (optimiste, puis resynchronisation). */
  async function runUndo(
    apply: ((page: TransactionPage) => TransactionPage) | null,
    action: () => Promise<unknown>,
    successMessage: string,
  ): Promise<void> {
    const ctx = apply ? await optimistic(apply) : undefined;
    try {
      await action();
      toastSuccess(successMessage);
    } catch (e) {
      rollback(ctx);
      toastError(errorMessage(e));
    } finally {
      await settle();
    }
  }

  const update = useMutation({
    mutationFn: async (v: { id: string; patch: TransactionPatch; message: string | null }) =>
      unwrap(await updateTransactionAction(v.id, v.patch)),
    onMutate: (v) => optimistic((page) => patchPage(page, new Map([[v.id, v.patch]]))),
    onError: (e, _v, ctx) => {
      rollback(ctx);
      toastError(errorMessage(e));
    },
    onSuccess: ({ before }, v) => {
      if (v.message === null) {
        toastSuccess('Catégorie confirmée');
        return;
      }
      const undo = buildUndoPatch(before, v.patch);
      toastUndo(v.message, () =>
        runUndo(
          (page) => patchPage(page, new Map([[v.id, undo]])),
          async () => unwrap(await updateTransactionAction(v.id, undo)),
          'Modification annulée',
        ),
      );
    },
    onSettled: settle,
  });

  const remove = useMutation({
    mutationFn: async (t: Transaction) => unwrap(await deleteTransactionAction(t.id)),
    onMutate: (t) => optimistic((page) => removeFromPage(page, [t.id])),
    onError: (e, _t, ctx) => {
      rollback(ctx);
      toastError(errorMessage(e));
    },
    onSuccess: (snapshot) => {
      toastUndo('Transaction supprimée', () =>
        runUndo(
          null,
          async () => unwrap(await restoreTransactionAction(snapshot)),
          'Transaction restaurée',
        ),
      );
    },
    onSettled: settle,
  });

  const duplicate = useMutation({
    mutationFn: async (v: { t: Transaction; date: ISODate }) =>
      unwrap(await duplicateTransactionAction(v.t.id, v.date)),
    onError: (e) => toastError(errorMessage(e)),
    onSuccess: (copy) => {
      toastUndo('Transaction dupliquée', () =>
        runUndo(
          (page) => removeFromPage(page, [copy.id]),
          async () => unwrap(await deleteTransactionAction(copy.id)),
          'Duplication annulée',
        ),
      );
    },
    onSettled: settle,
  });

  const bulkRemove = useMutation({
    mutationFn: async (list: Transaction[]) =>
      unwrap(await bulkDeleteTransactionsAction(list.map((t) => t.id))),
    onMutate: (list) =>
      optimistic((page) =>
        removeFromPage(
          page,
          list.map((t) => t.id),
        ),
      ),
    onError: (e, _list, ctx) => {
      rollback(ctx);
      toastError(errorMessage(e));
    },
    onSuccess: (snapshots) => {
      if (snapshots.length === 0) return;
      toastUndo(
        `${pluralize(snapshots.length, 'transaction supprimée', 'transactions supprimées')}`,
        () =>
          runUndo(
            null,
            async () => unwrap(await restoreTransactionsAction(snapshots)),
            pluralize(snapshots.length, 'transaction restaurée', 'transactions restaurées'),
          ),
      );
    },
    onSettled: settle,
  });

  const bulkCategorize = useMutation({
    mutationFn: async (v: { list: Transaction[]; categoryId: string | null }) =>
      unwrap(
        await bulkCategorizeAction(
          v.list.map((t) => t.id),
          v.categoryId,
        ),
      ),
    onMutate: (v) =>
      optimistic((page) =>
        patchPage(page, new Map(v.list.map((t) => [t.id, { categoryId: v.categoryId }]))),
      ),
    onError: (e, _v, ctx) => {
      rollback(ctx);
      toastError(errorMessage(e));
    },
    onSuccess: ({ before }) => {
      if (before.length === 0) return;
      // Regroupe les catégories d'origine pour rejouer un minimum d'appels.
      const groups = new Map<string | null, string[]>();
      for (const t of before) {
        const ids = groups.get(t.categoryId) ?? [];
        ids.push(t.id);
        groups.set(t.categoryId, ids);
      }
      toastUndo(
        pluralize(before.length, 'transaction catégorisée', 'transactions catégorisées'),
        () =>
          runUndo(
            (page) =>
              patchPage(page, new Map(before.map((t) => [t.id, { categoryId: t.categoryId }]))),
            async () => {
              for (const [categoryId, ids] of groups) {
                unwrap(await bulkCategorizeAction(ids, categoryId));
              }
            },
            'Catégorisation annulée',
          ),
      );
    },
    onSettled: settle,
  });

  return {
    updateTransaction: (t: Transaction, patch: TransactionPatch) =>
      update.mutate({ id: t.id, patch, message: 'Transaction modifiée' }),
    /** Confirme une catégorie proposée par l'IA (elle devient une catégorie choisie). */
    confirmCategory: (t: Transaction) => {
      if (t.categoryId === null) return;
      update.mutate({ id: t.id, patch: { categoryId: t.categoryId }, message: null });
    },
    deleteTransaction: (t: Transaction) => remove.mutate(t),
    duplicateTransaction: (t: Transaction, date: ISODate) => duplicate.mutate({ t, date }),
    bulkDelete: (list: Transaction[]) => bulkRemove.mutate(list),
    bulkCategorize: (list: Transaction[], categoryId: string | null) =>
      bulkCategorize.mutate({ list, categoryId }),
    bulkPending: bulkRemove.isPending || bulkCategorize.isPending,
  };
}
