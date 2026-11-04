import type { Metadata } from 'next';
import { GoalsView } from '@/components/goals/goals-view';
import { requireUserId } from '@/server/auth/session';
import { today as getToday } from '@/server/clock';
import { listCategories } from '@/server/services/categories.service';
import { listGoals } from '@/server/services/goals.service';

export const metadata: Metadata = { title: "Objectifs d'épargne · Masrouf" };

export default async function GoalsPage() {
  const userId = await requireUserId();
  const today = getToday();
  const [goals, categories] = await Promise.all([listGoals(userId), listCategories(userId)]);

  return (
    <GoalsView
      today={today}
      initialGoals={goals.ok ? goals.value : null}
      initialError={goals.ok ? null : goals.error.message}
      categories={categories.ok ? categories.value : []}
    />
  );
}
