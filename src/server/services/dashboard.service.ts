// Propriétaire : agent A
import 'server-only';
import type { DateRange, YearMonth } from '@/domain/dates';
import type { Result } from '@/domain/result';
import type { CategorySlice, DashboardData, MonthTotals } from '@/domain/types';
import { notImplemented } from './_stub';

/** Matérialise d'abord les récurrences échues, puis agrège. `month` défaut = mois courant. */
export async function getDashboard(
  _userId: string,
  _month?: YearMonth,
): Promise<Result<DashboardData>> {
  return notImplemented('getDashboard');
}
export async function getCategoryBreakdown(
  _userId: string,
  _range: DateRange,
  _type: 'EXPENSE' | 'INCOME',
): Promise<Result<CategorySlice[]>> {
  return notImplemented('getCategoryBreakdown');
}
/** `months` mois se terminant par `endMonth` (inclus). */
export async function getMonthlySeries(
  _userId: string,
  _months: number,
  _endMonth?: YearMonth,
): Promise<Result<MonthTotals[]>> {
  return notImplemented('getMonthlySeries');
}
