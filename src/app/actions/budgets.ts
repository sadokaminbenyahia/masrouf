'use server';
import type { ActionResult } from '@/domain/result';
import type { Budget, BudgetProgress } from '@/domain/types';
import { budgetUpsertSchema, type BudgetUpsertInput } from '@/lib/schemas/budgets';
import { idSchema, reorderSchema, yearMonthSchema } from '@/lib/schemas/common';
import { validatedAction } from '@/server/actions/safe-action';
import * as budgets from '@/server/services/budgets.service';
import { revalidateApp } from './_revalidate';

export async function listBudgetProgressAction(
  month: string,
): Promise<ActionResult<BudgetProgress[]>> {
  return validatedAction(yearMonthSchema, month, (m, userId) =>
    budgets.listBudgetProgress(userId, m),
  );
}

export async function upsertBudgetAction(input: BudgetUpsertInput): Promise<ActionResult<Budget>> {
  const r = await validatedAction(budgetUpsertSchema, input, (d, userId) =>
    budgets.upsertBudget(userId, d),
  );
  if (r.ok) revalidateApp();
  return r;
}

/** Renvoie le budget supprimé (pour « Annuler » via upsertBudgetAction). */
export async function deleteBudgetAction(id: string): Promise<ActionResult<Budget>> {
  const r = await validatedAction(idSchema, id, (d, userId) => budgets.deleteBudget(userId, d));
  if (r.ok) revalidateApp();
  return r;
}

export async function reorderBudgetsAction(ids: string[]): Promise<ActionResult<void>> {
  const r = await validatedAction(reorderSchema, { ids }, (d, userId) =>
    budgets.reorderBudgets(userId, d.ids),
  );
  if (r.ok) revalidateApp();
  return r;
}
