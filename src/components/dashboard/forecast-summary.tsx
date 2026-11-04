/**
 * Aperçu de la prévision : solde attendu en fin de mois, fourchette à 80 % et mini-graphique.
 */
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { BalanceForecast } from '@/domain/ai/types';
import { formatDateFR } from '@/domain/dates';
import { Money } from '@/components/shared/money';
import { Button } from '@/components/ui/button';
import { ForecastChart, ForecastReliabilityBadge } from '@/components/charts/forecast-chart';
import { cn } from '@/lib/utils';

export function ForecastSummary({ forecast }: { forecast: BalanceForecast }) {
  const eom = forecast.endOfMonth;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-muted-foreground text-sm">
            Solde prévu au {formatDateFR(eom.date, 'dayMonth')}
          </p>
          <Money
            value={eom.expected}
            decimals={0}
            className={cn('text-2xl font-semibold', eom.expected < 0 && 'text-expense')}
          />
          <p className="text-muted-foreground text-xs">
            entre <Money value={eom.low} decimals={0} /> et <Money value={eom.high} decimals={0} />{' '}
            (80 %)
          </p>
        </div>
        <ForecastReliabilityBadge reliability={forecast.reliability} />
      </div>
      <ForecastChart forecast={forecast} height={140} showLegend={false} />
      <Button asChild variant="link" className="h-11 px-0">
        <Link href="/analyses#previsions">
          Voir les prévisions détaillées
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    </div>
  );
}
