'use client';
import { ArrowDownRight, ArrowUpRight, Scale } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Millimes } from '@/domain/money';
import type { TransactionType } from '@/domain/types';
import { Money } from '@/components/shared/money';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { plural } from '@/components/import/import-logic';
import type { MonthlyTotals } from './recurring-math';

function Stat({
  label,
  value,
  type,
  icon: Icon,
  iconClass,
  hint,
  sign,
}: {
  label: string;
  value: Millimes;
  type?: TransactionType;
  icon: LucideIcon;
  iconClass: string;
  hint: string;
  sign?: 'auto' | 'always';
}) {
  return (
    <Card className="gap-2 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">{label}</p>
        <span className={cn('flex size-8 items-center justify-center rounded-lg', iconClass)}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="text-2xl font-semibold">
        <Money value={value} decimals={0} {...(type ? { type } : {})} {...(sign ? { sign } : {})} />
      </p>
      <p className="text-muted-foreground text-xs">{hint}</p>
    </Card>
  );
}

export function RecurringSummary({ totals }: { totals: MonthlyTotals }) {
  const hint = `Équivalent mensuel de ${plural(totals.activeCount, 'règle active', 'règles actives')}`;
  return (
    <section aria-label="Total mensuel des récurrences" className="grid gap-3 sm:grid-cols-3">
      <Stat
        label="Dépenses récurrentes / mois"
        value={totals.expense}
        type="EXPENSE"
        icon={ArrowDownRight}
        iconClass="bg-expense/10 text-expense"
        hint={hint}
      />
      <Stat
        label="Revenus récurrents / mois"
        value={totals.income}
        type="INCOME"
        icon={ArrowUpRight}
        iconClass="bg-income/10 text-income"
        hint="Salaire, loyers perçus…"
      />
      <Stat
        label="Solde récurrent / mois"
        value={totals.net}
        sign="always"
        icon={Scale}
        iconClass="bg-primary/10 text-primary"
        hint="Revenus moins dépenses récurrentes"
      />
    </section>
  );
}
