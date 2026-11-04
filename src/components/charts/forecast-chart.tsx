'use client';
/**
 * Prévision du solde : solde réel (ligne pleine), prévision (ligne pointillée) et intervalle
 * de confiance à 80 % (aire « range » [bas, haut]). Une ligne de référence à 0 apparaît si le
 * solde prévu risque de passer sous zéro. Le solde réel va jusqu'au solde du jour (point « auj. »)
 * quand le domaine le fournit, et la prévision part de ce point. Sans historique (nouvel
 * utilisateur), un état vide remplace la courbe plate inventée.
 */
import { ChartLine } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { BalanceForecast } from '@/domain/ai/types';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/shared/money';
import { cn } from '@/lib/utils';
import {
  describeForecast,
  forecastIsEmpty,
  forecastMayGoNegative,
  moneyTicks,
  prepareForecastData,
  RELIABILITY_LABELS,
  type ForecastDatum,
} from './chart-data';
import { ChartDataTable } from './chart-data-table';
import { ChartLegend } from './chart-legend';
import { NET_COLOR } from './colors';
import { useChartMoney } from './hooks';
import { PlotSkeleton } from './plot-skeleton';

const ForecastPlot = dynamic(() => import('./forecast-plot').then((m) => m.ForecastPlot), {
  ssr: false,
  loading: PlotSkeleton,
});

export interface ForecastChartProps {
  forecast: BalanceForecast;
  /** Hauteur du graphique en px (défaut 280) */
  height?: number;
  /** Légende + badge de fiabilité (défaut true) */
  showLegend?: boolean;
  className?: string;
}

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

/** État vide : pas encore d'historique, la prévision n'aurait aucun sens. */
export function ForecastEmpty({ height, className }: { height: number; className?: string }) {
  return (
    <div
      className={cn(
        'text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 text-center text-sm',
        className,
      )}
      style={{ minHeight: height }}
    >
      <ChartLine aria-hidden className="size-5" />
      <p className="text-foreground font-medium">Pas encore de prévision</p>
      <p className="max-w-sm">
        Elle apparaîtra après quelques semaines d&apos;opérations, ou dès l&apos;import d&apos;un
        relevé.
      </p>
    </div>
  );
}

export function ForecastChart({
  forecast,
  height = 280,
  showLegend = true,
  className,
}: ForecastChartProps) {
  const { text } = useChartMoney();
  const data = useMemo(() => prepareForecastData(forecast.chart), [forecast.chart]);
  const negative = forecastMayGoNegative(forecast);
  const compact = height < 200;
  const ticks = useMemo(
    () => moneyTicks(data.flatMap((d) => [d.actual, d.expected, d.low, d.high]), negative),
    [data, negative],
  );

  if (forecastIsEmpty(forecast)) {
    return <ForecastEmpty height={height} className={className} />;
  }

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
          <ForecastPlot data={data} ticks={ticks} negative={negative} compact={compact} />
      </div>
      <ChartDataTable<ForecastDatum>
        caption="Solde réel et prévu par mois"
        rows={data}
        rowKey={(d) => d.key}
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
