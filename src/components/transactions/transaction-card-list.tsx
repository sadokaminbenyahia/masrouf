'use client';
/** Liste de cartes (< lg) : mêmes données et mêmes actions que le tableau, sans édition inline. */
import { ArrowLeftRight, Repeat } from 'lucide-react';
import { useId } from 'react';
import { AiBadge } from '@/components/shared/ai-badge';
import { CategoryIcon } from '@/components/shared/category-icon';
import { Money } from '@/components/shared/money';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { formatRelativeDayFR, type ISODate } from '@/domain/dates';
import type { AccountWithBalance, Category, Transaction } from '@/domain/types';
import type { TransactionQueryData } from '@/lib/schemas/transactions';
import { cn } from '@/lib/utils';
import { groupByDay } from './grouping';
import { RowActions, type RowActionHandlers } from './row-actions';
import type { Selection } from './selection';

interface TransactionCardListProps {
  items: Transaction[];
  today: ISODate;
  sort: TransactionQueryData['sort'];
  selection: Selection;
  onToggleRow: (id: string, shift: boolean) => void;
  accountsById: ReadonlyMap<string, AccountWithBalance>;
  categoriesById: ReadonlyMap<string, Category>;
  handlers: RowActionHandlers;
  busy: boolean;
}

export function TransactionCardList({
  items,
  today,
  sort,
  selection,
  onToggleRow,
  accountsById,
  categoriesById,
  handlers,
  busy,
}: TransactionCardListProps) {
  const baseId = useId();
  const groups =
    sort.field === 'date'
      ? groupByDay(items)
      : [{ date: null, items, income: 0, expense: 0, net: 0 }];

  return (
    <div
      className={cn('grid gap-4 transition-opacity', busy && 'opacity-60')}
      aria-busy={busy || undefined}
    >
      {groups.map((g) => {
        const headingId = `${baseId}-${g.date ?? 'all'}`;
        return (
          <section key={g.date ?? 'all'} aria-labelledby={g.date ? headingId : undefined}>
            {g.date !== null && (
              <div className="text-muted-foreground mb-1.5 flex items-center justify-between px-1 text-xs font-medium">
                <h2 id={headingId}>{formatRelativeDayFR(g.date, today)}</h2>
                <span className="inline-flex items-center gap-1">
                  Total du jour <Money value={g.net} sign="always" className="text-foreground" />
                </span>
              </div>
            )}
            <ul
              aria-label={g.date ? undefined : 'Transactions'}
              className="bg-card border-border divide-border divide-y rounded-xl border"
            >
              {g.items.map((t) => {
                const category = t.categoryId ? (categoriesById.get(t.categoryId) ?? null) : null;
                const account = accountsById.get(t.accountId);
                const target = t.transferAccountId
                  ? accountsById.get(t.transferAccountId)
                  : undefined;
                const selected = !!selection[t.id];
                return (
                  <li
                    key={t.id}
                    className={cn(
                      'flex items-center gap-3 py-2 pr-1 pl-3',
                      selected && 'bg-accent/50',
                    )}
                  >
                    <Checkbox
                      checked={selected}
                      onClick={(e) => onToggleRow(t.id, e.shiftKey)}
                      aria-label={`Sélectionner ${t.label}`}
                      className="size-5"
                    />
                    {t.type === 'TRANSFER' ? (
                      <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-xl">
                        <ArrowLeftRight className="size-4" aria-hidden />
                      </span>
                    ) : category ? (
                      <CategoryIcon icon={category.icon} color={category.color} size="md" />
                    ) : (
                      <span className="bg-muted size-9 shrink-0 rounded-xl" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 font-medium">
                        <span className="truncate">{t.label}</span>
                        {t.recurringId && (
                          <Repeat
                            className="text-muted-foreground size-3.5 shrink-0"
                            aria-label="Récurrente"
                          />
                        )}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {t.type === 'TRANSFER'
                          ? `Virement · ${account?.name ?? 'Compte inconnu'} → ${target?.name ?? 'compte inconnu'}`
                          : `${category?.name ?? 'Sans catégorie'} · ${account?.name ?? 'Compte inconnu'}`}
                        {g.date === null && ` · ${formatRelativeDayFR(t.date, today)}`}
                      </p>
                      {t.note && <p className="text-muted-foreground truncate text-xs">{t.note}</p>}
                      {(t.tags.length > 0 || t.categorySource === 'AI') && (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {t.categorySource === 'AI' && category && (
                            <>
                              <AiBadge
                                {...(t.aiConfidence !== null ? { confidence: t.aiConfidence } : {})}
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() => handlers.onConfirmCategory(t)}
                                aria-label={`Confirmer la catégorie ${category.name} pour ${t.label}`}
                              >
                                Confirmer
                              </Button>
                            </>
                          )}
                          {t.tags.map((tag) => (
                            <span
                              key={tag}
                              className="border-border rounded-md border px-1.5 text-[11px]"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Money
                      value={t.amount}
                      type={t.type}
                      className="shrink-0 text-sm font-semibold"
                    />
                    <RowActions t={t} handlers={handlers} />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
