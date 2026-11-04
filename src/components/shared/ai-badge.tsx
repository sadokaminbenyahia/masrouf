import { SparklesIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AiBadgeProps {
  label?: string;
  /** Confiance 0..1 (affichée en %) */
  confidence?: number;
  className?: string;
}

/** Marque un contenu produit par l'IA locale. */
export function AiBadge({ label = 'Suggestion', confidence, className }: AiBadgeProps) {
  const pct =
    confidence !== undefined && Number.isFinite(confidence)
      ? Math.round(Math.min(1, Math.max(0, confidence)) * 100)
      : null;
  return (
    <span
      data-slot="ai-badge"
      title={
        pct !== null ? `Proposé par l'IA locale, confiance ${pct} %` : "Proposé par l'IA locale"
      }
      className={cn(
        'border-primary/20 bg-brand-tint text-primary inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        className,
      )}
    >
      <SparklesIcon className="size-3" aria-hidden="true" />
      <span>{label}</span>
      {pct !== null && (
        <span className="tabular-nums">
          · {pct}
          <span aria-hidden="true">&nbsp;</span>%
        </span>
      )}
      <span className="sr-only"> (IA locale)</span>
    </span>
  );
}
