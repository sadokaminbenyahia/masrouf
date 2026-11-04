'use server';
import { z } from 'zod';
import type { ActionResult } from '@/domain/result';
import type { CategorySlice, DashboardData, MonthTotals } from '@/domain/types';
import { flowTypeSchema, isoDateSchema, yearMonthSchema } from '@/lib/schemas/common';
import { validatedAction } from '@/server/actions/safe-action';
import * as dashboard from '@/server/services/dashboard.service';

export async function getDashboardAction(month?: string): Promise<ActionResult<DashboardData>> {
  return validatedAction(yearMonthSchema.optional(), month, (m, userId) =>
    dashboard.getDashboard(userId, m),
  );
}

export async function getCategoryBreakdownAction(input: {
  from: string;
  to: string;
  type: 'EXPENSE' | 'INCOME';
}): Promise<ActionResult<CategorySlice[]>> {
  return validatedAction(
    z.object({ from: isoDateSchema, to: isoDateSchema, type: flowTypeSchema }),
    input,
    (d, userId) => dashboard.getCategoryBreakdown(userId, { from: d.from, to: d.to }, d.type),
  );
}

export async function getMonthlySeriesAction(input: {
  months: number;
  endMonth?: string;
}): Promise<ActionResult<MonthTotals[]>> {
  return validatedAction(
    z.object({ months: z.number().int().min(1).max(36), endMonth: yearMonthSchema.optional() }),
    input,
    (d, userId) => dashboard.getMonthlySeries(userId, d.months, d.endMonth),
  );
}
