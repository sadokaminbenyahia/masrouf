/**
 * Objectifs d'épargne : progression, épargne mensuelle nécessaire et statut (pur).
 */
import { diffMonthsYM, monthOf, parseISODate, type ISODate } from './dates';
import type { Millimes } from './money';
import type { Goal, GoalProgress } from './types';

/**
 * Mois entiers restants entre `today` et `targetDate` (0 si la date est dans moins d'un mois
 * ou passée). Ex. 4 nov. → 4 avr. = 5 ; 4 nov. → 3 avr. = 4.
 */
export function monthsUntil(today: ISODate, targetDate: ISODate): number {
  let months = diffMonthsYM(monthOf(today), monthOf(targetDate));
  if (parseISODate(targetDate).day < parseISODate(today).day) months -= 1;
  return Math.max(0, months);
}

export function computeGoalProgress(
  goal: Goal,
  today: ISODate,
  opts: {
    /** Capacité d'épargne mensuelle estimée (revenus − dépenses moyens) ; null si inconnue */
    monthlyCapacity?: Millimes | null;
  } = {},
): GoalProgress {
  const remaining = Math.max(0, goal.targetAmount - goal.savedAmount);
  const ratio = goal.targetAmount > 0 ? goal.savedAmount / goal.targetAmount : 0;
  const completed = goal.savedAmount >= goal.targetAmount;
  const monthsLeft = goal.targetDate === null ? null : monthsUntil(today, goal.targetDate);

  let monthlyNeeded: Millimes | null = null;
  if (!completed && monthsLeft !== null) {
    monthlyNeeded = Math.ceil(remaining / Math.max(1, monthsLeft));
  }

  let status: GoalProgress['status'];
  if (completed) status = 'COMPLETED';
  else if (goal.targetDate === null) status = 'NO_DEADLINE';
  else if (goal.targetDate < today) status = 'OVERDUE';
  else {
    const capacity = opts.monthlyCapacity;
    const atRisk =
      capacity !== undefined &&
      capacity !== null &&
      monthlyNeeded !== null &&
      monthlyNeeded > Math.max(0, capacity);
    status = atRisk ? 'AT_RISK' : 'ON_TRACK';
  }

  return { ...goal, ratio, remaining, monthlyNeeded, monthsLeft, status };
}

/**
 * Applique un versement (> 0) ou un retrait (< 0). L'épargne ne descend pas sous 0 ;
 * `completedAt` est renseigné quand la cible est atteinte et remis à null en dessous.
 */
export function applyContribution(
  goal: Pick<Goal, 'savedAmount' | 'targetAmount' | 'completedAt'>,
  amount: Millimes,
  nowIso: string,
): { savedAmount: Millimes; completedAt: string | null } {
  const savedAmount = Math.max(0, goal.savedAmount + amount);
  return { savedAmount, completedAt: completionDate(savedAmount, goal.targetAmount, goal.completedAt, nowIso) };
}

/** Date d'atteinte cohérente avec le montant épargné (conserve la date existante si déjà atteint). */
export function completionDate(
  savedAmount: Millimes,
  targetAmount: Millimes,
  previous: string | null,
  nowIso: string,
): string | null {
  if (savedAmount < targetAmount) return null;
  return previous ?? nowIso;
}

export function sortGoals<T extends Pick<Goal, 'sortOrder' | 'name'>>(goals: readonly T[]): T[] {
  return [...goals].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'fr'));
}
