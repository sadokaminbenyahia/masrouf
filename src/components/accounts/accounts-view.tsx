'use client';
/** Page /comptes : cartes de comptes, solde total, création/édition/archivage/suppression. */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Archive,
  ArchiveRestore,
  ArrowLeftRight,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { deleteAccountAction, updateAccountAction } from '@/app/actions/accounts';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { Money } from '@/components/shared/money';
import { PageHeader } from '@/components/shared/page-header';
import { invalidateFinanceQueries } from '@/components/transactions/cache';
import { ErrorPanel } from '@/components/transactions/error-panel';
import { pluralize } from '@/components/transactions/text';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AccountWithBalance } from '@/domain/types';
import { openQuickAdd } from '@/lib/events';
import { ActionError, errorMessage, unwrap } from '@/lib/query';
import { toastError, toastSuccess, toastUndo } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { ACCOUNT_TYPE_META } from './account-meta';
import { AccountFormDialog } from './account-form-dialog';
import { totalBalance } from './balance';
import { allAccountsKey, useAllAccounts } from './use-all-accounts';

const bySortOrder = (a: AccountWithBalance, b: AccountWithBalance) => a.sortOrder - b.sortOrder;

export function AccountsView({ initialAccounts }: { initialAccounts: AccountWithBalance[] }) {
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const archivedRegionId = useId();
  const accountsQuery = useAllAccounts(initialAccounts);
  const accounts = accountsQuery.data ?? initialAccounts;
  const active = accounts.filter((a) => !a.archived).sort(bySortOrder);
  const archived = accounts.filter((a) => a.archived).sort(bySortOrder);

  const [form, setForm] = useState<{ open: boolean; account: AccountWithBalance | null }>({
    open: false,
    account: null,
  });
  const [toDelete, setToDelete] = useState<AccountWithBalance | null>(null);
  const [conflict, setConflict] = useState<{ account: AccountWithBalance; message: string } | null>(
    null,
  );
  const [showArchived, setShowArchived] = useState(false);

  const archive = useMutation({
    mutationFn: async (v: { account: AccountWithBalance; archived: boolean; undo: boolean }) =>
      unwrap(await updateAccountAction(v.account.id, { archived: v.archived })),
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: allAccountsKey });
      const previous = queryClient.getQueryData<AccountWithBalance[]>(allAccountsKey);
      if (previous) {
        queryClient.setQueryData<AccountWithBalance[]>(
          allAccountsKey,
          previous.map((a) => (a.id === v.account.id ? { ...a, archived: v.archived } : a)),
        );
      }
      return { previous };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(allAccountsKey, ctx.previous);
      toastError(errorMessage(e));
    },
    onSuccess: (_r, v) => {
      if (v.undo) {
        toastSuccess('Action annulée');
        return;
      }
      toastUndo(v.archived ? 'Compte archivé' : 'Compte désarchivé', () =>
        archive.mutate({ account: v.account, archived: !v.archived, undo: true }),
      );
    },
    onSettled: () => invalidateFinanceQueries(queryClient),
  });

  async function confirmDelete(account: AccountWithBalance) {
    try {
      unwrap(await deleteAccountAction(account.id));
      toastSuccess('Compte supprimé');
      await invalidateFinanceQueries(queryClient);
    } catch (e) {
      if (e instanceof ActionError && e.code === 'CONFLICT') {
        setConflict({ account, message: e.message });
      } else {
        toastError(errorMessage(e));
      }
    }
  }

  const handlers: AccountHandlers = {
    onEdit: (account) => setForm({ open: true, account }),
    onTransfer: (account) => openQuickAdd({ prefill: { type: 'TRANSFER', accountId: account.id } }),
    onArchive: (account) => archive.mutate({ account, archived: !account.archived, undo: false }),
    onDelete: setToDelete,
  };

  const header = (
    <PageHeader
      title="Comptes"
      description="Espèces, banque, cartes : vos soldes sont calculés à partir de vos transactions."
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            className="h-11 md:h-10"
            disabled={active.length < 2}
            onClick={() => openQuickAdd({ prefill: { type: 'TRANSFER' } })}
          >
            <ArrowLeftRight aria-hidden />
            Faire un virement
          </Button>
          <Button
            type="button"
            className="h-11 md:h-10"
            onClick={() => setForm({ open: true, account: null })}
          >
            <Plus aria-hidden />
            Nouveau compte
          </Button>
        </>
      }
    />
  );

  return (
    <>
      {header}
      <div className="grid gap-6">
        {accountsQuery.isError && (
          <ErrorPanel
            message={errorMessage(accountsQuery.error)}
            onRetry={() => void accountsQuery.refetch()}
            pending={accountsQuery.isFetching}
          />
        )}

        {accounts.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Aucun compte"
            description="Créez un compte pour vos espèces, votre banque ou votre carte, puis ajoutez vos transactions."
            action={
              <Button type="button" onClick={() => setForm({ open: true, account: null })}>
                <Plus aria-hidden />
                Créer mon premier compte
              </Button>
            }
          />
        ) : (
          <>
            <section
              aria-label="Solde total"
              className="bg-card border-border flex flex-wrap items-end justify-between gap-2 rounded-xl border p-5"
            >
              <div>
                <p className="text-muted-foreground text-sm">Solde total</p>
                {/* Total agrégé arrondi au dinar ; soldes par compte au millime. */}
                <Money
                  value={totalBalance(accounts)}
                  decimals={0}
                  className="text-3xl font-semibold tracking-tight"
                />
              </div>
              <p className="text-muted-foreground text-sm">
                {pluralize(active.length, 'compte actif', 'comptes actifs')}
              </p>
            </section>

            {active.length > 0 ? (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Comptes actifs">
                {active.map((a) => (
                  <li key={a.id}>
                    <AccountCard account={a} handlers={handlers} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                Tous vos comptes sont archivés. Désarchivez-en un ou créez un nouveau compte.
              </p>
            )}

            {archived.length > 0 && (
              <section className="grid gap-3">
                <h2>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-expanded={showArchived}
                    aria-controls={archivedRegionId}
                    onClick={() => setShowArchived((v) => !v)}
                    className="-ml-2 min-h-11"
                  >
                    <ChevronDown
                      className={cn(
                        'size-4 transition-transform motion-reduce:transition-none',
                        showArchived && 'rotate-180',
                      )}
                      aria-hidden
                    />
                    Comptes archivés ({archived.length})
                  </Button>
                </h2>
                <AnimatePresence initial={false}>
                  {showArchived && (
                    <motion.ul
                      id={archivedRegionId}
                      aria-label="Comptes archivés"
                      initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                      transition={{ duration: 0.16 }}
                      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
                    >
                      {archived.map((a) => (
                        <li key={a.id}>
                          <AccountCard account={a} handlers={handlers} />
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </section>
            )}
          </>
        )}
      </div>

      <AccountFormDialog
        open={form.open}
        account={form.account}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={toDelete ? `Supprimer « ${toDelete.name} » ?` : 'Supprimer le compte ?'}
        description="Cette action est définitive. Un compte qui contient des transactions ne peut pas être supprimé : archivez-le plutôt."
        confirmLabel="Supprimer"
        destructive
        onConfirm={async () => {
          if (toDelete) await confirmDelete(toDelete);
        }}
      />

      <Dialog open={conflict !== null} onOpenChange={(open) => !open && setConflict(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ce compte ne peut pas être supprimé</DialogTitle>
            <DialogDescription>
              {conflict?.message} Vous pouvez l&apos;archiver : il disparaîtra des listes et des
              formulaires, mais son historique sera conservé.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConflict(null)}>
              Fermer
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (conflict) {
                  archive.mutate({ account: conflict.account, archived: true, undo: false });
                }
                setConflict(null);
              }}
            >
              <Archive aria-hidden />
              Archiver le compte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface AccountHandlers {
  onEdit: (a: AccountWithBalance) => void;
  onTransfer: (a: AccountWithBalance) => void;
  onArchive: (a: AccountWithBalance) => void;
  onDelete: (a: AccountWithBalance) => void;
}

function AccountCard({
  account,
  handlers,
}: {
  account: AccountWithBalance;
  handlers: AccountHandlers;
}) {
  const meta = ACCOUNT_TYPE_META[account.type];
  const Icon = meta.icon;
  // « Espèces · Espèces » : le type n'est affiché que s'il apporte une information.
  const showType =
    account.name.trim().localeCompare(meta.label, 'fr', { sensitivity: 'base' }) !== 0;
  const subtitle = [showType ? meta.label : null, account.archived ? 'archivé' : null]
    .filter((part): part is string => part !== null)
    .join(' · ');
  return (
    <article
      className={cn(
        'bg-card border-border hover:border-primary/40 focus-within:border-primary/40 relative flex h-full flex-col gap-4 rounded-xl border p-5 transition-colors',
        account.archived && 'opacity-80',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ backgroundColor: account.color }}
          aria-hidden
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">
            {/* Lien étiré : toute la carte mène aux transactions du compte. */}
            <Link
              href={`/transactions?accountId=${encodeURIComponent(account.id)}`}
              className="focus-visible:ring-ring rounded-sm outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:ring-2"
            >
              {account.name}
            </Link>
          </h2>
          {subtitle && (
            <p className="text-muted-foreground text-sm first-letter:uppercase">{subtitle}</p>
          )}
        </div>
        <div className="relative z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Actions pour ${account.name}`}
                className="size-11 md:size-9"
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onSelect={() => handlers.onEdit(account)}>
                <Pencil aria-hidden />
                Modifier
              </DropdownMenuItem>
              {!account.archived && (
                <DropdownMenuItem onSelect={() => handlers.onTransfer(account)}>
                  <ArrowLeftRight aria-hidden />
                  Faire un virement
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => handlers.onArchive(account)}>
                {account.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                {account.archived ? 'Désarchiver' : 'Archiver'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => handlers.onDelete(account)}>
                <Trash2 aria-hidden />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="mt-auto flex items-end justify-between gap-2">
        <div>
          <p className="text-muted-foreground text-xs">Solde</p>
          <Money
            value={account.balance}
            className={cn('text-2xl font-semibold', account.balance < 0 && 'text-expense')}
          />
        </div>
        <p className="text-muted-foreground text-xs">
          {pluralize(account.transactionCount, 'transaction', 'transactions')}
        </p>
      </div>
    </article>
  );
}
