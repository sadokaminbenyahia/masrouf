'use client';
/**
 * Tracé recharts revenus / dépenses / solde net (chargé à la demande par MonthlyBarsChart,
 * sans SSR : recharts reste hors du bundle initial).
 */
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
import type { MonthlyBarDatum } from './chart-data';
import { ChartTooltip } from './chart-tooltip';
import { EXPENSE_COLOR, GRID_COLOR, INCOME_COLOR, MUTED_COLOR, NET_COLOR } from './colors';
import { useChartAnimation, useChartMoney } from './hooks';

const TICK = { fontSize: 12, fill: MUTED_COLOR };

export interface MonthlyBarsPlotProps {
  data: MonthlyBarDatum[];
  ticks: number[];
  showNet: boolean;
  onSelectMonth?: (month: YearMonth) => void;
}

export function MonthlyBarsPlot({ data, ticks, showNet, onSelectMonth }: MonthlyBarsPlotProps) {
  const animate = useChartAnimation();
  const { axis } = useChartMoney();
  const byLabel = new Map(data.map((d) => [d.label, d]));
  const hasNegative = data.some((d) => d.net < 0);
  return (
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
            <YAxis
              tickFormatter={axis}
              tickLine={false}
              axisLine={false}
              tick={TICK}
              width={60}
              ticks={ticks}
              domain={[ticks[0] ?? 0, ticks[ticks.length - 1] ?? 0]}
              allowDecimals={false}
              interval={0}
            />
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
                type="linear"
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
  );
}
