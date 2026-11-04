'use client';
/**
 * Tracé recharts de la prévision du solde (chargé à la demande par ForecastChart, sans SSR :
 * recharts reste hors du bundle initial).
 */
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ForecastDatum } from './chart-data';
import { ChartTooltip } from './chart-tooltip';
import { EXPENSE_COLOR, GRID_COLOR, MUTED_COLOR, NET_COLOR } from './colors';
import { useChartAnimation, useChartMoney } from './hooks';

const TICK = { fontSize: 12, fill: MUTED_COLOR };

export interface ForecastPlotProps {
  data: ForecastDatum[];
  ticks: number[];
  negative: boolean;
  compact: boolean;
}

export function ForecastPlot({ data, ticks, negative, compact }: ForecastPlotProps) {
  const animate = useChartAnimation();
  const { axis } = useChartMoney();
  const byLabel = new Map(data.map((d) => [d.label, d]));
  return (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
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
              minTickGap={12}
              interval="preserveStartEnd"
            />
            <YAxis
              hide={compact}
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
            {negative ? (
              <ReferenceLine
                y={0}
                stroke={EXPENSE_COLOR}
                strokeDasharray="4 4"
                label={
                  compact
                    ? undefined
                    : {
                        value: 'Solde nul',
                        position: 'insideBottomLeft',
                        fill: EXPENSE_COLOR,
                        fontSize: 11,
                      }
                }
              />
            ) : null}
            <Tooltip
              isAnimationActive={false}
              content={(p) => (
                <ChartTooltip
                  {...p}
                  title={(label) =>
                    typeof label === 'string' ? (byLabel.get(label)?.longLabel ?? label) : label
                  }
                />
              )}
            />
            <Area
              type="linear"
              dataKey="band"
              name="Intervalle 80 %"
              stroke="none"
              fill={NET_COLOR}
              fillOpacity={0.14}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={animate}
              animationDuration={600}
            />
            <Line
              type="linear"
              dataKey="actual"
              name="Solde réel"
              stroke={NET_COLOR}
              strokeWidth={2}
              dot={compact ? false : { r: 3, strokeWidth: 2, fill: 'var(--card)' }}
              activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={animate}
              animationDuration={600}
            />
            <Line
              type="linear"
              dataKey="expected"
              name="Prévision"
              stroke={NET_COLOR}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={animate}
              animationDuration={600}
            />
          </ComposedChart>
        </ResponsiveContainer>
  );
}
