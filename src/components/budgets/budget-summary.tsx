'use client';
import { OctagonAlert, TriangleAlert } from 'lucide-react';
import type { BudgetProgress } from '@/domain/types';
import { Money } from '@/components/shared/money';
import { cn } from '@/lib/utils';
import { BudgetProgressBar } from './budget-progress-bar';
import { alertSummaryText, budgetAlerts, type BudgetSummary } from './budget-utils';

/** Résumé du mois : total budgété, dépensé, reste + barre globale. */
export function BudgetSummaryCard({
  summary,
  monthLabel,
}: {
  summary: BudgetSummary;
  monthLabel: string;
}) {
  const over = summary.remaining < 0;
  return (
    <section
      aria-label={`Résumé des budgets de ${monthLabel}`}
      className="bg-card shadow-card grid gap-4 rounded-xl border p-4 sm:p-5"
    >
      <dl className="grid grid-cols-3 gap-3">
        <div className="min-w-0">
          <dt className="text-muted-foreground text-xs sm:text-sm">Budgété</dt>
          <dd className="truncate text-lg font-semibold tabular-nums sm:text-2xl">
            <Money value={summary.budgeted} decimals={0} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground text-xs sm:text-sm">Dépensé</dt>
          <dd className="truncate text-lg font-semibold tabular-nums sm:text-2xl">
            <Money value={summary.spent} decimals={0} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground text-xs sm:text-sm">
            {over ? 'Dépassement' : 'Reste'}
          </dt>
          <dd
            className={cn(
              'truncate text-lg font-semibold tabular-nums sm:text-2xl',
              over ? 'text-expense' : 'text-income',
            )}
          >
            <Money value={Math.abs(summary.remaining)} decimals={0} />
          </dd>
        </div>
      </dl>
      <BudgetProgressBar
        spent={summary.spent}
        amount={summary.budgeted}
        level={summary.level}
        label={`Progression globale des budgets de ${monthLabel}`}
      />
    </section>
  );
}

/** Bandeau récapitulatif des budgets à ≥ 80 % (role="status"). */
export function BudgetAlertsBanner({ list }: { list: readonly BudgetProgress[] }) {
  const alerts = budgetAlerts(list);
  const exceeded = alerts.some((a) => a.level === 'EXCEEDED');
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {alerts.length > 0 && (
        <div
          className={cn(
            'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
            exceeded
              ? 'border-expense/30 bg-expense/5 text-foreground'
              : 'border-warning/30 bg-warning/8 text-foreground',
          )}
        >
          {exceeded ? (
            <OctagonAlert className="text-expense mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : (
            <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          <p>{alertSummaryText(alerts)}</p>
        </div>
      )}
    </div>
  );
}
