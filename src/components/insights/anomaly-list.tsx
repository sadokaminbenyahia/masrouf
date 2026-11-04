'use client';
/**
 * Anomalies détectées par l'IA locale : icône par type, montant réel vs attendu, lien vers les
 * transactions concernées et bouton « Ignorer » (masquage optimiste).
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  Copy,
  EyeOff,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { Anomaly, AnomalyKind } from '@/domain/ai/types';
import { formatDateFR } from '@/domain/dates';
import { Money } from '@/components/shared/money';
import { Button } from '@/components/ui/button';
import { anomalyTransactionsHref } from '@/components/dashboard/links';
import { cn } from '@/lib/utils';
import { SEVERITY_STYLES, bySeverity } from './severity';
import { useDismissible } from './use-dismiss';
import { useMaskedText } from './use-masked-text';

export const ANOMALY_KINDS: Record<AnomalyKind, { icon: LucideIcon; label: string }> = {
  UNUSUAL_AMOUNT: { icon: Activity, label: 'Montant inhabituel' },
  DUPLICATE: { icon: Copy, label: 'Doublon possible' },
  PRICE_INCREASE: { icon: TrendingUp, label: 'Hausse de prix' },
};

export interface AnomalyListProps {
  anomalies: Anomaly[];
  /** Nombre maximal d'éléments affichés (lien « Tout voir » au-delà) */
  limit?: number;
  /** Lien « Tout voir » (défaut /analyses#anomalies) */
  moreHref?: string;
  className?: string;
}

const anomalyKey = (a: Anomaly) => a.key;

export function AnomalyList({
  anomalies,
  limit,
  moreHref = '/analyses#anomalies',
  className,
}: AnomalyListProps) {
  const reduce = useReducedMotion() === true;
  const mask = useMaskedText();
  const { visible, dismiss } = useDismissible(
    anomalies,
    anomalyKey,
    'Masqué : cette anomalie ne vous sera plus signalée.',
  );
  const sorted = bySeverity(visible);
  const shown = limit === undefined ? sorted : sorted.slice(0, limit);
  const hiddenCount = sorted.length - shown.length;

  if (sorted.length === 0) {
    return (
      <p className={cn('text-muted-foreground flex items-center gap-2 text-sm', className)}>
        <ShieldCheck aria-hidden className="text-success size-4" />
        Aucune anomalie détectée récemment.
      </p>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <ul className="space-y-3">
        <AnimatePresence initial={false}>
          {shown.map((a) => {
            const kind = ANOMALY_KINDS[a.kind];
            const sev = SEVERITY_STYLES[a.severity];
            const Icon = kind.icon;
            const several = a.transactionIds.length > 1;
            return (
              <motion.li
                key={a.key}
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
                  <p className="text-muted-foreground text-xs">
                    <span className={cn('font-medium', sev.text)}>{kind.label}</span>
                    <span className="sr-only"> ({sev.label})</span> ·{' '}
                    {formatDateFR(a.date, 'dayMonth')}
                  </p>
                  <h3 className="text-sm font-medium">{mask(a.title)}</h3>
                  <p className="text-muted-foreground text-sm">{mask(a.message)}</p>
                  <p className="text-sm">
                    {/* Montant d'une opération : au millime ; valeur attendue (moyenne) : au dinar */}
                    Montant : <Money value={a.actualAmount} className="font-medium" />
                    {a.expectedAmount !== null ? (
                      <>
                        {' '}
                        · attendu ≈{' '}
                        <Money
                          value={a.expectedAmount}
                          decimals={0}
                          className="text-muted-foreground"
                        />
                      </>
                    ) : null}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2">
                    <Button asChild variant="link" size="sm" className="h-11 px-0">
                      <Link href={anomalyTransactionsHref(a)}>
                        {several ? 'Voir les transactions' : 'Voir la transaction'}
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-11"
                      onClick={() => dismiss(a.key)}
                      aria-label={`Ignorer l'anomalie « ${mask(a.title)} »`}
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
            Voir les {sorted.length} anomalies
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
