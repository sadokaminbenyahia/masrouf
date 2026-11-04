'use client';
/**
 * Donut de répartition par catégorie : total au centre, part mise en avant au survol ou au
 * focus de la légende, clic (part ou bouton de légende) → onSelect. La légende est une liste
 * de boutons focusables, placée sous le donut sur mobile et à côté sur les écrans larges.
 * Pas d'infobulle : l'étiquette centrale affiche déjà le nom, le montant et la part survolés
 * (une infobulle la recouvrait).
 */
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import type { Millimes } from '@/domain/money';
import type { CategorySlice } from '@/domain/types';
import { Money } from '@/components/shared/money';
import { cn } from '@/lib/utils';
import { describeBreakdown, prepareDonutData, slicesTotal, type DonutDatum } from './chart-data';
import { formatPercent } from './format';
import { DonutPlotSkeleton } from './plot-skeleton';
import { useChartMoney } from './hooks';

const DonutPlot = dynamic(() => import('./donut-plot').then((m) => m.DonutPlot), {
  ssr: false,
  loading: DonutPlotSkeleton,
});

export interface CategoryDonutProps {
  slices: CategorySlice[];
  /** Total affiché au centre (défaut : somme des tranches) */
  total?: Millimes;
  onSelect?: (slice: CategorySlice) => void;
  /** Hauteur du donut en px (défaut 220) */
  height?: number;
  /** Légende interactive (défaut true) ; à désactiver si une liste équivalente est affichée */
  showLegend?: boolean;
  /** Libellé du centre (défaut « Total ») */
  centerLabel?: string;
  /** Nombre de tranches avant regroupement dans « Autres » (défaut 7) */
  maxSlices?: number;
  className?: string;
}

export function CategoryDonut({
  slices,
  total,
  onSelect,
  height = 220,
  showLegend = true,
  centerLabel = 'Total',
  maxSlices = 7,
  className,
}: CategoryDonutProps) {
  const { text } = useChartMoney();
  const data = useMemo(() => prepareDonutData(slices, maxSlices), [slices, maxSlices]);
  const sum = total ?? slicesTotal(slices);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active = data.find((d) => d.key === activeKey) ?? null;

  const select = (d: DonutDatum | undefined) => {
    if (d?.slice && onSelect) onSelect(d.slice);
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        showLegend && 'sm:flex-row sm:items-center sm:gap-6',
        className,
      )}
    >
      <div
        role="img"
        aria-label={describeBreakdown(data, text)}
        className="relative mx-auto w-full max-w-60 shrink-0 sm:mx-0 sm:w-56"
        style={{ height }}
      >
        <DonutPlot
          data={data}
          activeKey={activeKey}
          onActiveChange={setActiveKey}
          onSelectDatum={select}
          clickable={onSelect !== undefined}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-10 text-center"
        >
          <span className="text-muted-foreground line-clamp-1 text-xs">
            {active ? active.name : centerLabel}
          </span>
          <Money
            value={active ? active.amount : sum}
            decimals={0}
            className="text-lg font-semibold sm:text-xl"
          />
          {active ? (
            <span className="text-muted-foreground text-xs font-medium tabular-nums">
              {formatPercent(active.share)}
            </span>
          ) : null}
        </div>
      </div>

      {showLegend ? (
        <ul className="grid min-w-0 flex-1 gap-0.5" aria-label="Légende des catégories">
          {data.map((d) => {
            const clickable = d.slice !== null && onSelect !== undefined;
            const content = (
              <>
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full"
                  style={{ background: d.color }}
                />
                <span className="min-w-0 flex-1 truncate text-left">{d.name}</span>
                <span className="text-muted-foreground w-12 text-right tabular-nums">
                  {formatPercent(d.share)}
                </span>
                <Money value={d.amount} decimals={0} className="w-24 text-right font-medium" />
              </>
            );
            const rowClass = cn(
              'flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-sm transition-colors',
              activeKey === d.key && 'bg-accent',
            );
            return (
              <li key={d.key}>
                {clickable ? (
                  <button
                    type="button"
                    className={cn(
                      rowClass,
                      'hover:bg-accent focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
                    )}
                    onMouseEnter={() => setActiveKey(d.key)}
                    onMouseLeave={() => setActiveKey(null)}
                    onFocus={() => setActiveKey(d.key)}
                    onBlur={() => setActiveKey(null)}
                    onClick={() => select(d)}
                  >
                    {content}
                    <span className="sr-only"> : voir les transactions</span>
                  </button>
                ) : (
                  <div
                    className={rowClass}
                    onMouseEnter={() => setActiveKey(d.key)}
                    onMouseLeave={() => setActiveKey(null)}
                  >
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
