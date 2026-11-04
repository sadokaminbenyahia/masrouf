'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { createAccountAction, updateAccountAction } from '@/app/actions/accounts';
import { AmountInput } from '@/components/shared/amount-input';
import { ResponsiveDialog } from '@/components/transactions/edit-transaction-dialog';
import { invalidateFinanceQueries } from '@/components/transactions/cache';
import { readAmountField } from '@/components/transactions/read-amount';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  ACCOUNT_TYPES,
  type Account,
  type AccountType,
  type AccountWithBalance,
} from '@/domain/types';
import { ActionError, errorMessage, unwrap } from '@/lib/query';
import { accountInputSchema, type AccountInput } from '@/lib/schemas/accounts';
import { toastSuccess } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { ACCOUNT_COLORS, ACCOUNT_TYPE_META, DEFAULT_ACCOUNT_COLOR } from './account-meta';
import { splitBalance, toSignedBalance } from './balance';

type Field = 'name' | 'type' | 'initialBalance' | 'color';
type Errors = Partial<Record<Field, string>>;
const FIELDS: readonly Field[] = ['name', 'type', 'initialBalance', 'color'];
const isField = (k: string): k is Field => (FIELDS as readonly string[]).includes(k);

interface AccountFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Compte à modifier ; absent = création */
  account?: AccountWithBalance | null;
}

export function AccountFormDialog({ open, onOpenChange, account }: AccountFormDialogProps) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={account ? 'Modifier le compte' : 'Nouveau compte'}
      description="Le solde affiché est calculé à partir du solde initial et des transactions."
    >
      {open && (
        <AccountForm
          key={account?.id ?? 'new'}
          account={account ?? null}
          onDone={() => onOpenChange(false)}
        />
      )}
    </ResponsiveDialog>
  );
}

function AccountForm({ account, onDone }: { account: Account | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const uid = useId();
  const ids = {
    name: `${uid}-name`,
    type: `${uid}-type`,
    initialBalance: `${uid}-balance`,
    negative: `${uid}-negative`,
    color: `${uid}-color`,
  };
  const initialSplit = splitBalance(account?.initialBalance ?? 0);
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'BANK');
  const [balance, setBalance] = useState<number | null>(initialSplit.amount);
  const [negative, setNegative] = useState(initialSplit.negative);
  const [color, setColor] = useState(account?.color ?? DEFAULT_ACCOUNT_COLOR);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (input: AccountInput) =>
      account
        ? unwrap(await updateAccountAction(account.id, input))
        : unwrap(await createAccountAction(input)),
    onSuccess: () => {
      toastSuccess(account ? 'Compte modifié' : 'Compte créé');
      onDone();
      return invalidateFinanceQueries(queryClient);
    },
    onError: (e) => {
      if (e instanceof ActionError && e.fieldErrors) {
        const next: Errors = {};
        for (const [k, msgs] of Object.entries(e.fieldErrors)) {
          const key = k.split('.')[0] ?? '';
          if (isField(key) && msgs[0] && !next[key]) next[key] = msgs[0];
        }
        setErrors(next);
      }
      setFormError(errorMessage(e));
    },
  });

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mutation.isPending) return;
    setFormError(null);
    const read = readAmountField(ids.initialBalance, balance);
    const input: AccountInput = {
      name,
      type,
      initialBalance: toSignedBalance(read.value, negative),
      color,
    };
    const next: Errors = {};
    if (read.error) next.initialBalance = read.error;
    const parsed = accountInputSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '');
        if (isField(key) && !next[key]) next[key] = issue.message;
      }
    }
    setErrors(next);
    const first = FIELDS.find((f) => next[f]);
    if (first) {
      document.getElementById(ids[first])?.focus();
      return;
    }
    mutation.mutate(input);
  }

  const describe = (f: Field) =>
    errors[f] ? { 'aria-invalid': true as const, 'aria-describedby': `${ids[f]}-error` } : {};
  const errorText = (f: Field) =>
    errors[f] ? (
      <p id={`${ids[f]}-error`} className="text-destructive text-sm">
        {errors[f]}
      </p>
    ) : null;

  return (
    <form noValidate onSubmit={submit} className="grid gap-4">
      {formError && (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {formError}
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor={ids.name}>Nom</Label>
        <Input
          id={ids.name}
          value={name}
          maxLength={60}
          autoFocus
          autoComplete="off"
          placeholder="BIAT, Espèces, Carte Visa…"
          onChange={(e) => setName(e.target.value)}
          className="min-h-11"
          {...describe('name')}
        />
        {errorText('name')}
      </div>

      <div className="grid gap-2">
        <span id={ids.type} className="text-sm leading-none font-medium">
          Type de compte
        </span>
        <div
          role="radiogroup"
          aria-labelledby={ids.type}
          className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1"
        >
          {ACCOUNT_TYPES.map((t) => {
            const meta = ACCOUNT_TYPE_META[t];
            const Icon = meta.icon;
            const checked = type === t;
            return (
              <label
                key={t}
                className={cn(
                  'text-muted-foreground flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors',
                  'has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-2',
                  checked && 'bg-background text-foreground shadow-sm',
                )}
              >
                <input
                  type="radio"
                  name={`${uid}-account-type`}
                  value={t}
                  checked={checked}
                  onChange={() => setType(t)}
                  className="sr-only"
                />
                <Icon className="size-4" aria-hidden />
                {meta.label}
              </label>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={ids.initialBalance}>Solde initial</Label>
        <AmountInput
          id={ids.initialBalance}
          value={balance}
          onChange={setBalance}
          placeholder="0"
          {...describe('initialBalance')}
        />
        <div className="flex items-center gap-2">
          <Switch id={ids.negative} checked={negative} onCheckedChange={setNegative} />
          <Label htmlFor={ids.negative} className="font-normal">
            Solde négatif
          </Label>
        </div>
        <p className="text-muted-foreground text-xs">
          Activez-le pour une carte ou un compte à découvert au moment de la création.
        </p>
        {errorText('initialBalance')}
      </div>

      <div className="grid gap-2">
        <span id={ids.color} className="text-sm leading-none font-medium">
          Couleur
        </span>
        <div role="radiogroup" aria-labelledby={ids.color} className="flex flex-wrap gap-2">
          {ACCOUNT_COLORS.map((c) => {
            const checked = color.toLowerCase() === c.value.toLowerCase();
            return (
              <label
                key={c.value}
                className={cn(
                  'ring-offset-background relative flex size-11 cursor-pointer items-center justify-center rounded-full ring-offset-2 transition-shadow',
                  'has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-2',
                  checked && 'ring-foreground ring-2',
                )}
                style={{ backgroundColor: c.value }}
              >
                <input
                  type="radio"
                  name={`${uid}-color-radio`}
                  value={c.value}
                  checked={checked}
                  onChange={() => setColor(c.value)}
                  aria-label={c.label}
                  className="sr-only"
                />
                {checked && <Check className="size-5 text-white" aria-hidden />}
              </label>
            );
          })}
        </div>
        {errorText('color')}
      </div>

      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={mutation.isPending} className="min-h-11 min-w-32">
          {mutation.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
