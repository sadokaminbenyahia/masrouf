'use client';
/**
 * Page /transactions (partie interactive). L'URL fait foi pour les filtres, le tri et la
 * pagination ; la page RSC fournit la première page (initialData) pour chaque URL.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FileUp, Plus, Receipt, SearchX } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { listTransactionsAction, type TransactionPage } from '@/app/actions/transactions';
import { useAllAccounts } from '@/components/accounts/use-all-accounts';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/skeletons';
import { Button } from '@/components/ui/button';
import type { ISODate } from '@/domain/dates';
import type { AccountWithBalance, Category, Tag, Transaction } from '@/domain/types';
import { openQuickAdd } from '@/lib/events';
import { useCategories, useTags } from '@/lib/hooks/use-reference-data';
import { errorMessage, queryKeys, unwrap } from '@/lib/query';
import type { TransactionQueryData } from '@/lib/schemas/transactions';
import { BulkActionsBar } from './bulk-actions-bar';
import { EditTransactionDialog } from './edit-transaction-dialog';
import { ErrorPanel } from './error-panel';
import { Pagination } from './pagination';
import {
  clearFilters,
  hasActiveFilters,
  parseTransactionSearchParams,
  sameQuery,
  serializeQuery,
  toSearchParams,
} from './query-params';
import type { RowActionHandlers } from './row-actions';
import { selectedIds, toggleAll, toggleSelection } from './selection';
import { TotalsBar } from './totals-bar';
import { TransactionCardList } from './transaction-card-list';
import { TransactionFilters } from './transaction-filters';
import { TransactionsTable } from './transactions-table';
import { useTransactionMutations } from './use-transaction-mutations';

export interface TransactionsViewProps {
  today: ISODate;
  initialQuery: TransactionQueryData;
  initialPage: TransactionPage;
  /** Tous les comptes, archivés compris */
  accounts: AccountWithBalance[];
  categories: Category[];
  tags: Tag[];
}

export function TransactionsView({
  today,
  initialQuery,
  initialPage,
  accounts: initialAccounts,
  categories: initialCategories,
  tags: initialTags,
}: TransactionsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = useMemo(() => parseTransactionSearchParams(searchParams), [searchParams]);
  const [navigating, startTransition] = useTransition();
  // Les filtres reflètent immédiatement l'intention ; les données suivent l'URL.
  const [query, setOptimisticQuery] = useOptimistic(
    urlQuery,
    (_current: TransactionQueryData, next: TransactionQueryData) => next,
  );

  function navigate(next: TransactionQueryData) {
    startTransition(() => {
      setOptimisticQuery(next);
      const qs = toSearchParams(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  const pageKey = queryKeys.transactions(urlQuery);
  const pageQuery = useQuery({
    queryKey: pageKey,
    queryFn: async () => unwrap(await listTransactionsAction(urlQuery)),
    initialData: sameQuery(urlQuery, initialQuery) ? initialPage : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const accountsQuery = useAllAccounts(initialAccounts);
  const categoriesQuery = useCategories(initialCategories);
  const tagsQuery = useTags(initialTags);
  const accounts = accountsQuery.data ?? initialAccounts;
  const categories = categoriesQuery.data ?? initialCategories;
  const tags = tagsQuery.data ?? initialTags;
  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const page = pageQuery.data;
  const items = useMemo(() => page?.items ?? [], [page]);
  const rowIds = useMemo(() => items.map((t) => t.id), [items]);

  // Sélection : remise à zéro quand la requête change (page, filtres, tri).
  const scope = serializeQuery(urlQuery);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [selectionScope, setSelectionScope] = useState(scope);
  if (selectionScope !== scope) {
    setSelectionScope(scope);
    setSelection({});
    setAnchorId(null);
  }
  const selected = selectedIds(selection, rowIds)
    .map((id) => items.find((t) => t.id === id))
    .filter((t): t is Transaction => t !== undefined);

  const [editing, setEditing] = useState<Transaction | null>(null);
  const mutations = useTransactionMutations(pageKey);

  const handlers: RowActionHandlers = {
    onEdit: setEditing,
    onDuplicate: (t) => mutations.duplicateTransaction(t, today),
    onDelete: (t) => {
      setSelection((s) => {
        if (!s[t.id]) return s;
        const next = { ...s };
        delete next[t.id];
        return next;
      });
      mutations.deleteTransaction(t);
    },
    onConfirmCategory: mutations.confirmCategory,
  };

  function onToggleRow(id: string, shift: boolean) {
    const r = toggleSelection(selection, rowIds, id, anchorId, shift);
    setSelection(r.selection);
    setAnchorId(r.anchorId);
  }

  const filtersActive = hasActiveFilters(query);
  const busy = navigating || (pageQuery.isFetching && pageQuery.isPlaceholderData);

  let content;
  if (!page) {
    content = pageQuery.isError ? (
      <ErrorPanel
        message={errorMessage(pageQuery.error)}
        onRetry={() => void pageQuery.refetch()}
        pending={pageQuery.isFetching}
      />
    ) : (
      <TableSkeleton rows={10} />
    );
  } else if (page.total === 0 && !hasActiveFilters(urlQuery)) {
    content = (
      <EmptyState
        icon={Receipt}
        title="Aucune transaction pour l'instant"
        description="Ajoutez votre première dépense en quelques secondes, ou importez le relevé de votre banque."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={() => openQuickAdd()}>
              <Plus aria-hidden />
              Ajouter ma première transaction
            </Button>
            <Button asChild variant="outline">
              <Link href="/import">
                <FileUp aria-hidden />
                Importer un relevé
              </Link>
            </Button>
          </div>
        }
      />
    );
  } else if (page.total === 0) {
    content = (
      <EmptyState
        icon={SearchX}
        title="Aucun résultat"
        description="Aucune transaction ne correspond à ces filtres."
        action={
          <Button type="button" variant="outline" onClick={() => navigate(clearFilters(query))}>
            Effacer les filtres
          </Button>
        }
      />
    );
  } else if (items.length === 0) {
    const last = Math.max(1, page.pageCount);
    content = (
      <EmptyState
        icon={SearchX}
        title="Cette page est vide"
        description={`Les résultats tiennent sur ${last} page${last > 1 ? 's' : ''}.`}
        action={
          <Button type="button" variant="outline" onClick={() => navigate({ ...query, page: last })}>
            Aller à la page {last}
          </Button>
        }
      />
    );
  } else {
    const common = {
      items,
      today,
      sort: urlQuery.sort,
      selection,
      onToggleRow,
      accountsById,
      categoriesById,
      handlers,
      busy,
    };
    content = (
      <div className="grid gap-4">
        {pageQuery.isError && (
          <ErrorPanel
            title="Les données affichées ne sont peut-être plus à jour"
            message={errorMessage(pageQuery.error)}
            onRetry={() => void pageQuery.refetch()}
            pending={pageQuery.isFetching}
          />
        )}
        <TotalsBar totals={page.totals} />
        <div className="hidden lg:block">
          <TransactionsTable
            {...common}
            onSortChange={(sort) => navigate({ ...query, sort, page: 1 })}
            onToggleAll={() => setSelection(toggleAll(selection, rowIds))}
            accounts={accounts}
            categories={categories}
            onUpdate={mutations.updateTransaction}
          />
        </div>
        <div className="lg:hidden">
          <TransactionCardList {...common} />
        </div>
        <BulkActionsBar
          selected={selected}
          categories={categories}
          pending={mutations.bulkPending}
          onCategorize={(list, categoryId) => {
            if (list.length > 0) mutations.bulkCategorize(list, categoryId);
          }}
          onDelete={(list) => {
            setSelection({});
            mutations.bulkDelete(list);
          }}
          onClear={() => setSelection({})}
        />
        <Pagination
          page={page.page}
          pageCount={page.pageCount}
          pageSize={urlQuery.pageSize}
          onPageChange={(p) => navigate({ ...query, page: p })}
          onPageSizeChange={(size) => navigate({ ...query, pageSize: size, page: 1 })}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {!(page && page.total === 0 && !filtersActive && !hasActiveFilters(urlQuery)) && (
        <TransactionFilters
          query={query}
          today={today}
          accounts={accounts}
          categories={categories}
          tags={tags}
          onChange={navigate}
        />
      )}
      {content}
      <EditTransactionDialog transaction={editing} today={today} onClose={() => setEditing(null)} />
    </div>
  );
}
