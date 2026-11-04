import { Money } from '@/components/shared/money';
import type { TransactionTotals } from '@/domain/types';
import { cn } from '@/lib/utils';
import { pluralize } from './text';

/** Totaux du filtre courant (toutes pages confondues ; virements exclus). */
export function TotalsBar({
  totals,
  className,
}: {
  totals: TransactionTotals;
  className?: string;
}) {
  return (
    <section
      aria-label="Totaux du filtre"
      className={cn(
        'bg-card border-border flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border px-4 py-3',
        className,
      )}
    >
      <p className="text-muted-foreground w-full text-sm sm:w-auto">
        {pluralize(totals.count, 'transaction', 'transactions')}
      </p>
      <dl className="grid flex-1 grid-cols-3 gap-3 sm:flex sm:justify-end sm:gap-8">
        <div>
          <dt className="text-muted-foreground text-xs">Revenus</dt>
          <dd className="font-medium">
            <Money value={totals.income} type="INCOME" />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Dépenses</dt>
          <dd className="font-medium">
            <Money value={totals.expense} type="EXPENSE" />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Solde net</dt>
          <dd className="font-semibold">
            <Money value={totals.net} sign="always" />
          </dd>
        </div>
      </dl>
    </section>
  );
}
