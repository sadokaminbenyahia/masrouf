'use client';
/**
 * Graphique 12 mois : clic sur un mois → transactions de ce mois.
 */
import { useRouter } from 'next/navigation';
import type { MonthTotals } from '@/domain/types';
import { MonthlyBarsChart } from '@/components/charts/monthly-bars-chart';
import { monthTransactionsHref } from './links';

export function MonthlyOverview({ months, height }: { months: MonthTotals[]; height?: number }) {
  const router = useRouter();
  if (months.every((m) => m.income === 0 && m.expense === 0)) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        Aucun mouvement sur les 12 derniers mois.
      </p>
    );
  }
  return (
    <MonthlyBarsChart
      months={months}
      height={height}
      onSelectMonth={(ym) => router.push(monthTransactionsHref(ym))}
    />
  );
}
