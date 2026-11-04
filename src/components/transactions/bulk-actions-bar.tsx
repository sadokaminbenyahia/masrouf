'use client';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { FolderInput, Trash2, X } from 'lucide-react';
import { CategoryIcon } from '@/components/shared/category-icon';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Category, Transaction } from '@/domain/types';
import { pluralize } from './text';

interface BulkActionsBarProps {
  selected: Transaction[];
  categories: Category[];
  pending: boolean;
  onCategorize: (list: Transaction[], categoryId: string | null) => void;
  onDelete: (list: Transaction[]) => void;
  onClear: () => void;
}

/** Barre d'actions groupées (apparaît dès qu'une ligne est sélectionnée). */
export function BulkActionsBar({
  selected,
  categories,
  pending,
  onCategorize,
  onDelete,
  onClear,
}: BulkActionsBarProps) {
  const reduceMotion = useReducedMotion();
  // Les virements n'ont pas de catégorie : ils sont ignorés par « Catégoriser ».
  const categorizable = selected.filter((t) => t.type !== 'TRANSFER');
  const kinds = new Set(categorizable.map((t) => t.type));
  const groups = (['EXPENSE', 'INCOME'] as const)
    .filter((k) => kinds.has(k))
    .map((k) => ({
      kind: k,
      label: k === 'EXPENSE' ? 'Dépenses' : 'Revenus',
      items: categories.filter((c) => c.kind === k).sort((a, b) => a.sortOrder - b.sortOrder),
    }));

  return (
    <AnimatePresence>
      {selected.length > 0 && (
        <motion.div
          role="region"
          aria-label="Actions groupées"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          transition={{ duration: 0.16 }}
          className="bg-card border-border sticky bottom-20 z-30 flex flex-wrap items-center gap-2 rounded-xl border p-2 pl-4 shadow-lg md:bottom-4"
        >
          <p className="mr-auto text-sm font-medium" aria-live="polite">
            {pluralize(selected.length, 'sélectionnée', 'sélectionnées')}
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={pending || categorizable.length === 0}
                className="min-h-11 md:min-h-10"
              >
                <FolderInput aria-hidden />
                Catégoriser
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 min-w-52 overflow-y-auto">
              <DropdownMenuItem onSelect={() => onCategorize(categorizable, null)}>
                Sans catégorie
              </DropdownMenuItem>
              {groups.map((g) => (
                <DropdownMenuGroup key={g.kind}>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>{g.label}</DropdownMenuLabel>
                  {g.items.map((c) => (
                    <DropdownMenuItem
                      key={c.id}
                      onSelect={() =>
                        onCategorize(
                          categorizable.filter((t) => t.type === c.kind),
                          c.id,
                        )
                      }
                    >
                      <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                      {c.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => onDelete(selected)}
            className="min-h-11 md:min-h-10"
          >
            <Trash2 aria-hidden />
            Supprimer
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClear}
            aria-label="Désélectionner tout"
            className="size-11 md:size-10"
          >
            <X aria-hidden />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
