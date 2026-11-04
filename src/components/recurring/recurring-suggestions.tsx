'use client';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Plus, RefreshCw, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { RecurringCandidate } from '@/domain/ai/types';
import { deleteRecurringAction } from '@/app/actions/recurring';
import { errorMessage, queryKeys, unwrap } from '@/lib/query';
import { toastSuccess, toastUndo } from '@/lib/toast';
import { AiBadge } from '@/components/shared/ai-badge';
import { Money } from '@/components/shared/money';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { plural } from '@/components/import/import-logic';
import { frequencyLabel } from './recurring-math';
import {
  invalidateRecurringDependents,
  useAcceptSuggestion,
  useDismissSuggestion,
  useRecurringSuggestions,
} from './use-recurring';

/** Identifiant DOM sûr dérivé de la clé de la suggestion. */
function suggestionId(key: string): string {
  return `suggestion-${key.replace(/[^A-Za-z0-9_-]/g, '-')}`;
}

/** Suggestions IA : paiements réguliers détectés dans l'historique, ajoutables en un clic. */
export function RecurringSuggestions() {
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const suggestions = useRecurringSuggestions();
  const accept = useAcceptSuggestion();
  const dismiss = useDismissSuggestion();

  const onAccept = (c: RecurringCandidate) => {
    accept.mutate(c, {
      onSuccess: (rule) =>
        toastUndo(`« ${rule.label} » ajoutée à vos récurrences.`, async () => {
          unwrap(await deleteRecurringAction(rule.id));
          invalidateRecurringDependents(qc);
          await qc.invalidateQueries({ queryKey: queryKeys.ai.recurringSuggestions });
        }),
    });
  };

  const onDismiss = (c: RecurringCandidate) => {
    dismiss.mutate(c, { onSuccess: () => toastSuccess('Suggestion ignorée.') });
  };

  if (suggestions.isPending) {
    return (
      <section aria-labelledby="suggestions-title" aria-busy="true" className="space-y-3">
        <h2 id="suggestions-title" className="text-lg font-semibold">
          Suggestions
        </h2>
        <div className="grid gap-3 md:grid-cols-2" aria-hidden="true">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (suggestions.isError) {
    return (
      <section aria-labelledby="suggestions-title" className="space-y-3">
        <h2 id="suggestions-title" className="text-lg font-semibold">
          Suggestions
        </h2>
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Suggestions indisponibles</AlertTitle>
          <AlertDescription>
            <p>{errorMessage(suggestions.error)}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void suggestions.refetch()}
            >
              <RefreshCw aria-hidden="true" />
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  const items = suggestions.data;
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="suggestions-title" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="suggestions-title" className="text-lg font-semibold">
          Suggestions
        </h2>
        <AiBadge label="IA locale" />
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        <AnimatePresence initial={false}>
          {items.map((c) => (
            <motion.li
              key={c.key}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              transition={{ duration: reduce ? 0 : 0.18 }}
            >
              <Card className="h-full gap-3 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <p id={suggestionId(c.key)} className="text-sm">
                    Nous avons repéré un paiement régulier :{' '}
                    <span className="font-semibold">{c.label}</span> ·{' '}
                    <Money
                      value={c.amount}
                      decimals={c.amount % 1000 === 0 ? 0 : 3}
                      className="font-semibold"
                    />{' '}
                    · {frequencyLabel(c.frequency, true)} ({plural(c.occurrences, 'occurrence')})
                  </p>
                  <AiBadge confidence={c.confidence} />
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onAccept(c)}
                    aria-describedby={suggestionId(c.key)}
                  >
                    <Plus aria-hidden="true" />
                    Ajouter comme récurrence
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onDismiss(c)}
                    aria-describedby={suggestionId(c.key)}
                  >
                    <X aria-hidden="true" />
                    Ignorer
                  </Button>
                </div>
              </Card>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
