// Propriétaire : agent A
import 'server-only';
import type { ISODate } from '@/domain/dates';
import type { Result } from '@/domain/result';
import type { RecurringRule } from '@/domain/types';
import type { RecurringInputData, RecurringPatchData } from '@/lib/schemas/recurring';
import { notImplemented } from './_stub';

export async function listRecurring(_userId: string): Promise<Result<RecurringRule[]>> {
  return notImplemented('listRecurring');
}
export async function createRecurring(
  _userId: string,
  _input: RecurringInputData,
): Promise<Result<RecurringRule>> {
  return notImplemented('createRecurring');
}
export async function updateRecurring(
  _userId: string,
  _id: string,
  _patch: RecurringPatchData,
): Promise<Result<RecurringRule>> {
  return notImplemented('updateRecurring');
}
export async function deleteRecurring(
  _userId: string,
  _id: string,
): Promise<Result<{ id: string }>> {
  return notImplemented('deleteRecurring');
}
/** Crée les transactions des échéances ≤ today (autoCreate) et avance nextDate. Idempotent. */
export async function materializeDueRecurring(
  _userId: string,
  _today: ISODate,
): Promise<Result<{ created: number }>> {
  return notImplemented('materializeDueRecurring');
}
