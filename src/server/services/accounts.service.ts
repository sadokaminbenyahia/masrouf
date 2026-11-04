// Propriétaire : agent A
import 'server-only';
import { withBalances } from '@/domain/accounts';
import { USER_LIMITS } from '@/domain/limits';
import { appError, err, ok, type Result } from '@/domain/result';
import type { Account, AccountWithBalance } from '@/domain/types';
import type { AccountInputData, AccountPatchData } from '@/lib/schemas/accounts';
import { withPrismaErrors } from '@/server/repositories/_shared';
import * as accountRepo from '@/server/repositories/account.repo';

const notFound = () => err(appError('NOT_FOUND', 'Compte introuvable.'));

export async function listAccounts(
  userId: string,
  opts?: { includeArchived?: boolean },
): Promise<Result<AccountWithBalance[]>> {
  const [accounts, aggregates] = await Promise.all([
    accountRepo.listAccounts(userId, { includeArchived: opts?.includeArchived === true }),
    accountRepo.balanceAggregates(userId),
  ]);
  return ok(withBalances(accounts, aggregates.sums, aggregates.incoming));
}

export async function createAccount(
  userId: string,
  input: AccountInputData,
): Promise<Result<Account>> {
  return withPrismaErrors(async () => {
    if ((await accountRepo.countAccounts(userId)) >= USER_LIMITS.accounts) {
      return err(
        appError(
          'CONFLICT',
          `Vous avez atteint le maximum de ${USER_LIMITS.accounts} comptes. Supprimez un compte inutilisé pour en créer un nouveau.`,
        ),
      );
    }
    const sortOrder = await accountRepo.nextSortOrder(userId);
    return ok(
      await accountRepo.createAccount(userId, {
        name: input.name.trim(),
        type: input.type,
        initialBalance: input.initialBalance,
        color: input.color,
        sortOrder,
      }),
    );
  });
}

export async function updateAccount(
  userId: string,
  id: string,
  patch: AccountPatchData,
): Promise<Result<Account>> {
  return withPrismaErrors(async () => {
    const data: Parameters<typeof accountRepo.updateAccount>[2] = {};
    if (patch.name !== undefined) data.name = patch.name.trim();
    if (patch.type !== undefined) data.type = patch.type;
    if (patch.initialBalance !== undefined) data.initialBalance = patch.initialBalance;
    if (patch.color !== undefined) data.color = patch.color;
    if (patch.archived !== undefined) data.archived = patch.archived;
    const account = await accountRepo.updateAccount(userId, id, data);
    return account ? ok(account) : notFound();
  });
}

/** CONFLICT si le compte a des transactions (proposer l'archivage). */
export async function deleteAccount(userId: string, id: string): Promise<Result<{ id: string }>> {
  return withPrismaErrors(async () => {
    const account = await accountRepo.findAccount(userId, id);
    if (!account) return notFound();
    const usage = await accountRepo.countAccountUsage(userId, id);
    if (usage.transactions > 0) {
      return err(
        appError(
          'CONFLICT',
          'Ce compte contient des transactions. Archivez-le plutôt pour conserver votre historique.',
        ),
      );
    }
    if (usage.recurring > 0) {
      return err(
        appError(
          'CONFLICT',
          'Des dépenses récurrentes utilisent ce compte. Modifiez-les ou supprimez-les d’abord.',
        ),
      );
    }
    return (await accountRepo.deleteAccount(userId, id)) ? ok({ id }) : notFound();
  });
}

export async function reorderAccounts(userId: string, ids: string[]): Promise<Result<void>> {
  return withPrismaErrors(async () => {
    const owned = await accountRepo.ownedAccountIds(userId, ids);
    if (owned.size !== new Set(ids).size) return notFound();
    await accountRepo.reorderAccounts(userId, ids);
    return ok(undefined);
  });
}
