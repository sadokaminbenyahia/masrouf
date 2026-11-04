// Propriétaire : agent K — implémentation serveur des outils typés de l'assistant (scopés userId)
import 'server-only';
import type { BalanceForecast, FinanceTools } from '@/domain/ai/types';
import { merchantKey } from '@/domain/ai/text';
import { listMonths, monthOf } from '@/domain/dates';
import type { Result } from '@/domain/result';
import type { MonthTotals } from '@/domain/types';
import * as repo from '@/server/repositories/assistant.repo';
import { listAccounts } from './accounts.service';
import { listBudgetProgress } from './budgets.service';
import { listGoals } from './goals.service';
import { listRecurring } from './recurring.service';

/**
 * `deps` est injecté par ai.service (évite le cycle ai.service ↔ finance-tools).
 * Lectures de transactions via src/server/repositories/assistant.repo.ts (agent K).
 */
export interface FinanceToolsDeps {
  forecast: () => Promise<BalanceForecast>;
}

/** Nombre maximal de mois renvoyés par `monthlyTotals`. */
const MAX_MONTHS = 60;

/** Un Result en erreur devient une exception : askAssistant la capture et s'excuse. */
function unwrapOrThrow<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

function titleCase(key: string): string {
  return key.replace(/(^|\s)(\p{L})/gu, (_m, sp: string, ch: string) => sp + ch.toUpperCase());
}

export function createFinanceTools(userId: string, deps: FinanceToolsDeps): FinanceTools {
  return {
    sumTransactions: (f) => repo.sumAmount(userId, f),

    async breakdownByCategory(f) {
      const rows = await repo.sumByCategory(userId, f);
      const ids = rows.flatMap((r) => (r.categoryId ? [r.categoryId] : []));
      const names = await repo.categoryNames(userId, ids);
      return rows
        .map((r) => ({
          ...r,
          name: r.categoryId ? (names.get(r.categoryId) ?? 'Sans catégorie') : 'Sans catégorie',
        }))
        .sort((a, b) => b.total - a.total);
    },

    async monthlyTotals(f) {
      const months = listMonths(monthOf(f.range.from), monthOf(f.range.to)).slice(-MAX_MONTHS);
      const byMonth = new Map<string, MonthTotals>(
        months.map((month) => [month, { month, income: 0, expense: 0, net: 0 }]),
      );
      for (const row of await repo.sumByDayAndType(userId, f)) {
        const m = byMonth.get(monthOf(row.date));
        if (!m) continue;
        if (row.type === 'INCOME') m.income += row.total;
        else m.expense += row.total;
        m.net = m.income - m.expense;
      }
      return [...byMonth.values()];
    },

    listTransactions: (f) => repo.listForTool(userId, f, f.sort, f.limit),

    async topMerchants(f) {
      const groups = new Map<string, { label: string; total: number; count: number }>();
      for (const row of await repo.sumByLabel(userId, f)) {
        const key = merchantKey(row.label) || row.label.trim().toLowerCase();
        const cur = groups.get(key) ?? { label: titleCase(key), total: 0, count: 0 };
        groups.set(key, { ...cur, total: cur.total + row.total, count: cur.count + row.count });
      }
      return [...groups.values()].sort((a, b) => b.total - a.total).slice(0, Math.max(1, f.limit));
    },

    async budgetStatus(month) {
      return unwrapOrThrow(await listBudgetProgress(userId, month));
    },

    async goals() {
      return unwrapOrThrow(await listGoals(userId));
    },

    async balances() {
      const accounts = unwrapOrThrow(await listAccounts(userId));
      const active = accounts.filter((a) => !a.archived);
      return {
        total: active.reduce((s, a) => s + a.balance, 0),
        accounts: active.map((a) => ({ id: a.id, name: a.name, balance: a.balance })),
      };
    },

    forecast: () => deps.forecast(),

    async recurring() {
      return unwrapOrThrow(await listRecurring(userId));
    },
  };
}
