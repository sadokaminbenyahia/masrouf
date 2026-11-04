'use server';
import { z } from 'zod';
import type { ActionResult } from '@/domain/result';
import type { RecurringRule } from '@/domain/types';
import { idSchema } from '@/lib/schemas/common';
import {
  recurringInputSchema,
  recurringPatchSchema,
  type RecurringInput,
  type RecurringPatch,
} from '@/lib/schemas/recurring';
import { authedAction, validatedAction } from '@/server/actions/safe-action';
import * as recurring from '@/server/services/recurring.service';
import { revalidateApp } from './_revalidate';

export async function listRecurringAction(): Promise<ActionResult<RecurringRule[]>> {
  return authedAction((userId) => recurring.listRecurring(userId));
}

export async function createRecurringAction(
  input: RecurringInput,
): Promise<ActionResult<RecurringRule>> {
  const r = await validatedAction(recurringInputSchema, input, (d, userId) =>
    recurring.createRecurring(userId, d),
  );
  if (r.ok) revalidateApp();
  return r;
}

export async function updateRecurringAction(
  id: string,
  patch: RecurringPatch,
): Promise<ActionResult<RecurringRule>> {
  const r = await validatedAction(
    z.object({ id: idSchema, patch: recurringPatchSchema }),
    { id, patch },
    (d, userId) => recurring.updateRecurring(userId, d.id, d.patch),
  );
  if (r.ok) revalidateApp();
  return r;
}

export async function deleteRecurringAction(id: string): Promise<ActionResult<{ id: string }>> {
  const r = await validatedAction(idSchema, id, (d, userId) =>
    recurring.deleteRecurring(userId, d),
  );
  if (r.ok) revalidateApp();
  return r;
}
