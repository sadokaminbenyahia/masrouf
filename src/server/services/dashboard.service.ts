// Propriétaire : agent A
import 'server-only';
import { totalBalance } from '@/domain/accounts';
import { aiEngine } from '@/server/ai/engine';
import {
  buildCategorySlices,
  buildMonthlySeries,
  categoryMonthSums,
  comparisonPeriod,
  dailyAllowance,
  relativeChange,
} from '@/domain/aggregations';
import { isBudgetAlert, summarizeBudgets } from '@/domain/budgets';
import {
  addMonthsYM,
  listMonths,
  monthEnd,
  monthOf,
  monthRange,
  monthStart,
  type DateRange,
  type ISODate,
  type YearMonth,
} from '@/domain/dates';
import { computeInsights } from '@/domain/insights';
import { upcomingRules } from '@/domain/recurring';
import { ok, type Result } from '@/domain/result';
import { toAiTransaction, totalsFromTypeSums } from '@/domain/transactions';
import type { CategorySlice, DashboardData, MonthTotals } from '@/domain/types';
import { today } from '@/server/clock';
import * as categoryRepo from '@/server/repositories/category.repo';
import { listDismissedKeys } from '@/server/repositories/dismissed.repo';
import * as txRepo from '@/server/repositories/transaction.repo';
import { listAccounts } from '@/server/services/accounts.service';
import { listBudgetProgress } from '@/server/services/budgets.service';
import { listRecurring, materializeDueRecurring } from '@/server/services/recurring.service';

/** Historique analysé pour la détection des abonnements. */
const DETECTION_MONTHS = 6;
const UPCOMING_DAYS = 30;
const UPCOMING_LIMIT = 5;
const TOP_EXPENSES = 5;

/** Mois de référence de la règle 50/30/20 : le mois affiché s'il est terminé, sinon le précédent. */
function ruleMonthFor(month: YearMonth, day: ISODate): YearMonth {
  return month < monthOf(day) ? month : addMonthsYM(monthOf(day), -1);
}

/** Matérialise d'abord les récurrences échues, puis agrège. `month` défaut = mois courant. */
export async function getDashboard(
  userId: string,
  month?: YearMonth,
): Promise<Result<DashboardData>> {
  const day = today();
  const materialized = await materializeDueRecurring(userId, day);
  if (!materialized.ok) return materialized;

  const ym = month ?? monthOf(day);
  const range = monthRange(ym);
  const prevRange = monthRange(addMonthsYM(ym, -1));
  const comparison = comparisonPeriod(ym, day);
  const ruleMonth = ruleMonthFor(ym, day);
  const detectionRange: DateRange = {
    from: monthStart(addMonthsYM(monthOf(day), -(DETECTION_MONTHS - 1))),
    to: day,
  };

  const [
    accounts,
    budgets,
    recurring,
    categories,
    currentSums,
    previousSums,
    comparisonSums,
    byCategory,
    monthly,
    topExpenses,
    ruleTotals,
    ruleByCategory,
    spikeRows,
    history,
    dismissedKeys,
  ] = await Promise.all([
    listAccounts(userId),
    listBudgetProgress(userId, ym),
    listRecurring(userId),
    categoryRepo.listCategories(userId),
    txRepo.sumByType(userId, range),
    txRepo.sumByType(userId, prevRange),
    comparison.range.to === prevRange.to
      ? Promise.resolve(null)
      : txRepo.sumByType(userId, comparison.range),
    getCategoryBreakdown(userId, range, 'EXPENSE'),
    getMonthlySeries(userId, 12, ym),
    txRepo.topTransactions(userId, range, 'EXPENSE', TOP_EXPENSES),
    txRepo.sumByType(userId, monthRange(ruleMonth)),
    txRepo.sumByCategory(userId, monthRange(ruleMonth), 'EXPENSE'),
    txRepo.sumByCategoryAndDay(
      userId,
      { from: monthStart(addMonthsYM(ym, -3)), to: monthEnd(ym) },
      'EXPENSE',
    ),
    txRepo.findInRange(userId, detectionRange, { types: ['EXPENSE', 'INCOME'] }),
    listDismissedKeys(userId),
  ]);
  if (!accounts.ok) return accounts;
  if (!budgets.ok) return budgets;
  if (!recurring.ok) return recurring;
  if (!byCategory.ok) return byCategory;
  if (!monthly.ok) return monthly;

  const current = totalsFromTypeSums(currentSums);
  const previous = totalsFromTypeSums(previousSums);
  const reference = comparisonSums === null ? previous : totalsFromTypeSums(comparisonSums);
  const summary = summarizeBudgets(budgets.value);
  const remainingToSpend = summary === null ? null : summary.remaining;

  const candidates = aiEngine.detectRecurring({
    today: day,
    transactions: history.map(toAiTransaction),
    existing: recurring.value,
  });
  const txInfo = new Map(history.map((t) => [t.id, { date: t.date, recurringId: t.recurringId }]));
  const ruleTotalsValue = totalsFromTypeSums(ruleTotals);

  const insights = computeInsights({
    today: day,
    categories,
    ruleMonth: {
      month: ruleMonth,
      income: ruleTotalsValue.income,
      expense: ruleTotalsValue.expense,
      byCategory: ruleByCategory,
    },
    spikeMonth: ym,
    categoryMonthly: categoryMonthSums(spikeRows),
    forgotten: { candidates, rules: recurring.value, transactions: txInfo },
    dismissedKeys,
  });

  return ok({
    today: day,
    month: ym,
    totalBalance: totalBalance(accounts.value),
    accounts: accounts.value,
    current,
    previous,
    expenseChange: relativeChange(current.expense, reference.expense),
    comparisonLabel: comparison.label,
    remainingToSpend,
    dailyAllowance: remainingToSpend === null ? null : dailyAllowance(remainingToSpend, ym, day),
    byCategory: byCategory.value,
    monthly: monthly.value,
    topExpenses,
    budgetAlerts: budgets.value.filter(isBudgetAlert),
    insights,
    upcomingRecurring: upcomingRules(recurring.value, day, UPCOMING_DAYS, UPCOMING_LIMIT),
  });
}

export async function getCategoryBreakdown(
  userId: string,
  range: DateRange,
  type: 'EXPENSE' | 'INCOME',
): Promise<Result<CategorySlice[]>> {
  const [sums, categories] = await Promise.all([
    txRepo.sumByCategory(userId, range, type),
    categoryRepo.listCategories(userId),
  ]);
  return ok(buildCategorySlices(sums, new Map(categories.map((c) => [c.id, c]))));
}

/** `months` mois se terminant par `endMonth` (inclus). */
export async function getMonthlySeries(
  userId: string,
  months: number,
  endMonth?: YearMonth,
): Promise<Result<MonthTotals[]>> {
  const end = endMonth ?? monthOf(today());
  const count = Math.max(1, Math.floor(months));
  const list = listMonths(addMonthsYM(end, -(count - 1)), end);
  const first = list[0] ?? end;
  const sums = await txRepo.sumByDayAndType(userId, { from: monthStart(first), to: monthEnd(end) });
  return ok(buildMonthlySeries(list, sums));
}
