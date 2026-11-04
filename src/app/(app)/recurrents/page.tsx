import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RecurringView } from '@/components/recurring/recurring-view';
import { requireUserId } from '@/server/auth/session';
import { today } from '@/server/clock';
import { listAccounts } from '@/server/services/accounts.service';
import { listCategories } from '@/server/services/categories.service';
import { listRecurring, materializeDueRecurring } from '@/server/services/recurring.service';

export const metadata: Metadata = { title: 'Dépenses récurrentes' };

export default async function RecurrentsPage() {
  const userId = await requireUserId();
  const day = today();
  // Les échéances passées (création automatique) sont enregistrées avant l'affichage.
  const materialized = await materializeDueRecurring(userId, day);
  if (!materialized.ok) {
    console.error('[recurrents] matérialisation des échéances impossible', materialized.error);
  }
  const [rules, accounts, categories] = await Promise.all([
    listRecurring(userId),
    listAccounts(userId),
    listCategories(userId),
  ]);

  if (!rules.ok) {
    return (
      <>
        <PageHeader title="Dépenses récurrentes" />
        <Alert variant="destructive" role="alert">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Impossible de charger vos récurrences</AlertTitle>
          <AlertDescription>
            <p>{rules.error.message}</p>
            <Link href="/recurrents" className="font-medium underline underline-offset-4">
              Réessayer
            </Link>
          </AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <RecurringView
      today={day}
      initialRules={rules.value}
      initialAccounts={accounts.ok ? accounts.value : undefined}
      initialCategories={categories.ok ? categories.value : undefined}
    />
  );
}
