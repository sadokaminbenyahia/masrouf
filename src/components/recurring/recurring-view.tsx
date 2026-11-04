'use client';
import { useMemo, useState } from 'react';
import { Plus, Repeat } from 'lucide-react';
import type { ISODate } from '@/domain/dates';
import type { AccountWithBalance, Category, RecurringRule } from '@/domain/types';
import {
  useAccountMap,
  useAccounts,
  useCategories,
  useCategoryMap,
} from '@/lib/hooks/use-reference-data';
import { errorMessage } from '@/lib/query';
import { toastSuccess, toastUndo } from '@/lib/toast';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { TableSkeleton } from '@/components/shared/skeletons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RecurringFormDialog } from './recurring-form-dialog';
import { monthlyTotals, sortRules, upcomingOccurrences } from './recurring-math';
import { RecurringRuleItem } from './recurring-rule-item';
import { RecurringSuggestions } from './recurring-suggestions';
import { RecurringSummary } from './recurring-summary';
import { UpcomingTimeline } from './upcoming-timeline';
import {
  isTempRule,
  useDeleteRecurring,
  useRecurringRules,
  useUpdateRecurring,
} from './use-recurring';

interface RecurringViewProps {
  today: ISODate;
  initialRules: RecurringRule[];
  initialAccounts?: AccountWithBalance[];
  initialCategories?: Category[];
}

export function RecurringView({
  today,
  initialRules,
  initialAccounts,
  initialCategories,
}: RecurringViewProps) {
  const rulesQuery = useRecurringRules(initialRules);
  const accounts = useAccounts(initialAccounts).data ?? [];
  const categories = useCategories(initialCategories).data ?? [];
  const accountMap = useAccountMap(initialAccounts);
  const categoryMap = useCategoryMap(initialCategories);
  const update = useUpdateRecurring();
  const remove = useDeleteRecurring();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [deleting, setDeleting] = useState<RecurringRule | null>(null);

  const rules = useMemo(() => sortRules(rulesQuery.data ?? []), [rulesQuery.data]);
  const totals = useMemo(() => monthlyTotals(rules, today), [rules, today]);
  const upcoming = useMemo(() => upcomingOccurrences(rules, today, 30), [rules, today]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const toggle = (rule: RecurringRule, active: boolean, withUndo = true) => {
    update.mutate(
      { id: rule.id, patch: { active } },
      {
        onSuccess: () => {
          if (!withUndo) return;
          toastUndo(
            active ? `« ${rule.label} » réactivée.` : `« ${rule.label} » mise en pause.`,
            () => toggle(rule, !active, false),
          );
        },
      },
    );
  };

  const newButton = (
    <Button type="button" onClick={openCreate}>
      <Plus aria-hidden="true" />
      Nouvelle récurrence
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Dépenses récurrentes"
        description="Loyer, abonnements, factures : vos échéances régulières et leur poids sur le mois."
        actions={newButton}
      />

      <div className="space-y-8">
        <RecurringSummary totals={totals} />

        <RecurringSuggestions />

        <section aria-labelledby="rules-title" className="space-y-3">
          <h2 id="rules-title" className="text-lg font-semibold">
            Vos récurrences
          </h2>
          {rulesQuery.isError && (
            <Alert variant="destructive" role="alert">
              <AlertTitle>Actualisation impossible</AlertTitle>
              <AlertDescription>{errorMessage(rulesQuery.error)}</AlertDescription>
            </Alert>
          )}
          {rulesQuery.isPending ? (
            <TableSkeleton rows={4} />
          ) : rules.length === 0 ? (
            <EmptyState
              icon={Repeat}
              title="Aucune dépense récurrente"
              description="Ajoutez votre loyer, vos abonnements, votre facture internet… Masrouf les enregistrera à chaque échéance."
              action={newButton}
            />
          ) : (
            <ul className="bg-card divide-y rounded-xl border">
              {rules.map((rule) => (
                <RecurringRuleItem
                  key={rule.id}
                  rule={rule}
                  category={rule.categoryId ? categoryMap.get(rule.categoryId) : undefined}
                  account={accountMap.get(rule.accountId)}
                  today={today}
                  pendingCreate={isTempRule(rule)}
                  onToggle={(r, active) => toggle(r, active)}
                  onEdit={(r) => {
                    setEditing(r);
                    setFormOpen(true);
                  }}
                  onDelete={setDeleting}
                />
              ))}
            </ul>
          )}
        </section>

        {rules.length > 0 && (
          <UpcomingTimeline items={upcoming} categoryMap={categoryMap} today={today} />
        )}
      </div>

      <RecurringFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        rule={editing}
        accounts={accounts}
        categories={categories}
        today={today}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title="Supprimer cette récurrence ?"
        description={
          deleting
            ? `« ${deleting.label} » ne sera plus enregistrée automatiquement. Les transactions déjà créées sont conservées.`
            : ''
        }
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          if (!deleting) return;
          const target = deleting;
          remove.mutate(target.id, {
            onSuccess: () => toastSuccess(`Récurrence « ${target.label} » supprimée.`),
          });
        }}
      />
    </>
  );
}
