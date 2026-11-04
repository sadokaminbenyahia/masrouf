'use client';
import { Sparkles } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import type { BudgetSuggestion } from '@/domain/ai/types';
import type { Millimes } from '@/domain/money';
import type { BudgetProgress, Category } from '@/domain/types';
import { AiBadge } from '@/components/shared/ai-badge';
import { AmountInput } from '@/components/shared/amount-input';
import { Money } from '@/components/shared/money';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { readInputText, resolveAmount } from './amount';

export type BudgetDialogMode =
  { kind: 'create'; available: Category[] } | { kind: 'edit'; progress: BudgetProgress };

interface BudgetDialogProps {
  mode: BudgetDialogMode | null;
  onOpenChange: (open: boolean) => void;
  suggestions: ReadonlyMap<string, BudgetSuggestion>;
  onSubmit: (category: Category, amount: Millimes) => void;
}

/** Dialog « Nouveau budget » / « Modifier le budget ». Le contenu est remonté à chaque ouverture. */
export function BudgetDialog({ mode, onOpenChange, suggestions, onSubmit }: BudgetDialogProps) {
  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {mode && (
          <BudgetForm
            key={mode.kind === 'edit' ? mode.progress.budget.id : 'create'}
            mode={mode}
            suggestions={suggestions}
            onCancel={() => onOpenChange(false)}
            onSubmit={(category, amount) => {
              onSubmit(category, amount);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

const selectClass =
  'flex h-11 w-full rounded-lg border border-input bg-card px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive sm:text-sm dark:bg-input/30';

function BudgetForm({
  mode,
  suggestions,
  onCancel,
  onSubmit,
}: {
  mode: BudgetDialogMode;
  suggestions: ReadonlyMap<string, BudgetSuggestion>;
  onCancel: () => void;
  onSubmit: (category: Category, amount: Millimes) => void;
}) {
  const categoryFieldId = useId();
  const amountId = useId();
  const amountErrorId = useId();
  const suggestionId = useId();
  const isEdit = mode.kind === 'edit';
  const available = mode.kind === 'create' ? mode.available : [mode.progress.category];

  const [categoryId, setCategoryId] = useState<string>(available[0]?.id ?? '');
  const [amount, setAmount] = useState<number | null>(
    mode.kind === 'edit' ? mode.progress.budget.amount : null,
  );
  // Remonte le champ montant quand une valeur est imposée (bouton « Utiliser »).
  const [amountKey, setAmountKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const category = available.find((c) => c.id === categoryId) ?? null;
  const suggestion = category ? suggestions.get(category.id) : undefined;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!category) return;
    const raw = readInputText(amountId);
    const parsed = resolveAmount(raw, amount);
    if (!parsed.ok) {
      // Une saisie invalide est déjà signalée par <AmountInput> ; on signale l'absence.
      setError(raw?.trim() ? null : parsed.error);
      document.getElementById(amountId)?.focus();
      return;
    }
    onSubmit(category, parsed.value);
  }

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>
          {isEdit ? `Modifier le budget ${mode.progress.category.name}` : 'Nouveau budget'}
        </DialogTitle>
        <DialogDescription>
          Un plafond mensuel pour une catégorie de dépense. Il s’applique à tous les mois.
        </DialogDescription>
      </DialogHeader>

      {available.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
          Toutes vos catégories de dépense ont déjà un budget. Créez une catégorie dans les
          paramètres pour en ajouter un autre.
        </p>
      ) : (
        <>
          <div className="grid gap-2">
            <Label htmlFor={categoryFieldId}>Catégorie</Label>
            <select
              id={categoryFieldId}
              value={categoryId}
              disabled={isEdit}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setError(null);
              }}
              className={selectClass}
            >
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={amountId}>Plafond mensuel</Label>
            <AmountInput
              key={amountKey}
              id={amountId}
              value={amount}
              onChange={(v) => {
                setAmount(v);
                setError(null);
              }}
              autoFocus={isEdit}
              placeholder="Ex. 400"
              aria-invalid={error ? true : undefined}
              aria-describedby={
                [error ? amountErrorId : null, suggestion ? suggestionId : null]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
            />
            {error && (
              <p id={amountErrorId} role="alert" className="text-expense text-sm">
                {error}
              </p>
            )}
          </div>

          {suggestion && (
            <div
              id={suggestionId}
              className={cn(
                'border-primary/25 bg-primary/5 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center',
              )}
            >
              <div className="flex min-w-0 flex-1 items-start gap-2 text-sm">
                <Sparkles className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p>
                  <span className="font-medium">
                    Suggestion : <Money value={suggestion.amount} decimals={0} />
                  </span>{' '}
                  <span className="text-muted-foreground">— {suggestion.basis}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <AiBadge />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 sm:min-h-8"
                  onClick={() => {
                    setAmount(suggestion.amount);
                    setAmountKey((k) => k + 1);
                    setError(null);
                  }}
                >
                  Utiliser
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} className="min-h-11 sm:min-h-10">
          Annuler
        </Button>
        <Button type="submit" disabled={!category} className="min-h-11 sm:min-h-10">
          {isEdit ? 'Enregistrer' : 'Créer le budget'}
        </Button>
      </DialogFooter>
    </form>
  );
}
