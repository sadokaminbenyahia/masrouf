'use client';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { addMonthsYM, formatMonthFR, type YearMonth } from '@/domain/dates';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface MonthSwitcherProps {
  value: YearMonth;
  onChange: (m: YearMonth) => void;
  max?: YearMonth;
  min?: YearMonth;
  className?: string;
}

/** ‹ mars 2026 › */
export function MonthSwitcher({ value, onChange, max, min, className }: MonthSwitcherProps) {
  const prev = addMonthsYM(value, -1);
  const next = addMonthsYM(value, 1);
  const label = formatMonthFR(value);
  const canPrev = !min || prev >= min;
  const canNext = !max || next <= max;
  return (
    <div
      data-slot="month-switcher"
      role="group"
      aria-label="Choisir le mois"
      className={cn(
        'bg-card inline-flex items-center gap-1 rounded-lg border p-1 shadow-xs',
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 md:size-9"
        onClick={() => onChange(prev)}
        disabled={!canPrev}
        aria-label={`Mois précédent (${formatMonthFR(prev)})`}
      >
        <ChevronLeftIcon aria-hidden="true" />
      </Button>
      <span
        aria-live="polite"
        className="min-w-[8.5rem] px-1 text-center text-sm font-medium capitalize tabular-nums"
      >
        {label}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 md:size-9"
        onClick={() => onChange(next)}
        disabled={!canNext}
        aria-label={`Mois suivant (${formatMonthFR(next)})`}
      >
        <ChevronRightIcon aria-hidden="true" />
      </Button>
    </div>
  );
}
