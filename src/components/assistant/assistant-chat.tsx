'use client';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertCircleIcon,
  ArrowRightIcon,
  Loader2Icon,
  MessageCircleQuestionIcon,
  RotateCcwIcon,
  SendIcon,
  SparklesIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { askAssistantAction } from '@/app/actions/ai';
import type { AssistantAnswer } from '@/domain/ai/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ActionError, errorMessage, unwrap } from '@/lib/query';
import { cn } from '@/lib/utils';
import { MiniChart } from './mini-chart';
import { HighlightValue } from './monthly-summary-card';

interface Entry {
  id: number;
  question: string;
  status: 'pending' | 'done' | 'error';
  answer?: AssistantAnswer;
  error?: string;
}

export interface AssistantChatProps {
  examples: string[];
  /** Question passée dans l'URL (`?q=`), posée automatiquement */
  initialQuestion?: string;
}

function linkLabel(href: string): string {
  if (href.startsWith('/comptes')) return 'Voir les comptes';
  if (href.startsWith('/objectifs')) return 'Voir les objectifs';
  if (href.startsWith('/recurrents')) return 'Voir les dépenses récurrentes';
  if (href.startsWith('/budgets')) return 'Voir les budgets';
  return 'Voir les transactions';
}

function describeError(e: unknown): string {
  if (e instanceof ActionError) {
    if (e.code === 'RATE_LIMITED') {
      return 'Vous avez posé beaucoup de questions d’affilée. Patientez quelques secondes avant de réessayer.';
    }
    if (e.code === 'VALIDATION')
      return 'Votre question est vide ou trop longue (300 caractères au plus).';
    if (e.code === 'UNAUTHORIZED')
      return 'Votre session a expiré : reconnectez-vous pour continuer.';
  }
  return errorMessage(e);
}

export function AssistantChat({ examples, initialQuestion }: AssistantChatProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [value, setValue] = useState('');
  const nextId = useRef(1);
  const lastAuto = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const router = useRouter();
  const pathname = usePathname();
  const inputId = useId();
  const pending = entries.some((e) => e.status === 'pending');

  const ask = useCallback(async (raw: string) => {
    const question = raw.trim().slice(0, 300);
    if (!question) return;
    const id = nextId.current++;
    setEntries((list) => [...list, { id, question, status: 'pending' }]);
    try {
      const answer = unwrap(await askAssistantAction(question));
      setEntries((list) => list.map((e) => (e.id === id ? { ...e, status: 'done', answer } : e)));
    } catch (e) {
      const error = describeError(e);
      setEntries((list) => list.map((x) => (x.id === id ? { ...x, status: 'error', error } : x)));
    }
  }, []);

  // `?q=` : question posée automatiquement, puis retirée de l'URL.
  useEffect(() => {
    const q = initialQuestion?.trim();
    if (!q) {
      lastAuto.current = null;
      return;
    }
    if (lastAuto.current === q) return;
    lastAuto.current = q;
    void ask(q);
    router.replace(pathname, { scroll: false });
  }, [initialQuestion, ask, router, pathname]);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }, [entries, reduceMotion]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pending || !value.trim()) return;
    const q = value;
    setValue('');
    void ask(q);
  };

  const askSuggestion = (q: string) => {
    if (pending) return;
    void ask(q);
    inputRef.current?.focus();
  };

  const motionProps = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.2, ease: 'easeOut' as const },
      };
  const lastIndex = entries.length - 1;

  return (
    <section aria-labelledby="assistant-chat-title" className="flex flex-col gap-4">
      <h2 id="assistant-chat-title" className="sr-only">
        Questions à l’assistant
      </h2>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium">
            <MessageCircleQuestionIcon className="text-primary size-4" aria-hidden="true" />
            Posez une question sur vos finances, par exemple :
          </p>
          <ul className="flex flex-wrap gap-2">
            {examples.map((q) => (
              <li key={q}>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-11 text-left whitespace-normal"
                  onClick={() => askSuggestion(q)}
                >
                  {q}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ol className="flex flex-col gap-5" aria-label="Historique de la conversation">
          <AnimatePresence initial={false}>
            {entries.map((entry, index) => (
              <motion.li key={entry.id} className="flex flex-col gap-2" {...motionProps}>
                <p className="bg-primary text-primary-foreground max-w-[85%] self-end rounded-2xl rounded-br-sm px-4 py-2 text-sm">
                  <span className="sr-only">Vous : </span>
                  {entry.question}
                </p>
                <div
                  className="max-w-full self-start sm:max-w-[90%]"
                  {...(index === lastIndex
                    ? { 'data-testid': 'assistant-answer', 'aria-live': 'polite' as const }
                    : {})}
                >
                  <AnswerBubble
                    entry={entry}
                    disabled={pending}
                    onSuggestion={askSuggestion}
                    onRetry={() => askSuggestion(entry.question)}
                  />
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
      <div ref={endRef} />

      <form
        onSubmit={submit}
        className="bg-card shadow-card sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-10 flex flex-col gap-1.5 rounded-xl border p-3 md:bottom-4"
      >
        <Label htmlFor={inputId}>Votre question</Label>
        <div className="flex gap-2">
          <Input
            id={inputId}
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ex. : combien j’ai dépensé en courses ce mois-ci ?"
            maxLength={300}
            autoComplete="off"
            enterKeyHint="send"
            className="h-11"
          />
          <Button type="submit" className="h-11 shrink-0" disabled={pending || !value.trim()}>
            {pending ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : (
              <SendIcon aria-hidden="true" />
            )}
            Envoyer
          </Button>
        </div>
      </form>
    </section>
  );
}

function AnswerBubble({
  entry,
  disabled,
  onSuggestion,
  onRetry,
}: {
  entry: Entry;
  disabled: boolean;
  onSuggestion: (q: string) => void;
  onRetry: () => void;
}) {
  if (entry.status === 'pending') {
    return (
      <p
        role="status"
        className="bg-card text-muted-foreground flex items-center gap-2 rounded-2xl rounded-bl-sm border px-4 py-3 text-sm"
      >
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        Analyse en cours…
      </p>
    );
  }
  if (entry.status === 'error' || !entry.answer) {
    return (
      <div className="border-destructive/40 bg-destructive/5 flex flex-col items-start gap-2 rounded-2xl rounded-bl-sm border px-4 py-3 text-sm">
        <p className="text-destructive flex items-start gap-2">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {entry.error ?? 'Une erreur inattendue est survenue.'}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={onRetry}
          disabled={disabled}
        >
          <RotateCcwIcon aria-hidden="true" />
          Réessayer
        </Button>
      </div>
    );
  }
  const a = entry.answer;
  return (
    <article
      aria-label="Réponse de l’assistant"
      className={cn(
        'bg-card shadow-card flex flex-col gap-3 rounded-2xl rounded-bl-sm border px-4 py-3 text-sm',
        !a.understood && 'border-dashed',
      )}
    >
      <p className="flex items-start gap-2 leading-relaxed">
        <SparklesIcon className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{a.text}</span>
      </p>
      {a.highlights.length > 0 ? (
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          {a.highlights.map((h) => (
            <div key={h.label}>
              <dt className="text-muted-foreground text-xs">{h.label}</dt>
              <dd className="text-xl font-semibold">
                <HighlightValue h={h} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {a.chart && a.chart.data.length > 0 ? <MiniChart chart={a.chart} /> : null}
      {a.period || a.href ? (
        <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
          {a.period ? <span>Période : {a.period.label}</span> : <span />}
          {a.href ? (
            <Link
              href={a.href}
              className="text-primary focus-visible:ring-ring/50 inline-flex min-h-11 items-center gap-1 font-medium hover:underline focus-visible:ring-[3px] focus-visible:outline-none"
            >
              {linkLabel(a.href)}
              <ArrowRightIcon className="size-3.5" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      ) : null}
      {a.suggestions.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-muted-foreground text-xs">
            {a.understood ? 'Pour aller plus loin :' : 'Essayez :'}
          </p>
          <ul className="flex flex-wrap gap-2">
            {a.suggestions.map((s) => (
              <li key={s}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-auto min-h-11 text-left whitespace-normal"
                  disabled={disabled}
                  onClick={() => onSuggestion(s)}
                >
                  {s}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
