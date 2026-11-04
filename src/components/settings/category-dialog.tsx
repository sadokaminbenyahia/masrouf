'use client';
import { useState, useTransition, type FormEvent } from 'react';
import { Loader2Icon } from 'lucide-react';
import type { Category, CategoryGroup, CategoryKind } from '@/domain/types';
import { createCategoryAction, updateCategoryAction } from '@/app/actions/categories';
import { CATEGORY_ICON_NAMES, CategoryIcon, IconByName } from '@/components/shared/category-icon';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ActionError, errorMessage, unwrap } from '@/lib/query';
import { cn } from '@/lib/utils';

export const CATEGORY_COLORS = [
  '#1F5FAD',
  '#0E7C6B',
  '#15803D',
  '#4D7C0F',
  '#C2600C',
  '#B54708',
  '#B42318',
  '#BE185D',
  '#7C3AED',
  '#0E7490',
  '#475569',
  '#64748B',
] as const;

export const GROUP_LABELS: Record<CategoryGroup, string> = {
  NEEDS: 'Besoins (50 %)',
  WANTS: 'Envies (30 %)',
  SAVINGS: 'Épargne (20 %)',
  INCOME: 'Revenus',
};

export interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = création */
  category: Category | null;
  defaultKind: CategoryKind;
  onSaved: (c: Category) => void;
}

export function CategoryDialog(props: CategoryDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {props.open && (
          <CategoryForm key={props.category?.id ?? `new-${props.defaultKind}`} {...props} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({ category, defaultKind, onOpenChange, onSaved }: CategoryDialogProps) {
  const kind: CategoryKind = category?.kind ?? defaultKind;
  const [name, setName] = useState(category?.name ?? '');
  const [group, setGroup] = useState<CategoryGroup>(
    category?.group ?? (kind === 'INCOME' ? 'INCOME' : 'NEEDS'),
  );
  const [icon, setIcon] = useState(category?.icon ?? 'Tag');
  const [color, setColor] = useState(category?.color ?? '#1F5FAD');
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const saved = category
          ? unwrap(await updateCategoryAction(category.id, { name, group, icon, color }))
          : unwrap(await createCategoryAction({ name, kind, group, icon, color }));
        onSaved(saved);
        onOpenChange(false);
      } catch (err) {
        if (err instanceof ActionError && err.fieldErrors) {
          setErrors(err.fieldErrors);
          setFormError(null);
        } else {
          setErrors({});
          setFormError(errorMessage(err));
        }
      }
    });
  };

  const groups: CategoryGroup[] = kind === 'INCOME' ? ['INCOME'] : ['NEEDS', 'WANTS', 'SAVINGS'];

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{category ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</DialogTitle>
        <DialogDescription>
          {kind === 'INCOME' ? 'Catégorie de revenus.' : 'Catégorie de dépenses.'}
        </DialogDescription>
      </DialogHeader>

      {formError && (
        <p role="alert" className="bg-expense/8 text-expense rounded-lg px-3 py-2 text-sm">
          {formError}
        </p>
      )}

      <div className="flex items-end gap-3">
        <CategoryIcon icon={icon} color={color} size="lg" />
        <div className="grid flex-1 gap-2">
          <Label htmlFor="categorie-nom">Nom</Label>
          <Input
            id="categorie-nom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            autoFocus
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'categorie-nom-erreur' : undefined}
          />
        </div>
      </div>
      {errors.name && (
        <p id="categorie-nom-erreur" className="text-expense -mt-3 text-xs">
          {errors.name.join(' ')}
        </p>
      )}

      {kind === 'EXPENSE' && (
        <div className="grid gap-2">
          <Label htmlFor="categorie-groupe">Groupe 50/30/20</Label>
          <Select value={group} onValueChange={(v) => setGroup(v as CategoryGroup)}>
            <SelectTrigger id="categorie-groupe">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g} value={g}>
                  {GROUP_LABELS[g]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.group && <p className="text-expense text-xs">{errors.group.join(' ')}</p>}
        </div>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Couleur</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={color === c}
              aria-label={`Couleur ${c}`}
              onClick={() => setColor(c)}
              className={cn(
                'ring-offset-popover focus-visible:ring-ring size-8 rounded-full ring-offset-2 transition-transform outline-none focus-visible:ring-[3px]',
                color === c ? 'ring-foreground scale-110 ring-2' : 'hover:scale-105',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Icône</legend>
        <div className="grid max-h-44 grid-cols-7 gap-1.5 overflow-y-auto rounded-lg border p-2 sm:grid-cols-9">
          {CATEGORY_ICON_NAMES.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={icon === n}
              aria-label={`Icône ${n}`}
              title={n}
              onClick={() => setIcon(n)}
              className={cn(
                'focus-visible:ring-ring/50 flex aspect-square items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-[3px]',
                icon === n
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <IconByName name={n} className="size-4" aria-hidden="true" />
            </button>
          ))}
        </div>
      </fieldset>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Annuler
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
          Enregistrer
        </Button>
      </DialogFooter>
    </form>
  );
}
