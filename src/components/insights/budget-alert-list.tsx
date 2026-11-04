'use client';
/**
 * Alertes budgets (≥ 80 % ou dépassement projeté) : barre de progression, niveau en texte,
 * projection « à ce rythme ». Client (mode discret) mais rendu dès le serveur.
 */
import { CircleCheck, OctagonAlert, TrendingUp, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { formatMoney } from '@/domain/money';
import type { BudgetProgress } from '@/domain/types';
import { CategoryIcon } from '@/components/shared/category-icon';
import { Money } from '@/components/shared/money';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatPercent } from '@/components/charts/format';
import { useDiscreetMode } from '@/lib/hooks/use-discreet-mode';
import { cn } from '@/lib/utils';

export interface BudgetAlertListProps {
  alerts: BudgetProgress[];
  className?: string;
}

function levelBadge(b: BudgetProgress) {
  if (b.level === 'EXCEEDED') {
    return (
      <Badge variant="expense">
        <OctagonAlert aria-hidden />
        Dépassé
      </Badge>
    );
  }
  if (b.level === 'WARNING') {
    return (
      <Badge variant="warning">
        <TriangleAlert aria-hidden />
        Bientôt atteint
      </Badge>
    );
  }
  return (
    <Badge variant="warning">
      <TrendingUp aria-hidden />
      Dépassement prévu
    </Badge>
  );
}

const LEVEL_TEXT: Record<BudgetProgress['level'], string> = {
  EXCEEDED: 'dépassé',
  WARNING: 'bientôt atteint',
  OK: 'dans les limites',
};

/**
 * Texte lu par les lecteurs d'écran pour la barre : montants réels (la barre est plafonnée à
 * 100 %), niveau d'alerte ; les montants sont masqués en mode discret.
 */
export function budgetValueText(b: BudgetProgress, discreet: boolean): string {
  const level =
    b.level === 'OK' && b.projectedOverrun ? 'dépassement prévu' : LEVEL_TEXT[b.level];
  if (discreet) return `${formatPercent(b.ratio)} du budget utilisé, ${level}`;
  const spent = formatMoney(b.spent, { decimals: 0 });
  const budget = formatMoney(b.budget.amount, { decimals: 0 });
  return `${spent} sur ${budget}, ${level}`;
}

export function BudgetAlertList({ alerts, className }: BudgetAlertListProps) {
  const { discreet } = useDiscreetMode();
  if (alerts.length === 0) {
    return (
      <p className={cn('text-muted-foreground flex items-center gap-2 text-sm', className)}>
        <CircleCheck aria-hidden className="text-success size-4" />
        Aucun budget en alerte ce mois-ci.
      </p>
    );
  }
  const sorted = [...alerts].sort((a, b) => b.ratio - a.ratio);
  return (
    <ul className={cn('space-y-4', className)}>
      {sorted.map((b) => {
        const indicator =
          b.level === 'EXCEEDED'
            ? 'bg-expense'
            : b.level === 'WARNING'
              ? 'bg-warning'
              : 'bg-primary';
        return (
          <li key={b.budget.id} className="space-y-2">
            <div className="flex items-center gap-3">
              <CategoryIcon icon={b.category.icon} color={b.category.color} size="sm" />
              <Link
                href="/budgets"
                className="min-w-0 flex-1 truncate text-sm font-medium underline-offset-4 hover:underline"
              >
                {b.category.name}
              </Link>
              {levelBadge(b)}
            </div>
            <Progress
              value={Math.round(b.ratio * 100)}
              getValueLabel={() => budgetValueText(b, discreet)}
              aria-label={`Budget ${b.category.name} : ${formatPercent(b.ratio)} utilisé`}
              indicatorClassName={indicator}
            />
            <div className="text-muted-foreground flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
              <span>
                <Money value={b.spent} decimals={0} className="text-foreground font-medium" /> sur{' '}
                <Money value={b.budget.amount} decimals={0} /> ({formatPercent(b.ratio)})
              </span>
              {b.remaining >= 0 ? (
                <span>
                  Reste <Money value={b.remaining} decimals={0} />
                </span>
              ) : (
                <span className="text-expense">
                  Dépassement de <Money value={-b.remaining} decimals={0} />
                </span>
              )}
            </div>
            {b.projectedOverrun && b.projected !== null && b.level !== 'EXCEEDED' ? (
              <p className="text-warning text-xs">
                À ce rythme : <Money value={b.projected} decimals={0} /> /{' '}
                <Money value={b.budget.amount} decimals={0} /> en fin de mois
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
