'use client';
/**
 * Revenus / dépenses par mois (barres) et solde net (ligne), sur un axe unique en DT.
 * Clic sur une colonne → onSelectMonth(ym). Alternative clavier : tableau de données dont les
 * boutons deviennent visibles au focus.
 */
import { useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { YearMonth } from '@/domain/dates';
import type { MonthTotals } from '@/domain/types';
import { Money } from '@/components/shared/money';
import { cn } from '@/lib/utils';
import { describeMonthly, prepareMonthlyBars, type MonthlyBarDatum } from './chart-data';
import { ChartDataTable } from './chart-data-table';
import { ChartTooltip } from './chart-tooltip';
import { EXPENSE_COLOR, GRID_COLOR, INCOME_COLOR, MUTED_COLOR, NET_COLOR } from './colors';
import { useChartAnimation, useChartMoney } from './hooks';
import { ChartLegend } from './chart-legend';

export interface MonthlyBarsChartProps {
  months: MonthTotals[];
  onSelectMonth?: (month: YearMonth) => void;
  /** Hauteur en px (défaut 260) */
  height?: number;
  /** Affiche la ligne du solde net (défaut true) */
  showNet?: boolean;
  className?: string;
}

const TICK = { fontSize: 12, fill: MUTED_COLOR };

export function MonthlyBarsChart({
  months,
  onSelectMonth,
  height = 260,
  showNet = true,
  className,
}: MonthlyBarsChartProps) {
  const animate = useChartAnimation();
  const { text, axis } = useChartMoney();
  const data = useMemo(() => prepareMonthlyBars(months), [months]);
  const byLabel = useMemo(() => new Map(data.map((d) => [d.label, d])), [data]);
  const hasNegative = data.some((d) => d.net < 0);

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
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
            barGap={2}
            barCategoryGap="22%"
            accessibilityLayer={false}
            style={onSelectMonth ? { cursor: 'pointer' } : undefined}
            onClick={(state) => {
              const index = Number(state.activeTooltipIndex ?? state.activeIndex);
              const d = Number.isInteger(index) ? data[index] : undefined;
              if (d && onSelectMonth) onSelectMonth(d.month);
            }}
          >
            <CartesianGrid vertical={false} stroke={GRID_COLOR} strokeOpacity={0.7} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={TICK}
              minTickGap={8}
              interval="preserveStartEnd"
            />
            <YAxis tickFormatter={axis} tickLine={false} axisLine={false} tick={TICK} width={60} />
            {hasNegative ? <ReferenceLine y={0} stroke={MUTED_COLOR} strokeOpacity={0.6} /> : null}
            <Tooltip
              isAnimationActive={false}
              cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
              content={(p) => (
                <ChartTooltip
                  {...p}
                  title={(label) =>
                    typeof label === 'string' ? (byLabel.get(label)?.longLabel ?? label) : label
                  }
                  footer={onSelectMonth ? () => 'Cliquez pour voir les transactions' : undefined}
                />
              )}
            />
            <Bar
              dataKey="income"
              name="Revenus"
              fill={INCOME_COLOR}
              radius={[4, 4, 0, 0]}
              maxBarSize={18}
              isAnimationActive={animate}
              animationDuration={500}
            />
            <Bar
              dataKey="expense"
              name="Dépenses"
              fill={EXPENSE_COLOR}
              radius={[4, 4, 0, 0]}
              maxBarSize={18}
              isAnimationActive={animate}
              animationDuration={500}
            />
            {showNet ? (
              <Line
                type="monotone"
                dataKey="net"
                name="Solde net"
                stroke={NET_COLOR}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 2, fill: 'var(--card)' }}
                activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }}
                isAnimationActive={animate}
                animationDuration={500}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
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
                label: (d) => `Transactions de ${d.longLabel}`,
                onActivate: (d) => onSelectMonth(d.month),
              }
            : undefined
        }
      />
    </div>
  );
}
