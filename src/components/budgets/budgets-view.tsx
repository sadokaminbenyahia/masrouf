'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, RotateCcw, Wallet } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { BudgetSuggestion } from '@/domain/ai/types';
import { formatMonthFR, type ISODate, type YearMonth } from '@/domain/dates';
import type { Millimes } from '@/domain/money';
import type { BudgetProgress, Category } from '@/domain/types';
import { getBudgetSuggestionsAction } from '@/app/actions/ai';
import { listBudgetProgressAction } from '@/app/actions/budgets';
import { SortableList } from '@/components/dnd/sortable-list';
import { CardSkeleton } from '@/components/shared/skeletons';
import { EmptyState } from '@/components/shared/empty-state';
import { MonthSwitcher } from '@/components/shared/month-switcher';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { useCategories } from '@/lib/hooks/use-reference-data';
import { errorMessage, queryKeys, unwrap } from '@/lib/query';
import { BudgetCard } from './budget-card';
import { BudgetDialog, type BudgetDialogMode } from './budget-dialog';
import { BudgetSuggestions } from './budget-suggestions';
import { BudgetAlertsBanner, BudgetSummaryCard } from './budget-summary';
import {
  applicableSuggestions,
  categoriesWithoutBudget,
  isOptimisticBudgetId,
  maxBudgetMonth,
  summarizeBudgets,
} from './budget-utils';
import { useBudgetMutations } from './use-budget-mutations';

interface BudgetsViewProps {
  today: ISODate;
  initialMonth: YearMonth;
  initialProgress: BudgetProgress[] | null;
  initialError: string | null;
  categories: Category[];
}

interface BudgetItem {
  id: string;
  progress: BudgetProgress;
}

export function BudgetsView({
  today,
  initialMonth,
  initialProgress,
  initialError,
  categories: initialCategories,
}: BudgetsViewProps) {
  const [month, setMonth] = useState<YearMonth>(initialMonth);
  const [dialog, setDialog] = useState<BudgetDialogMode | null>(null);
  const [pendingSuggestionIds, setPendingSuggestionIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const { data: categories = initialCategories } = useCategories(initialCategories);

  const budgetsQuery = useQuery({
    queryKey: queryKeys.budgets(month),
    queryFn: async () => unwrap(await listBudgetProgressAction(month)),
    initialData: month === initialMonth && initialProgress ? initialProgress : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const suggestionsQuery = useQuery({
    queryKey: queryKeys.ai.budgetSuggestions,
    queryFn: async () => unwrap(await getBudgetSuggestionsAction()),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const mutations = useBudgetMutations(month);
  const list = useMemo(() => budgetsQuery.data ?? [], [budgetsQuery.data]);
  const items = useMemo<BudgetItem[]>(
    () => list.map((progress) => ({ id: progress.budget.id, progress })),
    [list],
  );
  const summary = useMemo(() => summarizeBudgets(list), [list]);
  const available = useMemo(() => categoriesWithoutBudget(categories, list), [categories, list]);
  const suggestionMap = useMemo(
    () =>
      new Map<string, BudgetSuggestion>(
        (suggestionsQuery.data ?? []).map((s) => [s.categoryId, s]),
      ),
    [suggestionsQuery.data],
  );
  const suggestions = useMemo(
    () => applicableSuggestions(suggestionsQuery.data ?? [], categories, list),
    [suggestionsQuery.data, categories, list],
  );

  const monthLabel = formatMonthFR(month);
  const hasData = budgetsQuery.data !== undefined;
  const loadError =
    budgetsQuery.error !== null
      ? errorMessage(budgetsQuery.error)
      : month === initialMonth && !hasData
        ? initialError
        : null;

  function changeMonth(next: YearMonth) {
    setMonth(next);
    // Met à jour l'URL sans nouveau rendu serveur (les données viennent de TanStack Query).
    const url = new URL(window.location.href);
    url.searchParams.set('mois', next);
    window.history.replaceState(null, '', url);
  }

  const createFromSuggestion = useCallback(
    async (category: Category, amount: Millimes) => {
      setPendingSuggestionIds((s) => new Set(s).add(category.id));
      try {
        await mutations.create(category, amount);
      } finally {
        setPendingSuggestionIds((s) => {
          const next = new Set(s);
          next.delete(category.id);
          return next;
        });
      }
    },
    [mutations],
  );

  async function applyAll() {
    const entries = suggestions.map(({ category, suggestion }) => ({
      category,
      amount: suggestion.amount,
    }));
    setPendingSuggestionIds(new Set(entries.map((e) => e.category.id)));
    try {
      await mutations.createMany(entries);
    } finally {
      setPendingSuggestionIds(new Set());
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Budgets"
        description="Un plafond mensuel par catégorie, avec alertes à 80 % et 100 %."
        actions={
          <Button
            onClick={() => setDialog({ kind: 'create', available })}
            className="min-h-11 sm:min-h-10"
          >
            <Plus aria-hidden="true" />
            Nouveau budget
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher value={month} onChange={changeMonth} max={maxBudgetMonth(today)} />
        {budgetsQuery.isFetching && hasData && (
          <span className="text-muted-foreground text-xs" aria-live="polite">
            Mise à jour…
          </span>
        )}
      </div>

      {loadError && !hasData ? (
        <div
          role="alert"
          className="border-expense/30 bg-expense/5 flex flex-col items-start gap-3 rounded-xl border p-4 text-sm"
        >
          <p>
            <span className="font-medium">Impossible de charger les budgets.</span> {loadError}
          </p>
          <Button
            variant="outline"
            onClick={() => void budgetsQuery.refetch()}
            className="min-h-11 sm:min-h-10"
          >
            <RotateCcw aria-hidden="true" />
            Réessayer
          </Button>
        </div>
      ) : !hasData ? (
        <div className="grid gap-3" aria-busy="true">
          <span className="sr-only">Chargement des budgets…</span>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Aucun budget"
          description="Créez-en un, ou partez des suggestions basées sur vos dépenses."
          action={
            <Button
              onClick={() => setDialog({ kind: 'create', available })}
              className="min-h-11 sm:min-h-10"
            >
              <Plus aria-hidden="true" />
              Nouveau budget
            </Button>
          }
        />
      ) : (
        <>
          <BudgetSummaryCard summary={summary} monthLabel={monthLabel} />
          <BudgetAlertsBanner list={list} />
          <section aria-labelledby="budgets-list-heading" className="grid gap-3">
            <h2 id="budgets-list-heading" className="sr-only">
              Budgets de {monthLabel}
            </h2>
            <SortableList
              items={items}
              ariaLabel={`Budgets de ${monthLabel}`}
              getLabel={(item) => item.progress.category.name}
              isItemDisabled={(item) => isOptimisticBudgetId(item.id)}
              onReorder={(ids) => mutations.reorder(ids)}
              renderItem={(item, handle) => (
                <BudgetCard
                  progress={item.progress}
                  today={today}
                  handle={handle}
                  pending={isOptimisticBudgetId(item.id)}
                  onUpdateAmount={(amount) => void mutations.updateAmount(item.progress, amount)}
                  onEdit={() => setDialog({ kind: 'edit', progress: item.progress })}
                  onDelete={() => void mutations.remove(item.progress)}
                />
              )}
            />
          </section>
        </>
      )}

      {hasData && (
        <BudgetSuggestions
          items={suggestions}
          isLoading={suggestionsQuery.isPending}
          error={suggestionsQuery.error ? errorMessage(suggestionsQuery.error) : null}
          pendingIds={pendingSuggestionIds}
          onCreate={(category, amount) => void createFromSuggestion(category, amount)}
          onApplyAll={() => void applyAll()}
        />
      )}

      <BudgetDialog
        mode={dialog}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        suggestions={suggestionMap}
        onSubmit={(category, amount) => {
          if (dialog?.kind === 'edit') {
            void mutations.updateAmount(dialog.progress, amount);
          } else {
            void mutations.create(category, amount);
          }
        }}
      />
    </div>
  );
}
