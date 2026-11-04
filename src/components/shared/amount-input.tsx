'use client';
import { useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from 'react';
import { millimesToInputString, parseAmountInput, type Millimes } from '@/domain/money';
import { cn } from '@/lib/utils';

export interface AmountInputProps {
  id?: string;
  name?: string;
  value: Millimes | null;
  onChange: (m: Millimes | null) => void;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
  'aria-label'?: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Champ montant intelligent : virgule ou point, « 12,5+3 », « 500 millimes ».
 * La saisie est libre ; elle est validée (parseAmountInput) au blur ou à Entrée, et la valeur
 * normalisée remplace le texte. Une saisie invalide renvoie `null` et affiche l'erreur.
 */
export function AmountInput({
  id,
  name,
  value,
  onChange,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  'aria-label': ariaLabel,
  placeholder = '0,000',
  autoFocus,
  disabled,
  required,
  className,
  onBlur,
  onKeyDown,
}: AmountInputProps) {
  const [text, setText] = useState(() => (value === null ? '' : millimesToInputString(value)));
  const [lastValue, setLastValue] = useState<Millimes | null>(value);
  const [error, setError] = useState<string | null>(null);
  const errorId = id ? `${id}-erreur` : undefined;

  // Valeur modifiée de l'extérieur (réinitialisation de formulaire, pré-remplissage) :
  // ajustement pendant le rendu, recommandé par React plutôt qu'un effet.
  if (value !== lastValue) {
    setLastValue(value);
    setText(value === null ? '' : millimesToInputString(value));
    setError(null);
  }

  const commit = (raw: string) => {
    if (raw.trim() === '') {
      setError(null);
      if (value !== null) {
        setLastValue(null);
        onChange(null);
      }
      return;
    }
    const parsed = parseAmountInput(raw);
    if (parsed.ok) {
      setError(null);
      setText(millimesToInputString(parsed.value));
      setLastValue(parsed.value);
      if (parsed.value !== value) onChange(parsed.value);
    } else {
      setError(parsed.error);
      setLastValue(null);
      if (value !== null) onChange(null);
    }
  };

  const invalid = ariaInvalid === true || ariaInvalid === 'true' || error !== null;
  const describedBy = [ariaDescribedBy, error && errorId ? errorId : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <div data-slot="amount-input" className={cn('w-full', className)}>
      <div className="relative">
        <input
          id={id}
          name={name}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          spellCheck={false}
          value={text}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          required={required}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy || undefined}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          onBlur={(e) => {
            commit(e.target.value);
            onBlur?.(e);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(e.currentTarget.value);
            onKeyDown?.(e);
          }}
          className={cn(
            'border-input bg-card placeholder:text-muted-foreground dark:bg-input/30 flex h-10 w-full min-w-0 rounded-lg border py-2 pr-11 pl-3 text-right text-base tabular-nums shadow-xs transition-[color,box-shadow,border-color] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
          )}
        />
        <span
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium"
        >
          DT
        </span>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-expense mt-1.5 text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
