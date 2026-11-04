'use client';
/**
 * Score de santé financière (0–100) : jauge circulaire animée, appréciation, résumé et levier
 * prioritaire. En mode détaillé, une barre par composante avec son poids et son explication.
 */
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Lightbulb } from 'lucide-react';
import Link from 'next/link';
import type { HealthComponent, HealthScore } from '@/domain/ai/types';
import { AiBadge } from '@/components/shared/ai-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatPercent } from '@/components/charts/format';
import { cn } from '@/lib/utils';

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
          initial={reduce ? false : { strokeDashoffset: CIRCUMFERENCE }}
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
      <p className="text-muted-foreground text-xs leading-relaxed">{c.explanation}</p>
    </li>
  );
}

export function HealthScoreCard({ score, compact = false, className }: HealthScoreCardProps) {
  const components = [...score.components].sort((a, b) => b.weight - a.weight);
  return (
    <Card data-testid="health-score" className={cn('min-w-0 scroll-mt-24', className)}>
      <CardHeader>
        <h2 className="text-base leading-tight font-semibold">Santé financière</h2>
        <CardDescription>Score calculé sur vos 6 derniers mois</CardDescription>
        <CardAction>
          <AiBadge label="IA locale" />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-5">
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
            <p className={cn('text-sm leading-relaxed', compact && 'line-clamp-3')}>
              {score.summary}
            </p>
          </div>
        </div>
        {score.topAdvice ? (
          <div className="bg-muted/60 flex gap-3 rounded-lg p-3 text-sm">
            <Lightbulb aria-hidden className="text-warning mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-medium">Levier prioritaire : </span>
              {score.topAdvice}
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
      </CardContent>
    </Card>
  );
}
