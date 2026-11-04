import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export const IMPORT_STEPS = ['Fichier', 'Colonnes', 'Aperçu', 'Confirmation'] as const;

/** Indicateur d'étapes accessible : liste ordonnée, l'étape courante porte aria-current="step". */
export function StepIndicator({ current }: { current: number }) {
  return (
    <nav aria-label="Étapes de l’import">
      <ol className="flex items-center gap-2 sm:gap-3">
        {IMPORT_STEPS.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li
              key={label}
              aria-current={active ? 'step' : undefined}
              className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3"
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tabular-nums transition-colors',
                  done && 'border-primary bg-primary text-primary-foreground',
                  active && 'border-primary bg-primary/10 text-primary ring-primary/15 ring-4',
                  !done && !active && 'border-border bg-card text-muted-foreground',
                )}
                aria-hidden="true"
              >
                {done ? <Check className="size-4" /> : i + 1}
              </span>
              <span
                className={cn(
                  'truncate text-sm',
                  active ? 'text-foreground font-semibold' : 'text-muted-foreground',
                  !active && 'sr-only sm:not-sr-only',
                )}
              >
                <span className="sr-only">{`Étape ${i + 1} sur ${IMPORT_STEPS.length} : `}</span>
                {label}
                {done && <span className="sr-only"> (terminée)</span>}
              </span>
              {i < IMPORT_STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn('hidden h-px flex-1 sm:block', done ? 'bg-primary' : 'bg-border')}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
