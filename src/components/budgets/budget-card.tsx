'use client';
import { motion, useReducedMotion } from 'framer-motion';
import {
  MoreHorizontal,
  OctagonAlert,
  Pencil,
  Trash2,
  TriangleAlert,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import type { ISODate } from '@/domain/dates';
import { formatMoney, type Millimes } from '@/domain/money';
import type { BudgetProgress } from '@/domain/types';
import { DragHandle, type SortableHandleProps } from '@/components/dnd/sortable-list';
import { AmountInput } from '@/components/shared/amount-input';
import { CategoryIcon } from '@/components/shared/category-icon';
import { Money } from '@/components/shared/money';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDiscreetMode } from '@/lib/hooks/use-discreet-mode';
import { cn } from '@/lib/utils';
import { resolveAmount } from './amount';
import { BudgetProgressBar } from './budget-progress-bar';
import {
  LEVEL_LABELS,
  budgetStatus,
  budgetTransactionsHref,
  formatDays,
  percentOf,
  projectionText,
} from './budget-utils';

interface BudgetCardProps {
  progress: BudgetProgress;
  today: ISODate;
  handle: SortableHandleProps;
  /** Création en cours (budget provisoire) */
  pending?: boolean;
  onUpdateAmount: (amount: Millimes) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function BudgetCard({
  progress,
  today,
  handle,
  pending = false,
  onUpdateAmount,
  onEdit,
  onDelete,
}: BudgetCardProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const { discreet } = useDiscreetMode();
  const { budget, category, level, spent } = progress;
  const titleId = useId();
  const status = budgetStatus(progress, today);
  const projection = projectionText(progress);
  const pct = percentOf(progress.ratio);

  const levelTone =
    level === 'EXCEEDED'
      ? 'text-expense'
      : level === 'WARNING'
        ? 'text-warning'
        : 'text-muted-foreground';

  return (
    <motion.article
      aria-labelledby={titleId}
      aria-busy={pending || undefined}
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: pending ? 0.6 : 1 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'group bg-card text-card-foreground shadow-card focus-within:border-ring/60 hover:border-ring/40 relative flex flex-col gap-3 rounded-xl border p-3 transition-colors sm:p-4',
        level === 'EXCEEDED' && 'border-expense/40',
        level === 'WARNING' && 'border-warning/40',
      )}
    >
      <div className="flex items-center gap-2">
        <DragHandle {...handle} className="-ml-1" />
        <CategoryIcon icon={category.icon} color={category.color} size="md" />
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-base leading-tight font-semibold">
            {/* Lien étiré : toute la carte ouvre les transactions du mois */}
            <Link
              href={budgetTransactionsHref(category.id, progress.month)}
              className="focus-visible:ring-ring/50 flex min-h-11 items-center rounded-sm outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:ring-[3px] md:min-h-9"
            >
              <span className="truncate">{category.name}</span>
              <span className="sr-only"> : voir les transactions du mois</span>
            </Link>
          </h3>
        </div>
        <InlineAmount
          categoryName={category.name}
          amount={budget.amount}
          discreet={discreet}
          disabled={pending}
          onCommit={onUpdateAmount}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative z-10 size-11"
              aria-label={`Actions pour ${category.name}`}
              disabled={pending}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil aria-hidden="true" />
              Modifier
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 aria-hidden="true" />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <BudgetProgressBar
        spent={spent}
        amount={budget.amount}
        level={level}
        label={`Progression du budget ${category.name}`}
      />

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
        <p className={cn('flex min-w-0 items-center gap-1.5', levelTone)}>
          {level === 'EXCEEDED' && <OctagonAlert className="size-4 shrink-0" aria-hidden="true" />}
          {level === 'WARNING' && <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />}
          {level !== 'OK' && <span className="sr-only">{LEVEL_LABELS[level]} : </span>}
          <span className="text-foreground tabular-nums">
            <Money value={spent} decimals={0} /> / <Money value={budget.amount} decimals={0} />
          </span>
          <span aria-hidden="true">·</span>
          {status.kind === 'OVER' ? (
            <span className="text-expense font-medium">
              dépassé de <Money value={status.over} decimals={0} />
            </span>
          ) : (
            <>
              <span>
                reste <Money value={status.remaining} decimals={0} />
              </span>
              {status.daysLeft !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{formatDays(status.daysLeft)}</span>
                </>
              )}
            </>
          )}
        </p>
        <span className={cn('font-medium tabular-nums', levelTone)}>{pct} %</span>
      </div>

      {projection && progress.projected !== null && (
        <p className="text-warning flex items-center gap-1.5 text-sm">
          <TrendingUp className="size-4 shrink-0" aria-hidden="true" />
          {discreet ? (
            <span>À ce rythme, ce plafond sera dépassé en fin de mois</span>
          ) : (
            <span>
              À ce rythme : <Money value={progress.projected} decimals={0} /> en fin de mois
            </span>
          )}
        </p>
      )}
    </motion.article>
  );
}

/** Plafond éditable sur place : clic → champ ; Entrée valide, Échap annule. */
function InlineAmount({
  categoryName,
  amount,
  discreet,
  disabled,
  onCommit,
}: {
  categoryName: string;
  amount: Millimes;
  discreet: boolean;
  disabled: boolean;
  onCommit: (amount: Millimes) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<number | null>(amount);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Évite un second commit (blur provoqué par la fermeture après Entrée/Échap).
  const closingRef = useRef(false);
  const inputId = useId();
  const errorId = useId();
  const hintId = useId();

  function start() {
    closingRef.current = false;
    setValue(amount);
    setError(null);
    setEditing(true);
  }

  function stop() {
    closingRef.current = true;
    setEditing(false);
    setError(null);
    // Rend le focus au déclencheur après le rendu.
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function commit(raw: string | null) {
    if (closingRef.current) return;
    const parsed = resolveAmount(raw, value);
    if (!parsed.ok) {
      // Une saisie invalide est déjà signalée par <AmountInput> ; on signale l'absence.
      setError(raw?.trim() ? null : parsed.error);
      return;
    }
    stop();
    if (parsed.value !== amount) onCommit(parsed.value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const target = e.target;
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(target instanceof HTMLInputElement ? target.value : null);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      stop();
    }
  }

  function onBlur(e: FocusEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    const target = e.target;
    commit(target instanceof HTMLInputElement ? target.value : null);
  }

  if (editing) {
    return (
      <div className="relative z-10 flex w-36 flex-col" onKeyDown={onKeyDown} onBlur={onBlur}>
        <label htmlFor={inputId} className="sr-only">
          Plafond mensuel pour {categoryName}
        </label>
        <AmountInput
          id={inputId}
          value={value}
          onChange={setValue}
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${errorId} ${hintId}` : hintId}
          className="h-11"
        />
        <span id={hintId} className="sr-only">
          Entrée pour valider, Échap pour annuler.
        </span>
        {error && (
          <span id={errorId} role="alert" className="text-expense mt-1 text-xs">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={start}
      disabled={disabled}
      aria-label={
        discreet
          ? `Modifier le plafond de ${categoryName}`
          : `Modifier le plafond de ${categoryName}, actuellement ${formatMoney(amount, { decimals: 0 })}`
      }
      className="hover:bg-accent focus-visible:ring-ring/50 relative z-10 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-semibold tabular-nums outline-none focus-visible:ring-[3px] disabled:opacity-50"
    >
      <Money value={amount} decimals={0} />
      <Pencil
        className="text-muted-foreground size-3.5 opacity-60 group-hover:opacity-100"
        aria-hidden="true"
      />
    </button>
  );
}
