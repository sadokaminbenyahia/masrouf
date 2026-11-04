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
      {/* Totaux arrondis au dinar ; flex-wrap : jamais de débordement sur mobile. */}
      <dl className="flex min-w-0 flex-1 flex-wrap gap-x-6 gap-y-2 sm:justify-end sm:gap-x-8">
        <div>
          <dt className="text-muted-foreground text-xs">Revenus</dt>
          <dd className="font-medium">
            <Money value={totals.income} type="INCOME" decimals={0} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Dépenses</dt>
          <dd className="font-medium">
            <Money value={totals.expense} type="EXPENSE" decimals={0} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Solde net</dt>
          <dd className="font-semibold">
            <Money value={totals.net} sign="always" decimals={0} />
          </dd>
        </div>
      </dl>
    </section>
  );
}
