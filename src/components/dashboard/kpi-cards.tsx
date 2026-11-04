'use client';
/**
 * Indicateurs clés : reste à dépenser (réponse à « Combien puis-je encore dépenser ? »),
 * solde total (détail par compte), dépenses et revenus du mois.
 */
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronDown, Minus } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { formatDateFR, formatMonthFR, monthEnd } from '@/domain/dates';
import type { DashboardData } from '@/domain/types';
import { Money } from '@/components/shared/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkline } from '@/components/charts/sparkline';
import { trimLeadingEmptyMonths } from '@/components/charts/chart-data';
import { EXPENSE_COLOR, INCOME_COLOR } from '@/components/charts/colors';
import { cn } from '@/lib/utils';
import { AnimatedMoney } from './animated-money';
import { daysLeftInMonth, describeExpenseChange } from './metrics';

export type KpiData = Pick<
  DashboardData,
  | 'today'
  | 'month'
  | 'totalBalance'
  | 'accounts'
  | 'current'
  | 'previous'
  | 'expenseChange'
  | 'comparisonLabel'
  | 'remainingToSpend'
  | 'dailyAllowance'
  | 'monthly'
>;

function KpiLabel({ children }: { children: string }) {
  return <h2 className="text-muted-foreground text-sm font-medium">{children}</h2>;
}

function RemainingKpi({ data }: { data: KpiData }) {
  const { remainingToSpend, dailyAllowance, today, month } = data;
  if (remainingToSpend === null) {
    return (
      <Card className="border-primary/30 bg-brand-tint/40 min-w-0">
        <CardContent className="flex h-full flex-col gap-2">
          <KpiLabel>Reste à dépenser</KpiLabel>
          <p className="text-sm">
            Créez des budgets pour savoir, chaque jour, combien vous pouvez encore dépenser.
          </p>
          <Button asChild variant="link" className="mt-auto h-11 justify-start px-0">
            <Link href="/budgets">
              Créer un budget
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  const overspent = remainingToSpend < 0;
  const days = daysLeftInMonth(today);
  return (
    <Card className="border-primary/30 min-w-0">
      <CardContent className="flex h-full flex-col gap-1">
        <KpiLabel>Reste à dépenser</KpiLabel>
        <AnimatedMoney
          value={remainingToSpend}
          className={cn('text-2xl font-semibold sm:text-3xl', overspent && 'text-expense')}
        />
        {overspent ? (
          <p className="text-expense text-sm">Budgets du mois dépassés</p>
        ) : dailyAllowance !== null ? (
          <p className="text-muted-foreground text-sm">
            soit{' '}
            <Money value={dailyAllowance} decimals={0} className="text-foreground font-semibold" />{' '}
            / jour
          </p>
        ) : null}
        <p className="text-muted-foreground mt-auto pt-1 text-xs">
          {days} jour{days > 1 ? 's' : ''} restant{days > 1 ? 's' : ''}, jusqu&apos;au{' '}
          {formatDateFR(monthEnd(month), 'dayMonth')}
        </p>
      </CardContent>
    </Card>
  );
}

function BalanceKpi({ data }: { data: KpiData }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const accounts = data.accounts.filter((a) => !a.archived);
  return (
    <Card data-testid="kpi-balance" className="min-w-0">
      <CardContent className="flex h-full flex-col gap-1">
        <KpiLabel>Solde total</KpiLabel>
        <AnimatedMoney
          value={data.totalBalance}
          className={cn('text-2xl font-semibold', data.totalBalance < 0 && 'text-expense')}
        />
        {accounts.length > 0 ? (
          <>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((v) => !v)}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 mt-auto flex min-h-11 items-center gap-1 self-start rounded-md text-sm focus-visible:ring-[3px] focus-visible:outline-none"
            >
              {accounts.length} compte{accounts.length > 1 ? 's' : ''}
              <ChevronDown
                aria-hidden
                className={cn(
                  'size-4 transition-transform motion-reduce:transition-none',
                  open && 'rotate-180',
                )}
              />
            </button>
            <ul id={panelId} hidden={!open} className="space-y-1 border-t pt-2 text-sm">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: a.color }}
                    />
                    <Link
                      href={`/transactions?accountId=${encodeURIComponent(a.id)}`}
                      className="truncate underline-offset-4 hover:underline"
                    >
                      {a.name}
                    </Link>
                  </span>
                  <Money value={a.balance} decimals={0} className="font-medium" />
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

const TREND_ICONS = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus } as const;
const TONE_CLASSES = {
  bad: 'text-expense',
  good: 'text-income',
  neutral: 'text-muted-foreground',
} as const;

function MonthExpenseKpi({ data }: { data: KpiData }) {
  const change = describeExpenseChange(
    data.expenseChange,
    data.month,
    data.comparisonLabel,
  );
  const last6 = trimLeadingEmptyMonths(data.monthly)
    .slice(-6)
    .map((m) => m.expense);
  const Icon = change ? TREND_ICONS[change.trend] : Minus;
  return (
    <Card data-testid="kpi-month-expense" className="min-w-0">
      <CardContent className="flex h-full flex-col gap-1">
        <KpiLabel>{`Dépenses de ${formatMonthFR(data.month, 'monthOnly')}`}</KpiLabel>
        <AnimatedMoney value={data.current.expense} className="text-2xl font-semibold" />
        {change ? (
          <p
            className={cn('flex items-center gap-1 text-sm font-medium', TONE_CLASSES[change.tone])}
          >
            <Icon aria-hidden className="size-4" />
            <span aria-hidden>{change.text}</span>
            <span className="sr-only">{change.srText}</span>
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">Pas de comparaison avec le mois précédent</p>
        )}
        <Sparkline values={last6} color={EXPENSE_COLOR} height={28} className="mt-auto pt-1" />
      </CardContent>
    </Card>
  );
}

function MonthIncomeKpi({ data }: { data: KpiData }) {
  const last6 = trimLeadingEmptyMonths(data.monthly)
    .slice(-6)
    .map((m) => m.income);
  return (
    <Card className="min-w-0">
      <CardContent className="flex h-full flex-col gap-1">
        <KpiLabel>{`Revenus de ${formatMonthFR(data.month, 'monthOnly')}`}</KpiLabel>
        <AnimatedMoney value={data.current.income} className="text-2xl font-semibold" />
        <p className="text-muted-foreground text-sm">
          Solde du mois :{' '}
          <Money
            value={data.current.net}
            sign="always"
            decimals={0}
            className={cn('font-medium', data.current.net < 0 ? 'text-expense' : 'text-income')}
          />
        </p>
        <Sparkline values={last6} color={INCOME_COLOR} height={28} className="mt-auto pt-1" />
      </CardContent>
    </Card>
  );
}

export function KpiCards({ data, className }: { data: KpiData; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>
      <RemainingKpi data={data} />
      <BalanceKpi data={data} />
      <MonthExpenseKpi data={data} />
      <MonthIncomeKpi data={data} />
    </div>
  );
}
