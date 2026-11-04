'use client';
/**
 * Score de santé financière (0–100) : jauge circulaire animée, appréciation, résumé et levier
 * prioritaire. En mode détaillé, une barre par composante avec son poids et son explication.
 */
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ChartNoAxesColumn, Lightbulb } from 'lucide-react';
import Link from 'next/link';
import type { HealthComponent, HealthScore } from '@/domain/ai/types';
import { AiBadge } from '@/components/shared/ai-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatPercent } from '@/components/charts/format';
import { cn } from '@/lib/utils';
import { useMaskedText } from './use-masked-text';

export interface HealthScoreCardProps {
  score: HealthScore;
  compact?: boolean;
  className?: string;
}

export const GRADE_LABELS: Record<HealthScore['grade'], string> = {
  EXCELLENT: 'Excellent',
  BON: 'Bon',
  MOYEN: 'Moyen',
  FRAGILE: 'Fragile',
};

const GRADE_COLORS: Record<HealthScore['grade'], string> = {
  EXCELLENT: 'var(--success)',
  BON: 'var(--primary)',
  MOYEN: 'var(--warning)',
  FRAGILE: 'var(--expense)',
};

const GRADE_BADGE = {
  EXCELLENT: 'success',
  BON: 'secondary',
  MOYEN: 'warning',
  FRAGILE: 'expense',
} as const;

/** Couleur d'une sous-note (même échelle que les appréciations). */
function componentTone(score: number): { bar: string; text: string } {
  if (score >= 80) return { bar: 'bg-success', text: 'text-success' };
  if (score >= 60) return { bar: 'bg-primary', text: 'text-primary' };
  if (score >= 40) return { bar: 'bg-warning', text: 'text-warning' };
  return { bar: 'bg-expense', text: 'text-expense' };
}

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function clampScore(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)));
}

/**
 * Vrai si le score repose sur assez de données. Le domaine renvoie un score neutre (50) sans
 * aucune composante quand l'historique est insuffisant : on affiche alors un état vide.
 */
export function hasHealthData(score: Pick<HealthScore, 'components'>): boolean {
  return score.components.length > 0;
}

function Gauge({
  score,
  grade,
  size,
}: {
  score: number;
  grade: HealthScore['grade'];
  size: number;
}) {
  const reduce = useReducedMotion() === true;
  const value = clampScore(score);
  const offset = CIRCUMFERENCE * (1 - value / 100);
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={`${value} sur 100, ${GRADE_LABELS[grade]}`}
      aria-label="Score de santé financière"
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="var(--muted)" strokeWidth="10" />
        <motion.circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          stroke={GRADE_COLORS[grade]}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          // Toujours le même état initial qu'au rendu serveur : framer-motion anime donc toujours
          // (durée nulle si l'utilisateur réduit les animations) et écrit la valeur finale.
          initial={{ strokeDashoffset: CIRCUMFERENCE }}
          animate={{ strokeDashoffset: offset }}
          transition={reduce ? { duration: 0 } : { duration: 0.9, ease: 'easeOut', delay: 0.1 }}
        />
      </svg>
      <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl leading-none font-semibold tabular-nums">{value}</span>
        <span className="text-muted-foreground text-xs">/ 100</span>
      </div>
    </div>
  );
}

function ComponentRow({ c }: { c: HealthComponent }) {
  const mask = useMaskedText();
  const value = clampScore(c.score);
  const tone = componentTone(value);
  return (
    <li className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{c.label}</span>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          <span className={cn('text-sm font-semibold', tone.text)}>{value}</span> / 100 · poids{' '}
          {formatPercent(c.weight)}
        </span>
      </div>
      <Progress
        value={value}
        aria-label={`${c.label} : ${value} sur 100`}
        indicatorClassName={tone.bar}
      />
      <p className="text-muted-foreground text-xs leading-relaxed">{mask(c.explanation)}</p>
    </li>
  );
}

function CardTitleRow() {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <h2 className="text-base leading-tight font-semibold">Santé financière</h2>
      <div className="-my-3 flex shrink-0 items-center">
        <AiBadge label="IA locale" />
      </div>
    </div>
  );
}

function NotEnoughData({ compact }: { compact: boolean }) {
  return (
    <div className="flex flex-col items-start gap-3 text-sm">
      <div className="flex items-start gap-3">
        <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
          <ChartNoAxesColumn aria-hidden className="size-4" />
        </span>
        <div className="space-y-1">
          <p className="font-medium">Pas encore de score</p>
          <p className="text-muted-foreground leading-relaxed">
            Le score se calcule à partir de quelques semaines de revenus et de dépenses.
            Continuez à enregistrer vos opérations, ou importez un relevé pour l&apos;obtenir dès
            maintenant.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4">
        <Button asChild variant="link" className="h-11 px-0">
          <Link href="/import">
            Importer un relevé
            <ArrowRight aria-hidden />
          </Link>
        </Button>
        {compact ? null : (
          <Button asChild variant="link" className="h-11 px-0">
            <Link href="/transactions">
              Voir mes transactions
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

export function HealthScoreCard({ score, compact = false, className }: HealthScoreCardProps) {
  const mask = useMaskedText();
  const components = [...score.components].sort((a, b) => b.weight - a.weight);
  const enough = hasHealthData(score);
  return (
    <Card data-testid="health-score" className={cn('min-w-0 scroll-mt-24', className)}>
      <CardHeader>
        <CardTitleRow />
        <CardDescription>Score calculé sur vos 6 derniers mois</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {enough ? (
          <>
            <div
              className={cn(
                'flex items-center gap-5',
                !compact && 'flex-col sm:flex-row sm:items-center',
              )}
            >
              <Gauge score={score.score} grade={score.grade} size={compact ? 104 : 136} />
              <div className="min-w-0 space-y-2">
                <Badge variant={GRADE_BADGE[score.grade]} className="text-sm">
                  {GRADE_LABELS[score.grade]}
                </Badge>
                <p className="text-sm leading-relaxed">{mask(score.summary)}</p>
              </div>
            </div>
            {score.topAdvice ? (
              <div className="bg-muted/60 flex gap-3 rounded-lg p-3 text-sm">
                <Lightbulb aria-hidden className="text-warning mt-0.5 size-4 shrink-0" />
                <p>
                  <span className="font-medium">Levier prioritaire : </span>
                  {mask(score.topAdvice)}
                </p>
              </div>
            ) : null}
            {compact ? (
              <Button asChild variant="link" className="h-11 px-0">
                <Link href="/analyses#sante">
                  Voir le détail du score
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            ) : (
              <ul className="space-y-4" aria-label="Composantes du score">
                {components.map((c) => (
                  <ComponentRow key={c.key} c={c} />
                ))}
              </ul>
            )}
          </>
        ) : (
          <NotEnoughData compact={compact} />
        )}
      </CardContent>
    </Card>
  );
}
