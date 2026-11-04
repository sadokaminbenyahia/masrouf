'use client';
/**
 * Simulateur « Et si… ? » : réductions par catégorie (0–50 %) et épargne supplémentaire,
 * simulées par l'IA locale (simulateWhatIfAction, appel debouncé à 300 ms).
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarCheck, CalendarX, RotateCcw, Sparkles, TrendingUp } from 'lucide-react';
import { useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { WhatIfResult } from '@/domain/ai/types';
import { formatMonthFR, monthOf, type ISODate } from '@/domain/dates';
import type { Category, GoalProgress } from '@/domain/types';
import { simulateWhatIfAction } from '@/app/actions/ai';
import { getCategoryBreakdownAction } from '@/app/actions/dashboard';
import { AiBadge } from '@/components/shared/ai-badge';
import { AmountInput } from '@/components/shared/amount-input';
import { CategoryIcon } from '@/components/shared/category-icon';
import { Money } from '@/components/shared/money';
import { ChartSkeleton } from '@/components/shared/skeletons';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import type { WhatIfActionInput } from '@/lib/schemas/ai';
import { ActionError, errorMessage, queryKeys, unwrap } from '@/lib/query';
import { cn } from '@/lib/utils';
import {
  MAX_REDUCTION,
  REDUCTION_STEP,
  buildWhatIfInput,
  clampPercent,
  describeOutcome,
  eligibleGoals,
  estimatedSaving,
  monthsSavedLabel,
  percentValueText,
  selectSimulatorCategories,
  simulatorRange,
  whatIfErrorMessage,
  type SimulatorCategory,
} from './simulator-utils';
import { useDebouncedValue } from './use-debounced-value';
import { WhatIfChart } from './what-if-chart';

export interface WhatIfSimulatorProps {
  goals: GoalProgress[];
  categories: Category[];
  today: ISODate;
  /** Catégories payées par une échéance récurrente : exclues des curseurs si besoins. */
  fixedCategoryIds?: readonly string[];
}

const selectClass =
  'flex h-11 w-full rounded-lg border border-input bg-card px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-sm dark:bg-input/30';

export function WhatIfSimulator({
  goals,
  categories,
  today,
  fixedCategoryIds,
}: WhatIfSimulatorProps) {
  const headingId = useId();
  const goalFieldId = useId();
  const extraId = useId();
  const eligible = useMemo(() => eligibleGoals(goals), [goals]);
  const [goalId, setGoalId] = useState<string>(eligible[0]?.id ?? '');
  const goal = eligible.find((g) => g.id === goalId) ?? eligible[0] ?? null;
  const [percents, setPercents] = useState<Record<string, number>>({});
  const [extra, setExtra] = useState<number | null>(null);

  const range = useMemo(() => simulatorRange(today), [today]);
  const breakdownParams = useMemo(() => ({ ...range, type: 'EXPENSE' as const }), [range]);
  const breakdown = useQuery({
    queryKey: queryKeys.breakdown(breakdownParams),
    queryFn: async () => unwrap(await getCategoryBreakdownAction(breakdownParams)),
    staleTime: 5 * 60_000,
  });
  const fixedKey = (fixedCategoryIds ?? []).join(',');
  const simCategories = useMemo(
    () =>
      selectSimulatorCategories(breakdown.data ?? [], categories, {
        fixedCategoryIds: new Set(fixedKey ? fixedKey.split(',') : []),
      }),
    [breakdown.data, categories, fixedKey],
  );

  const input = useMemo<WhatIfActionInput | null>(() => {
    if (!goal) return null;
    const allowed = new Set(simCategories.map((c) => c.categoryId));
    const kept = Object.fromEntries(Object.entries(percents).filter(([id]) => allowed.has(id)));
    return buildWhatIfInput(goal.id, kept, extra);
  }, [goal, simCategories, percents, extra]);
  const debouncedInput = useDebouncedValue(input, 300);

  const simulation = useQuery({
    queryKey: ['ai', 'what-if', debouncedInput] as const,
    queryFn: async () => {
      if (!debouncedInput) throw new Error('Choisissez un objectif.');
      return unwrap(await simulateWhatIfAction(debouncedInput));
    },
    enabled: debouncedInput !== null,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 60_000,
  });

  const dirty = (input?.adjustments.length ?? 0) > 0 || (input?.extraMonthlySaving ?? 0) > 0;

  function reset() {
    setPercents({});
    setExtra(null);
  }

  return (
    <section
      data-testid="what-if"
      aria-labelledby={headingId}
      className="bg-card text-card-foreground shadow-card grid gap-5 rounded-xl border p-4 sm:p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id={headingId} className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="text-primary size-4" aria-hidden="true" />
            Et si… ?
          </h2>
          <p className="text-muted-foreground max-w-prose text-sm">
            Réduisez quelques dépenses ou épargnez un peu plus chaque mois : voyez quand vous
            atteindriez votre objectif.
          </p>
        </div>
        <AiBadge label="Simulation" />
      </header>

      {!goal ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
          {goals.length === 0
            ? 'Créez un objectif pour simuler la date à laquelle vous pourriez l’atteindre.'
            : 'Tous vos objectifs sont atteints : bravo ! Créez-en un nouveau pour utiliser le simulateur.'}
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="grid content-start gap-5">
            <div className="grid gap-2">
              <Label htmlFor={goalFieldId}>Objectif</Label>
              <select
                id={goalFieldId}
                value={goal.id}
                onChange={(e) => setGoalId(e.target.value)}
                className={selectClass}
              >
                {eligible.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Mobile : le résultat complet est sous les curseurs ; ce résumé collant montre
                l'effet de chaque réglage sans faire défiler (doublon visuel, masqué aux
                lecteurs d'écran qui ont la région live du résultat). */}
            <StickySummary result={simulation.data ?? null} isUpdating={simulation.isFetching} />

            <fieldset className="grid gap-4">
              <legend className="mb-1 text-sm font-medium">
                Réduire mes dépenses{' '}
                <span className="text-muted-foreground font-normal">
                  (moyenne des 3 derniers mois)
                </span>
              </legend>
              {breakdown.isPending ? (
                <div className="grid gap-4" aria-busy="true">
                  <span className="sr-only">Chargement des catégories…</span>
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-12 rounded-lg" />
                  ))}
                </div>
              ) : breakdown.error ? (
                <p className="text-muted-foreground text-sm">
                  Impossible de charger vos dépenses : {errorMessage(breakdown.error)}{' '}
                  <Button
                    variant="link"
                    className="h-auto p-0"
                    onClick={() => void breakdown.refetch()}
                  >
                    Réessayer
                  </Button>
                </p>
              ) : simCategories.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Pas encore assez d’historique de dépenses pour proposer des réductions. Vous
                  pouvez déjà simuler une épargne supplémentaire.
                </p>
              ) : (
                simCategories.map((c) => (
                  <ReductionSlider
                    key={c.categoryId}
                    category={c}
                    value={percents[c.categoryId] ?? 0}
                    onChange={(v) => setPercents((p) => ({ ...p, [c.categoryId]: v }))}
                  />
                ))
              )}
            </fieldset>

            <div className="grid gap-2">
              <Label htmlFor={extraId}>Épargne supplémentaire par mois</Label>
              <AmountInput id={extraId} value={extra} onChange={setExtra} placeholder="0" />
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={reset}
              disabled={!dirty}
              className="min-h-11 justify-self-start sm:min-h-10"
            >
              <RotateCcw aria-hidden="true" />
              Réinitialiser
            </Button>
          </div>

          <SimulationResult
            goal={goal}
            result={simulation.data ?? null}
            isLoading={simulation.isPending}
            isUpdating={simulation.isFetching || input !== debouncedInput}
            error={simulation.error}
            onRetry={() => void simulation.refetch()}
          />
        </div>
      )}
    </section>
  );
}

/*
 * Curseur natif restylé : piste de 6 px, pouce de 24 px (zone tactile de 44 px de haut),
 * portion active en couleur primaire (`--fill`), anneau de focus sur le pouce.
 */
const sliderClass = cn(
  'h-11 w-full cursor-pointer appearance-none bg-transparent outline-none',
  '[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full',
  '[&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--primary)_var(--fill),var(--input)_var(--fill))]',
  '[&::-webkit-slider-thumb]:-mt-[9px] [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none',
  '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-card',
  '[&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md',
  'focus-visible:[&::-webkit-slider-thumb]:ring-ring/50 focus-visible:[&::-webkit-slider-thumb]:ring-[4px]',
  '[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-input',
  '[&::-moz-range-progress]:h-1.5 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-primary',
  '[&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2',
  '[&::-moz-range-thumb]:border-card [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow-md',
  'focus-visible:[&::-moz-range-thumb]:ring-ring/50 focus-visible:[&::-moz-range-thumb]:ring-[4px]',
);

function StickySummary({
  result,
  isUpdating,
}: {
  result: WhatIfResult | null;
  isUpdating: boolean;
}) {
  if (!result) return null;
  const outcome = describeOutcome(result);
  return (
    <div
      aria-hidden="true"
      className="bg-card/95 supports-[backdrop-filter]:bg-card/85 sticky top-[4.5rem] z-10 -mx-1 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm shadow-sm backdrop-blur lg:hidden"
    >
      <span className="min-w-0">
        <span className="text-muted-foreground block text-xs">Date simulée</span>
        <span className={cn('text-primary font-semibold', isUpdating && 'opacity-70')}>
          {result.scenarioDate ? formatMonthFR(monthOf(result.scenarioDate)) : 'Jamais atteint'}
        </span>
      </span>
      {outcome.kind === 'COMPARED' && (
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold',
            outcome.monthsSaved > 0
              ? 'bg-income/12 text-income'
              : outcome.monthsSaved < 0
                ? 'bg-warning/10 text-warning'
                : 'bg-muted text-muted-foreground',
          )}
        >
          {monthsSavedLabel(outcome.monthsSaved)}
        </span>
      )}
      {outcome.kind === 'NOW_REACHABLE' && (
        <span className="bg-income/12 text-income shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold">
          Atteignable
        </span>
      )}
    </div>
  );
}

function ReductionSlider({
  category,
  value,
  onChange,
}: {
  category: SimulatorCategory;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const hintId = useId();
  const saving = estimatedSaving(category.monthlyAverage, value);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <CategoryIcon icon={category.icon} color={category.color} size="sm" />
        <label htmlFor={id} className="min-w-0 flex-1 truncate text-sm font-medium">
          {category.name}
        </label>
        <output htmlFor={id} className="text-sm font-semibold tabular-nums">
          {value > 0 ? `−${value} %` : '0 %'}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={MAX_REDUCTION}
        step={REDUCTION_STEP}
        value={value}
        onChange={(e) => onChange(clampPercent(Number(e.target.value)))}
        aria-valuetext={percentValueText(value)}
        aria-describedby={hintId}
        style={{ '--fill': `${(value / MAX_REDUCTION) * 100}%` } as CSSProperties}
        className={sliderClass}
      />
      <p id={hintId} className="text-muted-foreground text-xs">
        ≈ <Money value={category.monthlyAverage} decimals={0} />
        /mois
        {value > 0 && (
          <>
            {' '}
            · économie ≈ <Money value={saving} decimals={0} className="text-income" />
            /mois
          </>
        )}
      </p>
    </div>
  );
}

function SimulationResult({
  goal,
  result,
  isLoading,
  isUpdating,
  error,
  onRetry,
}: {
  goal: GoalProgress;
  result: WhatIfResult | null;
  isLoading: boolean;
  isUpdating: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  if (error && !result) {
    const code = error instanceof ActionError ? error.code : null;
    return (
      <div
        role="alert"
        className="grid content-start gap-3 rounded-lg border border-dashed p-4 text-sm"
      >
        <p>{whatIfErrorMessage(code, errorMessage(error))}</p>
        {code !== 'NOT_FOUND' && (
          <Button
            variant="outline"
            onClick={onRetry}
            className="min-h-11 justify-self-start sm:min-h-10"
          >
            <RotateCcw aria-hidden="true" />
            Réessayer
          </Button>
        )}
      </div>
    );
  }

  if (isLoading || !result) {
    return (
      <div className="grid content-start gap-4" aria-busy="true">
        <span className="sr-only">Simulation en cours…</span>
        <Skeleton className="h-6 w-3/4" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
        <ChartSkeleton height={256} />
      </div>
    );
  }

  const outcome = describeOutcome(result);
  const code = error instanceof ActionError ? error.code : null;

  return (
    <div className="grid content-start gap-4" aria-busy={isUpdating || undefined}>
      <p aria-live="polite" aria-atomic="true" className="text-base leading-relaxed font-medium">
        {result.message}
      </p>

      {error && (
        <p role="alert" className="text-warning text-sm">
          {whatIfErrorMessage(code, errorMessage(error))} Le dernier résultat reste affiché.
        </p>
      )}

      {outcome.kind === 'COMPARED' && outcome.monthsSaved !== 0 && (
        <p
          className={cn(
            'inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold',
            outcome.monthsSaved > 0 ? 'bg-income/12 text-income' : 'bg-warning/10 text-warning',
          )}
        >
          <TrendingUp className="size-4" aria-hidden="true" />
          {monthsSavedLabel(outcome.monthsSaved)}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3">
        <ResultTile
          label="Date actuelle"
          icon={result.baselineDate ? CalendarCheck : CalendarX}
          value={
            result.baselineDate ? formatMonthFR(monthOf(result.baselineDate)) : 'Jamais atteint'
          }
          hint={
            <>
              Épargne : <Money value={result.baselineMonthlySaving} decimals={0} />
              /mois
            </>
          }
          muted
        />
        <ResultTile
          label="Date simulée"
          icon={result.scenarioDate ? CalendarCheck : CalendarX}
          value={
            result.scenarioDate ? formatMonthFR(monthOf(result.scenarioDate)) : 'Jamais atteint'
          }
          hint={
            <>
              Épargne : <Money value={result.scenarioMonthlySaving} decimals={0} />
              /mois
            </>
          }
        />
      </dl>

      {outcome.kind === 'NEVER' && (
        <p className="text-muted-foreground text-sm">
          Au rythme actuel, votre épargne mensuelle ne suffit pas pour atteindre « {goal.name} ».
          Essayez une réduction ou une épargne supplémentaire.
        </p>
      )}
      {outcome.kind === 'NOW_REACHABLE' && (
        <p className="text-income text-sm">
          Au rythme actuel l’objectif n’est jamais atteint ; avec ce scénario, il le devient en{' '}
          {formatMonthFR(outcome.scenarioMonth)}.
        </p>
      )}
      {outcome.kind === 'SCENARIO_NEVER' && (
        <p className="text-warning text-sm">
          Avec ces réglages, l’épargne mensuelle devient insuffisante pour atteindre l’objectif.
        </p>
      )}
      {goal.targetDate && result.scenarioDate && result.scenarioDate > goal.targetDate && (
        <p className="text-muted-foreground text-sm">
          La date cible ({formatMonthFR(monthOf(goal.targetDate))}) ne serait pas tenue.
        </p>
      )}

      {result.timeline.length > 0 && (
        <WhatIfChart timeline={result.timeline} target={goal.targetAmount} goalName={goal.name} />
      )}
    </div>
  );
}

function ResultTile({
  label,
  value,
  hint,
  icon: Icon,
  muted = false,
}: {
  label: string;
  value: string;
  hint: ReactNode;
  icon: typeof CalendarCheck;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        'grid gap-1 rounded-lg border p-3',
        muted ? 'bg-muted/40' : 'border-primary/30 bg-primary/5',
      )}
    >
      <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className={cn('text-base font-semibold sm:text-lg', !muted && 'text-primary')}>
        {value}
      </dd>
      <dd className="text-muted-foreground text-xs">{hint}</dd>
    </div>
  );
}
