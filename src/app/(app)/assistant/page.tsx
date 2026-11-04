import type { Metadata } from 'next';
import { AlertCircleIcon, ShieldCheckIcon } from 'lucide-react';
import { addMonthsYM, monthOf, parseISODate, type ISODate, type YearMonth } from '@/domain/dates';
import { AssistantChat } from '@/components/assistant/assistant-chat';
import { MonthlySummaryCard } from '@/components/assistant/monthly-summary-card';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { requireUserId } from '@/server/auth/session';
import { today as getToday } from '@/server/clock';
import { getExampleQuestions, getMonthlySummary } from '@/server/services/ai.service';

export const metadata: Metadata = { title: 'Assistant' };

/** Mois du résumé par défaut : le mois précédent avant le 5, sinon le mois courant. */
function defaultSummaryMonth(today: ISODate): YearMonth {
  const current = monthOf(today);
  return parseISODate(today).day < 5 ? addMonthsYM(current, -1) : current;
}

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await requireUserId();
  const today = getToday();
  const params = await searchParams;
  const rawQ = params.q;
  const initialQuestion = (typeof rawQ === 'string' ? rawQ : (rawQ?.[0] ?? '')).slice(0, 300);
  const month = defaultSummaryMonth(today);
  const [summary, examples] = await Promise.all([
    getMonthlySummary(userId, month),
    getExampleQuestions(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="Assistant"
        description="Posez vos questions sur vos dépenses, budgets et objectifs, en français."
        actions={
          <Badge variant="success" className="gap-1.5 px-2.5 py-1 text-xs">
            <ShieldCheckIcon aria-hidden="true" />
            100 % local
          </Badge>
        }
        className="mb-0"
      />
      <p className="text-muted-foreground -mt-3 flex items-start gap-2 text-xs">
        <ShieldCheckIcon className="text-success mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Vos questions sont analysées directement sur le serveur de Masrouf, sans service
        d’intelligence artificielle externe : aucune donnée ne quitte le serveur.
      </p>

      {summary.ok ? (
        <MonthlySummaryCard summary={summary.value} maxMonth={monthOf(today)} />
      ) : (
        <div
          data-testid="monthly-summary"
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive flex items-start gap-2 rounded-xl border p-4 text-sm"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Le résumé mensuel est momentanément indisponible : {summary.error.message}
        </div>
      )}

      <AssistantChat examples={examples} initialQuestion={initialQuestion || undefined} />
    </div>
  );
}
