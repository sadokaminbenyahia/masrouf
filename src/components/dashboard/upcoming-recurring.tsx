/**
 * Prochaines échéances récurrentes (loyer, abonnements, salaire…).
 */
import { CalendarClock } from 'lucide-react';
import { diffDays, formatRelativeDayFR, type ISODate } from '@/domain/dates';
import type { RecurringRule } from '@/domain/types';
import { Money } from '@/components/shared/money';
import { cn } from '@/lib/utils';

export function UpcomingRecurring({
  rules,
  today,
  limit = 5,
}: {
  rules: RecurringRule[];
  today: ISODate;
  limit?: number;
}) {
  const upcoming = [...rules]
    .filter((r) => r.active)
    .sort((a, b) => (a.nextDate < b.nextDate ? -1 : a.nextDate > b.nextDate ? 1 : 0))
    .slice(0, limit);
  if (upcoming.length === 0) {
    return <p className="text-muted-foreground text-sm">Aucune échéance prévue prochainement.</p>;
  }
  return (
    <ul className="space-y-3">
      {upcoming.map((r) => {
        const soon = diffDays(today, r.nextDate) <= 3;
        return (
          <li key={r.id} className="flex items-center gap-3">
            <span
              className={cn(
                'bg-muted flex size-9 shrink-0 items-center justify-center rounded-full',
                soon && 'bg-warning/15 text-warning',
              )}
            >
              <CalendarClock aria-hidden className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{r.label}</span>
              <span className={cn('text-muted-foreground block text-xs', soon && 'text-warning')}>
                {formatRelativeDayFR(r.nextDate, today)}
                {r.autoCreate ? ' · création automatique' : ''}
              </span>
            </span>
            {/* Montant d'une opération : au millime (les agrégats sont arrondis au dinar) */}
            <Money value={r.amount} type={r.type} className="shrink-0 text-sm font-medium" />
          </li>
        );
      })}
    </ul>
  );
}
