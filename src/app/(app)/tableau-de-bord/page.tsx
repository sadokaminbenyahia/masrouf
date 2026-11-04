import {
  CalendarClock,
  ChartColumn,
  ChartPie,
  Lightbulb,
  ReceiptText,
  ScanSearch,
  Target,
  TrendingUp,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { formatMonthFR, monthRange } from '@/domain/dates';
import type { Anomaly, BalanceForecast, HealthScore } from '@/domain/ai/types';
import type { Result } from '@/domain/result';
import type { DashboardData } from '@/domain/types';
import { requireUserId } from '@/server/auth/session';
import { getDashboard } from '@/server/services/dashboard.service';
import { getAnomalies, getForecast, getHealthScore } from '@/server/services/ai.service';
import { AiBadge } from '@/components/shared/ai-badge';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { CategoryBreakdown } from '@/components/dashboard/category-breakdown';
import { DashboardEmpty } from '@/components/dashboard/dashboard-empty';
import { ForecastSummary } from '@/components/dashboard/forecast-summary';
import { KpiCards } from '@/components/dashboard/kpi-cards';
import { transactionsHref } from '@/components/dashboard/links';
import { isDashboardEmpty } from '@/components/dashboard/metrics';
import { MonthlyOverview } from '@/components/dashboard/monthly-overview';
import { SectionCard } from '@/components/dashboard/section-card';
import { SectionError } from '@/components/dashboard/section-error';
import { settle } from '@/components/dashboard/settle';
import { Stagger, StaggerItem } from '@/components/dashboard/stagger';
import { TopExpenses } from '@/components/dashboard/top-expenses';
import { UpcomingRecurring } from '@/components/dashboard/upcoming-recurring';
import { AnomalyList } from '@/components/insights/anomaly-list';
import { BudgetAlertList } from '@/components/insights/budget-alert-list';
import { HealthScoreCard } from '@/components/insights/health-score-card';
import { InsightList } from '@/components/insights/insight-list';

export const metadata: Metadata = { title: 'Tableau de bord' };

function SeeAll({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="h-11">
      <Link href={href}>{label}</Link>
    </Button>
  );
}

function ForecastBlock({ forecast }: { forecast: Result<BalanceForecast> }) {
  if (!forecast.ok) {
    return (
      <SectionError
        testId="forecast"
        title="Prévision indisponible"
        message={forecast.error.message}
      />
    );
  }
  return (
    <SectionCard
      testId="forecast"
      title="Prévision du solde"
      icon={TrendingUp}
      action={<AiBadge label="IA locale" />}
    >
      <ForecastSummary forecast={forecast.value} />
    </SectionCard>
  );
}

function HealthBlock({ health }: { health: Result<HealthScore> }) {
  if (!health.ok) {
    return (
      <SectionError
        testId="health-score"
        title="Score de santé indisponible"
        message={health.error.message}
      />
    );
  }
  return <HealthScoreCard score={health.value} compact />;
}

function AnomaliesBlock({ anomalies }: { anomalies: Result<Anomaly[]> }) {
  if (!anomalies.ok) {
    return <SectionError title="Anomalies indisponibles" message={anomalies.error.message} />;
  }
  return (
    <SectionCard
      title="Anomalies"
      description="Dépenses inhabituelles, doublons suspects, hausses de prix"
      icon={ScanSearch}
      action={<AiBadge label="IA locale" />}
    >
      <AnomalyList anomalies={anomalies.value} limit={3} />
    </SectionCard>
  );
}

function DashboardContent({
  d,
  forecast,
  health,
  anomalies,
}: {
  d: DashboardData;
  forecast: Result<BalanceForecast>;
  health: Result<HealthScore>;
  anomalies: Result<Anomaly[]>;
}) {
  const range = monthRange(d.month);
  const hasBudgets = d.remainingToSpend !== null || d.budgetAlerts.length > 0;
  return (
    <Stagger className="space-y-4">
      <StaggerItem>
        <KpiCards
          data={{
            today: d.today,
            month: d.month,
            totalBalance: d.totalBalance,
            accounts: d.accounts,
            current: d.current,
            previous: d.previous,
            expenseChange: d.expenseChange,
            comparisonLabel: d.comparisonLabel,
            remainingToSpend: d.remainingToSpend,
            dailyAllowance: d.dailyAllowance,
            monthly: d.monthly,
          }}
        />
      </StaggerItem>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <StaggerItem index={1}>
            <SectionCard
              testId="chart-categories"
              title="Répartition des dépenses"
              description="Sélectionnez une catégorie pour voir ses transactions."
              icon={ChartPie}
            >
              <CategoryBreakdown today={d.today} initialSlices={d.byCategory} />
            </SectionCard>
          </StaggerItem>
          <StaggerItem index={2}>
            <SectionCard
              testId="chart-12-months"
              title="12 derniers mois"
              description="Revenus, dépenses et solde net. Sélectionnez un mois pour voir ses transactions."
              icon={ChartColumn}
            >
              <MonthlyOverview months={d.monthly} />
            </SectionCard>
          </StaggerItem>
          <StaggerItem index={3}>
            <SectionCard
              testId="top-expenses"
              title="Plus grosses dépenses du mois"
              icon={ReceiptText}
              action={
                <SeeAll
                  href={transactionsHref({ from: range.from, to: range.to, type: 'EXPENSE' })}
                  label="Tout voir"
                />
              }
            >
              <TopExpenses expenses={d.topExpenses} categories={d.byCategory} today={d.today} />
            </SectionCard>
          </StaggerItem>
        </div>

        <div className="min-w-0 space-y-4">
          {hasBudgets ? (
            <StaggerItem index={4}>
              <SectionCard
                title="Alertes budgets"
                icon={Target}
                action={<SeeAll href="/budgets" label="Budgets" />}
              >
                <BudgetAlertList alerts={d.budgetAlerts} />
              </SectionCard>
            </StaggerItem>
          ) : null}
          <StaggerItem index={5}>
            <ForecastBlock forecast={forecast} />
          </StaggerItem>
          <StaggerItem index={6}>
            <HealthBlock health={health} />
          </StaggerItem>
          {d.upcomingRecurring.length > 0 ? (
            <StaggerItem index={7}>
              <SectionCard
                title="Échéances à venir"
                icon={CalendarClock}
                action={<SeeAll href="/recurrents" label="Récurrents" />}
              >
                <UpcomingRecurring rules={d.upcomingRecurring} today={d.today} />
              </SectionCard>
            </StaggerItem>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <StaggerItem className="min-w-0" index={8}>
          <SectionCard title="Conseils" icon={Lightbulb}>
            <InsightList insights={d.insights} limit={3} />
          </SectionCard>
        </StaggerItem>
        <StaggerItem className="min-w-0" index={9}>
          <AnomaliesBlock anomalies={anomalies} />
        </StaggerItem>
      </div>
    </Stagger>
  );
}

export default async function DashboardPage() {
  const userId = await requireUserId();
  const [dashboard, health, forecast, anomalies] = await Promise.all([
    settle('tableau-de-bord:getDashboard', () => getDashboard(userId)),
    settle('tableau-de-bord:getHealthScore', () => getHealthScore(userId)),
    settle('tableau-de-bord:getForecast', () => getForecast(userId)),
    settle('tableau-de-bord:getAnomalies', () => getAnomalies(userId)),
  ]);

  if (dashboard.ok && isDashboardEmpty(dashboard.value)) {
    return (
      <>
        <PageHeader title="Tableau de bord" />
        <DashboardEmpty />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description={
          dashboard.ok ? `Votre situation en ${formatMonthFR(dashboard.value.month)}` : undefined
        }
      />
      {dashboard.ok ? (
        <DashboardContent
          d={dashboard.value}
          forecast={forecast}
          health={health}
          anomalies={anomalies}
        />
      ) : (
        <div className="space-y-4">
          <SectionError
            title="Les chiffres du mois sont indisponibles"
            message={dashboard.error.message}
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <ForecastBlock forecast={forecast} />
            <HealthBlock health={health} />
            <AnomaliesBlock anomalies={anomalies} />
          </div>
        </div>
      )}
    </>
  );
}
