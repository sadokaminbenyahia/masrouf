'use client';
/**
 * Mutations des objectifs : versements/retraits et suppressions optimistes, toasts
 * « Annuler » (montant inverse rejoué, ou recréation avec les valeurs supprimées).
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Millimes } from '@/domain/money';
import type { GoalProgress } from '@/domain/types';
import {
  contributeToGoalAction,
  createGoalAction,
  deleteGoalAction,
  reorderGoalsAction,
  updateGoalAction,
} from '@/app/actions/goals';
import type { GoalInput, GoalPatch } from '@/lib/schemas/budgets';
import { errorMessage, queryKeys, unwrap } from '@/lib/query';
import { toastError, toastSuccess, toastUndo } from '@/lib/toast';
import { applyContribution, becameCompleted, goalToInput, sortGoalsByIds } from './goal-utils';

export function useGoalMutations(opts: { onCompleted: (goal: GoalProgress) => void }) {
  const qc = useQueryClient();
  const { onCompleted } = opts;

  const getList = useCallback(() => qc.getQueryData<GoalProgress[]>(queryKeys.goals), [qc]);
  const setList = useCallback(
    (fn: (list: GoalProgress[]) => GoalProgress[]) =>
      qc.setQueryData<GoalProgress[]>(queryKeys.goals, (old) => (old ? fn(old) : old)),
    [qc],
  );
  const restore = useCallback(
    (snap: GoalProgress[] | undefined) => qc.setQueryData(queryKeys.goals, snap),
    [qc],
  );
  const replace = useCallback(
    (goal: GoalProgress) => setList((list) => list.map((g) => (g.id === goal.id ? goal : g))),
    [setList],
  );
  const invalidate = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.goals }),
      qc.invalidateQueries({ queryKey: queryKeys.dashboard() }),
      qc.invalidateQueries({ queryKey: ['ai', 'what-if'] }),
    ]);
  }, [qc]);

  /** Versement (>0) ou retrait (<0), optimiste. Renvoie l'objectif à jour ou null. */
  const applyDelta = useCallback(
    async (goal: GoalProgress, delta: Millimes): Promise<GoalProgress | null> => {
      const snap = getList();
      replace(applyContribution(goal, delta));
      try {
        const updated = unwrap(await contributeToGoalAction(goal.id, delta));
        replace(updated);
        return updated;
      } catch (e) {
        restore(snap);
        toastError(errorMessage(e));
        return null;
      } finally {
        await invalidate();
      }
    },
    [getList, replace, restore, invalidate],
  );

  const contribute = useCallback(
    async (goal: GoalProgress, delta: Millimes) => {
      const updated = await applyDelta(goal, delta);
      if (!updated) return;
      if (becameCompleted(goal, updated)) onCompleted(updated);
      const message =
        delta > 0
          ? `Versement ajouté à « ${goal.name} ».`
          : `Retrait effectué sur « ${goal.name} ».`;
      toastUndo(message, async () => {
        if (await applyDelta(updated, -delta)) {
          toastSuccess(delta > 0 ? 'Versement annulé.' : 'Retrait annulé.');
        }
      });
    },
    [applyDelta, onCompleted],
  );

  const create = useCallback(
    async (input: GoalInput, opts: { undo?: boolean } = {}): Promise<GoalProgress | null> => {
      try {
        const created = unwrap(await createGoalAction(input));
        setList((list) => (list.some((g) => g.id === created.id) ? list : [...list, created]));
        toastSuccess(opts.undo ? `Objectif « ${created.name} » rétabli.` : 'Objectif créé.');
        return created;
      } catch (e) {
        toastError(errorMessage(e));
        return null;
      } finally {
        await invalidate();
      }
    },
    [setList, invalidate],
  );

  const update = useCallback(
    async (goal: GoalProgress, patch: GoalPatch): Promise<boolean> => {
      try {
        const updated = unwrap(await updateGoalAction(goal.id, patch));
        replace(updated);
        if (becameCompleted(goal, updated)) onCompleted(updated);
        toastUndo(`Objectif « ${updated.name} » modifié.`, async () => {
          try {
            replace(unwrap(await updateGoalAction(goal.id, goalToInput(goal))));
            toastSuccess('Modification annulée.');
          } finally {
            await invalidate();
          }
        });
        return true;
      } catch (e) {
        toastError(errorMessage(e));
        return false;
      } finally {
        await invalidate();
      }
    },
    [replace, invalidate, onCompleted],
  );

  const remove = useCallback(
    async (goal: GoalProgress) => {
      const snap = getList();
      setList((list) => list.filter((g) => g.id !== goal.id));
      try {
        const deleted = unwrap(await deleteGoalAction(goal.id));
        toastUndo(`Objectif « ${goal.name} » supprimé.`, async () => {
          await create(goalToInput(deleted), { undo: true });
        });
      } catch (e) {
        restore(snap);
        toastError(errorMessage(e));
      } finally {
        await invalidate();
      }
    },
    [getList, setList, restore, invalidate, create],
  );

  /** Réordonne (optimiste) ; lève l'erreur pour que la liste revienne à l'ordre initial. */
  const reorder = useCallback(
    async (ids: string[]) => {
      const snap = getList();
      setList((list) => sortGoalsByIds(list, ids));
      try {
        unwrap(await reorderGoalsAction(ids));
      } catch (e) {
        restore(snap);
        toastError(`Impossible de réordonner les objectifs. ${errorMessage(e)}`);
        throw e;
      } finally {
        await invalidate();
      }
    },
    [getList, setList, restore, invalidate],
  );

  return { contribute, create, update, remove, reorder };
}
