'use client';
import { Sparkles } from 'lucide-react';
import { useId } from 'react';
import type { Millimes } from '@/domain/money';
import type { Category } from '@/domain/types';
import { AiBadge } from '@/components/shared/ai-badge';
import { CategoryIcon } from '@/components/shared/category-icon';
import { Money } from '@/components/shared/money';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { ApplicableSuggestion } from './budget-utils';

interface BudgetSuggestionsProps {
  items: ApplicableSuggestion[];
  isLoading: boolean;
  error: string | null;
  pendingIds: ReadonlySet<string>;
  onCreate: (category: Category, amount: Millimes) => void;
  onApplyAll: () => void;
}

/** Section « Suggestions de budgets » (IA locale) pour les catégories sans budget. */
export function BudgetSuggestions({
  items,
  isLoading,
  error,
  pendingIds,
  onCreate,
  onApplyAll,
}: BudgetSuggestionsProps) {
  const headingId = useId();
  const descriptionId = useId();

  if (!isLoading && !error && items.length === 0) return null;

  return (
    <section aria-labelledby={headingId} aria-describedby={descriptionId} className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={headingId} className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="text-primary size-4" aria-hidden="true" />
            Suggestions de budgets
          </h2>
          <p id={descriptionId} className="text-muted-foreground text-sm">
            Calculées sur vos dépenses récentes, pour les catégories qui n’ont pas encore de budget.
          </p>
        </div>
        {items.length > 1 && (
          <Button
            variant="outline"
            onClick={onApplyAll}
            disabled={pendingIds.size > 0}
            className="min-h-11 sm:min-h-10"
          >
            Tout appliquer
          </Button>
        )}
      </div>

      {error ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
          Les suggestions sont indisponibles pour le moment. {error}
        </p>
      ) : isLoading ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <Skeleton className="h-32 rounded-xl" />
              <span className="sr-only">Chargement des suggestions…</span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ suggestion, category }) => (
            <SuggestionCard
              key={category.id}
              category={category}
              amount={suggestion.amount}
              basis={suggestion.basis}
              pending={pendingIds.has(category.id)}
              onCreate={() => onCreate(category, suggestion.amount)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SuggestionCard({
  category,
  amount,
  basis,
  pending,
  onCreate,
}: {
  category: Category;
  amount: Millimes;
  basis: string;
  pending: boolean;
  onCreate: () => void;
}) {
  const titleId = useId();
  return (
    <li
      aria-labelledby={titleId}
      className="border-primary/30 bg-card flex flex-col gap-3 rounded-xl border border-dashed p-4"
    >
      <div className="flex items-center gap-2">
        <CategoryIcon icon={category.icon} color={category.color} size="sm" />
        <h3 id={titleId} className="min-w-0 flex-1 truncate font-medium">
          {category.name}
        </h3>
        <AiBadge />
      </div>
      <div>
        <p className="text-xl font-semibold tabular-nums">
          <Money value={amount} decimals={0} />
          <span className="text-muted-foreground text-sm font-normal"> / mois</span>
        </p>
        <p className="text-muted-foreground text-sm">{basis}</p>
      </div>
      <Button
        onClick={onCreate}
        disabled={pending}
        aria-describedby={titleId}
        className="mt-auto min-h-11 sm:min-h-10"
      >
        {pending ? 'Création…' : 'Créer ce budget'}
      </Button>
    </li>
  );
}
