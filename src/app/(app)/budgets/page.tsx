import type { Metadata } from 'next';
import { BudgetsView } from '@/components/budgets/budgets-view';
import { parseMonthParam } from '@/components/budgets/budget-utils';
import { requireUserId } from '@/server/auth/session';
import { today as getToday } from '@/server/clock';
import { listBudgetProgress } from '@/server/services/budgets.service';
import { listCategories } from '@/server/services/categories.service';

export const metadata: Metadata = { title: 'Budgets' };

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await requireUserId();
  const today = getToday();
  const params = await searchParams;
  const month = parseMonthParam(typeof params.mois === 'string' ? params.mois : undefined, today);

  const [progress, categories] = await Promise.all([
    listBudgetProgress(userId, month),
    listCategories(userId),
  ]);

  return (
    <BudgetsView
      today={today}
      initialMonth={month}
      initialProgress={progress.ok ? progress.value : null}
      initialError={progress.ok ? null : progress.error.message}
      categories={categories.ok ? categories.value : []}
    />
  );
}
