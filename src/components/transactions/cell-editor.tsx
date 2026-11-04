'use client';
import { useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { AmountInput } from '@/components/shared/amount-input';
import type { AccountWithBalance, Category, Transaction } from '@/domain/types';
import type { TransactionPatch } from '@/lib/schemas/transactions';
import { cn } from '@/lib/utils';
import { inlineValueToPatch, type EditableColumn } from './inline-edit';

/** stay : Entrée ; blur : clic ailleurs ; 1 / -1 : Tab / Maj+Tab */
export type CommitMove = 'stay' | 'blur' | 1 | -1;

interface CellEditorProps {
  t: Transaction;
  column: EditableColumn;
  categories: readonly Category[];
  accounts: readonly AccountWithBalance[];
  onCommit: (patch: TransactionPatch | null, move: CommitMove) => void;
  onCancel: () => void;
}

const COLUMN_LABELS: Record<EditableColumn, string> = {
  date: 'Date',
  label: 'Libellé',
  category: 'Catégorie',
  account: 'Compte',
  amount: 'Montant',
};

const fieldClass =
  'border-input bg-background h-9 w-full min-w-0 rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive';

/** Éditeur inline d'une cellule : Entrée valide, Échap annule, Tab passe à la suivante. */
export function CellEditor({
  t,
  column,
  categories,
  accounts,
  onCommit,
  onCancel,
}: CellEditorProps) {
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(t.amount);
  const doneRef = useRef(false);
  const pointerRef = useRef(false);
  const errorId = useId();
  const inputId = useId();

  function finish(raw: string, move: CommitMove) {
    if (doneRef.current) return;
    const r = inlineValueToPatch(t, column, raw);
    if (!r.ok) {
      // Au blur, une saisie invalide est abandonnée (on ne peut pas retenir le focus).
      if (move === 'blur') {
        doneRef.current = true;
        onCancel();
      } else {
        setError(r.error);
      }
      return;
    }
    doneRef.current = true;
    onCommit(r.value, move);
  }

  function cancel() {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    const raw = e.currentTarget.value;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      finish(raw, 'stay');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      finish(raw, e.shiftKey ? -1 : 1);
    } else if (error) {
      setError(null);
    }
  }

  const onBlur = (e: FocusEvent<HTMLInputElement | HTMLSelectElement>) =>
    finish(e.currentTarget.value, 'blur');

  const common = {
    id: inputId,
    'aria-label': COLUMN_LABELS[column],
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
    onKeyDown,
    onBlur,
  };

  let field;
  switch (column) {
    case 'label':
      field = (
        <input
          {...common}
          type="text"
          defaultValue={t.label}
          maxLength={140}
          autoFocus
          autoComplete="off"
          onFocus={(e) => e.currentTarget.select()}
          className={fieldClass}
        />
      );
      break;
    case 'date':
      field = (
        <input {...common} type="date" defaultValue={t.date} autoFocus className={fieldClass} />
      );
      break;
    case 'amount':
      field = (
        <AmountInput
          id={inputId}
          value={amount}
          onChange={setAmount}
          aria-label="Montant"
          aria-invalid={error ? true : undefined}
          {...(error ? { 'aria-describedby': errorId } : {})}
          autoFocus
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          className="min-w-28"
        />
      );
      break;
    case 'category': {
      const kind = t.type === 'INCOME' ? 'INCOME' : 'EXPENSE';
      const options = categories
        .filter((c) => c.kind === kind)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      field = (
        <select
          {...common}
          defaultValue={t.categoryId ?? ''}
          autoFocus
          onPointerDown={() => {
            pointerRef.current = true;
          }}
          onChange={(e) => {
            if (pointerRef.current) finish(e.currentTarget.value, 'stay');
          }}
          className={fieldClass}
        >
          <option value="">Sans catégorie</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      );
      break;
    }
    case 'account': {
      const options = accounts.filter((a) => !a.archived || a.id === t.accountId);
      field = (
        <select
          {...common}
          defaultValue={t.accountId}
          autoFocus
          onPointerDown={() => {
            pointerRef.current = true;
          }}
          onChange={(e) => {
            if (pointerRef.current) finish(e.currentTarget.value, 'stay');
          }}
          className={fieldClass}
        >
          {options.map((a) => (
            <option key={a.id} value={a.id} disabled={a.id === t.transferAccountId}>
              {a.name}
            </option>
          ))}
        </select>
      );
      break;
    }
  }

  return (
    <div className={cn('relative', column === 'amount' && 'ml-auto max-w-40')}>
      {field}
      {error && (
        <p id={errorId} role="alert" className="text-destructive mt-1 text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
