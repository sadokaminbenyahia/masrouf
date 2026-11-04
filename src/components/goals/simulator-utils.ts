/**
 * Fonctions pures du simulateur « Et si… ? » : période d'analyse, choix des catégories à
 * réduire, paramètres envoyés à l'action, lecture du résultat.
 */
import type { WhatIfResult } from '@/domain/ai/types';
import {
  addMonthsYM,
  diffMonthsYM,
  monthEnd,
  monthOf,
  monthStart,
  type DateRange,
  type ISODate,
} from '@/domain/dates';
import type { AppErrorCode } from '@/domain/result';
import type { Millimes } from '@/domain/money';
import type { Category, CategorySlice, GoalProgress } from '@/domain/types';
import type { WhatIfActionInput } from '@/lib/schemas/ai';

export const SIMULATOR_MONTHS = 3;
export const SIMULATOR_CATEGORY_LIMIT = 6;
export const MAX_REDUCTION = 50;
export const REDUCTION_STEP = 5;

/** Les 3 derniers mois complets (le mois en cours est partiel). */
export function simulatorRange(today: ISODate): DateRange {
  const current = monthOf(today);
  return {
    from: monthStart(addMonthsYM(current, -SIMULATOR_MONTHS)),
    to: monthEnd(addMonthsYM(current, -1)),
  };
}

export interface SimulatorCategory {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  group: Category['group'] | null;
  /** Moyenne mensuelle sur la période */
  monthlyAverage: Millimes;
}

/**
 * Les `limit` catégories de dépense les plus coûteuses (hors « sans catégorie » et épargne),
 * affichées avec les envies (WANTS) en premier, puis par montant décroissant.
 */
export function selectSimulatorCategories(
  slices: readonly CategorySlice[],
  categories: readonly Category[],
  limit = SIMULATOR_CATEGORY_LIMIT,
  months = SIMULATOR_MONTHS,
): SimulatorCategory[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const candidates: SimulatorCategory[] = [];
  for (const s of slices) {
    if (s.categoryId === null || s.amount <= 0) continue;
    const category = byId.get(s.categoryId);
    if (category && (category.kind !== 'EXPENSE' || category.group === 'SAVINGS')) continue;
    candidates.push({
      categoryId: s.categoryId,
      name: category?.name ?? s.name,
      icon: category?.icon ?? s.icon,
      color: category?.color ?? s.color,
      group: category?.group ?? null,
      monthlyAverage: Math.round(s.amount / months),
    });
  }
  const top = candidates.sort((a, b) => b.monthlyAverage - a.monthlyAverage).slice(0, limit);
  const rank = (c: SimulatorCategory) => (c.group === 'WANTS' ? 0 : 1);
  return top.sort((a, b) => rank(a) - rank(b) || b.monthlyAverage - a.monthlyAverage);
}

/** Économie mensuelle estimée pour une réduction donnée. */
export function estimatedSaving(monthlyAverage: Millimes, percent: number): Millimes {
  return Math.round((monthlyAverage * percent) / 100);
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const stepped = Math.round(value / REDUCTION_STEP) * REDUCTION_STEP;
  return Math.min(MAX_REDUCTION, Math.max(0, stepped));
}

export function percentValueText(percent: number): string {
  return `${percent} %`;
}

/** Paramètres normalisés (réductions non nulles triées : clé de cache stable). */
export function buildWhatIfInput(
  goalId: string,
  percents: Readonly<Record<string, number>>,
  extraMonthlySaving: Millimes | null,
): WhatIfActionInput {
  const adjustments = Object.entries(percents)
    .map(([categoryId, percent]) => ({ categoryId, percent: clampPercent(percent) }))
    .filter((a) => a.percent > 0)
    .sort((a, b) => a.categoryId.localeCompare(b.categoryId));
  return { goalId, adjustments, extraMonthlySaving: Math.max(0, extraMonthlySaving ?? 0) };
}

/** Objectifs simulables (non atteints). */
export function eligibleGoals(goals: readonly GoalProgress[]): GoalProgress[] {
  return goals.filter((g) => g.status !== 'COMPLETED' && g.remaining > 0);
}

export function whatIfErrorMessage(code: AppErrorCode | null, fallback: string): string {
  if (code === 'RATE_LIMITED')
    return 'Beaucoup de simulations d’affilée : patientez quelques secondes, puis réessayez.';
  if (code === 'NOT_FOUND') return 'Cet objectif n’existe plus. Choisissez-en un autre.';
  return fallback;
}

export type WhatIfOutcome =
  | { kind: 'NEVER' }
  | { kind: 'NOW_REACHABLE'; scenarioMonth: string }
  | { kind: 'SCENARIO_NEVER' }
  | { kind: 'COMPARED'; baselineMonth: string; scenarioMonth: string; monthsSaved: number };

/** Lecture du résultat : jamais atteint, atteint grâce au scénario, ou comparaison des dates. */
export function describeOutcome(result: WhatIfResult): WhatIfOutcome {
  const { baselineDate, scenarioDate } = result;
  if (scenarioDate === null) {
    return baselineDate === null ? { kind: 'NEVER' } : { kind: 'SCENARIO_NEVER' };
  }
  const scenarioMonth = monthOf(scenarioDate);
  if (baselineDate === null) return { kind: 'NOW_REACHABLE', scenarioMonth };
  const baselineMonth = monthOf(baselineDate);
  return {
    kind: 'COMPARED',
    baselineMonth,
    scenarioMonth,
    monthsSaved: result.monthsSaved ?? diffMonthsYM(scenarioMonth, baselineMonth),
  };
}

/** « 2 mois plus tôt », « 1 mois plus tard », « même échéance ». */
export function monthsSavedLabel(monthsSaved: number): string {
  if (monthsSaved === 0) return 'Même échéance';
  const n = Math.abs(monthsSaved);
  return `${n} mois ${monthsSaved > 0 ? 'plus tôt' : 'plus tard'}`;
}
