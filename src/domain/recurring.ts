/**
 * Récurrences : calcul des échéances (pur).
 *  - WEEKLY : +7 jours.
 *  - MONTHLY / QUARTERLY / YEARLY : +1 / +3 / +12 mois, ancrés sur le JOUR de `startDate`
 *    (un 31 donne la fin de mois, sans dérive : 31 janv. → 28 févr. → 31 mars).
 */
import { addDays, addMonths, diffMonthsYM, monthOf, type ISODate } from './dates';
import type { Millimes } from './money';
import type { Frequency, RecurringRule } from './types';

/** Plafond d'occurrences créées par règle et par matérialisation. */
export const MAX_OCCURRENCES_PER_RUN = 60;

const MONTH_STEP: Record<Exclude<Frequency, 'WEEKLY'>, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
};

/** Échéance suivant `current` (strictement après). */
export function nextOccurrence(
  rule: Pick<RecurringRule, 'frequency' | 'startDate'>,
  current: ISODate,
): ISODate {
  if (current < rule.startDate) return rule.startDate;
  if (rule.frequency === 'WEEKLY') return addDays(current, 7);
  const step = MONTH_STEP[rule.frequency];
  // Nombre de pas déjà écoulés depuis le début, puis pas suivant à partir de startDate.
  const elapsed = Math.floor(diffMonthsYM(monthOf(rule.startDate), monthOf(current)) / step);
  let n = Math.max(0, elapsed) + 1;
  let next = addMonths(rule.startDate, n * step);
  while (next <= current) {
    n += 1;
    next = addMonths(rule.startDate, n * step);
  }
  return next;
}

/** Première échéance ≥ `from` (startDate si elle est déjà ≥ from). */
export function firstOccurrenceOnOrAfter(
  rule: Pick<RecurringRule, 'frequency' | 'startDate'>,
  from: ISODate,
): ISODate {
  let d = rule.startDate;
  let guard = 0;
  while (d < from && guard < 10_000) {
    d = nextOccurrence(rule, d);
    guard += 1;
  }
  return d;
}

export interface DueOccurrences {
  /** Dates à matérialiser, dans l'ordre */
  dates: ISODate[];
  /** Nouvelle valeur de `nextDate` */
  nextDate: ISODate;
}

/**
 * Échéances dues (≤ today) d'une règle active, sans dépasser `endDate`, plafonnées à `max`.
 * Une règle inactive ou dont l'échéance est future ne produit rien.
 */
export function dueOccurrences(
  rule: Pick<RecurringRule, 'frequency' | 'startDate' | 'nextDate' | 'endDate' | 'active'>,
  today: ISODate,
  max: number = MAX_OCCURRENCES_PER_RUN,
): DueOccurrences {
  const dates: ISODate[] = [];
  let next = rule.nextDate;
  if (!rule.active) return { dates, nextDate: next };
  while (next <= today && dates.length < max) {
    if (rule.endDate !== null && next > rule.endDate) break;
    dates.push(next);
    next = nextOccurrence(rule, next);
  }
  return { dates, nextDate: next };
}

/** Équivalent mensuel d'une règle (pour un « total mensuel »). */
export function monthlyEquivalent(rule: Pick<RecurringRule, 'frequency' | 'amount'>): Millimes {
  switch (rule.frequency) {
    case 'WEEKLY':
      return Math.round((rule.amount * 52) / 12);
    case 'MONTHLY':
      return rule.amount;
    case 'QUARTERLY':
      return Math.round(rule.amount / 3);
    case 'YEARLY':
      return Math.round(rule.amount / 12);
  }
}

/** Charges fixes mensuelles : équivalent mensuel des règles de dépense actives. */
export function monthlyFixedCharges(rules: readonly RecurringRule[]): Millimes {
  let total = 0;
  for (const r of rules) if (r.active && r.type === 'EXPENSE') total += monthlyEquivalent(r);
  return total;
}

/** Règles actives dont l'échéance tombe dans [today, today + days], triées, limitées. */
export function upcomingRules(
  rules: readonly RecurringRule[],
  today: ISODate,
  days: number,
  limit: number,
): RecurringRule[] {
  const until = addDays(today, days);
  return rules
    .filter(
      (r) =>
        r.active &&
        r.nextDate >= today &&
        r.nextDate <= until &&
        (r.endDate === null || r.nextDate <= r.endDate),
    )
    .sort(
      (a, b) =>
        (a.nextDate < b.nextDate ? -1 : a.nextDate > b.nextDate ? 1 : 0) ||
        a.label.localeCompare(b.label, 'fr'),
    )
    .slice(0, limit);
}

export function sortRules(rules: readonly RecurringRule[]): RecurringRule[] {
  return [...rules].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      (a.nextDate < b.nextDate ? -1 : a.nextDate > b.nextDate ? 1 : 0) ||
      a.label.localeCompare(b.label, 'fr'),
  );
}
