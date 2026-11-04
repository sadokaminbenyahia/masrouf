'use client';
import type { Millimes } from '@/domain/money';
import type { BudgetLevel } from '@/domain/types';
import { useDiscreetMode } from '@/lib/hooks/use-discreet-mode';
import { cn } from '@/lib/utils';
import { barPercent, percentOf, progressValueText, ratioOf } from './budget-utils';

const LEVEL_BAR: Record<BudgetLevel, string> = {
  OK: 'bg-primary',
  WARNING: 'bg-warning',
  EXCEEDED: 'bg-expense',
};

/** Barre de progression accessible (role="progressbar"), colorée selon le niveau. */
export function BudgetProgressBar({
  spent,
  amount,
  level,
  label,
  size = 'md',
  className,
}: {
  spent: Millimes;
  amount: Millimes;
  level: BudgetLevel;
  /** Nom accessible, ex. « Progression du budget Courses » */
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { discreet } = useDiscreetMode();
  const ratio = ratioOf(spent, amount);
  const width = barPercent(ratio);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(100, percentOf(ratio))}
      aria-valuetext={progressValueText(spent, amount, discreet)}
      className={cn(
        'bg-muted relative w-full overflow-hidden rounded-full',
        size === 'sm' ? 'h-2' : 'h-2.5',
        className,
      )}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none',
          LEVEL_BAR[level],
        )}
        style={{ width: `${width}%` }}
      />
      {/* Repère des 80 % */}
      <span aria-hidden="true" className="bg-foreground/25 absolute inset-y-0 left-[80%] w-px" />
    </div>
  );
}
