'use client';
import { formatMoney, type Millimes } from '@/domain/money';
import type { TransactionType } from '@/domain/types';
import { useDiscreetMode } from '@/lib/hooks/use-discreet-mode';
import { cn } from '@/lib/utils';

export interface MoneyProps {
  /** Montant en millimes (toujours positif pour une transaction ; le signe vient de `type`) */
  value: Millimes;
  type?: TransactionType;
  sign?: 'auto' | 'always' | 'never';
  decimals?: 0 | 3;
  compact?: boolean;
  className?: string;
}

export const DISCREET_PLACEHOLDER = '•••';

/** Affiche un montant (seul point d'affichage UI des montants, respecte le mode discret). */
export function Money({ value, type, sign, decimals = 3, compact = false, className }: MoneyProps) {
  const { discreet } = useDiscreetMode();
  const isFlow = type === 'EXPENSE' || type === 'INCOME';
  const signed =
    type === 'EXPENSE' ? -Math.abs(value) : type === 'INCOME' ? Math.abs(value) : value;
  const effectiveSign = sign ?? (isFlow ? 'always' : 'auto');
  const color = type === 'EXPENSE' ? 'text-expense' : type === 'INCOME' ? 'text-income' : undefined;

  if (discreet) {
    return (
      <span
        data-slot="money"
        data-discreet="true"
        className={cn('whitespace-nowrap tabular-nums', color, className)}
      >
        <span aria-hidden="true">{`${DISCREET_PLACEHOLDER} DT`}</span>
        <span className="sr-only">Montant masqué</span>
      </span>
    );
  }

  return (
    <span data-slot="money" className={cn('whitespace-nowrap tabular-nums', color, className)}>
      {formatMoney(signed, { decimals, compact, sign: effectiveSign })}
    </span>
  );
}
