'use client';
/**
 * Revenus / dépenses par mois (barres) et solde net (ligne), sur un axe unique en DT.
 * La série commence au premier mois avec des données (pas de faux « 0 DT »).
 * Clic sur une colonne → onSelectMonth(ym). Alternative clavier : liste de boutons qui
 * apparaît sous le graphique au focus (tableau de données pour les lecteurs d'écran).
 */
import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { YearMonth } from '@/domain/dates';
import type { MonthTotals } from '@/domain/types';
import { Money } from '@/components/shared/money';
import { cn } from '@/lib/utils';
import {
  describeMonthly,
  moneyTicks,
  prepareMonthlyBars,
  trimLeadingEmptyMonths,
  type MonthlyBarDatum,
} from './chart-data';
import { ChartDataTable } from './chart-data-table';
import { ChartLegend } from './chart-legend';
import { EXPENSE_COLOR, INCOME_COLOR, NET_COLOR } from './colors';
import { useChartMoney } from './hooks';
import { PlotSkeleton } from './plot-skeleton';

const MonthlyBarsPlot = dynamic(
  () => import('./monthly-bars-plot').then((m) => m.MonthlyBarsPlot),
  { ssr: false, loading: PlotSkeleton },
);

export interface MonthlyBarsChartProps {
  months: MonthTotals[];
  onSelectMonth?: (month: YearMonth) => void;
  /** Hauteur en px (défaut 260) */
  height?: number;
  /** Affiche la ligne du solde net (défaut true) */
  showNet?: boolean;
  className?: string;
}

export function MonthlyBarsChart({
  months,
  onSelectMonth,
  height = 260,
  showNet = true,
  className,
}: MonthlyBarsChartProps) {
  const { text } = useChartMoney();
  const data = useMemo(() => prepareMonthlyBars(trimLeadingEmptyMonths(months)), [months]);
  const ticks = useMemo(
    () => moneyTicks(data.flatMap((d) => [d.income, d.expense, ...(showNet ? [d.net] : [])])),
    [data, showNet],
  );

  return (
    <div className={cn('space-y-3', className)}>
      <ChartLegend
        items={[
          { label: 'Revenus', color: INCOME_COLOR, shape: 'square' },
          { label: 'Dépenses', color: EXPENSE_COLOR, shape: 'square' },
          ...(showNet ? [{ label: 'Solde net', color: NET_COLOR, shape: 'line' as const }] : []),
        ]}
      />
      <div role="img" aria-label={describeMonthly(data, text)} style={{ height }}>
        <MonthlyBarsPlot
          data={data}
          ticks={ticks}
          showNet={showNet}
          onSelectMonth={onSelectMonth}
        />
      </div>
      <ChartDataTable<MonthlyBarDatum>
        caption="Revenus, dépenses et solde net par mois"
        rows={data}
        rowKey={(d) => d.month}
        columns={[
          { header: 'Mois', cell: (d) => d.longLabel },
          {
            header: 'Revenus',
            align: 'right',
            cell: (d) => <Money value={d.income} decimals={0} />,
          },
          {
            header: 'Dépenses',
            align: 'right',
            cell: (d) => <Money value={d.expense} decimals={0} />,
          },
          {
            header: 'Solde net',
            align: 'right',
            cell: (d) => <Money value={d.net} decimals={0} />,
          },
        ]}
        action={
          onSelectMonth
            ? {
                title: "Voir les transactions d'un mois",
                label: (d) => d.longLabel,
                onActivate: (d) => onSelectMonth(d.month),
              }
            : undefined
        }
      />
    </div>
  );
}
