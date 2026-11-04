'use client';
import { useId, useState, type FormEvent } from 'react';
import type { Millimes } from '@/domain/money';
import type { GoalProgress } from '@/domain/types';
import { readInputText, resolveAmount } from '@/components/budgets/amount';
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
import { contributionDelta, type ContributionMode } from './goal-utils';

export interface ContributionTarget {
  goal: GoalProgress;
  mode: ContributionMode;
}

/** Dialog « Verser » / « Retirer » sur un objectif. */
export function ContributionDialog({
  target,
  onOpenChange,
  onSubmit,
}: {
  target: ContributionTarget | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (goal: GoalProgress, delta: Millimes) => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {target && (
          <ContributionForm
            key={`${target.goal.id}-${target.mode}`}
            target={target}
            onCancel={() => onOpenChange(false)}
            onSubmit={(delta) => {
              onSubmit(target.goal, delta);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ContributionForm({
  target,
  onCancel,
  onSubmit,
}: {
  target: ContributionTarget;
  onCancel: () => void;
  onSubmit: (delta: Millimes) => void;
}) {
  const { goal, mode } = target;
  const amountId = useId();
  const errorId = useId();
  const [amount, setAmount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deposit = mode === 'deposit';

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = readInputText(amountId);
    const parsed = resolveAmount(raw, amount);
    if (!parsed.ok) {
      setError(raw?.trim() ? null : parsed.error);
      document.getElementById(amountId)?.focus();
      return;
    }
    const delta = contributionDelta(mode, parsed.value, goal);
    if (!delta.ok) {
      setError(delta.error);
      return;
    }
    onSubmit(delta.delta);
  }

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>
          {deposit ? `Verser sur « ${goal.name} »` : `Retirer de « ${goal.name} »`}
        </DialogTitle>
        <DialogDescription>
          Épargné : <Money value={goal.savedAmount} /> sur <Money value={goal.targetAmount} />.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor={amountId}>{deposit ? 'Montant à verser' : 'Montant à retirer'}</Label>
        <AmountInput
          id={amountId}
          value={amount}
          onChange={(v) => {
            setAmount(v);
            setError(null);
          }}
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {error && (
          <p id={errorId} role="alert" className="text-expense text-sm">
            {error}
          </p>
        )}
        {deposit && goal.remaining > 0 && (
          <Button
            type="button"
            variant="link"
            className="h-auto justify-start p-0 text-sm"
            onClick={() => {
              setAmount(goal.remaining);
              setError(null);
            }}
          >
            Verser le reste (<Money value={goal.remaining} />)
          </Button>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} className="min-h-11 sm:min-h-10">
          Annuler
        </Button>
        <Button type="submit" className="min-h-11 sm:min-h-10">
          {deposit ? 'Verser' : 'Retirer'}
        </Button>
      </DialogFooter>
    </form>
  );
}
