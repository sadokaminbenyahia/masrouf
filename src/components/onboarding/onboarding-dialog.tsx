'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRightIcon,
  CompassIcon,
  Loader2Icon,
  ReceiptIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UploadIcon,
  WalletIcon,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Millimes } from '@/domain/money';
import type { AccountWithBalance, Category } from '@/domain/types';
import { updateAccountAction } from '@/app/actions/accounts';
import { upsertBudgetAction } from '@/app/actions/budgets';
import { completeOnboardingAction } from '@/app/actions/user';
import { AmountInput } from '@/components/shared/amount-input';
import { CategoryIcon } from '@/components/shared/category-icon';
import { Money } from '@/components/shared/money';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { openQuickAdd } from '@/lib/events';
import { errorMessage, queryKeys, unwrap } from '@/lib/query';
import { toastError, toastSuccess } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { proposeBudgets, split503020 } from './budget-proposals';

const STEPS = ['Bienvenue', 'Vos comptes', 'Votre revenu', 'Première action'] as const;
const ACCOUNT_TYPE_LABELS = { CASH: 'Espèces', BANK: 'Banque', CARD: 'Carte' } as const;

export interface OnboardingDialogProps {
  userName: string;
  accounts: AccountWithBalance[];
  categories: Category[];
}

type FinalChoice = 'expense' | 'import' | 'explore';

export function OnboardingDialog({ userName, accounts, categories }: OnboardingDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [saving, startSaving] = useTransition();

  const [balances, setBalances] = useState<Record<string, Millimes | null>>(() =>
    Object.fromEntries(
      accounts.map((a) => [a.id, a.initialBalance > 0 ? a.initialBalance : null] as const),
    ),
  );
  const [income, setIncome] = useState<Millimes | null>(null);
  const [unchecked, setUnchecked] = useState<Set<string>>(() => new Set());
  const proposals = income ? proposeBudgets(income, categories) : [];
  const isLast = step === STEPS.length - 1;

  const goTo = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  const finish = (choice: FinalChoice | 'skip') => {
    setOpen(false);
    startSaving(async () => {
      try {
        unwrap(await completeOnboardingAction());
      } catch (e) {
        toastError(errorMessage(e));
      }
      router.refresh();
      if (choice === 'expense') openQuickAdd();
      if (choice === 'import') router.push('/import');
    });
  };

  const saveAccounts = async () => {
    const changed = accounts.filter((a) => {
      const v = balances[a.id] ?? 0;
      return v !== a.initialBalance;
    });
    for (const a of changed) {
      unwrap(await updateAccountAction(a.id, { initialBalance: balances[a.id] ?? 0 }));
    }
    if (changed.length > 0) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
    }
  };

  const saveBudgets = async () => {
    const selected = proposals.filter((p) => !unchecked.has(p.categoryId));
    for (const p of selected) {
      unwrap(await upsertBudgetAction({ categoryId: p.categoryId, amount: p.amount }));
    }
    if (selected.length > 0) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.budgets() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
      toastSuccess(selected.length === 1 ? '1 budget créé.' : `${selected.length} budgets créés.`);
    }
  };

  const next = () => {
    startSaving(async () => {
      try {
        if (step === 1) await saveAccounts();
        if (step === 2) await saveBudgets();
        goTo(step + 1);
      } catch (e) {
        toastError(errorMessage(e));
      }
    });
  };

  const offset = reduceMotion ? 0 : 24;
  const progressValue = ((step + 1) / STEPS.length) * 100;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !saving) finish('skip');
      }}
    >
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-xl"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="bg-brand-tint/50 border-b px-6 pt-6 pb-4">
          <DialogHeader className="pr-0">
            <p className="text-primary text-xs font-medium tracking-wide uppercase">
              Étape {step + 1} sur {STEPS.length} · {STEPS[step]}
            </p>
            <DialogTitle className="text-xl">Bienvenue sur Masrouf</DialogTitle>
            <DialogDescription className="sr-only">
              Introduction en quatre étapes, chacune peut être passée.
            </DialogDescription>
          </DialogHeader>
          <Progress
            value={progressValue}
            className="mt-4 h-1.5"
            aria-label={`Progression : étape ${step + 1} sur ${STEPS.length}`}
          />
        </div>

        <div className="relative min-h-[19rem] overflow-hidden px-6 py-5">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              initial={{ opacity: 0, x: direction * offset }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -direction * offset }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              {step === 0 && <WelcomeStep userName={userName} />}
              {step === 1 && (
                <AccountsStep
                  accounts={accounts}
                  balances={balances}
                  onChange={(id, v) => setBalances((b) => ({ ...b, [id]: v }))}
                />
              )}
              {step === 2 && (
                <IncomeStep
                  income={income}
                  onIncome={setIncome}
                  proposals={proposals}
                  unchecked={unchecked}
                  onToggle={(id, checked) =>
                    setUnchecked((s) => {
                      const copy = new Set(s);
                      if (checked) copy.delete(id);
                      else copy.add(id);
                      return copy;
                    })
                  }
                />
              )}
              {step === 3 && <FirstActionStep onChoose={finish} disabled={saving} />}
            </motion.div>
          </AnimatePresence>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t px-6 py-4 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => finish('skip')}
            disabled={saving}
            className="text-muted-foreground"
          >
            Passer
          </Button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => goTo(step - 1)}
                disabled={saving}
              >
                Retour
              </Button>
            )}
            {isLast ? (
              <Button type="button" onClick={() => finish('explore')} disabled={saving}>
                Terminer
              </Button>
            ) : (
              <Button type="button" onClick={next} disabled={saving}>
                {saving ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : null}
                Suivant
                {!saving && <ArrowRightIcon aria-hidden="true" />}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepHeading({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{text}</p>
    </div>
  );
}

function WelcomeStep({ userName }: { userName: string }) {
  const points = [
    {
      icon: ReceiptIcon,
      title: 'Saisie éclair',
      text: 'Écrivez « café 3,500 hier » : Masrouf comprend et classe pour vous.',
    },
    {
      icon: SparklesIcon,
      title: 'IA 100 % locale',
      text: 'Catégorisation, prévisions et conseils sont calculés ici, sans service externe.',
    },
    {
      icon: ShieldCheckIcon,
      title: 'Vos données restent privées',
      text: 'Rien ne quitte votre installation. Le mode discret masque les montants en public.',
    },
  ];
  return (
    <div>
      <StepHeading
        title={`Bonjour ${userName} !`}
        text="En quelques étapes, préparons votre espace pour savoir où part chaque dinar."
      />
      <ul className="flex flex-col gap-3">
        {points.map(({ icon: Icon, title, text }) => (
          <li key={title} className="bg-card flex items-start gap-3 rounded-xl border p-3">
            <span className="bg-brand-tint text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
              <Icon className="size-[18px]" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-medium">{title}</span>
              <span className="text-muted-foreground block text-sm">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AccountsStep({
  accounts,
  balances,
  onChange,
}: {
  accounts: AccountWithBalance[];
  balances: Record<string, Millimes | null>;
  onChange: (id: string, v: Millimes | null) => void;
}) {
  return (
    <div>
      <StepHeading
        title="Vos soldes de départ"
        text="Indiquez ce que contient chaque compte aujourd'hui. Laissez vide pour commencer à zéro ; vous pourrez tout modifier dans « Comptes »."
      />
      {accounts.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
          Aucun compte pour l&apos;instant. Vous pourrez en créer depuis la page « Comptes ».
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {accounts.map((a) => {
            const id = `onboarding-solde-${a.id}`;
            return (
              <li
                key={a.id}
                className="bg-card flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <Label htmlFor={id} className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-9 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `color-mix(in oklab, ${a.color} 14%, transparent)` }}
                  >
                    <WalletIcon className="size-[18px]" style={{ color: a.color }} />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span>{a.name}</span>
                    <span className="text-muted-foreground text-xs font-normal">
                      {ACCOUNT_TYPE_LABELS[a.type]} · solde de départ
                    </span>
                  </span>
                </Label>
                <AmountInput
                  id={id}
                  value={balances[a.id] ?? null}
                  onChange={(v) => onChange(a.id, v)}
                  className="sm:w-40"
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function IncomeStep({
  income,
  onIncome,
  proposals,
  unchecked,
  onToggle,
}: {
  income: Millimes | null;
  onIncome: (v: Millimes | null) => void;
  proposals: ReturnType<typeof proposeBudgets>;
  unchecked: Set<string>;
  onToggle: (categoryId: string, checked: boolean) => void;
}) {
  const split = income ? split503020(income) : null;
  return (
    <div>
      <StepHeading
        title="Votre revenu mensuel"
        text="Nous proposons des budgets selon la règle 50/30/20 : 50 % pour les besoins, 30 % pour les envies, 20 % pour l'épargne."
      />
      <div className="grid gap-2">
        <Label htmlFor="onboarding-revenu">Revenu mensuel net</Label>
        <AmountInput
          id="onboarding-revenu"
          value={income}
          onChange={onIncome}
          placeholder="2 400"
          aria-describedby="onboarding-revenu-aide"
        />
        <p id="onboarding-revenu-aide" className="text-muted-foreground text-xs">
          Facultatif. Exemple : 2400 ou 2 400,500.
        </p>
      </div>

      {split && (
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          {(
            [
              ['Besoins', split.needs],
              ['Envies', split.wants],
              ['Épargne', split.savings],
            ] as const
          ).map(([label, v]) => (
            <div key={label} className="bg-muted rounded-lg px-2 py-2">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="text-sm font-semibold">
                <Money value={v} decimals={0} />
              </dd>
            </div>
          ))}
        </dl>
      )}

      {proposals.length > 0 && (
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium">Budgets proposés</legend>
          <ul className="flex flex-col gap-2">
            {proposals.map((p) => {
              const id = `onboarding-budget-${p.categoryId}`;
              const checked = !unchecked.has(p.categoryId);
              return (
                <li
                  key={p.categoryId}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border p-2.5 transition-colors',
                    checked ? 'bg-card' : 'bg-muted/50 opacity-75',
                  )}
                >
                  <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={(v) => onToggle(p.categoryId, v === true)}
                  />
                  <CategoryIcon icon={p.icon} color={p.color} size="sm" />
                  <Label htmlFor={id} className="flex-1 cursor-pointer">
                    {p.categoryName}
                    <span className="text-muted-foreground text-xs font-normal">
                      {Math.round(p.share * 100)} % · {p.group === 'NEEDS' ? 'besoin' : 'envie'}
                    </span>
                  </Label>
                  <Money value={p.amount} decimals={0} className="text-sm font-medium" />
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}
    </div>
  );
}

function FirstActionStep({
  onChoose,
  disabled,
}: {
  onChoose: (c: FinalChoice) => void;
  disabled: boolean;
}) {
  const choices: { id: FinalChoice; icon: typeof ReceiptIcon; title: string; text: string }[] = [
    {
      id: 'expense',
      icon: ReceiptIcon,
      title: 'Ajouter une dépense',
      text: 'Votre café du matin, un plein, des courses…',
    },
    {
      id: 'import',
      icon: UploadIcon,
      title: 'Importer un relevé',
      text: 'Un fichier CSV de votre banque, doublons détectés.',
    },
    {
      id: 'explore',
      icon: CompassIcon,
      title: 'Explorer',
      text: 'Découvrir le tableau de bord à votre rythme.',
    },
  ];
  return (
    <div>
      <StepHeading title="Par quoi commencer ?" text="Choisissez une première action." />
      <ul className="grid gap-2 sm:grid-cols-3">
        {choices.map(({ id, icon: Icon, title, text }) => (
          <li key={id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChoose(id)}
              className="group bg-card hover:border-primary/40 hover:shadow-card focus-visible:ring-ring/50 flex h-full w-full flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-[border-color,box-shadow,transform] outline-none hover:-translate-y-0.5 focus-visible:ring-[3px] disabled:opacity-50 motion-reduce:hover:translate-y-0"
            >
              <span className="bg-brand-tint text-primary flex size-9 items-center justify-center rounded-lg">
                <Icon className="size-[18px]" aria-hidden="true" />
              </span>
              <span className="text-sm font-medium">{title}</span>
              <span className="text-muted-foreground text-xs leading-relaxed">{text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
