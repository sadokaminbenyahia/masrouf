'use client';
/**
 * Répartition des dépenses par catégorie, avec sélecteur de période (TanStack Query sur
 * getCategoryBreakdownAction). Clic sur une part ou une ligne → transactions filtrées.
 *  - variant « dashboard » : 4 presets, donut + légende ;
 *  - variant « full » (analyses) : tous les presets + période personnalisée, donut + liste
 *    triée avec barres.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { RotateCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { ISODate } from '@/domain/dates';
import { resolvePeriod, type Period, type PeriodPreset } from '@/domain/periods';
import type { CategorySlice } from '@/domain/types';
import { getCategoryBreakdownAction } from '@/app/actions/dashboard';
import { CategoryIcon } from '@/components/shared/category-icon';
import { Money } from '@/components/shared/money';
import { PeriodPicker } from '@/components/shared/period-picker';
import { Button } from '@/components/ui/button';
import { CategoryDonut } from '@/components/charts/category-donut';
import { prepareDonutData, slicesTotal } from '@/components/charts/chart-data';
import { formatPercent } from '@/components/charts/format';
import { errorMessage, queryKeys, unwrap } from '@/lib/query';
import { cn } from '@/lib/utils';
import { categoryTransactionsHref } from './links';

const DASHBOARD_PRESETS: PeriodPreset[] = [
  'THIS_MONTH',
  'LAST_MONTH',
  'LAST_3_MONTHS',
  'THIS_YEAR',
];
const FULL_PRESETS: PeriodPreset[] = [
  'THIS_MONTH',
  'LAST_MONTH',
  'LAST_3_MONTHS',
  'LAST_6_MONTHS',
  'THIS_QUARTER',
  'THIS_YEAR',
  'LAST_12_MONTHS',
];

export interface CategoryBreakdownProps {
  today: ISODate;
  /** Répartition du mois courant (byCategory du tableau de bord) */
  initialSlices: CategorySlice[];
  variant?: 'dashboard' | 'full';
}

function CategoryRows({
  slices,
  hrefFor,
}: {
  slices: CategorySlice[];
  hrefFor: (s: CategorySlice) => string;
}) {
  const data = prepareDonutData(slices, Number.POSITIVE_INFINITY);
  const max = data[0]?.amount ?? 0;
  return (
    <ol className="space-y-1" aria-label="Catégories triées par montant">
      {data.map((d) => {
        const s = d.slice;
        if (!s) return null;
        return (
          <li key={d.key}>
            <Link
              href={hrefFor(s)}
              className="group hover:bg-accent focus-visible:ring-ring/50 flex min-h-11 items-center gap-3 rounded-md px-2 py-1.5 focus-visible:ring-[3px] focus-visible:outline-none"
            >
              <CategoryIcon icon={s.icon} color={s.color} size="sm" />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{s.name}</span>
                  <Money value={s.amount} decimals={0} className="shrink-0 font-medium" />
                </span>
                <span className="flex items-center gap-3">
                  <span aria-hidden className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${max > 0 ? Math.max(2, (d.amount / max) * 100) : 0}%`,
                        background: d.color,
                      }}
                    />
                  </span>
                  <span className="text-muted-foreground w-28 shrink-0 text-right text-xs tabular-nums">
                    {formatPercent(d.share)} · {s.count} op.
                  </span>
                </span>
              </span>
              <span className="sr-only">: voir les transactions</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

export function CategoryBreakdown({
  today,
  initialSlices,
  variant = 'dashboard',
}: CategoryBreakdownProps) {
  const router = useRouter();
  const initialPeriod = useMemo<Period>(
    () => ({ preset: 'THIS_MONTH', range: resolvePeriod('THIS_MONTH', today) }),
    [today],
  );
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const isInitial =
    period.range.from === initialPeriod.range.from && period.range.to === initialPeriod.range.to;
  const params = { from: period.range.from, to: period.range.to, type: 'EXPENSE' as const };

  const query = useQuery({
    queryKey: queryKeys.breakdown(params),
    queryFn: async () => unwrap(await getCategoryBreakdownAction(params)),
    initialData: isInitial ? initialSlices : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const slices = query.data ?? [];
  const total = slicesTotal(slices);
  const hrefFor = (s: CategorySlice) => categoryTransactionsHref(s.categoryId, period.range);
  const loading = query.isFetching && query.isPlaceholderData;

  return (
    <div className="space-y-4">
      <PeriodPicker
        today={today}
        value={period}
        onChange={setPeriod}
        presets={variant === 'full' ? FULL_PRESETS : DASHBOARD_PRESETS}
      />
      <p className="sr-only" aria-live="polite">
        {loading ? 'Chargement de la répartition…' : ''}
      </p>
      <div aria-busy={loading} className={cn('transition-opacity', loading && 'opacity-60')}>
        {query.isError && !query.data ? (
          <div role="alert" className="flex flex-col items-start gap-2 text-sm">
            <p className="text-muted-foreground">{errorMessage(query.error)}</p>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => void query.refetch()}
            >
              <RotateCw aria-hidden />
              Réessayer
            </Button>
          </div>
        ) : total === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            {query.isPending ? 'Chargement…' : 'Aucune dépense sur cette période.'}
          </p>
        ) : variant === 'full' ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,240px)_1fr] lg:items-start">
            <CategoryDonut
              slices={slices}
              total={total}
              showLegend={false}
              onSelect={(s) => router.push(hrefFor(s))}
              height={240}
            />
            <CategoryRows slices={slices} hrefFor={hrefFor} />
          </div>
        ) : (
          <CategoryDonut slices={slices} total={total} onSelect={(s) => router.push(hrefFor(s))} />
        )}
      </div>
    </div>
  );
}
