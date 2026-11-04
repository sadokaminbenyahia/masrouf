// Propriétaire : agent A
import 'server-only';
import type { Result } from '@/domain/result';
import type { Account, AccountWithBalance } from '@/domain/types';
import type { AccountInputData, AccountPatchData } from '@/lib/schemas/accounts';
import { notImplemented } from './_stub';

export async function listAccounts(
  _userId: string,
  _opts?: { includeArchived?: boolean },
): Promise<Result<AccountWithBalance[]>> {
  return notImplemented('listAccounts');
}
export async function createAccount(
  _userId: string,
  _input: AccountInputData,
): Promise<Result<Account>> {
  return notImplemented('createAccount');
}
export async function updateAccount(
  _userId: string,
  _id: string,
  _patch: AccountPatchData,
): Promise<Result<Account>> {
  return notImplemented('updateAccount');
}
/** CONFLICT si le compte a des transactions (proposer l'archivage). */
export async function deleteAccount(_userId: string, _id: string): Promise<Result<{ id: string }>> {
  return notImplemented('deleteAccount');
}
export async function reorderAccounts(_userId: string, _ids: string[]): Promise<Result<void>> {
  return notImplemented('reorderAccounts');
}
