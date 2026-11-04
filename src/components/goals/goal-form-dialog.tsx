'use client';
import { Check } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import type { ISODate } from '@/domain/dates';
import type { GoalProgress } from '@/domain/types';
import { readInputText, resolveAmount } from '@/components/budgets/amount';
import { AmountInput } from '@/components/shared/amount-input';
import { CATEGORY_ICON_NAMES, IconByName } from '@/components/shared/category-icon';
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
import { goalInputSchema, type GoalInput } from '@/lib/schemas/budgets';
import { cn } from '@/lib/utils';
import { GOAL_COLORS, iconLabel } from './goal-utils';

export type GoalFormMode = { kind: 'create' } | { kind: 'edit'; goal: GoalProgress };

/** Dialog « Nouvel objectif » / « Modifier l'objectif ». */
export function GoalFormDialog({
  mode,
  today,
  onOpenChange,
  onSubmit,
}: {
  mode: GoalFormMode | null;
  today: ISODate;
  onOpenChange: (open: boolean) => void;
  /** Renvoie true si l'enregistrement a réussi (le dialog se ferme alors). */
  onSubmit: (input: GoalInput) => Promise<boolean>;
}) {
  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {mode && (
          <GoalForm
            key={mode.kind === 'edit' ? mode.goal.id : 'create'}
            mode={mode}
            today={today}
            onCancel={() => onOpenChange(false)}
            onSubmit={async (input) => {
              if (await onSubmit(input)) onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type FieldErrors = Partial<Record<'name' | 'targetAmount' | 'savedAmount' | 'targetDate', string>>;

function GoalForm({
  mode,
  today,
  onCancel,
  onSubmit,
}: {
  mode: GoalFormMode;
  today: ISODate;
  onCancel: () => void;
  onSubmit: (input: GoalInput) => Promise<void>;
}) {
  const initial = mode.kind === 'edit' ? mode.goal : null;
  const ids = {
    name: useId(),
    target: useId(),
    saved: useId(),
    date: useId(),
    icon: useId(),
    color: useId(),
    errors: useId(),
  };
  const [name, setName] = useState(initial?.name ?? '');
  const [target, setTarget] = useState<number | null>(initial?.targetAmount ?? null);
  const [saved, setSaved] = useState<number | null>(initial?.savedAmount ?? null);
  const [targetDate, setTargetDate] = useState<string>(initial?.targetDate ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? 'PiggyBank');
  const [color, setColor] = useState(initial?.color ?? GOAL_COLORS[0]?.value ?? '#15803D');
  const [errors, setErrors] = useState<FieldErrors>({});
  // Conserve l'icône et la couleur actuelles même si elles ne figurent pas dans les choix.
  const [iconChoices] = useState(() =>
    CATEGORY_ICON_NAMES.includes(icon) ? CATEGORY_ICON_NAMES : [icon, ...CATEGORY_ICON_NAMES],
  );
  const [colorChoices] = useState(() =>
    GOAL_COLORS.some((c) => c.value.toLowerCase() === color.toLowerCase())
      ? GOAL_COLORS
      : [{ value: color, label: 'Couleur actuelle' }, ...GOAL_COLORS],
  );
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: FieldErrors = {};
    const targetRaw = readInputText(ids.target);
    const targetParsed = resolveAmount(targetRaw, target);
    if (!targetParsed.ok && !targetRaw?.trim()) next.targetAmount = 'Montant cible requis.';
    const savedRaw = readInputText(ids.saved)?.trim() ?? '';
    const savedParsed = savedRaw === '' ? null : resolveAmount(savedRaw, saved);

    const input: GoalInput = {
      name: name.trim(),
      targetAmount: targetParsed.ok ? targetParsed.value : 0,
      savedAmount: savedParsed?.ok ? savedParsed.value : 0,
      targetDate: targetDate === '' ? null : targetDate,
      icon,
      color,
    };
    const parsed = goalInputSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'name' || key === 'targetDate' || key === 'savedAmount')
          next[key] ??= issue.message;
        if (key === 'targetAmount' && targetParsed.ok) next.targetAmount ??= issue.message;
      }
    }
    const amountInvalid = !targetParsed.ok || (savedParsed !== null && !savedParsed.ok);
    if (Object.keys(next).length > 0 || amountInvalid) {
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await onSubmit(input);
    } finally {
      setSubmitting(false);
    }
  }

  const describe = (key: keyof FieldErrors) => (errors[key] ? `${ids.errors}-${key}` : undefined);

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>{initial ? 'Modifier l’objectif' : 'Nouvel objectif'}</DialogTitle>
        <DialogDescription>
          Un montant à atteindre, avec ou sans date cible. Vous pourrez verser au fil de l’eau.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor={ids.name}>Nom</Label>
        <Input
          id={ids.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="Ex. Voyage à Djerba"
          autoFocus
          autoComplete="off"
          className="h-11"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describe('name')}
        />
        <FieldError id={describe('name')} message={errors.name} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={ids.target}>Montant cible</Label>
          <AmountInput
            id={ids.target}
            value={target}
            onChange={setTarget}
            placeholder="Ex. 1 500"
            aria-invalid={errors.targetAmount ? true : undefined}
            aria-describedby={describe('targetAmount')}
          />
          <FieldError id={describe('targetAmount')} message={errors.targetAmount} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={ids.saved}>Déjà épargné</Label>
          <AmountInput
            id={ids.saved}
            value={saved}
            onChange={setSaved}
            placeholder="0"
            aria-invalid={errors.savedAmount ? true : undefined}
            aria-describedby={describe('savedAmount')}
          />
          <FieldError id={describe('savedAmount')} message={errors.savedAmount} />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={ids.date}>Date cible (facultative)</Label>
        <div className="flex gap-2">
          <Input
            id={ids.date}
            type="date"
            value={targetDate}
            min={initial ? undefined : today}
            onChange={(e) => setTargetDate(e.target.value)}
            className="h-11"
            aria-invalid={errors.targetDate ? true : undefined}
            aria-describedby={describe('targetDate')}
          />
          {targetDate !== '' && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setTargetDate('')}
              className="min-h-11"
            >
              Sans date
            </Button>
          )}
        </div>
        <FieldError id={describe('targetDate')} message={errors.targetDate} />
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Icône</legend>
        <div className="grid max-h-40 grid-cols-7 gap-1.5 overflow-y-auto rounded-lg border p-2 sm:grid-cols-10">
          {iconChoices.map((n) => (
            <label
              key={n}
              title={iconLabel(n)}
              className={cn(
                'text-muted-foreground hover:bg-accent has-[:focus-visible]:ring-ring/50 relative grid size-11 cursor-pointer place-items-center rounded-md transition-colors has-[:focus-visible]:ring-[3px]',
                icon === n && 'bg-primary/10 text-primary ring-primary/40 ring-1',
              )}
            >
              <input
                type="radio"
                name={ids.icon}
                value={n}
                checked={icon === n}
                onChange={() => setIcon(n)}
                className="sr-only"
                aria-label={iconLabel(n)}
              />
              <IconByName name={n} className="size-5" aria-hidden="true" />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Couleur</legend>
        <div className="flex flex-wrap gap-2">
          {colorChoices.map((c) => (
            <label
              key={c.value}
              title={c.label}
              className="has-[:focus-visible]:ring-ring/50 relative grid size-11 cursor-pointer place-items-center rounded-full has-[:focus-visible]:ring-[3px]"
            >
              <input
                type="radio"
                name={ids.color}
                value={c.value}
                checked={color === c.value}
                onChange={() => setColor(c.value)}
                className="sr-only"
                aria-label={c.label}
              />
              <span
                aria-hidden="true"
                className={cn(
                  'ring-offset-background grid size-8 place-items-center rounded-full text-white ring-offset-2',
                  color === c.value && 'ring-foreground ring-2',
                )}
                style={{ backgroundColor: c.value }}
              >
                {color === c.value && <Check className="size-4" />}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} className="min-h-11 sm:min-h-10">
          Annuler
        </Button>
        <Button type="submit" disabled={submitting} className="min-h-11 sm:min-h-10">
          {submitting ? 'Enregistrement…' : initial ? 'Enregistrer' : 'Créer l’objectif'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function FieldError({ id, message }: { id: string | undefined; message: string | undefined }) {
  if (!id || !message) return null;
  return (
    <p id={id} role="alert" className="text-expense text-sm">
      {message}
    </p>
  );
}
