import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell, SIDEBAR_COOKIE } from '@/components/layout/app-shell';
import { OnboardingDialog } from '@/components/onboarding/onboarding-dialog';
import { requireUserId } from '@/server/auth/session';
import { today } from '@/server/clock';
import { listAccounts } from '@/server/services/accounts.service';
import { listCategories } from '@/server/services/categories.service';
import { getProfile } from '@/server/services/user.service';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const userId = await requireUserId();
  const profile = await getProfile(userId);
  if (!profile.ok) {
    if (profile.error.code === 'NOT_FOUND' || profile.error.code === 'UNAUTHORIZED') {
      redirect('/connexion');
    }
    throw new Error(profile.error.message);
  }
  const user = profile.value;
  const cookieStore = await cookies();
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === 'collapsed';

  let onboarding: ReactNode = null;
  if (!user.onboarded) {
    const [accounts, categories] = await Promise.all([
      listAccounts(userId, { includeArchived: false }),
      listCategories(userId),
    ]);
    onboarding = (
      <OnboardingDialog
        userName={user.name}
        accounts={accounts.ok ? accounts.value : []}
        categories={categories.ok ? categories.value : []}
      />
    );
  }

  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      defaultCollapsed={collapsed}
      today={today()}
    >
      {children}
      {onboarding}
    </AppShell>
  );
}
