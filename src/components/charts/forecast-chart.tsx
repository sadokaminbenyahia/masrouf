'use client';
/**
 * Prévision du solde : solde réel (ligne pleine), prévision (ligne pointillée) et intervalle
 * de confiance à 80 % (aire « range » [bas, haut]). Une ligne de référence à 0 apparaît si le
 * solde prévu risque de passer sous zéro.
 */
import { useMemo } from 'react';
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
import type { BalanceForecast } from '@/domain/ai/types';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/shared/money';
import { cn } from '@/lib/utils';
import {
  describeForecast,
  forecastMayGoNegative,
  prepareForecastData,
  RELIABILITY_LABELS,
  type ForecastDatum,
} from './chart-data';
import { ChartDataTable } from './chart-data-table';
import { ChartLegend } from './chart-legend';
import { ChartTooltip } from './chart-tooltip';
import { EXPENSE_COLOR, GRID_COLOR, MUTED_COLOR, NET_COLOR } from './colors';
import { useChartAnimation, useChartMoney } from './hooks';

export interface ForecastChartProps {
  forecast: BalanceForecast;
  /** Hauteur du graphique en px (défaut 280) */
  height?: number;
  /** Légende + badge de fiabilité (défaut true) */
  showLegend?: boolean;
  className?: string;
}

const TICK = { fontSize: 12, fill: MUTED_COLOR };
const RELIABILITY_VARIANT = { LOW: 'warning', MEDIUM: 'secondary', HIGH: 'success' } as const;

export function ForecastReliabilityBadge({
  reliability,
}: {
  reliability: BalanceForecast['reliability'];
}) {
  return (
    <Badge variant={RELIABILITY_VARIANT[reliability]}>{RELIABILITY_LABELS[reliability]}</Badge>
  );
}

export function ForecastChart({
  forecast,
  height = 280,
  showLegend = true,
  className,
}: ForecastChartProps) {
  const animate = useChartAnimation();
  const { text, axis } = useChartMoney();
  const data = useMemo(() => prepareForecastData(forecast.chart), [forecast.chart]);
  const byLabel = useMemo(() => new Map(data.map((d) => [d.label, d])), [data]);
  const negative = forecastMayGoNegative(forecast);
  const compact = height < 200;

  return (
    <div className={cn('space-y-3', className)}>
      {showLegend ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ChartLegend
            items={[
              { label: 'Solde réel', color: NET_COLOR, shape: 'line' },
              { label: 'Prévision', color: NET_COLOR, shape: 'dashed' },
              { label: 'Intervalle de confiance 80 %', color: NET_COLOR, shape: 'band' },
            ]}
          />
          <ForecastReliabilityBadge reliability={forecast.reliability} />
        </div>
      ) : null}
      <div role="img" aria-label={describeForecast(forecast, text)} style={{ height }}>
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
              domain={['auto', 'auto']}
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
              type="monotone"
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
              type="monotone"
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
              type="monotone"
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
      </div>
      <ChartDataTable<ForecastDatum>
        caption="Solde réel et prévu par mois"
        rows={data}
        rowKey={(d) => d.month}
        columns={[
          { header: 'Mois', cell: (d) => d.longLabel },
          {
            header: 'Solde réel',
            align: 'right',
            cell: (d) => (d.actual === null ? '—' : <Money value={d.actual} decimals={0} />),
          },
          {
            header: 'Prévision',
            align: 'right',
            cell: (d) =>
              d.expected === null || d.actual !== null ? (
                '—'
              ) : (
                <Money value={d.expected} decimals={0} />
              ),
          },
          {
            header: 'Intervalle à 80 %',
            align: 'right',
            cell: (d) =>
              d.low === null || d.high === null ? (
                '—'
              ) : (
                <>
                  <Money value={d.low} decimals={0} /> à <Money value={d.high} decimals={0} />
                </>
              ),
          },
        ]}
      />
    </div>
  );
}
