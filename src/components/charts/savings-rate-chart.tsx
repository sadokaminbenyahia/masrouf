'use client';
/**
 * Taux d'épargne mensuel (net / revenus), avec le repère des 20 % de la règle 50/30/20.
 * Graphique séparé des montants : jamais deux échelles sur un même graphique.
 * Le mois en cours, incomplet, est exclu de la courbe (signalé « en cours » dans les données).
 */
import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { YearMonth } from '@/domain/dates';
import type { MonthTotals } from '@/domain/types';
import { cn } from '@/lib/utils';
import {
  computeSavingsRates,
  describeSavingsRates,
  savingsRateTicks,
  type SavingsRateDatum,
} from './chart-data';
import { ChartDataTable } from './chart-data-table';
import { formatPercent } from './format';
import { PlotSkeleton } from './plot-skeleton';

const SavingsRatePlot = dynamic(
  () => import('./savings-rate-plot').then((m) => m.SavingsRatePlot),
  { ssr: false, loading: PlotSkeleton },
);

export interface SavingsRateChartProps {
  months: MonthTotals[];
  /** Mois en cours (incomplet) : exclu de la courbe */
  currentMonth?: YearMonth;
  height?: number;
  className?: string;
}

export const SAVINGS_TARGET = 0.2;

export function SavingsRateChart({
  months,
  currentMonth,
  height = 220,
  className,
}: SavingsRateChartProps) {
  const data = useMemo(() => computeSavingsRates(months, currentMonth), [months, currentMonth]);
  const ticks = useMemo(() => savingsRateTicks(data, SAVINGS_TARGET), [data]);
  const partial = data.find((d) => d.partial);

  if (data.every((d) => d.rate === null)) {
    return (
      <p className={cn('text-muted-foreground py-6 text-center text-sm', className)}>
        Le taux d&apos;épargne apparaîtra après un premier mois complet avec des revenus.
      </p>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div role="img" aria-label={describeSavingsRates(data)} style={{ height }}>
        <SavingsRatePlot data={data} ticks={ticks} target={SAVINGS_TARGET} />
      </div>
      {partial ? (
        <p className="text-muted-foreground text-xs">
          {`Mois en cours (${partial.longLabel}) non représenté : son taux sera calculé une fois le mois terminé.`}
        </p>
      ) : null}
      <ChartDataTable<SavingsRateDatum>
        caption="Taux d'épargne par mois"
        rows={data}
        rowKey={(d) => d.month}
        columns={[
          { header: 'Mois', cell: (d) => d.longLabel },
          {
            header: "Taux d'épargne",
            align: 'right',
            cell: (d) =>
              d.partial
                ? 'Mois en cours'
                : d.rate === null
                  ? 'Aucun revenu'
                  : formatPercent(d.rate),
          },
        ]}
      />
    </div>
  );
}
