// Propriétaire : agent A
import 'server-only';
import type { YearMonth } from '@/domain/dates';
import type { Result } from '@/domain/result';
import type { Budget, BudgetProgress } from '@/domain/types';
import type { BudgetUpsertData } from '@/lib/schemas/budgets';
import { notImplemented } from './_stub';

export async function listBudgetProgress(
  _userId: string,
  _month: YearMonth,
): Promise<Result<BudgetProgress[]>> {
  return notImplemented('listBudgetProgress');
}
export async function upsertBudget(
  _userId: string,
  _input: BudgetUpsertData,
): Promise<Result<Budget>> {
  return notImplemented('upsertBudget');
}
export async function deleteBudget(_userId: string, _id: string): Promise<Result<Budget>> {
  return notImplemented('deleteBudget');
}
export async function reorderBudgets(_userId: string, _ids: string[]): Promise<Result<void>> {
  return notImplemented('reorderBudgets');
}
