'use client';
import { useQuery } from '@tanstack/react-query';
import { listAccountsAction } from '@/app/actions/accounts';
import type { AccountWithBalance } from '@/domain/types';
import { queryKeys, unwrap } from '@/lib/query';

/** Clé des comptes archivés compris (préfixée par `queryKeys.accounts` : invalidée avec elle). */
export const allAccountsKey = [...queryKeys.accounts, 'all'] as const;

/** Tous les comptes, archivés compris (page Comptes, formulaires, libellés des transactions). */
export function useAllAccounts(initialData?: AccountWithBalance[]) {
  return useQuery({
    queryKey: allAccountsKey,
    queryFn: async () => unwrap(await listAccountsAction({ includeArchived: true })),
    initialData,
    staleTime: 30_000,
  });
}
