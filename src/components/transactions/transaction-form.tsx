'use client';
/**
 * Formulaire de transaction (création et édition), utilisé par l'ajout rapide et le
 * dialog « Modifier ». Validation Zod côté client + erreurs serveur par champ.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { suggestCategoryAction } from '@/app/actions/ai';
import { getCategoryBreakdownAction } from '@/app/actions/dashboard';
import { createTransactionAction, updateTransactionAction } from '@/app/actions/transactions';
import { AiBadge } from '@/components/shared/ai-badge';
import { AmountInput } from '@/components/shared/amount-input';
import { CategoryIcon } from '@/components/shared/category-icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import type { CategoryPrediction } from '@/domain/ai/types';
import { addDays, type ISODate } from '@/domain/dates';
import type { Transaction, TransactionType } from '@/domain/types';
import { useCategories, useTags } from '@/lib/hooks/use-reference-data';
import { ActionError, errorMessage, queryKeys, unwrap } from '@/lib/query';
import { transactionInputSchema, type TransactionInput } from '@/lib/schemas/transactions';
import { cn } from '@/lib/utils';
import { useAllAccounts } from '@/components/accounts/use-all-accounts';
import { invalidateFinanceQueries } from './cache';
import { readLastAccountId, writeLastAccountId } from './last-account';
import {
  FORM_FIELDS,
  diffInput,
  isFormField,
  normalizedNote,
  pickFrequent,
  toFieldErrors,
  type FieldErrors,
  type FormField,
} from './form-utils';
import { readAmountField } from './read-amount';
import { TagInput } from './tag-input';

export interface TransactionFormProps {
  defaultValues?: Partial<TransactionInput>;
  onSuccess?: (t: Transaction) => void;
  today: ISODate;
  mode?: 'create' | 'edit';
  transactionId?: string;
  /** Élément focalisé au montage (défaut : « Montant ») */
  initialFocus?: 'amount' | 'submit' | 'none';
}

const NO_CATEGORY = '__none__';
const SUGGEST_DEBOUNCE_MS = 400;
/** Montant neutre utilisé pour la suggestion tant que le montant n'est pas saisi (10 DT). */
const SUGGEST_FALLBACK_AMOUNT = 10_000;

const TYPE_OPTIONS: { value: TransactionType; label: string; icon: typeof ArrowUpRight }[] = [
  { value: 'EXPENSE', label: 'Dépense', icon: ArrowUpRight },
  { value: 'INCOME', label: 'Revenu', icon: ArrowDownLeft },
  { value: 'TRANSFER', label: 'Virement', icon: ArrowLeftRight },
];

export function TransactionForm({
  defaultValues,
  onSuccess,
  today,
  mode = 'create',
  transactionId,
  initialFocus = 'amount',
}: TransactionFormProps) {
  const queryClient = useQueryClient();
  const baseId = useId();
  const ids = {
    type: `${baseId}-type`,
    amount: `${baseId}-amount`,
    date: `${baseId}-date`,
    label: `${baseId}-label`,
    categoryId: `${baseId}-category`,
    accountId: `${baseId}-account`,
    transferAccountId: `${baseId}-transfer`,
    tags: `${baseId}-tags`,
    note: `${baseId}-note`,
  } satisfies Record<FormField, string>;
  const errorId = (f: FormField) => `${ids[f]}-error`;

  const [initial] = useState<Partial<TransactionInput>>(() => ({ ...defaultValues }));
  const [type, setType] = useState<TransactionType>(defaultValues?.type ?? 'EXPENSE');
  const [amount, setAmount] = useState<number | null>(defaultValues?.amount ?? null);
  const [label, setLabel] = useState(defaultValues?.label ?? '');
  const [date, setDate] = useState<ISODate>(defaultValues?.date ?? today);
  /** undefined = non choisie (IA côté serveur) ; null = « Sans catégorie » */
  const [categoryChoice, setCategoryChoice] = useState<string | null | undefined>(
    defaultValues?.categoryId,
  );
  const [accountChoice, setAccountChoice] = useState<string | null>(
    defaultValues?.accountId ?? null,
  );
  const [lastAccountId] = useState<string | null>(() =>
    mode === 'create' && !defaultValues?.accountId ? readLastAccountId() : null,
  );
  const [transferAccountId, setTransferAccountId] = useState<string | null>(
    defaultValues?.transferAccountId ?? null,
  );
  const [tags, setTags] = useState<string[]>(defaultValues?.tags ?? []);
  const [note, setNote] = useState(defaultValues?.note ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{
    prediction: CategoryPrediction;
    type: TransactionType;
  } | null>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  const accountsQuery = useAllAccounts();
  const categoriesQuery = useCategories();
  const tagsQuery = useTags();
  const allAccounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const kind = type === 'TRANSFER' ? null : type;
  const kindCategories = useMemo(
    () => categories.filter((c) => c.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder),
    [categories, kind],
  );

  const activeAccounts = allAccounts.filter((a) => !a.archived);
  const fallbackAccountId =
    (lastAccountId && activeAccounts.some((a) => a.id === lastAccountId) ? lastAccountId : null) ??
    activeAccounts[0]?.id ??
    null;
  const accountId = accountChoice ?? fallbackAccountId;
  const accountOptions = allAccounts.filter(
    (a) => !a.archived || a.id === accountId || a.id === initial.accountId,
  );
  const transferOptions = allAccounts.filter(
    (a) => a.id !== accountId && (!a.archived || a.id === initial.transferAccountId),
  );

  // Catégories fréquentes : répartition des 90 derniers jours.
  const breakdownParams = {
    from: addDays(today, -90),
    to: today,
    type: kind ?? 'EXPENSE',
  } as const;
  const breakdown = useQuery({
    queryKey: queryKeys.breakdown(breakdownParams),
    queryFn: async () => unwrap(await getCategoryBreakdownAction(breakdownParams)),
    enabled: kind !== null,
    staleTime: 5 * 60_000,
  });
  const frequent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of breakdown.data ?? []) if (s.categoryId) counts.set(s.categoryId, s.count);
    return pickFrequent(kindCategories, counts, 6);
  }, [breakdown.data, kindCategories]);

  // Suggestion IA (nouvelle transaction, catégorie non choisie), debouncée.
  useEffect(() => {
    if (mode !== 'create' || categoryChoice !== undefined || type === 'TRANSFER') return;
    const text = label.trim();
    if (text.length < 2) return;
    let cancelled = false;
    const flowType = type;
    const timer = window.setTimeout(() => {
      suggestCategoryAction({
        label: text,
        amount: amount ?? SUGGEST_FALLBACK_AMOUNT,
        type: flowType,
      })
        .then((r) => {
          if (cancelled || !r.ok) return;
          setSuggestion(r.value ? { prediction: r.value, type: flowType } : null);
        })
        .catch(() => {
          // La suggestion est facultative : un échec réseau ne bloque pas la saisie.
        });
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode, categoryChoice, type, label, amount]);

  const activeSuggestion =
    mode === 'create' &&
    categoryChoice === undefined &&
    suggestion !== null &&
    suggestion.type === type &&
    label.trim().length >= 2 &&
    categoryById.get(suggestion.prediction.categoryId)?.kind === type
      ? suggestion.prediction
      : null;
  const effectiveCategoryId =
    categoryChoice !== undefined ? categoryChoice : (activeSuggestion?.categoryId ?? null);
  const categoryValue =
    categoryChoice === null ? NO_CATEGORY : (categoryChoice ?? activeSuggestion?.categoryId ?? '');

  useEffect(() => {
    if (initialFocus === 'submit') submitRef.current?.focus();
  }, [initialFocus]);

  const mutation = useMutation({
    mutationFn: async (input: TransactionInput): Promise<Transaction> => {
      if (mode === 'edit') {
        if (!transactionId) throw new Error('Transaction introuvable.');
        const r = unwrap(await updateTransactionAction(transactionId, diffInput(initial, input)));
        return r.after;
      }
      return unwrap(await createTransactionAction(input));
    },
    onSuccess: (t) => {
      if (mode === 'create') writeLastAccountId(t.accountId);
      onSuccess?.(t);
      return invalidateFinanceQueries(queryClient);
    },
    onError: (e) => {
      if (e instanceof ActionError && e.fieldErrors) {
        const fieldErrors = toFieldErrors(e.fieldErrors);
        setErrors(fieldErrors);
        focusFirstError(fieldErrors);
      }
      setFormError(errorMessage(e));
    },
  });

  function clearError(field: FormField) {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function focusFirstError(fieldErrors: FieldErrors) {
    const first = FORM_FIELDS.find((f) => fieldErrors[f]);
    if (first) document.getElementById(ids[first])?.focus();
  }

  function changeType(next: TransactionType) {
    setType(next);
    if (typeof categoryChoice === 'string' && categoryById.get(categoryChoice)?.kind !== next) {
      setCategoryChoice(undefined);
    }
    clearError('categoryId');
    clearError('transferAccountId');
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mutation.isPending) return;
    setFormError(null);

    const amountRead = readAmountField(ids.amount, amount);
    const pre: FieldErrors = {};
    if (amountRead.error) pre.amount = amountRead.error;
    else if (amountRead.value === null) pre.amount = 'Saisissez un montant.';
    if (!accountId) pre.accountId = 'Choisissez un compte.';
    if (type === 'TRANSFER' && !transferAccountId) {
      pre.transferAccountId = 'Choisissez le compte destinataire.';
    }

    const base = {
      type,
      amount: amountRead.value ?? 0,
      date,
      label,
      accountId: accountId ?? '',
      tags,
      note: normalizedNote(note),
    };
    const input: TransactionInput =
      type === 'TRANSFER'
        ? { ...base, categoryId: null, transferAccountId: transferAccountId ?? '' }
        : {
            ...base,
            transferAccountId: null,
            ...(effectiveCategoryId !== null || categoryChoice === null
              ? { categoryId: effectiveCategoryId }
              : {}),
          };

    const parsed = transactionInputSchema.safeParse(input);
    const zodErrors: FieldErrors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '');
        if (isFormField(key) && !zodErrors[key]) zodErrors[key] = issue.message;
      }
    }
    const all: FieldErrors = { ...zodErrors, ...pre };
    if (Object.keys(all).length > 0) {
      setErrors(all);
      focusFirstError(all);
      return;
    }
    setErrors({});
    mutation.mutate(input);
  }

  function onFormKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.currentTarget.requestSubmit();
    }
  }

  const fieldProps = (f: FormField) => ({
    'aria-invalid': errors[f] ? true : undefined,
    'aria-describedby': errors[f] ? errorId(f) : undefined,
  });

  if (accountsQuery.isPending || categoriesQuery.isPending) {
    return (
      <div className="grid gap-4" aria-busy="true" aria-label="Chargement du formulaire">
        <Skeleton className="h-11 w-full" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="ml-auto h-11 w-32" />
      </div>
    );
  }

  if (activeAccounts.length === 0 && mode === 'create') {
    return (
      <div className="grid gap-3 text-sm">
        <p>
          Créez d&apos;abord un compte (espèces, banque ou carte) pour enregistrer une transaction.
        </p>
        <Button asChild variant="outline" className="justify-self-start">
          <Link href="/comptes">Gérer mes comptes</Link>
        </Button>
      </div>
    );
  }

  const yesterday = addDays(today, -1);

  return (
    <form noValidate onSubmit={handleSubmit} onKeyDown={onFormKeyDown} className="grid gap-4">
      {formError && (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {formError}
        </div>
      )}

      <div className="grid gap-2">
        <span id={ids.type} className="text-sm leading-none font-medium">
          Type
        </span>
        <div
          role="radiogroup"
          aria-labelledby={ids.type}
          className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1"
        >
          {TYPE_OPTIONS.map((o) => {
            const Icon = o.icon;
            const checked = type === o.value;
            return (
              <label
                key={o.value}
                className={cn(
                  'text-muted-foreground flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors',
                  'has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-2',
                  checked && 'bg-background text-foreground shadow-sm',
                  checked && o.value === 'EXPENSE' && 'text-expense',
                  checked && o.value === 'INCOME' && 'text-income',
                )}
              >
                <input
                  type="radio"
                  name={`${baseId}-type-radio`}
                  value={o.value}
                  checked={checked}
                  onChange={() => changeType(o.value)}
                  className="sr-only"
                />
                <Icon className="size-4" aria-hidden />
                {o.label}
              </label>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Montant"
          htmlFor={ids.amount}
          error={errors.amount}
          errorId={errorId('amount')}
        >
          <AmountInput
            id={ids.amount}
            value={amount}
            onChange={(m) => {
              setAmount(m);
              clearError('amount');
            }}
            autoFocus={initialFocus === 'amount'}
            placeholder="0,000"
            {...fieldProps('amount')}
          />
        </Field>

        <Field label="Date" htmlFor={ids.date} error={errors.date} errorId={errorId('date')}>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={ids.date}
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                clearError('date');
              }}
              className="min-h-11 min-w-0 flex-1"
              {...fieldProps('date')}
            />
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant={date === today ? 'secondary' : 'ghost'}
                aria-pressed={date === today}
                onClick={() => setDate(today)}
              >
                Aujourd&apos;hui
              </Button>
              <Button
                type="button"
                size="sm"
                variant={date === yesterday ? 'secondary' : 'ghost'}
                aria-pressed={date === yesterday}
                onClick={() => setDate(yesterday)}
              >
                Hier
              </Button>
            </div>
          </div>
        </Field>
      </div>

      <Field label="Libellé" htmlFor={ids.label} error={errors.label} errorId={errorId('label')}>
        <Input
          id={ids.label}
          value={label}
          maxLength={140}
          autoComplete="off"
          placeholder={type === 'INCOME' ? 'Salaire, remboursement…' : 'Café, courses, louage…'}
          onChange={(e) => {
            setLabel(e.target.value);
            clearError('label');
          }}
          className="min-h-11"
          {...fieldProps('label')}
        />
      </Field>

      {type !== 'TRANSFER' && (
        <div className="grid gap-2">
          <div className="flex min-h-5 items-center gap-2">
            <Label htmlFor={ids.categoryId}>Catégorie</Label>
            {activeSuggestion && (
              <AiBadge label="Suggestion" confidence={activeSuggestion.confidence} />
            )}
          </div>
          <Select
            value={categoryValue}
            onValueChange={(v) => {
              setCategoryChoice(v === NO_CATEGORY ? null : v);
              clearError('categoryId');
            }}
          >
            <SelectTrigger
              id={ids.categoryId}
              className="min-h-11 w-full"
              {...fieldProps('categoryId')}
            >
              <SelectValue placeholder="Automatique" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CATEGORY}>Sans catégorie</SelectItem>
              {kindCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {frequent.length > 0 && (
            <div role="group" aria-label="Catégories fréquentes" className="flex flex-wrap gap-1.5">
              {frequent.map((c) => {
                const pressed = effectiveCategoryId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => {
                      setCategoryChoice(c.id);
                      clearError('categoryId');
                    }}
                    className={cn(
                      'border-border hover:bg-accent focus-visible:ring-ring inline-flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
                      pressed && 'border-primary bg-primary/10 text-primary',
                    )}
                  >
                    <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}
          {mode === 'create' && categoryChoice === undefined && !activeSuggestion && (
            <p className="text-muted-foreground text-xs">
              Sans choix de votre part, une catégorie sera proposée automatiquement.
            </p>
          )}
          <FieldErrorText id={errorId('categoryId')} message={errors.categoryId} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Compte"
          htmlFor={ids.accountId}
          error={errors.accountId}
          errorId={errorId('accountId')}
        >
          <Select
            value={accountId ?? ''}
            onValueChange={(v) => {
              setAccountChoice(v);
              if (v === transferAccountId) setTransferAccountId(null);
              clearError('accountId');
            }}
          >
            <SelectTrigger
              id={ids.accountId}
              className="min-h-11 w-full"
              {...fieldProps('accountId')}
            >
              <SelectValue placeholder="Choisir un compte" />
            </SelectTrigger>
            <SelectContent>
              {accountOptions.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                  {a.archived ? ' (archivé)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {type === 'TRANSFER' && (
          <Field
            label="Compte destinataire"
            htmlFor={ids.transferAccountId}
            error={errors.transferAccountId}
            errorId={errorId('transferAccountId')}
          >
            <Select
              value={transferAccountId ?? ''}
              onValueChange={(v) => {
                setTransferAccountId(v);
                clearError('transferAccountId');
              }}
            >
              <SelectTrigger
                id={ids.transferAccountId}
                className="min-h-11 w-full"
                {...fieldProps('transferAccountId')}
              >
                <SelectValue placeholder="Choisir le compte destinataire" />
              </SelectTrigger>
              <SelectContent>
                {transferOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                    {a.archived ? ' (archivé)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>

      <Field label="Tags" htmlFor={ids.tags} error={errors.tags} errorId={errorId('tags')}>
        <TagInput
          id={ids.tags}
          value={tags}
          onChange={(t) => {
            setTags(t);
            clearError('tags');
          }}
          suggestions={(tagsQuery.data ?? []).map((t) => t.name)}
          {...fieldProps('tags')}
        />
      </Field>

      <Field label="Note" htmlFor={ids.note} error={errors.note} errorId={errorId('note')}>
        <Textarea
          id={ids.note}
          value={note}
          maxLength={500}
          rows={2}
          onChange={(e) => {
            setNote(e.target.value);
            clearError('note');
          }}
          {...fieldProps('note')}
        />
      </Field>

      <div className="flex items-center justify-end gap-3 pt-1">
        <span className="text-muted-foreground hidden text-xs sm:inline">
          <kbd className="font-sans">Ctrl</kbd> + <kbd className="font-sans">Entrée</kbd>
        </span>
        <Button
          ref={submitRef}
          type="submit"
          disabled={mutation.isPending}
          className="min-h-11 min-w-32"
        >
          {mutation.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Enregistrer
        </Button>
      </div>
    </form>
  );
}

function FieldErrorText({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="text-destructive text-sm">
      {message}
    </p>
  );
}

function Field({
  label,
  htmlFor,
  error,
  errorId,
  children,
}: {
  label: string;
  htmlFor: string;
  error: string | undefined;
  errorId: string;
  children: ReactNode;
}) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      <FieldErrorText id={errorId} message={error} />
    </div>
  );
}
