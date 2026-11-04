import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ImportWizard } from '@/components/import/import-wizard';
import { requireUserId } from '@/server/auth/session';
import { today } from '@/server/clock';
import { listAccounts } from '@/server/services/accounts.service';
import { listCategories } from '@/server/services/categories.service';

export const metadata: Metadata = { title: 'Importer un relevé' };

export default async function ImportPage() {
  const userId = await requireUserId();
  const [accounts, categories] = await Promise.all([listAccounts(userId), listCategories(userId)]);
  // En cas d'échec, l'assistant recharge ces données côté client et affiche l'erreur.
  return (
    <>
      <PageHeader
        title="Importer un relevé"
        description="Ajoutez en une fois les opérations de votre banque à partir d’un fichier CSV."
      />
      <ImportWizard
        today={today()}
        initialAccounts={accounts.ok ? accounts.value : undefined}
        initialCategories={categories.ok ? categories.value : undefined}
      />
    </>
  );
}
