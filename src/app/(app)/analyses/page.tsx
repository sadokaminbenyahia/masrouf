import { ChartColumn, ChartPie, Lightbulb, ScanSearch, TrendingUp } from 'lucide-react';
import type { Metadata } from 'next';
import { formatDateFR, formatMonthFR, monthOf } from '@/domain/dates';
import type { BalanceForecast, ForecastPoint } from '@/domain/ai/types';
import { requireUserId } from '@/server/auth/session';
import { today } from '@/server/clock';
import { getDashboard } from '@/server/services/dashboard.service';
import { getAnomalies, getForecast, getHealthScore } from '@/server/services/ai.service';
import { AiBadge } from '@/components/shared/ai-badge';
import { Money } from '@/components/shared/money';
import { PageHeader } from '@/components/shared/page-header';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { averageSavingsRate } from '@/components/charts/chart-data';
import { ForecastChart } from '@/components/charts/forecast-chart';
import { formatPercent } from '@/components/charts/format';
import { SavingsRateChart } from '@/components/charts/savings-rate-chart';
import { CategoryBreakdown } from '@/components/dashboard/category-breakdown';
import { MonthlyOverview } from '@/components/dashboard/monthly-overview';
import { SectionCard } from '@/components/dashboard/section-card';
import { SectionError } from '@/components/dashboard/section-error';
import { settle } from '@/components/dashboard/settle';
import { Stagger, StaggerItem } from '@/components/dashboard/stagger';
import { AnomalyList } from '@/components/insights/anomaly-list';
import { HealthScoreCard } from '@/components/insights/health-score-card';
import { InsightList } from '@/components/insights/insight-list';

export const metadata: Metadata = { title: 'Analyses · Masrouf' };

const SECTIONS = [
  { id: 'previsions', label: 'Prévisions' },
  { id: 'sante', label: 'Santé financière' },
  { id: 'anomalies', label: 'Anomalies' },
  { id: 'conseils', label: 'Conseils' },
  { id: 'repartition', label: 'Répartition' },
  { id: 'evolution', label: 'Évolution' },
] as const;

function forecastRows(forecast: BalanceForecast): { label: string; point: ForecastPoint }[] {
  const rows = [
    {
      label: `Fin ${formatMonthFR(monthOf(forecast.endOfMonth.date), 'monthOnly')} (ce mois)`,
      point: forecast.endOfMonth,
    },
  ];
  for (const p of forecast.months) {
    if (p.date === forecast.endOfMonth.date) continue;
    rows.push({ label: `Fin ${formatMonthFR(monthOf(p.date))}`, point: p });
  }
  return rows;
}

function ForecastSection({ forecast }: { forecast: BalanceForecast }) {
  return (
    <SectionCard
      id="previsions"
      testId="forecast"
      title="Prévisions"
      description="Solde total prévu pour la fin du mois et les trois mois suivants."
      icon={TrendingUp}
      action={<AiBadge label="IA locale" />}
    >
      <div className="space-y-5">
        <ForecastChart forecast={forecast} height={320} />
        <div className="text-muted-foreground space-y-2 text-sm leading-relaxed">
          <p>{forecast.explanation}</p>
          <p>
            Flux mensuel estimé hors récurrences :{' '}
            <Money
              value={forecast.monthlyNetEstimate}
              sign="always"
              decimals={0}
              className="text-foreground font-medium"
            />
            . La zone ombrée contient le solde réel avec une probabilité de 80 % : elle
            s&apos;élargit avec l&apos;horizon, car l&apos;incertitude augmente.
          </p>
        </div>
        <Table>
          <TableCaption className="sr-only">Prévision du solde par échéance</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Échéance</TableHead>
              <TableHead scope="col" className="text-right">
                Solde attendu
              </TableHead>
              <TableHead scope="col" className="text-right">
                Fourchette à 80 %
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {forecastRows(forecast).map(({ label, point }) => (
              <TableRow key={point.date}>
                <TableCell>
                  <span className="font-medium">{label}</span>
                  <span className="text-muted-foreground block text-xs">
                    {formatDateFR(point.date)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Money
                    value={point.expected}
                    decimals={0}
                    className={point.expected < 0 ? 'text-expense font-semibold' : 'font-semibold'}
                  />
                </TableCell>
                <TableCell className="text-muted-foreground text-right">
                  <Money value={point.low} decimals={0} /> –{' '}
                  <Money value={point.high} decimals={0} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}

export default async function AnalysesPage() {
  const userId = await requireUserId();
  const [dashboard, health, forecast, anomalies] = await Promise.all([
    settle('analyses:getDashboard', () => getDashboard(userId)),
    settle('analyses:getHealthScore', () => getHealthScore(userId)),
    settle('analyses:getForecast', () => getForecast(userId)),
    settle('analyses:getAnomalies', () => getAnomalies(userId)),
  ]);
  const todayIso = dashboard.ok ? dashboard.value.today : today();
  const savings = dashboard.ok ? averageSavingsRate(dashboard.value.monthly) : null;

  return (
    <>
      <PageHeader
        title="Analyses"
        description="Prévisions, santé financière et tendances, calculées localement sur vos données."
      />
      <nav aria-label="Sections de la page" className="-mt-2 mb-6">
        <ul className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="bg-card text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium focus-visible:ring-[3px] focus-visible:outline-none sm:h-9"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Stagger className="space-y-6">
        <StaggerItem>
          {forecast.ok ? (
            <ForecastSection forecast={forecast.value} />
          ) : (
            <div id="previsions" className="scroll-mt-24">
              <SectionError
                testId="forecast"
                title="Prévisions indisponibles"
                message={forecast.error.message}
              />
            </div>
          )}
        </StaggerItem>

        <StaggerItem>
          <div id="sante" className="scroll-mt-24">
            {health.ok ? (
              <HealthScoreCard score={health.value} />
            ) : (
              <SectionError
                testId="health-score"
                title="Score de santé indisponible"
                message={health.error.message}
              />
            )}
          </div>
        </StaggerItem>

        <div className="grid gap-6 lg:grid-cols-2">
          <StaggerItem className="min-w-0">
            {anomalies.ok ? (
              <SectionCard
                id="anomalies"
                title="Anomalies"
                description="Dépenses inhabituelles, doublons suspects et hausses de prix des 45 derniers jours."
                icon={ScanSearch}
                action={<AiBadge label="IA locale" />}
              >
                <AnomalyList anomalies={anomalies.value} />
              </SectionCard>
            ) : (
              <div id="anomalies" className="scroll-mt-24">
                <SectionError title="Anomalies indisponibles" message={anomalies.error.message} />
              </div>
            )}
          </StaggerItem>
          <StaggerItem className="min-w-0">
            {dashboard.ok ? (
              <SectionCard
                id="conseils"
                title="Conseils"
                description="Règle 50/30/20, catégories en hausse, abonnements oubliés."
                icon={Lightbulb}
              >
                <InsightList insights={dashboard.value.insights} />
              </SectionCard>
            ) : (
              <div id="conseils" className="scroll-mt-24">
                <SectionError title="Conseils indisponibles" message={dashboard.error.message} />
              </div>
            )}
          </StaggerItem>
        </div>

        <StaggerItem>
          <SectionCard
            id="repartition"
            title="Répartition"
            description="Dépenses par catégorie. Sélectionnez une catégorie pour voir ses transactions."
            icon={ChartPie}
          >
            <CategoryBreakdown
              today={todayIso}
              initialSlices={dashboard.ok ? dashboard.value.byCategory : []}
              variant="full"
            />
          </SectionCard>
        </StaggerItem>

        <StaggerItem>
          {dashboard.ok ? (
            <SectionCard
              id="evolution"
              title="Évolution"
              description="Revenus, dépenses et taux d'épargne sur 12 mois."
              icon={ChartColumn}
            >
              <div className="space-y-8">
                <MonthlyOverview months={dashboard.value.monthly} />
                <div className="space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold">Taux d&apos;épargne mensuel</h3>
                    <p className="text-muted-foreground text-sm">
                      {savings === null
                        ? 'Aucun revenu sur la période'
                        : `Sur 12 mois : ${formatPercent(savings)} de vos revenus épargnés`}
                    </p>
                  </div>
                  <SavingsRateChart months={dashboard.value.monthly} />
                </div>
              </div>
            </SectionCard>
          ) : (
            <div id="evolution" className="scroll-mt-24">
              <SectionError title="Évolution indisponible" message={dashboard.error.message} />
            </div>
          )}
        </StaggerItem>
      </Stagger>
    </>
  );
}
