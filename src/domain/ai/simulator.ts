// Propriétaire : agent K — simulateur « et si »
import {
  addMonths,
  addMonthsYM,
  formatMonthFR,
  monthOf,
  type ISODate,
  type YearMonth,
} from '../dates';
import { formatMoney, type Millimes } from '../money';
import { savedAmount, withSavingsGroup } from '../savings';
import type { MonthTotals } from '../types';
import type { WhatIfInput, WhatIfResult } from './types';

/** Plafond de la projection, en mois. */
export const MAX_SIMULATION_MONTHS = 120;
/** Longueur minimale de la projection, en mois. */
export const MIN_TIMELINE_MONTHS = 6;
/** Mois affichés après la dernière date d'atteinte. */
const TIMELINE_TAIL_MONTHS = 2;

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid] ?? 0;
  const lo = sorted[mid - 1] ?? hi;
  return sorted.length % 2 === 1 ? hi : (lo + hi) / 2;
}

/**
 * Épargne mensuelle de référence : médiane de l'épargne (définition unique de
 * src/domain/savings.ts : revenus − dépenses hors groupe Épargne) sur les 3 derniers mois,
 * complets si possible (le mois de `today`, partiel, est écarté s'il existe des mois antérieurs).
 */
export function baselineMonthlySaving(
  monthly: readonly MonthTotals[],
  today: ISODate,
  savingsGroupByMonth: readonly { month: YearMonth; amount: Millimes }[] = [],
): Millimes {
  const current = monthOf(today);
  const sorted = [...monthly].sort((a, b) => (a.month < b.month ? -1 : 1));
  const complete = sorted.filter((m) => m.month < current);
  const pool = complete.length > 0 ? complete : sorted.filter((m) => m.month <= current);
  const last3 = pool.slice(-3);
  const groups = new Map(savingsGroupByMonth.map((g) => [g.month, g.amount]));
  return Math.round(median(withSavingsGroup(last3, groups).map((m) => savedAmount(m))));
}

/** Nombre de mois pour combler `remaining` au rythme `saving` (null si jamais). */
export function monthsToReach(remaining: Millimes, saving: Millimes): number | null {
  if (remaining <= 0) return 0;
  if (saving <= 0) return null;
  const n = Math.ceil(remaining / saving);
  return n > MAX_SIMULATION_MONTHS ? null : n;
}

function joinFr(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1] ?? ''}`;
}

export function simulateWhatIf(input: WhatIfInput): WhatIfResult {
  const { today, goal } = input;
  const baseline = baselineMonthlySaving(input.monthly, today, input.savingsGroupByMonth);

  const spending = new Map(input.categorySpending.map((c) => [c.categoryId, c]));
  const applied: { name: string; percent: number; gain: Millimes }[] = [];
  for (const adj of input.adjustments) {
    const cat = spending.get(adj.categoryId);
    const percent = Math.min(100, Math.max(0, adj.percent));
    if (!cat || percent === 0) continue;
    const gain = Math.round((percent / 100) * Math.max(0, cat.monthlyAverage));
    applied.push({ name: cat.name, percent, gain });
  }
  const extra = Math.max(0, Math.round(input.extraMonthlySaving));
  const scenario = baseline + applied.reduce((s, a) => s + a.gain, 0) + extra;

  const remaining = Math.max(0, goal.targetAmount - goal.savedAmount);
  const baseMonths = monthsToReach(remaining, baseline);
  const scenMonths = monthsToReach(remaining, scenario);
  const baselineDate = baseMonths === null ? null : addMonths(today, baseMonths);
  const scenarioDate = scenMonths === null ? null : addMonths(today, scenMonths);
  const monthsSaved = baseMonths !== null && scenMonths !== null ? baseMonths - scenMonths : null;

  // Projection cumulée : part du montant déjà épargné (mois courant) et s'arrête 2 mois après
  // la dernière date d'atteinte (scénario ou rythme actuel), entre 6 et 120 mois.
  const reached = [baseMonths, scenMonths].filter((n): n is number => n !== null);
  const horizon = Math.min(
    MAX_SIMULATION_MONTHS,
    Math.max(
      MIN_TIMELINE_MONTHS,
      reached.length > 0 ? Math.max(...reached) + TIMELINE_TAIL_MONTHS : 0,
    ),
  );
  const start: YearMonth = monthOf(today);
  const timeline: WhatIfResult['timeline'] = [];
  const cap = Math.max(goal.targetAmount, goal.savedAmount);
  for (let k = 0; k <= horizon; k++) {
    timeline.push({
      month: addMonthsYM(start, k),
      baseline: Math.min(cap, goal.savedAmount + k * Math.max(0, baseline)),
      scenario: Math.min(cap, goal.savedAmount + k * Math.max(0, scenario)),
    });
  }

  return {
    baselineMonthlySaving: baseline,
    scenarioMonthlySaving: scenario,
    baselineDate,
    scenarioDate,
    monthsSaved,
    timeline,
    message: buildMessage({
      goalName: goal.name,
      targetDate: goal.targetDate,
      remaining,
      baseline,
      scenario,
      baselineDate,
      scenarioDate,
      monthsSaved,
      applied,
      extra,
    }),
  };
}

function buildMessage(p: {
  goalName: string;
  targetDate: ISODate | null;
  remaining: Millimes;
  baseline: Millimes;
  scenario: Millimes;
  baselineDate: ISODate | null;
  scenarioDate: ISODate | null;
  monthsSaved: number | null;
  applied: { name: string; percent: number; gain: Millimes }[];
  extra: Millimes;
}): string {
  const goal = `« ${p.goalName} »`;
  if (p.remaining <= 0) return `Bravo : l'objectif ${goal} est déjà atteint.`;

  const levers: string[] = p.applied.map(
    (a) => `réduisant ${a.name} de ${String(a.percent).replace('.', ',')} %`,
  );
  if (p.extra > 0)
    levers.push(`épargnant ${formatMoney(p.extra, { decimals: 0 })} de plus par mois`);
  const hasScenario = levers.length > 0;
  const intro = hasScenario
    ? `En ${joinFr(levers)}`
    : `À votre rythme actuel (${formatMoney(p.baseline, { decimals: 0 })} d'épargne par mois)`;

  let sentence: string;
  if (p.scenarioDate === null) {
    sentence = hasScenario
      ? `${intro}, votre épargne mensuelle resterait de ${formatMoney(p.scenario, { decimals: 0 })} : ${goal} ne serait pas atteint. Essayez d'ajuster d'autres catégories.`
      : `${intro}, ${goal} ne serait pas atteint. Réduire quelques dépenses vous permettrait d'avancer.`;
  } else {
    const when = formatMonthFR(monthOf(p.scenarioDate));
    sentence = `${intro}, vous atteignez ${goal} en ${when}`;
    if (hasScenario) {
      if (p.monthsSaved === null)
        sentence += `, alors qu'au rythme actuel il ne serait pas atteint`;
      else if (p.monthsSaved > 0) sentence += `, ${p.monthsSaved} mois plus tôt`;
      else sentence += `, à la même échéance qu'au rythme actuel`;
    }
    sentence += '.';
  }

  if (p.targetDate) {
    const target = formatMonthFR(monthOf(p.targetDate));
    if (p.scenarioDate !== null && p.scenarioDate <= p.targetDate) {
      sentence += ` Votre échéance (${target}) est tenue.`;
    } else {
      sentence += ` Pour tenir votre échéance (${target}), il faudra épargner davantage.`;
    }
  }
  return sentence;
}
