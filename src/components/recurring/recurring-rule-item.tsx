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
  const overdue = rule.active && rule.nextDate < today && (rule.endDate === null || rule.endDate >= today);
  return (
    <li
      aria-labelledby={titleId}
      aria-busy={pendingCreate || undefined}
      className={cn(
        'flex gap-3 px-4 py-4 transition-opacity sm:items-center sm:px-5',
        !rule.active && 'opacity-60',
        pendingCreate && 'animate-pulse motion-reduce:animate-none',
      )}
    >
      <CategoryIcon icon={category?.icon ?? 'Repeat'} color={category?.color ?? '#5B6470'} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p id={titleId} className="truncate font-medium">
            {rule.label}
          </p>
          {rule.autoCreate && (
            <Badge variant="secondary">
              <Zap aria-hidden="true" />
              Créée automatiquement
            </Badge>
          )}
          {overdue && <Badge variant="warning">En retard</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {frequencyLabel(rule.frequency)}
          {account && ` · ${account.name}`}
          {category ? ` · ${category.name}` : ' · Sans catégorie'}
        </p>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
          {scheduleText(rule, today)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Money value={rule.amount} type={rule.type} className="font-semibold" />
        <div className="flex items-center gap-1">
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
    </li>
  );
}
