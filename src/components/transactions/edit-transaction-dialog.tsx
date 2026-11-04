'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
import { useDiscreetMode } from '@/lib/hooks/use-discreet-mode';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { errorMessage, unwrap } from '@/lib/query';
import { toastError, toastSuccess, toastUndo } from '@/lib/toast';
import { invalidateFinanceQueries } from './cache';
import { diffPatch } from './optimistic';
import { describeTransaction } from './text';
import { TransactionForm } from './transaction-form';

/** Élément présent et affiché (le tableau et la liste de cartes coexistent, l'un masqué). */
function isVisible(el: HTMLElement): boolean {
  return el.isConnected && el.getClientRects().length > 0;
}

/**
 * Élément à refocaliser à la fermeture : l'élément actif à l'ouverture ; s'il s'agit d'un
 * élément de menu (« Modifier » d'un menu de ligne), le bouton qui ouvre ce menu.
 */
function returnTargetFrom(active: Element | null): HTMLElement | null {
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  const menu = active.closest('[role="menu"]');
  if (menu) {
    const triggerId = menu.getAttribute('aria-labelledby');
    const trigger = triggerId ? document.getElementById(triggerId) : null;
    return trigger instanceof HTMLElement ? trigger : null;
  }
  return active;
}

/**
 * Dialog (desktop) ou panneau du bas (mobile), selon la largeur d'écran.
 * À la fermeture, le focus revient à l'élément actif à l'ouverture (bouton, cellule, menu de
 * ligne), y compris quand le dialog a été ouvert par un raccourci ou un événement ; à défaut,
 * `returnFocusFallback`, puis le contenu principal (`<main id="contenu">`).
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  returnFocusFallback,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  returnFocusFallback?: () => HTMLElement | null;
}) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Effet de layout : s'exécute avant que Radix ne déplace le focus dans le dialog.
  useLayoutEffect(() => {
    if (open) returnFocusRef.current = returnTargetFrom(document.activeElement);
  }, [open]);

  function restoreFocus(e: Event) {
    e.preventDefault();
    const saved = returnFocusRef.current;
    returnFocusRef.current = null;
    const fallback = returnFocusFallback?.() ?? null;
    const target =
      (saved && isVisible(saved) ? saved : null) ??
      (fallback && isVisible(fallback) ? fallback : null) ??
      document.getElementById('contenu');
    target?.focus();
  }

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
          onCloseAutoFocus={restoreFocus}
        >
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
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-2xl px-4 pb-6"
        onCloseAutoFocus={restoreFocus}
      >
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
  const { discreet } = useDiscreetMode();
  // Conserve l'identifiant après la fermeture (le focus est rendu après `onClose`).
  const [lastId, setLastId] = useState<string | undefined>(transaction?.id);
  if (transaction && transaction.id !== lastId) setLastId(transaction.id);

  function handleSaved(before: Transaction, after: Transaction) {
    onClose();
    const undo = diffPatch(after, before);
    if (Object.keys(undo).length === 0) return;
    toastUndo(describeTransaction(after, 'modifié', discreet), async () => {
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
      returnFocusFallback={() => rowActionsButton(lastId)}
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

/** Bouton « Actions pour <libellé> » visible de la transaction (tableau ou carte). */
function rowActionsButton(id: string | undefined): HTMLElement | null {
  if (id === undefined) return null;
  const buttons = document.querySelectorAll<HTMLElement>(`[data-row-actions="${CSS.escape(id)}"]`);
  return Array.from(buttons).find(isVisible) ?? null;
}
