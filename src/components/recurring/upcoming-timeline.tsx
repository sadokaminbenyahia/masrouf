'use client';
import { useMemo } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatDateFR, type ISODate } from '@/domain/dates';
import type { Category } from '@/domain/types';
import { cn } from '@/lib/utils';
import { CategoryIcon } from '@/components/shared/category-icon';
import { Money } from '@/components/shared/money';
import { Badge } from '@/components/ui/badge';
import { relativeDueFR, type UpcomingItem } from './recurring-math';

interface UpcomingTimelineProps {
  items: UpcomingItem[];
  categoryMap: Map<string, Category>;
  today: ISODate;
}

/** Frise chronologique des échéances des 30 prochains jours, groupées par date. */
export function UpcomingTimeline({ items, categoryMap, today }: UpcomingTimelineProps) {
  const groups = useMemo(() => {
    const map = new Map<ISODate, UpcomingItem[]>();
    for (const item of items) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    return [...map.entries()];
  }, [items]);

  const totalExpense = items
    .filter((i) => i.rule.type === 'EXPENSE')
    .reduce((s, i) => s + i.rule.amount, 0);

  return (
    <section aria-labelledby="upcoming-title" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="upcoming-title" className="text-lg font-semibold">
          À venir (30 jours)
        </h2>
        {totalExpense > 0 && (
          <p className="text-muted-foreground text-sm">
            Sorties prévues : <Money value={totalExpense} type="EXPENSE" decimals={0} />
          </p>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="bg-card/60 text-muted-foreground flex items-center gap-3 rounded-xl border border-dashed px-4 py-6 text-sm">
          <CalendarDays className="size-5 shrink-0" aria-hidden="true" />
          Aucune échéance dans les 30 prochains jours.
        </div>
      ) : (
        <ol className="bg-card relative space-y-4 rounded-xl border px-4 py-4 sm:px-5">
          {groups.map(([date, list], gi) => {
            const overdue = list.some((i) => i.overdue);
            return (
              <li key={date} className="relative pl-7">
                {gi < groups.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="bg-border absolute top-5 bottom-[-1rem] left-[7px] w-px"
                  />
                )}
                <span
                  aria-hidden="true"
                  className={cn(
                    'bg-card absolute top-1 left-0 size-[15px] rounded-full border-2',
                    overdue
                      ? 'border-warning'
                      : date === today
                        ? 'border-primary bg-primary'
                        : 'border-primary',
                  )}
                />
                <p className="text-sm font-medium">
                  <time dateTime={date}>
                    {formatDateFR(
                      date,
                      date.slice(0, 4) === today.slice(0, 4) ? 'dayMonth' : 'long',
                    )}
                  </time>
                  <span className="text-muted-foreground font-normal">
                    {' '}
                    · {relativeDueFR(date, today)}
                  </span>
                  {overdue && (
                    <Badge variant="warning" className="ml-2">
                      En retard
                    </Badge>
                  )}
                </p>
                <ul className="mt-2 space-y-2">
                  {list.map(({ rule }) => {
                    const category = rule.categoryId ? categoryMap.get(rule.categoryId) : undefined;
                    return (
                      <li key={`${rule.id}-${date}`} className="flex items-center gap-3">
                        <CategoryIcon
                          icon={category?.icon ?? 'Repeat'}
                          color={category?.color ?? '#5B6470'}
                          size="sm"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">{rule.label}</span>
                        <Money
                          value={rule.amount}
                          type={rule.type}
                          className="text-sm font-medium"
                        />
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
