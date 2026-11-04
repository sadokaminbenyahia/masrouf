import { Download, Upload } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { LoadError } from '@/components/transactions/error-panel';
import { exportHref, parseTransactionSearchParams } from '@/components/transactions/query-params';
import { TransactionsView } from '@/components/transactions/transactions-view';
import { Button } from '@/components/ui/button';
import { requireUserId } from '@/server/auth/session';
import { today } from '@/server/clock';
import { listAccounts } from '@/server/services/accounts.service';
import { listCategories, listTags } from '@/server/services/categories.service';
import { listTransactions } from '@/server/services/transactions.service';

export const metadata: Metadata = { title: 'Transactions' };

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await requireUserId();
  const query = parseTransactionSearchParams(await searchParams);
  const [page, accounts, categories, tags] = await Promise.all([
    listTransactions(userId, query),
    listAccounts(userId, { includeArchived: true }),
    listCategories(userId),
    listTags(userId),
  ]);

  const header = (
    <PageHeader
      title="Transactions"
      description="Recherchez, filtrez et corrigez vos opérations."
      actions={
        <>
          <Button asChild variant="outline" className="h-11 md:h-10">
            <Link href="/import">
              <Upload aria-hidden />
              Importer
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11 md:h-10">
            <a href={exportHref(query)} download>
              <Download aria-hidden />
              Exporter
            </a>
          </Button>
        </>
      }
    />
  );

  if (!page.ok || !accounts.ok || !categories.ok || !tags.ok) {
    const error = [page, accounts, categories, tags].find((r) => !r.ok);
    return (
      <>
        {header}
        <LoadError
          title="Impossible de charger les transactions"
          message={error && !error.ok ? error.error.message : 'Une erreur inattendue est survenue.'}
        />
      </>
    );
  }

  return (
    <>
      {header}
      <TransactionsView
        today={today()}
        initialQuery={query}
        initialPage={page.value}
        accounts={accounts.value}
        categories={categories.value}
        tags={tags.value}
      />
    </>
  );
}
