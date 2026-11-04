'use client';
/**
 * Données de référence partagées (comptes, catégories, tags), mises en cache par TanStack Query.
 * Passer `initialData` depuis la page RSC évite un aller-retour au premier rendu.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { AccountWithBalance, Category, Tag } from '@/domain/types';
import { listAccountsAction } from '@/app/actions/accounts';
import { listCategoriesAction, listTagsAction } from '@/app/actions/categories';
import { queryKeys, unwrap } from '@/lib/query';

export function useAccounts(initialData?: AccountWithBalance[]) {
  return useQuery({
    queryKey: queryKeys.accounts,
    queryFn: async () => unwrap(await listAccountsAction()),
    initialData,
    staleTime: 30_000,
  });
}

export function useCategories(initialData?: Category[]) {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: async () => unwrap(await listCategoriesAction()),
    initialData,
    staleTime: 60_000,
  });
}

export function useTags(initialData?: Tag[]) {
  return useQuery({
    queryKey: queryKeys.tags,
    queryFn: async () => unwrap(await listTagsAction()),
    initialData,
    staleTime: 60_000,
  });
}

/** Index id → catégorie, pratique pour le rendu des tableaux. */
export function useCategoryMap(initialData?: Category[]): Map<string, Category> {
  const { data } = useCategories(initialData);
  return useMemo(() => new Map((data ?? []).map((c) => [c.id, c])), [data]);
}

export function useAccountMap(initialData?: AccountWithBalance[]): Map<string, AccountWithBalance> {
  const { data } = useAccounts(initialData);
  return useMemo(() => new Map((data ?? []).map((a) => [a.id, a])), [data]);
}
