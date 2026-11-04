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
      className={cn(
        'grid grid-cols-[minmax(0,1fr)] gap-4 transition-opacity',
        busy && 'opacity-60',
      )}
      aria-busy={busy || undefined}
    >
      {groups.map((g) => {
        const headingId = `${baseId}-${g.date ?? 'all'}`;
        return (
          <section
            key={g.date ?? 'all'}
            aria-labelledby={g.date ? headingId : undefined}
            className="min-w-0"
          >
            {g.date !== null && (
              <div className="text-muted-foreground mb-1.5 flex items-center justify-between gap-2 px-1 text-xs font-medium">
                <h2 id={headingId} className="min-w-0 truncate">
                  {formatRelativeDayFR(g.date, today)}
                </h2>
                <span className="inline-flex shrink-0 items-center gap-1">
                  Total du jour
                  <Money value={g.net} sign="always" decimals={0} className="text-foreground" />
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
                const aiCategory = t.categorySource === 'AI' ? category : null;
                const hasExtras = t.tags.length > 0 || aiCategory !== null;
                return (
                  // Grille : la 1re ligne (case, icône, libellé, montant, actions) a une colonne
                  // de libellé `minmax(0,1fr)` (troncature, jamais de débordement) ; les badges
                  // (IA, tags) passent sur une 2e ligne qui s'étend sous le montant.
                  <li
                    key={t.id}
                    className={cn(
                      'grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1 py-2 pr-1 pl-3',
                      selected && 'bg-accent/50',
                    )}
                  >
                    <Checkbox
                      checked={selected}
                      onClick={(e) => onToggleRow(t.id, e.shiftKey)}
                      aria-label={`Sélectionner ${t.label}`}
                      // Zone cliquable de 44 × 44 px (pseudo-élément) autour de la case de 20 px.
                      className="relative mr-1 size-5 after:absolute after:-inset-3 after:content-['']"
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
                    <div className="min-w-0">
                      <p className="flex min-w-0 items-center gap-1.5 font-medium">
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
                    </div>
                    <Money
                      value={t.amount}
                      type={t.type}
                      className="text-right text-sm font-semibold"
                    />
                    <RowActions t={t} handlers={handlers} narrow />
                    {hasExtras && (
                      <div className="col-span-3 col-start-3 flex min-w-0 flex-wrap items-center gap-1 pr-3">
                        {aiCategory && (
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
                              aria-label={`Confirmer la catégorie ${aiCategory.name} pour ${t.label}`}
                            >
                              Confirmer
                            </Button>
                          </>
                        )}
                        {t.tags.map((tag) => (
                          <span
                            key={tag}
                            className="border-border max-w-full truncate rounded-md border px-1.5 text-[11px]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
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
