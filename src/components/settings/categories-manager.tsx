'use client';
import { useState } from 'react';
import { MoreHorizontalIcon, PencilIcon, PlusIcon, TagsIcon, Trash2Icon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Category, CategoryKind } from '@/domain/types';
import { deleteCategoryAction } from '@/app/actions/categories';
import { CategoryIcon } from '@/components/shared/category-icon';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCategories } from '@/lib/hooks/use-reference-data';
import { errorMessage, queryKeys, unwrap } from '@/lib/query';
import { toastError, toastSuccess } from '@/lib/toast';
import { CategoryDialog, GROUP_LABELS } from './category-dialog';
import { SettingsSection } from './settings-section';

const KIND_LABELS: Record<CategoryKind, string> = { EXPENSE: 'Dépenses', INCOME: 'Revenus' };

export function CategoriesManager({ initialCategories }: { initialCategories: Category[] }) {
  const queryClient = useQueryClient();
  const { data: categories = initialCategories } = useCategories(initialCategories);
  const [kind, setKind] = useState<CategoryKind>('EXPENSE');
  const [editing, setEditing] = useState<Category | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Category | null>(null);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.categories }),
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() }),
    ]);
  };

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      unwrap(await deleteCategoryAction(toDelete.id));
      toastSuccess(`Catégorie « ${toDelete.name} » supprimée.`);
      setToDelete(null);
      await invalidate();
    } catch (e) {
      toastError(errorMessage(e));
    }
  };

  return (
    <SettingsSection
      id="categories"
      title="Catégories"
      description="Organisez vos dépenses et revenus. Le groupe sert aux conseils 50/30/20."
    >
      <Tabs value={kind} onValueChange={(v) => setKind(v as CategoryKind)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            {(['EXPENSE', 'INCOME'] as const).map((k) => (
              <TabsTrigger key={k} value={k}>
                {KIND_LABELS[k]}
                <span className="text-muted-foreground text-xs tabular-nums">
                  {categories.filter((c) => c.kind === k).length}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          <Button type="button" variant="outline" onClick={openCreate}>
            <PlusIcon aria-hidden="true" />
            Nouvelle catégorie
          </Button>
        </div>
        {(['EXPENSE', 'INCOME'] as const).map((k) => {
          const list = categories.filter((c) => c.kind === k);
          return (
            <TabsContent key={k} value={k} className="mt-3">
              {list.length === 0 ? (
                <EmptyState
                  icon={TagsIcon}
                  title="Aucune catégorie"
                  description="Créez une catégorie pour classer vos opérations."
                />
              ) : (
                <ul
                  className="divide-y rounded-xl border"
                  aria-label={`Catégories de ${KIND_LABELS[k].toLowerCase()}`}
                >
                  {list.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                      <CategoryIcon icon={c.icon} color={c.color} size="md" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                      {c.kind === 'EXPENSE' && (
                        <Badge variant="secondary" className="hidden sm:inline-flex">
                          {GROUP_LABELS[c.group]}
                        </Badge>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions pour ${c.name}`}
                          >
                            <MoreHorizontalIcon aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              setEditing(c);
                              setDialogOpen(true);
                            }}
                          >
                            <PencilIcon aria-hidden="true" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(c)}>
                            <Trash2Icon aria-hidden="true" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editing}
        defaultKind={kind}
        onSaved={(c) => {
          toastSuccess(
            editing ? `Catégorie « ${c.name} » modifiée.` : `Catégorie « ${c.name} » créée.`,
          );
          void invalidate();
        }}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => {
          if (!o) setToDelete(null);
        }}
        title={toDelete ? `Supprimer « ${toDelete.name} » ?` : 'Supprimer la catégorie ?'}
        description="Les transactions concernées passeront « Sans catégorie » et le budget associé sera supprimé. Cette action est définitive."
        confirmLabel="Supprimer"
        destructive
        onConfirm={confirmDelete}
      />
    </SettingsSection>
  );
}
