'use client';
/**
 * Ajout rapide global : touche `N` et événement QUICK_ADD_EVENT (émis par le bouton
 * « Ajouter une transaction » de la barre du haut sur desktop et par le bouton central de la
 * navigation mobile). Pas de bouton flottant : il masquait des contenus et faisait doublon.
 * Champ en langage naturel (« café 3,500 hier ») qui pré-remplit le formulaire.
 */
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';
import { useEffect, useEffectEvent, useId, useRef, useState, type FormEvent } from 'react';
import { parseEntryAction } from '@/app/actions/ai';
import { deleteTransactionAction } from '@/app/actions/transactions';
import { AiBadge } from '@/components/shared/ai-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEFAULT_TIMEZONE, todayInTimeZone, type ISODate } from '@/domain/dates';
import type { Transaction } from '@/domain/types';
import { QUICK_ADD_EVENT, onUiEvent, type QuickAddDetail } from '@/lib/events';
import { useDiscreetMode } from '@/lib/hooks/use-discreet-mode';
import { useHotkey } from '@/lib/hooks/use-hotkey';
import { errorMessage, unwrap } from '@/lib/query';
import type { TransactionInput } from '@/lib/schemas/transactions';
import { toastError, toastSuccess, toastUndo } from '@/lib/toast';
import { invalidateFinanceQueries } from './cache';
import { ResponsiveDialog } from './edit-transaction-dialog';
import { describeTransaction } from './text';
import { TransactionForm } from './transaction-form';

const DEFAULT_EXAMPLES = ['café 3,500 hier', 'courses carrefour 87,250', 'salaire 2600 le 1er'];

type ParseState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'parsed'; warnings: string[] }
  | { status: 'failed'; message: string; examples: string[] };

type InitialFocus = 'amount' | 'submit' | 'none';

export function QuickAddTransaction() {
  const queryClient = useQueryClient();
  const { discreet } = useDiscreetMode();
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState<ISODate>(() => todayInTimeZone(DEFAULT_TIMEZONE, new Date()));
  const [text, setText] = useState('');
  const [prefill, setPrefill] = useState<Partial<TransactionInput>>({});
  const [formKey, setFormKey] = useState(0);
  const [focus, setFocus] = useState<InitialFocus>('none');
  const [parse, setParse] = useState<ParseState>({ status: 'idle' });
  const requestRef = useRef(0);
  const nlId = useId();
  const nlHintId = useId();

  async function runParse(raw: string, base: Partial<TransactionInput>) {
    const value = raw.trim();
    if (value === '') {
      setParse({
        status: 'failed',
        message: 'Décrivez la transaction en quelques mots, avec son montant.',
        examples: DEFAULT_EXAMPLES,
      });
      return;
    }
    const request = ++requestRef.current;
    setParse({ status: 'pending' });
    try {
      const result = unwrap(await parseEntryAction(value));
      if (request !== requestRef.current) return;
      if (!result.ok) {
        setParse({
          status: 'failed',
          message: result.message,
          examples: result.examples.length > 0 ? result.examples : DEFAULT_EXAMPLES,
        });
        return;
      }
      const e = result.entry;
      setPrefill({
        ...base,
        type: e.type,
        amount: e.amount,
        date: e.date,
        label: e.label,
        ...(e.categoryId ? { categoryId: e.categoryId } : {}),
        ...(e.accountId ? { accountId: e.accountId } : {}),
        ...(e.tags.length > 0 ? { tags: e.tags } : {}),
      });
      setFocus('submit');
      setFormKey((k) => k + 1);
      setParse({ status: 'parsed', warnings: e.warnings });
    } catch (e) {
      if (request !== requestRef.current) return;
      setParse({ status: 'failed', message: errorMessage(e), examples: [] });
    }
  }

  function openWith(detail: QuickAddDetail) {
    requestRef.current++;
    const base = detail.prefill ?? {};
    setToday(todayInTimeZone(DEFAULT_TIMEZONE, new Date()));
    setText(detail.text ?? '');
    setPrefill(base);
    setFocus(detail.prefill && !detail.text ? 'amount' : 'none');
    setFormKey((k) => k + 1);
    setParse({ status: 'idle' });
    setOpen(true);
    if (detail.text) void runParse(detail.text, base);
  }

  const onQuickAddEvent = useEffectEvent((detail: QuickAddDetail | undefined) =>
    openWith(detail ?? {}),
  );
  useEffect(
    () => onUiEvent<QuickAddDetail | undefined>(QUICK_ADD_EVENT, (d) => onQuickAddEvent(d)),
    [],
  );

  useHotkey(
    'n',
    (e) => {
      e.preventDefault();
      openWith({});
    },
    { enabled: !open },
  );

  function handleSaved(t: Transaction) {
    setOpen(false);
    toastUndo(describeTransaction(t, 'ajouté', discreet), async () => {
      try {
        unwrap(await deleteTransactionAction(t.id));
        toastSuccess('Ajout annulé');
      } catch (e) {
        toastError(errorMessage(e));
      } finally {
        await invalidateFinanceQueries(queryClient);
      }
    });
  }

  function onNlSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void runParse(text, prefill);
  }

  const body = (
    <div className="grid gap-5">
      <form onSubmit={onNlSubmit} className="grid gap-2">
        <Label htmlFor={nlId}>Décrivez la transaction</Label>
        <div className="relative">
          <Sparkles
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            id={nlId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="café 3,500 hier"
            autoComplete="off"
            enterKeyHint="go"
            maxLength={200}
            autoFocus={focus === 'none'}
            aria-describedby={nlHintId}
            className="min-h-11 pr-10 pl-9"
          />
          {parse.status === 'pending' && (
            <Loader2
              className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin"
              aria-hidden
            />
          )}
        </div>
        <div id={nlHintId} aria-live="polite" className="min-h-5 text-sm">
          {parse.status === 'idle' && (
            <p className="text-muted-foreground">
              Appuyez sur Entrée pour pré-remplir le formulaire.
            </p>
          )}
          {parse.status === 'pending' && <p className="text-muted-foreground">Analyse en cours…</p>}
          {parse.status === 'parsed' && (
            <div className="flex flex-wrap items-center gap-2">
              <AiBadge label="Analysé automatiquement" />
              <span className="text-muted-foreground">Vérifiez puis enregistrez.</span>
              {parse.warnings.map((w) => (
                <span key={w} className="text-warning w-full">
                  {w}
                </span>
              ))}
            </div>
          )}
          {parse.status === 'failed' && (
            <div className="grid gap-2">
              <p className="text-destructive">{parse.message}</p>
              {parse.examples.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground">Exemples :</span>
                  {parse.examples.map((example) => (
                    <Button
                      key={example}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setText(example);
                        void runParse(example, prefill);
                      }}
                    >
                      {example}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </form>
      <div className="border-border border-t pt-4">
        <TransactionForm
          key={formKey}
          today={today}
          defaultValues={prefill}
          onSuccess={handleSaved}
          initialFocus={focus}
        />
      </div>
    </div>
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      title="Nouvelle transaction"
      description="Saisissez-la en langage naturel ou remplissez le formulaire."
    >
      {body}
    </ResponsiveDialog>
  );
}
