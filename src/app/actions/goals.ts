'use server';
import { z } from 'zod';
import type { ActionResult } from '@/domain/result';
import type { Goal, GoalProgress } from '@/domain/types';
import {
  goalContributionSchema,
  goalInputSchema,
  goalPatchSchema,
  type GoalInput,
  type GoalPatch,
} from '@/lib/schemas/budgets';
import { idSchema, reorderSchema } from '@/lib/schemas/common';
import { authedAction, validatedAction } from '@/server/actions/safe-action';
import * as goals from '@/server/services/goals.service';
import { revalidateApp } from './_revalidate';

export async function listGoalsAction(): Promise<ActionResult<GoalProgress[]>> {
  return authedAction((userId) => goals.listGoals(userId));
}

export async function createGoalAction(input: GoalInput): Promise<ActionResult<GoalProgress>> {
  const r = await validatedAction(goalInputSchema, input, (d, userId) =>
    goals.createGoal(userId, d),
  );
  if (r.ok) revalidateApp();
  return r;
}

export async function updateGoalAction(
  id: string,
  patch: GoalPatch,
): Promise<ActionResult<GoalProgress>> {
  const r = await validatedAction(
    z.object({ id: idSchema, patch: goalPatchSchema }),
    { id, patch },
    (d, userId) => goals.updateGoal(userId, d.id, d.patch),
  );
  if (r.ok) revalidateApp();
  return r;
}

/** Renvoie l'objectif supprimé (pour « Annuler » via createGoalAction). */
export async function deleteGoalAction(id: string): Promise<ActionResult<Goal>> {
  const r = await validatedAction(idSchema, id, (d, userId) => goals.deleteGoal(userId, d));
  if (r.ok) revalidateApp();
  return r;
}

export async function contributeToGoalAction(
  id: string,
  amount: number,
): Promise<ActionResult<GoalProgress>> {
  const r = await validatedAction(
    z.object({ id: idSchema }).and(goalContributionSchema),
    { id, amount },
    (d, userId) => goals.contributeToGoal(userId, d.id, d.amount),
  );
  if (r.ok) revalidateApp();
  return r;
}

export async function reorderGoalsAction(ids: string[]): Promise<ActionResult<void>> {
  const r = await validatedAction(reorderSchema, { ids }, (d, userId) =>
    goals.reorderGoals(userId, d.ids),
  );
  if (r.ok) revalidateApp();
  return r;
}
