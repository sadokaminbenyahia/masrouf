'use client';
import { useQuery } from '@tanstack/react-query';
import { Plus, RotateCcw, Target } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { ISODate } from '@/domain/dates';
import type { Category, GoalProgress } from '@/domain/types';
import { listGoalsAction } from '@/app/actions/goals';
import { SortableList } from '@/components/dnd/sortable-list';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { CardSkeleton } from '@/components/shared/skeletons';
import { Button } from '@/components/ui/button';
import { useCategories } from '@/lib/hooks/use-reference-data';
import { errorMessage, queryKeys, unwrap } from '@/lib/query';
import { toastSuccess } from '@/lib/toast';
import { Celebration } from './celebration';
import { ContributionDialog, type ContributionTarget } from './contribution-dialog';
import { GoalCard } from './goal-card';
import { GoalFormDialog, type GoalFormMode } from './goal-form-dialog';
import { useGoalMutations } from './use-goal-mutations';
import { WhatIfSimulator } from './what-if-simulator';

interface GoalsViewProps {
  today: ISODate;
  initialGoals: GoalProgress[] | null;
  initialError: string | null;
  categories: Category[];
  /** Catégories payées par une échéance récurrente (exclues du simulateur si besoins). */
  fixedCategoryIds?: string[];
}

export function GoalsView({
  today,
  initialGoals,
  initialError,
  categories: initialCategories,
  fixedCategoryIds,
}: GoalsViewProps) {
  const [form, setForm] = useState<GoalFormMode | null>(null);
  const [contribution, setContribution] = useState<ContributionTarget | null>(null);
  const [burst, setBurst] = useState(0);
  const { data: categories = initialCategories } = useCategories(initialCategories);

  const goalsQuery = useQuery({
    queryKey: queryKeys.goals,
    queryFn: async () => unwrap(await listGoalsAction()),
    initialData: initialGoals ?? undefined,
    staleTime: 30_000,
  });

  const onCompleted = useCallback((goal: GoalProgress) => {
    setBurst((b) => b + 1);
    toastSuccess(`Objectif « ${goal.name} » atteint. Félicitations !`);
  }, []);
  const mutations = useGoalMutations({ onCompleted });

  const goals = useMemo(() => goalsQuery.data ?? [], [goalsQuery.data]);
  const hasData = goalsQuery.data !== undefined;
  const loadError = goalsQuery.error
    ? errorMessage(goalsQuery.error)
    : hasData
      ? null
      : initialError;

  const newGoalButton = (
    <Button onClick={() => setForm({ kind: 'create' })} className="min-h-11 sm:min-h-10">
      <Plus aria-hidden="true" />
      Nouvel objectif
    </Button>
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Objectifs d'épargne"
        description="Fixez un montant, une date si vous le souhaitez, et suivez vos versements."
        actions={newGoalButton}
      />

      {loadError && !hasData ? (
        <div
          role="alert"
          className="border-expense/30 bg-expense/5 flex flex-col items-start gap-3 rounded-xl border p-4 text-sm"
        >
          <p>
            <span className="font-medium">Impossible de charger les objectifs.</span> {loadError}
          </p>
          <Button
            variant="outline"
            onClick={() => void goalsQuery.refetch()}
            className="min-h-11 sm:min-h-10"
          >
            <RotateCcw aria-hidden="true" />
            Réessayer
          </Button>
        </div>
      ) : !hasData ? (
        <div className="grid gap-3 md:grid-cols-2" aria-busy="true">
          <span className="sr-only">Chargement des objectifs…</span>
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Aucun objectif"
          description="Un voyage, un fonds d’urgence, un nouvel ordinateur… Créez un objectif et suivez votre progression."
          action={newGoalButton}
        />
      ) : (
        <section aria-labelledby="goals-list-heading">
          <h2 id="goals-list-heading" className="sr-only">
            Vos objectifs
          </h2>
          <SortableList
            items={goals}
            ariaLabel="Objectifs d'épargne"
            layout="grid"
            className="md:grid-cols-2"
            getLabel={(g) => g.name}
            onReorder={(ids) => mutations.reorder(ids)}
            renderItem={(goal, handle) => (
              <GoalCard
                goal={goal}
                handle={handle}
                onDeposit={() => setContribution({ goal, mode: 'deposit' })}
                onWithdraw={() => setContribution({ goal, mode: 'withdraw' })}
                onEdit={() => setForm({ kind: 'edit', goal })}
                onDelete={() => void mutations.remove(goal)}
              />
            )}
          />
        </section>
      )}

      {hasData && (
        <WhatIfSimulator
          goals={goals}
          categories={categories}
          today={today}
          fixedCategoryIds={fixedCategoryIds}
        />
      )}

      <ContributionDialog
        target={contribution}
        onOpenChange={(open) => {
          if (!open) setContribution(null);
        }}
        onSubmit={(goal, delta) => void mutations.contribute(goal, delta)}
      />
      <GoalFormDialog
        mode={form}
        today={today}
        onOpenChange={(open) => {
          if (!open) setForm(null);
        }}
        onSubmit={async (input) => {
          if (form?.kind === 'edit') return mutations.update(form.goal, input);
          return (await mutations.create(input)) !== null;
        }}
      />
      <Celebration burst={burst} />
    </div>
  );
}
