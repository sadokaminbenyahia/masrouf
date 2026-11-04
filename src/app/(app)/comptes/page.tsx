import type { Metadata } from 'next';
import { AccountsView } from '@/components/accounts/accounts-view';
import { PageHeader } from '@/components/shared/page-header';
import { LoadError } from '@/components/transactions/error-panel';
import { requireUserId } from '@/server/auth/session';
import { listAccounts } from '@/server/services/accounts.service';

export const metadata: Metadata = { title: 'Comptes · Masrouf' };

export default async function AccountsPage() {
  const userId = await requireUserId();
  const accounts = await listAccounts(userId, { includeArchived: true });
  if (!accounts.ok) {
    return (
      <>
        <PageHeader title="Comptes" />
        <LoadError title="Impossible de charger vos comptes" message={accounts.error.message} />
      </>
    );
  }
  return <AccountsView initialAccounts={accounts.value} />;
}
