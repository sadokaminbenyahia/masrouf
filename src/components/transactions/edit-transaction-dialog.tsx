'use client';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { updateTransactionAction } from '@/app/actions/transactions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { ISODate } from '@/domain/dates';
import type { Transaction } from '@/domain/types';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { errorMessage, unwrap } from '@/lib/query';
import { toastError, toastSuccess, toastUndo } from '@/lib/toast';
import { invalidateFinanceQueries } from './cache';
import { diffPatch } from './optimistic';
import { TransactionForm } from './transaction-form';

/** Dialog (desktop) ou panneau du bas (mobile), selon la largeur d'écran. */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl px-4 pb-6">
        <SheetHeader className="px-0">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}

interface EditTransactionDialogProps {
  transaction: Transaction | null;
  today: ISODate;
  onClose: () => void;
}

/** « Modifier » : formulaire complet, puis toast « Annuler » qui rejoue les valeurs d'avant. */
export function EditTransactionDialog({ transaction, today, onClose }: EditTransactionDialogProps) {
  const queryClient = useQueryClient();

  function handleSaved(before: Transaction, after: Transaction) {
    onClose();
    const undo = diffPatch(after, before);
    if (Object.keys(undo).length === 0) return;
    toastUndo('Transaction modifiée', async () => {
      try {
        unwrap(await updateTransactionAction(before.id, undo));
        toastSuccess('Modification annulée');
      } catch (e) {
        toastError(errorMessage(e));
      } finally {
        await invalidateFinanceQueries(queryClient);
      }
    });
  }

  return (
    <ResponsiveDialog
      open={transaction !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Modifier la transaction"
      description="Les changements de catégorie améliorent les suggestions automatiques."
    >
      {transaction && (
        <TransactionForm
          key={transaction.id}
          mode="edit"
          transactionId={transaction.id}
          today={today}
          defaultValues={{
            type: transaction.type,
            amount: transaction.amount,
            date: transaction.date,
            label: transaction.label,
            accountId: transaction.accountId,
            categoryId: transaction.categoryId,
            transferAccountId: transaction.transferAccountId,
            tags: transaction.tags,
            note: transaction.note,
          }}
          onSuccess={(after) => handleSaved(transaction, after)}
        />
      )}
    </ResponsiveDialog>
  );
}
