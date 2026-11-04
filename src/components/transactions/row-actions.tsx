'use client';
import { Check, Copy, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Transaction } from '@/domain/types';

export interface RowActionHandlers {
  onEdit: (t: Transaction) => void;
  onDuplicate: (t: Transaction) => void;
  onDelete: (t: Transaction) => void;
  onConfirmCategory: (t: Transaction) => void;
}

/**
 * Menu « Actions pour <libellé> » : Modifier, Dupliquer, Supprimer.
 * `narrow` (liste mobile) : bouton visuellement étroit (32 px) mais zone cliquable de 44 × 44 px
 * (pseudo-élément), pour laisser plus de place au libellé.
 */
export function RowActions({
  t,
  handlers,
  narrow = false,
}: {
  t: Transaction;
  handlers: RowActionHandlers;
  narrow?: boolean;
}) {
  const aiCategory = t.categorySource === 'AI' && t.categoryId !== null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Actions pour ${t.label}`}
          data-row-actions={t.id}
          className={
            narrow
              ? "relative h-11 w-8 after:absolute after:inset-y-0 after:-right-1 after:-left-2 after:content-['']"
              : 'size-11 md:size-9'
          }
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {aiCategory && (
          <DropdownMenuItem onSelect={() => handlers.onConfirmCategory(t)}>
            <Check aria-hidden />
            Valider la catégorie
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => handlers.onEdit(t)}>
          <Pencil aria-hidden />
          Modifier
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handlers.onDuplicate(t)}>
          <Copy aria-hidden />
          Dupliquer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => handlers.onDelete(t)}>
          <Trash2 aria-hidden />
          Supprimer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
