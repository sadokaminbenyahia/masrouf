'use client';
/**
 * Tracé recharts du taux d'épargne (chargé à la demande par SavingsRateChart, sans SSR).
 */
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
import type { SavingsRateDatum } from './chart-data';
import { ChartTooltip } from './chart-tooltip';
import { GRID_COLOR, MUTED_COLOR, NET_COLOR } from './colors';
import { formatPercent } from './format';
import { useChartAnimation } from './hooks';

const TICK = { fontSize: 12, fill: MUTED_COLOR };

export interface SavingsRatePlotProps {
  data: SavingsRateDatum[];
  ticks: number[];
  target: number;
}

export function SavingsRatePlot({ data, ticks, target }: SavingsRatePlotProps) {
  const animate = useChartAnimation();
  const byLabel = new Map(data.map((d) => [d.label, d]));
  return (
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
              ticks={ticks}
              domain={[ticks[0] ?? 0, ticks[ticks.length - 1] ?? 1]}
              allowDecimals={false}
              interval={0}
            />
            <ReferenceLine y={0} stroke={MUTED_COLOR} strokeOpacity={0.6} />
            <ReferenceLine
              y={target}
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
              type="linear"
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
  );
}
