'use client';
import { useQuery } from '@tanstack/react-query';
import { AlertCircleIcon, ArrowRightIcon, LightbulbIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { getMonthlySummaryAction } from '@/app/actions/ai';
import { formatPercent } from '@/domain/ai/assistant/normalize';
import type { AssistantHighlight, MonthlySummary } from '@/domain/ai/types';
import type { YearMonth } from '@/domain/dates';
import { AiBadge } from '@/components/shared/ai-badge';
import { Money } from '@/components/shared/money';
import { MonthSwitcher } from '@/components/shared/month-switcher';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage, queryKeys, unwrap } from '@/lib/query';
import { cn } from '@/lib/utils';

export interface MonthlySummaryCardProps {
  summary: MonthlySummary;
  /** Dernier mois sélectionnable (défaut : le mois du résumé fourni) */
  maxMonth?: YearMonth;
  /** Affiche le sélecteur de mois (défaut true) */
  switchable?: boolean;
  className?: string;
}

export function HighlightValue({ h, className }: { h: AssistantHighlight; className?: string }) {
  if (h.format === 'money') return <Money value={h.value} decimals={0} className={className} />;
  const text =
    h.format === 'percent'
      ? formatPercent(h.value, h.label.startsWith('Évolution'))
      : new Intl.NumberFormat('fr-FR').format(h.value);
  return <span className={cn('tabular-nums', className)}>{text}</span>;
}

export function MonthlySummaryCard({
  summary,
  maxMonth,
  switchable = true,
  className,
}: MonthlySummaryCardProps) {
  const [month, setMonth] = useState<YearMonth>(summary.month);
  const query = useQuery({
    queryKey: queryKeys.ai.summary(month),
    queryFn: async () => unwrap(await getMonthlySummaryAction(month)),
    initialData: month === summary.month ? summary : undefined,
    staleTime: 5 * 60_000,
  });
  const data = query.data;

  return (
    <Card data-testid="monthly-summary" className={className} aria-busy={query.isFetching}>
      <CardHeader className="gap-3 sm:grid-cols-[1fr_auto]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <AiBadge label="Résumé automatique" />
          <CardTitle className="text-lg">
            <h2>{data?.title ?? 'Résumé du mois'}</h2>
          </CardTitle>
        </div>
        {switchable ? (
          <MonthSwitcher
            value={month}
            onChange={setMonth}
            max={maxMonth ?? summary.month}
            className="sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:self-start"
          />
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {query.isError && !data ? (
          <p role="alert" className="text-destructive flex items-start gap-2 text-sm">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {errorMessage(query.error)}
          </p>
        ) : !data ? (
          <div className="flex flex-col gap-2" aria-label="Chargement du résumé">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="mt-3 h-16 w-full" />
          </div>
        ) : (
          <>
            {data.highlights.length > 0 ? (
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {data.highlights.map((h) => (
                  <div key={h.label} className="bg-muted/40 rounded-lg border px-3 py-2">
                    <dt className="text-muted-foreground text-xs">{h.label}</dt>
                    <dd className="text-lg font-semibold">
                      <HighlightValue h={h} />
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <div className="flex max-w-prose flex-col gap-3 text-sm leading-relaxed">
              {data.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            {data.recommendations.length > 0 ? (
              <section aria-labelledby="summary-reco-title" className="flex flex-col gap-2">
                <h3
                  id="summary-reco-title"
                  className="flex items-center gap-2 text-sm font-semibold"
                >
                  <LightbulbIcon className="text-warning size-4" aria-hidden="true" />
                  Recommandations
                </h3>
                <ul className="grid gap-2 md:grid-cols-3">
                  {data.recommendations.map((r) => (
                    <li key={r.title} className="flex flex-col gap-1.5 rounded-lg border p-3">
                      <p className="text-sm font-medium">{r.title}</p>
                      <p className="text-muted-foreground text-xs leading-relaxed">{r.detail}</p>
                      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                        {r.impact !== null ? (
                          <span className="text-income text-xs font-medium">
                            Gain estimé : <Money value={r.impact} decimals={0} /> / mois
                          </span>
                        ) : (
                          <span />
                        )}
                        {r.href ? (
                          <Link
                            href={r.href}
                            className="text-primary focus-visible:ring-ring/50 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-medium hover:underline focus-visible:ring-[3px] focus-visible:outline-none"
                          >
                            Voir le détail
                            <span className="sr-only"> : {r.title}</span>
                            <ArrowRightIcon className="size-3.5" aria-hidden="true" />
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
