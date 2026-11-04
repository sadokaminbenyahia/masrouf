import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { AppearanceSettings } from '@/components/settings/appearance-settings';
import { CategoriesManager } from '@/components/settings/categories-manager';
import { ExportCard } from '@/components/settings/export-card';
import { OnboardingReset } from '@/components/settings/onboarding-reset';
import { ProfileForm } from '@/components/settings/profile-form';
import { requireUserId } from '@/server/auth/session';
import { today } from '@/server/clock';
import { listCategories } from '@/server/services/categories.service';
import { getProfile } from '@/server/services/user.service';

export const metadata: Metadata = { title: 'Paramètres' };

export default async function ParametresPage() {
  const userId = await requireUserId();
  const [profile, categories] = await Promise.all([getProfile(userId), listCategories(userId)]);
  if (!profile.ok) throw new Error(profile.error.message);

  return (
    <>
      <PageHeader title="Paramètres" description="Profil, apparence, catégories et export." />
      <div className="grid gap-5 lg:grid-cols-2">
        <ProfileForm name={profile.value.name} email={profile.value.email} />
        <AppearanceSettings />
        <CategoriesManager
          initialCategories={categories.ok ? categories.value : []}
        />
        <div className="grid content-start gap-5">
          <ExportCard today={today()} />
          <OnboardingReset />
        </div>
      </div>
    </>
  );
}
