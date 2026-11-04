'use server';
import { z } from 'zod';
import type { ActionResult } from '@/domain/result';
import type { Account, AccountWithBalance } from '@/domain/types';
import {
  accountInputSchema,
  accountPatchSchema,
  type AccountInput,
  type AccountPatch,
} from '@/lib/schemas/accounts';
import { idSchema, reorderSchema } from '@/lib/schemas/common';
import { authedAction, validatedAction } from '@/server/actions/safe-action';
import * as accounts from '@/server/services/accounts.service';
import { revalidateApp } from './_revalidate';

export async function listAccountsAction(opts?: {
  includeArchived?: boolean;
}): Promise<ActionResult<AccountWithBalance[]>> {
  return authedAction((userId) =>
    accounts.listAccounts(userId, { includeArchived: opts?.includeArchived === true }),
  );
}

export async function createAccountAction(input: AccountInput): Promise<ActionResult<Account>> {
  const r = await validatedAction(accountInputSchema, input, (data, userId) =>
    accounts.createAccount(userId, data),
  );
  if (r.ok) revalidateApp();
  return r;
}

export async function updateAccountAction(
  id: string,
  patch: AccountPatch,
): Promise<ActionResult<Account>> {
  const r = await validatedAction(
    z.object({ id: idSchema, patch: accountPatchSchema }),
    { id, patch },
    (d, userId) => accounts.updateAccount(userId, d.id, d.patch),
  );
  if (r.ok) revalidateApp();
  return r;
}

export async function deleteAccountAction(id: string): Promise<ActionResult<{ id: string }>> {
  const r = await validatedAction(idSchema, id, (d, userId) => accounts.deleteAccount(userId, d));
  if (r.ok) revalidateApp();
  return r;
}

export async function reorderAccountsAction(ids: string[]): Promise<ActionResult<void>> {
  const r = await validatedAction(reorderSchema, { ids }, (d, userId) =>
    accounts.reorderAccounts(userId, d.ids),
  );
  if (r.ok) revalidateApp();
  return r;
}
