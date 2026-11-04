'use client';
/**
 * Conseils (règle 50/30/20, catégories en hausse, abonnements oubliés…) : sévérité → icône,
 * couleur ET texte ; lien d'action ; « Ignorer » (masquage optimiste).
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, EyeOff, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { Insight } from '@/domain/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SEVERITY_STYLES, bySeverity } from './severity';
import { useDismissible } from './use-dismiss';

export interface InsightListProps {
  insights: Insight[];
  limit?: number;
  /** Lien « Tout voir » (défaut /analyses#conseils) */
  moreHref?: string;
  className?: string;
}

const insightKey = (i: Insight) => i.key;

export function InsightList({
  insights,
  limit,
  moreHref = '/analyses#conseils',
  className,
}: InsightListProps) {
  const reduce = useReducedMotion() === true;
  const { visible, dismiss } = useDismissible(
    insights,
    insightKey,
    'Masqué : ce conseil ne vous sera plus proposé.',
  );
  const sorted = bySeverity(visible);
  const shown = limit === undefined ? sorted : sorted.slice(0, limit);
  const hiddenCount = sorted.length - shown.length;

  if (sorted.length === 0) {
    return (
      <p className={cn('text-muted-foreground flex items-center gap-2 text-sm', className)}>
        <Sparkles aria-hidden className="text-primary size-4" />
        Aucun conseil pour le moment : tout semble en ordre.
      </p>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <ul className="space-y-3">
        <AnimatePresence initial={false}>
          {shown.map((insight) => {
            const sev = SEVERITY_STYLES[insight.severity];
            const Icon = sev.icon;
            return (
              <motion.li
                key={insight.key}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: 16 }}
                transition={{ duration: 0.2 }}
                className="flex gap-3 rounded-lg border p-3"
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-full',
                    sev.tint,
                    sev.text,
                  )}
                >
                  <Icon aria-hidden className="size-4" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className={cn('text-xs font-medium', sev.text)}>{sev.label}</p>
                  <h3 className="text-sm font-medium">{insight.title}</h3>
                  <p className="text-muted-foreground text-sm">{insight.message}</p>
                  <div className="flex flex-wrap items-center gap-x-2">
                    {insight.href ? (
                      <Button asChild variant="link" size="sm" className="h-11 px-0">
                        <Link href={insight.href}>
                          Voir le détail
                          <ArrowRight aria-hidden />
                        </Link>
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-11"
                      onClick={() => dismiss(insight.key)}
                      aria-label={`Ignorer le conseil « ${insight.title} »`}
                    >
                      <EyeOff aria-hidden />
                      Ignorer
                    </Button>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {hiddenCount > 0 ? (
        <Button asChild variant="link" className="h-11 px-0">
          <Link href={moreHref}>
            Voir les {sorted.length} conseils
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
