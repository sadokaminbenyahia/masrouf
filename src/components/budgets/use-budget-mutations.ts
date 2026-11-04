'use client';
/**
 * Mutations des budgets avec mises à jour optimistes du cache TanStack Query, retour
 * arrière en cas d'erreur et toasts « Annuler ». Un budget est un plafond mensuel par
 * catégorie, identique pour tous les mois : les modifications s'appliquent à tous les mois
 * en cache.
 */
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { YearMonth } from '@/domain/dates';
import type { Millimes } from '@/domain/money';
import type { BudgetProgress, Category } from '@/domain/types';
import {
  deleteBudgetAction,
  reorderBudgetsAction,
  upsertBudgetAction,
} from '@/app/actions/budgets';
import { errorMessage, queryKeys, unwrap } from '@/lib/query';
import { toastError, toastSuccess, toastUndo } from '@/lib/toast';
import {
  isOptimisticBudgetId,
  optimisticProgress,
  sortByIds,
  withBudgetAmount,
} from './budget-utils';

type Snapshot = [QueryKey, BudgetProgress[] | undefined][];

export function useBudgetMutations(month: YearMonth) {
  const qc = useQueryClient();

  const snapshot = useCallback(
    (): Snapshot => qc.getQueriesData<BudgetProgress[]>({ queryKey: queryKeys.budgets() }),
    [qc],
  );
  const restore = useCallback(
    (snap: Snapshot) => {
      for (const [key, data] of snap) qc.setQueryData(key, data);
    },
    [qc],
  );
  const updateAll = useCallback(
    (fn: (list: BudgetProgress[]) => BudgetProgress[]) => {
      qc.setQueriesData<BudgetProgress[]>({ queryKey: queryKeys.budgets() }, (old) =>
        old ? fn(old) : old,
      );
    },
    [qc],
  );
  const invalidate = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.budgets() }),
      qc.invalidateQueries({ queryKey: queryKeys.dashboard() }),
    ]);
  }, [qc]);

  /** Applique un plafond (optimiste) ; renvoie true en cas de succès. */
  const saveAmount = useCallback(
    async (progress: BudgetProgress, amount: Millimes): Promise<boolean> => {
      const snap = snapshot();
      updateAll((list) =>
        list.map((p) => (p.budget.id === progress.budget.id ? withBudgetAmount(p, amount) : p)),
      );
      try {
        unwrap(await upsertBudgetAction({ categoryId: progress.budget.categoryId, amount }));
        return true;
      } catch (e) {
        restore(snap);
        toastError(errorMessage(e));
        return false;
      } finally {
        await invalidate();
      }
    },
    [snapshot, updateAll, restore, invalidate],
  );

  /** Change le plafond d'un budget existant ; « Annuler » rétablit l'ancien plafond. */
  const updateAmount = useCallback(
    async (progress: BudgetProgress, amount: Millimes) => {
      const previous = progress.budget.amount;
      if (amount === previous) return;
      if (!(await saveAmount(progress, amount))) return;
      toastUndo(`Plafond de ${progress.category.name} modifié.`, async () => {
        if (await saveAmount(withBudgetAmount(progress, amount), previous)) {
          toastSuccess(`Plafond de ${progress.category.name} rétabli.`);
        }
      });
    },
    [saveAmount],
  );

  /** Suppression d'un budget créé (utilisée par « Annuler »). */
  const removeById = useCallback(
    async (id: string, category: Category) => {
      const snap = snapshot();
      updateAll((list) => list.filter((p) => p.budget.id !== id));
      try {
        unwrap(await deleteBudgetAction(id));
        toastSuccess(`Budget ${category.name} retiré.`);
      } catch (e) {
        restore(snap);
        toastError(errorMessage(e));
      } finally {
        await invalidate();
      }
    },
    [snapshot, updateAll, restore, invalidate],
  );

  /** Crée (ou remplace) le budget d'une catégorie. Renvoie l'id créé, ou null en cas d'échec. */
  const create = useCallback(
    async (
      category: Category,
      amount: Millimes,
      opts: { undo?: boolean; silent?: boolean } = {},
    ): Promise<string | null> => {
      const snap = snapshot();
      qc.setQueryData<BudgetProgress[]>(queryKeys.budgets(month), (old) => {
        if (!old) return old;
        const existing = old.find((p) => p.budget.categoryId === category.id);
        if (existing) return old.map((p) => (p === existing ? withBudgetAmount(p, amount) : p));
        return [...old, optimisticProgress(category, amount, month, old.length)];
      });
      try {
        const budget = unwrap(await upsertBudgetAction({ categoryId: category.id, amount }));
        if (opts.undo) {
          toastSuccess(`Budget ${category.name} rétabli.`);
        } else if (!opts.silent) {
          toastUndo(`Budget ${category.name} créé.`, async () => {
            await removeById(budget.id, category);
          });
        }
        return budget.id;
      } catch (e) {
        restore(snap);
        toastError(errorMessage(e));
        return null;
      } finally {
        if (!opts.silent) await invalidate();
      }
    },
    [qc, month, snapshot, restore, invalidate, removeById],
  );

  /** Supprime un budget (optimiste) ; « Annuler » le recrée avec le même plafond. */
  const remove = useCallback(
    async (progress: BudgetProgress) => {
      const snap = snapshot();
      updateAll((list) => list.filter((p) => p.budget.id !== progress.budget.id));
      try {
        const deleted = unwrap(await deleteBudgetAction(progress.budget.id));
        toastUndo(`Budget ${progress.category.name} supprimé.`, async () => {
          await create(progress.category, deleted.amount, { undo: true });
        });
      } catch (e) {
        restore(snap);
        toastError(errorMessage(e));
      } finally {
        await invalidate();
      }
    },
    [snapshot, updateAll, restore, invalidate, create],
  );

  /** Applique plusieurs suggestions d'un coup ; « Annuler » supprime les budgets créés. */
  const createMany = useCallback(
    async (entries: { category: Category; amount: Millimes }[]) => {
      const created: { id: string; category: Category }[] = [];
      for (const { category, amount } of entries) {
        const id = await create(category, amount, { silent: true });
        if (id) created.push({ id, category });
      }
      await invalidate();
      if (created.length === 0) return;
      const label = created.length === 1 ? '1 budget créé.' : `${created.length} budgets créés.`;
      toastUndo(label, async () => {
        const snap = snapshot();
        const ids = new Set(created.map((c) => c.id));
        updateAll((list) => list.filter((p) => !ids.has(p.budget.id)));
        try {
          for (const c of created) unwrap(await deleteBudgetAction(c.id));
          toastSuccess('Budgets retirés.');
        } catch (e) {
          restore(snap);
          toastError(errorMessage(e));
        } finally {
          await invalidate();
        }
      });
    },
    [create, invalidate, snapshot, updateAll, restore],
  );

  /** Réordonne (optimiste) ; lève l'erreur pour que la liste revienne à l'ordre initial. */
  const reorder = useCallback(
    async (ids: string[]) => {
      const serverIds = ids.filter((id) => !isOptimisticBudgetId(id));
      if (serverIds.length === 0) return;
      const snap = snapshot();
      updateAll((list) => sortByIds(list, ids));
      try {
        unwrap(await reorderBudgetsAction(serverIds));
      } catch (e) {
        restore(snap);
        toastError(`Impossible de réordonner les budgets. ${errorMessage(e)}`);
        throw e;
      } finally {
        await invalidate();
      }
    },
    [snapshot, updateAll, restore, invalidate],
  );

  return { updateAmount, create, remove, createMany, reorder };
}
