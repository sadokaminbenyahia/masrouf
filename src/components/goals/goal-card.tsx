'use client';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarClock,
  CircleCheck,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useId } from 'react';
import { formatDateFR } from '@/domain/dates';
import type { GoalProgress } from '@/domain/types';
import { DragHandle, type SortableHandleProps } from '@/components/dnd/sortable-list';
import { IconByName } from '@/components/shared/category-icon';
import { Money } from '@/components/shared/money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDiscreetMode } from '@/lib/hooks/use-discreet-mode';
import { cn } from '@/lib/utils';
import { GOAL_STATUS_META, goalPercent, goalValueText, ringGeometry } from './goal-utils';

interface GoalCardProps {
  goal: GoalProgress;
  handle: SortableHandleProps;
  onDeposit: () => void;
  onWithdraw: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function GoalCard({ goal, handle, onDeposit, onWithdraw, onEdit, onDelete }: GoalCardProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const titleId = useId();
  const meta = GOAL_STATUS_META[goal.status];
  const completed = goal.status === 'COMPLETED';

  return (
    <motion.article
      aria-labelledby={titleId}
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'bg-card text-card-foreground shadow-card flex flex-col gap-4 rounded-xl border p-3 sm:p-4',
        completed && 'border-success/40',
      )}
    >
      <div className="flex items-start gap-2">
        <DragHandle {...handle} className="-ml-1" />
        <GoalRing goal={goal} />
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="truncate text-base leading-tight font-semibold">
            {goal.name}
          </h3>
          <p className="mt-1 text-sm tabular-nums">
            <Money value={goal.savedAmount} decimals={0} className="font-semibold" />
            <span className="text-muted-foreground">
              {' '}
              / <Money value={goal.targetAmount} decimals={0} />
            </span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={meta.variant}>
              {completed && <CircleCheck aria-hidden="true" />}
              {meta.label}
            </Badge>
            {goal.targetDate && (
              <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                <CalendarClock className="size-3.5" aria-hidden="true" />
                <span>
                  <span className="sr-only">Date cible : </span>
                  {formatDateFR(goal.targetDate)}
                </span>
              </span>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={`Actions pour ${goal.name}`}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil aria-hidden="true" />
              Modifier
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 aria-hidden="true" />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <GoalHint goal={goal} />

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={completed ? 'outline' : 'default'}
          onClick={onDeposit}
          className="min-h-11 sm:min-h-10"
          aria-describedby={titleId}
        >
          <ArrowDownToLine aria-hidden="true" />
          Verser
        </Button>
        <Button
          variant="outline"
          onClick={onWithdraw}
          disabled={goal.savedAmount <= 0}
          className="min-h-11 sm:min-h-10"
          aria-describedby={titleId}
        >
          <ArrowUpFromLine aria-hidden="true" />
          Retirer
        </Button>
      </div>
    </motion.article>
  );
}

function GoalHint({ goal }: { goal: GoalProgress }) {
  if (goal.status === 'COMPLETED') {
    return <p className="text-success text-sm">Bravo, la cible est atteinte.</p>;
  }
  if (goal.status === 'OVERDUE') {
    return (
      <p className="text-muted-foreground text-sm">
        La date cible est passée. Il reste <Money value={goal.remaining} decimals={0} /> à épargner
        : vous pouvez fixer une nouvelle date.
      </p>
    );
  }
  if (goal.monthlyNeeded !== null) {
    return (
      <p className={cn('text-sm', goal.status === 'AT_RISK' ? 'text-warning' : 'text-foreground')}>
        <Money value={goal.monthlyNeeded} decimals={0} className="font-semibold" />
        /mois pour tenir la date
        {goal.monthsLeft !== null && goal.monthsLeft > 0 && (
          <span className="text-muted-foreground">
            {' '}
            · {goal.monthsLeft} mois restant{goal.monthsLeft > 1 ? 's' : ''}
          </span>
        )}
      </p>
    );
  }
  return (
    <p className="text-muted-foreground text-sm">
      Reste <Money value={goal.remaining} decimals={0} /> à épargner, à votre rythme.
    </p>
  );
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

/** Teinte lisible en clair comme en sombre (même mélange que les icônes de catégorie). */
function ringColor(color: string): string {
  const safe = HEX_RE.test(color) ? color : '#64748B';
  return `color-mix(in oklab, ${safe} var(--category-ink, 85%), var(--foreground))`;
}

const RADIUS = 26;
const STROKE = 6;
const SIZE = (RADIUS + STROKE) * 2;

/** Anneau de progression accessible (role="progressbar") avec l'icône au centre. */
function GoalRing({ goal }: { goal: GoalProgress }) {
  const { discreet } = useDiscreetMode();
  const reducedMotion = useReducedMotion() ?? false;
  const pct = goalPercent(goal);
  const { circumference, offset } = ringGeometry(goal.ratio, RADIUS);
  return (
    <div
      role="progressbar"
      aria-label={`Progression de ${goal.name}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`${goalValueText(goal, discreet)} (${pct} %)`}
      className="relative grid shrink-0 place-items-center"
      style={{ width: SIZE, height: SIZE, color: ringColor(goal.color) }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={STROKE}
        />
        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={reducedMotion ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: reducedMotion ? 0 : 0.6, ease: 'easeOut' }}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        <IconByName name={goal.icon} className="size-5" aria-hidden="true" />
      </span>
      <span className="bg-card text-foreground absolute -bottom-1 rounded-full px-1.5 text-[11px] font-semibold tabular-nums">
        {pct} %
      </span>
    </div>
  );
}
