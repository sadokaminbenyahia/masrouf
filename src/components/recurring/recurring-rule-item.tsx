'use client';
import { useId } from 'react';
import { CalendarClock, MoreHorizontal, Pencil, Trash2, Zap } from 'lucide-react';
import { formatDateFR, type ISODate } from '@/domain/dates';
import type { AccountWithBalance, Category, RecurringRule } from '@/domain/types';
import { cn } from '@/lib/utils';
import { CategoryIcon } from '@/components/shared/category-icon';
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
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { dueLabelFR, frequencyLabel } from './recurring-math';

interface RecurringRuleItemProps {
  rule: RecurringRule;
  category: Category | undefined;
  account: AccountWithBalance | undefined;
  today: ISODate;
  /** Règle en cours de création (optimiste) : actions désactivées */
  pendingCreate: boolean;
  onToggle: (rule: RecurringRule, active: boolean) => void;
  onEdit: (rule: RecurringRule) => void;
  onDelete: (rule: RecurringRule) => void;
}

function scheduleText(rule: RecurringRule, today: ISODate): string {
  if (rule.endDate !== null && rule.endDate < today) {
    return `Terminée le ${formatDateFR(rule.endDate, 'long')}`;
  }
  if (!rule.active) return 'En pause';
  return `Prochaine échéance : ${dueLabelFR(rule.nextDate, today)}`;
}

export function RecurringRuleItem({
  rule,
  category,
  account,
  today,
  pendingCreate,
  onToggle,
  onEdit,
  onDelete,
}: RecurringRuleItemProps) {
  const titleId = useId();
  const overdue =
    rule.active && rule.nextDate < today && (rule.endDate === null || rule.endDate >= today);
  return (
    <li
      aria-labelledby={titleId}
      aria-busy={pendingCreate || undefined}
      className={cn(
        'flex items-start gap-3 px-4 py-4 transition-opacity sm:items-center sm:px-5',
        !rule.active && 'opacity-60',
        pendingCreate && 'animate-pulse motion-reduce:animate-none',
      )}
    >
      <CategoryIcon icon={category?.icon ?? 'Repeat'} color={category?.color ?? '#5B6470'} />
      {/* Mobile : en-tête (libellé + montant), détails pleine largeur, puis commandes en bas.
          ≥ sm : une seule ligne, montant et commandes à droite. */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-3">
            <p id={titleId} className="min-w-0 font-medium break-words">
              {rule.label}
            </p>
            <Money
              value={rule.amount}
              type={rule.type}
              className="shrink-0 font-semibold sm:hidden"
            />
          </div>
          {(rule.autoCreate || overdue) && (
            <div className="flex flex-wrap items-center gap-2">
              {rule.autoCreate && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="secondary"
                      tabIndex={0}
                      className="focus-visible:ring-ring/50 cursor-help outline-none focus-visible:ring-[3px]"
                    >
                      <Zap aria-hidden="true" />
                      Saisie auto
                      <span className="sr-only">
                        {' '}
                        : les transactions sont créées automatiquement à l’échéance
                      </span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Les transactions sont créées automatiquement à l’échéance
                  </TooltipContent>
                </Tooltip>
              )}
              {overdue && <Badge variant="warning">En retard</Badge>}
            </div>
          )}
          <p className="text-muted-foreground text-sm">
            {frequencyLabel(rule.frequency)}
            {account && ` · ${account.name}`}
            {category ? ` · ${category.name}` : ' · Sans catégorie'}
          </p>
          <p className="text-muted-foreground flex items-start gap-1.5 text-sm">
            <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {scheduleText(rule, today)}
          </p>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-4">
          <Money value={rule.amount} type={rule.type} className="hidden font-semibold sm:inline" />
          <div className="flex items-center gap-2 sm:gap-1">
            <Switch
              checked={rule.active}
              disabled={pendingCreate}
              onCheckedChange={(v) => onToggle(rule, v)}
              aria-label={`Active : ${rule.label}`}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 md:size-10"
                  disabled={pendingCreate}
                  aria-label={`Actions pour ${rule.label}`}
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onEdit(rule)}>
                  <Pencil aria-hidden="true" />
                  Modifier
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => onDelete(rule)}>
                  <Trash2 aria-hidden="true" />
                  Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </li>
  );
}
