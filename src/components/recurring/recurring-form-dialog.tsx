'use client';
import { useId, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import type { ISODate } from '@/domain/dates';
import type { AccountWithBalance, Category, Frequency, RecurringRule } from '@/domain/types';
import { ActionError, errorMessage } from '@/lib/query';
import { zodFieldErrors } from '@/lib/schemas/common';
import {
  recurringInputSchema,
  recurringPatchSchema,
  type RecurringInput,
  type RecurringPatch,
} from '@/lib/schemas/recurring';
import { toastSuccess } from '@/lib/toast';
import { AmountInput } from '@/components/shared/amount-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { FREQUENCY_OPTIONS } from './recurring-math';
import { useCreateRecurring, useUpdateRecurring } from './use-recurring';

const NO_CATEGORY = '__none__';

type FlowType = 'EXPENSE' | 'INCOME';

interface FormValues {
  label: string;
  amount: number | null;
  type: FlowType;
  categoryId: string | null;
  accountId: string;
  frequency: Frequency;
  /** Date de début (création) ou prochaine échéance (modification) */
  date: ISODate;
  endDate: ISODate | '';
  autoCreate: boolean;
}

interface RecurringFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Règle à modifier ; absente = création */
  rule: RecurringRule | null;
  accounts: AccountWithBalance[];
  categories: Category[];
  today: ISODate;
}

function initialValues(
  rule: RecurringRule | null,
  accounts: AccountWithBalance[],
  today: ISODate,
): FormValues {
  if (rule) {
    return {
      label: rule.label,
      amount: rule.amount,
      type: rule.type,
      categoryId: rule.categoryId,
      accountId: rule.accountId,
      frequency: rule.frequency,
      date: rule.nextDate,
      endDate: rule.endDate ?? '',
      autoCreate: rule.autoCreate,
    };
  }
  const active = accounts.filter((a) => !a.archived);
  return {
    label: '',
    amount: null,
    type: 'EXPENSE',
    categoryId: null,
    accountId: (active.find((a) => a.type === 'BANK') ?? active[0])?.id ?? '',
    frequency: 'MONTHLY',
    date: today,
    endDate: '',
    autoCreate: true,
  };
}

function FieldError({ id, messages }: { id: string; messages: string[] | undefined }) {
  if (!messages || messages.length === 0) return null;
  return (
    <p id={id} className="text-expense text-sm">
      {messages[0]}
    </p>
  );
}

function RecurringForm({
  rule,
  accounts,
  categories,
  today,
  onDone,
}: Omit<RecurringFormDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const ids = {
    label: useId(),
    amount: useId(),
    category: useId(),
    account: useId(),
    frequency: useId(),
    date: useId(),
    endDate: useId(),
    autoCreate: useId(),
    type: useId(),
  };
  const editing = rule !== null;
  const [values, setValues] = useState<FormValues>(() => initialValues(rule, accounts, today));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const create = useCreateRecurring();
  const update = useUpdateRecurring();
  const pending = create.isPending || update.isPending;

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const kindCategories = categories.filter((c) => c.kind === values.type);
  const activeAccounts = accounts.filter((a) => !a.archived || a.id === values.accountId);

  const fail = (e: unknown) => {
    if (e instanceof ActionError && e.fieldErrors) setErrors(remapErrors(e.fieldErrors));
    setFormError(errorMessage(e));
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    if (values.amount === null) {
      setErrors({ amount: ['Montant requis.'] });
      return;
    }
    const endDate = values.endDate === '' ? null : values.endDate;

    if (!editing) {
      const input: RecurringInput = {
        accountId: values.accountId,
        categoryId: values.categoryId,
        type: values.type,
        amount: values.amount,
        label: values.label,
        frequency: values.frequency,
        startDate: values.date,
        endDate,
        autoCreate: values.autoCreate,
      };
      const parsed = recurringInputSchema.safeParse(input);
      if (!parsed.success) {
        setErrors(remapErrors(zodFieldErrors(parsed.error)));
        return;
      }
      setErrors({});
      create.mutate(input, {
        onSuccess: (r) => {
          toastSuccess(`Récurrence « ${r.label} » ajoutée.`);
          onDone();
        },
        onError: fail,
      });
      return;
    }

    const patch: RecurringPatch = {
      accountId: values.accountId,
      categoryId: values.categoryId,
      amount: values.amount,
      label: values.label,
      frequency: values.frequency,
      nextDate: values.date,
      endDate,
      autoCreate: values.autoCreate,
    };
    const parsed = recurringPatchSchema.safeParse(patch);
    const fieldErrors = parsed.success ? {} : remapErrors(zodFieldErrors(parsed.error));
    if (endDate !== null && endDate < values.date) {
      fieldErrors.endDate = ['La date de fin doit suivre la prochaine échéance.'];
    }
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    update.mutate(
      { id: rule.id, patch },
      {
        onSuccess: (r) => {
          toastSuccess(`Récurrence « ${r.label} » modifiée.`);
          onDone();
        },
        onError: fail,
      },
    );
  };

  const described = (key: keyof typeof ids, errorKey: string = key) =>
    errors[errorKey] ? `${ids[key]}-error` : undefined;

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor={ids.label}>Libellé</Label>
        <Input
          id={ids.label}
          value={values.label}
          onChange={(e) => set('label', e.target.value)}
          placeholder="Loyer, Netflix, STEG…"
          maxLength={140}
          autoFocus
          aria-invalid={errors.label ? true : undefined}
          aria-describedby={described('label')}
        />
        <FieldError id={`${ids.label}-error`} messages={errors.label} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={ids.amount}>Montant</Label>
          <AmountInput
            id={ids.amount}
            value={values.amount}
            onChange={(m) => set('amount', m)}
            placeholder="0,000"
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={described('amount')}
          />
          <FieldError id={`${ids.amount}-error`} messages={errors.amount} />
        </div>
        <fieldset className="grid gap-1.5" disabled={editing}>
          <legend id={ids.type} className="mb-1.5 text-sm font-medium">
            Type
          </legend>
          <RadioGroup
            aria-labelledby={ids.type}
            value={values.type}
            onValueChange={(v) => {
              if (v !== 'EXPENSE' && v !== 'INCOME') return;
              setValues((cur) => {
                const keep = categories.find((c) => c.id === cur.categoryId)?.kind === v;
                return { ...cur, type: v, categoryId: keep ? cur.categoryId : null };
              });
            }}
            className="flex min-h-10 items-center gap-5"
          >
            {(
              [
                ['EXPENSE', 'Dépense'],
                ['INCOME', 'Revenu'],
              ] as const
            ).map(([value, label]) => (
              <div key={value} className="flex items-center gap-2">
                <RadioGroupItem value={value} id={`${ids.type}-${value}`} />
                <Label htmlFor={`${ids.type}-${value}`} className="font-normal">
                  {label}
                </Label>
              </div>
            ))}
          </RadioGroup>
          {editing && (
            <p className="text-muted-foreground text-xs">Le type ne peut pas être modifié.</p>
          )}
        </fieldset>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={ids.category}>Catégorie</Label>
          <Select
            value={values.categoryId ?? NO_CATEGORY}
            onValueChange={(v) => set('categoryId', v === NO_CATEGORY ? null : v)}
          >
            <SelectTrigger id={ids.category}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CATEGORY}>Sans catégorie</SelectItem>
              {kindCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={ids.account}>Compte</Label>
          <Select value={values.accountId || undefined} onValueChange={(v) => set('accountId', v)}>
            <SelectTrigger
              id={ids.account}
              aria-invalid={errors.accountId ? true : undefined}
              aria-describedby={described('account', 'accountId')}
            >
              <SelectValue placeholder="Choisir un compte" />
            </SelectTrigger>
            <SelectContent>
              {activeAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id={`${ids.account}-error`} messages={errors.accountId} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={ids.frequency}>Fréquence</Label>
        <Select
          value={values.frequency}
          onValueChange={(v) => {
            const found = FREQUENCY_OPTIONS.find((o) => o.value === v);
            if (found) set('frequency', found.value);
          }}
        >
          <SelectTrigger id={ids.frequency}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FREQUENCY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={ids.date}>{editing ? 'Prochaine échéance' : 'Date de début'}</Label>
          <Input
            id={ids.date}
            type="date"
            value={values.date}
            onChange={(e) => set('date', e.target.value)}
            required
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={described('date')}
          />
          <FieldError id={`${ids.date}-error`} messages={errors.date} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={ids.endDate}>Date de fin (facultatif)</Label>
          <Input
            id={ids.endDate}
            type="date"
            value={values.endDate}
            min={values.date}
            onChange={(e) => set('endDate', e.target.value)}
            aria-invalid={errors.endDate ? true : undefined}
            aria-describedby={described('endDate')}
          />
          <FieldError id={`${ids.endDate}-error`} messages={errors.endDate} />
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-xl border p-3">
        <div className="space-y-1">
          <Label htmlFor={ids.autoCreate}>Création automatique</Label>
          <p id={`${ids.autoCreate}-help`} className="text-muted-foreground text-sm">
            La transaction est ajoutée toute seule à chaque échéance.
          </p>
        </div>
        <Switch
          id={ids.autoCreate}
          checked={values.autoCreate}
          onCheckedChange={(v) => set('autoCreate', v)}
          aria-describedby={`${ids.autoCreate}-help`}
        />
      </div>

      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Annuler
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && (
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          )}
          Enregistrer
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Ramène les chemins d'erreur serveur/Zod vers les champs du formulaire. */
function remapErrors(fieldErrors: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    const field = key.replace(/^patch\./, '');
    const mapped = field === 'startDate' || field === 'nextDate' ? 'date' : field;
    out[mapped] = [...(out[mapped] ?? []), ...messages];
  }
  return out;
}

export function RecurringFormDialog({
  open,
  onOpenChange,
  rule,
  accounts,
  categories,
  today,
}: RecurringFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{rule ? 'Modifier la récurrence' : 'Nouvelle récurrence'}</DialogTitle>
          <DialogDescription>
            {rule
              ? 'Les modifications s’appliquent aux prochaines échéances.'
              : 'Loyer, abonnement, facture… Masrouf vous rappelle chaque échéance.'}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <RecurringForm
            key={rule?.id ?? 'new'}
            rule={rule}
            accounts={accounts}
            categories={categories}
            today={today}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
