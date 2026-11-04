/**
 * Pont TanStack Query ↔ server actions : les actions renvoient un ActionResult, la couche
 * query attend une valeur ou une exception. `unwrap` convertit sans perdre l'erreur typée.
 */
import type { ActionResult, AppError } from '@/domain/result';

export class ActionError extends Error {
  readonly code: AppError['code'];
  readonly fieldErrors?: Record<string, string[]>;
  constructor(error: AppError) {
    super(error.message);
    this.name = 'ActionError';
    this.code = error.code;
    if (error.fieldErrors) this.fieldErrors = error.fieldErrors;
  }
}

export function unwrap<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new ActionError(result.error);
  return result.value;
}

/** Message utilisateur pour n'importe quelle erreur (ActionError, Error, inconnu). */
export function errorMessage(e: unknown): string {
  if (e instanceof ActionError || e instanceof Error) return e.message;
  return 'Une erreur inattendue est survenue.';
}

/** Clés de cache TanStack Query (une seule source de vérité). */
export const queryKeys = {
  accounts: ['accounts'] as const,
  categories: ['categories'] as const,
  tags: ['tags'] as const,
  transactions: (query?: unknown) =>
    query === undefined ? (['transactions'] as const) : (['transactions', query] as const),
  recurring: ['recurring'] as const,
  budgets: (month?: string) =>
    month === undefined ? (['budgets'] as const) : (['budgets', month] as const),
  goals: ['goals'] as const,
  dashboard: (month?: string) =>
    month === undefined ? (['dashboard'] as const) : (['dashboard', month] as const),
  breakdown: (params?: unknown) =>
    params === undefined ? (['breakdown'] as const) : (['breakdown', params] as const),
  monthlySeries: (params?: unknown) =>
    params === undefined ? (['monthly-series'] as const) : (['monthly-series', params] as const),
  profile: ['profile'] as const,
  ai: {
    anomalies: ['ai', 'anomalies'] as const,
    forecast: ['ai', 'forecast'] as const,
    health: ['ai', 'health'] as const,
    summary: (month: string) => ['ai', 'summary', month] as const,
    recurringSuggestions: ['ai', 'recurring-suggestions'] as const,
    budgetSuggestions: ['ai', 'budget-suggestions'] as const,
  },
} as const;
