/**
 * Top 5 des dépenses du mois, chaque ligne ouvre la transaction (recherche par libellé et date).
 */
import Link from 'next/link';
import { formatRelativeDayFR, type ISODate } from '@/domain/dates';
import type { CategorySlice, Transaction } from '@/domain/types';
import { CategoryIcon } from '@/components/shared/category-icon';
import { Money } from '@/components/shared/money';
import { transactionLabelHref } from './links';

export interface TopExpensesProps {
  expenses: Transaction[];
  /** Catégories connues (byCategory du mois) pour le nom, l'icône et la couleur */
  categories: CategorySlice[];
  today: ISODate;
}

export function TopExpenses({ expenses, categories, today }: TopExpensesProps) {
  if (expenses.length === 0) {
    return <p className="text-muted-foreground text-sm">Aucune dépense ce mois-ci.</p>;
  }
  const byId = new Map(
    categories.filter((c) => c.categoryId !== null).map((c) => [c.categoryId, c] as const),
  );
  return (
    <ol className="divide-y">
      {expenses.slice(0, 5).map((t, i) => {
        const cat = t.categoryId ? byId.get(t.categoryId) : undefined;
        return (
          <li key={t.id}>
            <Link
              href={transactionLabelHref(t.label, t.date)}
              className="hover:bg-accent focus-visible:ring-ring/50 flex min-h-14 items-center gap-3 rounded-md px-1 py-2 focus-visible:ring-[3px] focus-visible:outline-none"
            >
              <span
                aria-hidden
                className="text-muted-foreground w-4 shrink-0 text-center text-xs tabular-nums"
              >
                {i + 1}
              </span>
              <CategoryIcon icon={cat?.icon ?? 'Tag'} color={cat?.color ?? '#5B6470'} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{t.label}</span>
                <span className="text-muted-foreground block truncate text-xs">
                  {cat?.name ?? (t.categoryId ? 'Catégorie' : 'Sans catégorie')} ·{' '}
                  {formatRelativeDayFR(t.date, today)}
                </span>
              </span>
              <Money value={t.amount} type="EXPENSE" className="shrink-0 text-sm font-semibold" />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
