'use client';
/**
 * Taux d'épargne mensuel (net / revenus), avec le repère des 20 % de la règle 50/30/20.
 * Graphique séparé des montants : jamais deux échelles sur un même graphique.
 */
import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MonthTotals } from '@/domain/types';
import { cn } from '@/lib/utils';
import { computeSavingsRates, describeSavingsRates, type SavingsRateDatum } from './chart-data';
import { ChartDataTable } from './chart-data-table';
import { ChartTooltip } from './chart-tooltip';
import { GRID_COLOR, MUTED_COLOR, NET_COLOR } from './colors';
import { formatPercent } from './format';
import { useChartAnimation } from './hooks';

export interface SavingsRateChartProps {
  months: MonthTotals[];
  height?: number;
  className?: string;
}

const TICK = { fontSize: 12, fill: MUTED_COLOR };
export const SAVINGS_TARGET = 0.2;

export function SavingsRateChart({ months, height = 220, className }: SavingsRateChartProps) {
  const animate = useChartAnimation();
  const data = useMemo(() => computeSavingsRates(months), [months]);
  const byLabel = useMemo(() => new Map(data.map((d) => [d.label, d])), [data]);

  return (
    <div className={cn('space-y-3', className)}>
      <div role="img" aria-label={describeSavingsRates(data)} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            accessibilityLayer={false}
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
            <YAxis
              tickFormatter={(v: number) => formatPercent(v)}
              tickLine={false}
              axisLine={false}
              tick={TICK}
              width={52}
              domain={[
                (min: number) => Math.min(0, min),
                (max: number) => Math.max(SAVINGS_TARGET + 0.1, max),
              ]}
            />
            <ReferenceLine y={0} stroke={MUTED_COLOR} strokeOpacity={0.6} />
            <ReferenceLine
              y={SAVINGS_TARGET}
              stroke="var(--success)"
              strokeDasharray="4 4"
              label={{
                value: 'Repère 20 %',
                position: 'insideTopRight',
                fill: MUTED_COLOR,
                fontSize: 11,
              }}
            />
            <Tooltip
              isAnimationActive={false}
              content={(p) => (
                <ChartTooltip
                  {...p}
                  format="percent"
                  title={(label) =>
                    typeof label === 'string' ? (byLabel.get(label)?.longLabel ?? label) : label
                  }
                />
              )}
            />
            <Line
              type="monotone"
              dataKey="rate"
              name="Taux d'épargne"
              stroke={NET_COLOR}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 2, fill: 'var(--card)' }}
              activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={animate}
              animationDuration={500}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartDataTable<SavingsRateDatum>
        caption="Taux d'épargne par mois"
        rows={data}
        rowKey={(d) => d.month}
        columns={[
          { header: 'Mois', cell: (d) => d.longLabel },
          {
            header: "Taux d'épargne",
            align: 'right',
            cell: (d) => (d.rate === null ? 'Aucun revenu' : formatPercent(d.rate)),
          },
        ]}
      />
    </div>
  );
}
