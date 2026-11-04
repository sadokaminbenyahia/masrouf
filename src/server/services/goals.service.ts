// Propriétaire : agent A
import 'server-only';
import type { Result } from '@/domain/result';
import type { Goal, GoalProgress } from '@/domain/types';
import type { GoalInputData, GoalPatchData } from '@/lib/schemas/budgets';
import { notImplemented } from './_stub';

export async function listGoals(_userId: string): Promise<Result<GoalProgress[]>> {
  return notImplemented('listGoals');
}
export async function createGoal(
  _userId: string,
  _input: GoalInputData,
): Promise<Result<GoalProgress>> {
  return notImplemented('createGoal');
}
export async function updateGoal(
  _userId: string,
  _id: string,
  _patch: GoalPatchData,
): Promise<Result<GoalProgress>> {
  return notImplemented('updateGoal');
}
export async function deleteGoal(_userId: string, _id: string): Promise<Result<Goal>> {
  return notImplemented('deleteGoal');
}
/** Versement (>0) ou retrait (<0) ; marque completedAt quand la cible est atteinte. */
export async function contributeToGoal(
  _userId: string,
  _id: string,
  _amount: number,
): Promise<Result<GoalProgress>> {
  return notImplemented('contributeToGoal');
}
export async function reorderGoals(_userId: string, _ids: string[]): Promise<Result<void>> {
  return notImplemented('reorderGoals');
}
