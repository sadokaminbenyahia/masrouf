/**
 * Calculs purs de la page « Dépenses récurrentes » : équivalent mensuel, échéances à venir,
 * libellés de fréquence et d'échéance en français.
 */
import { addDays, addMonths, diffDays, formatDateFR, type ISODate } from '@/domain/dates';
import type { Millimes } from '@/domain/money';
import type { Frequency, RecurringRule } from '@/domain/types';

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  WEEKLY: 'Toutes les semaines',
  MONTHLY: 'Tous les mois',
  QUARTERLY: 'Tous les trimestres',
  YEARLY: 'Tous les ans',
};

export const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = (
  Object.keys(FREQUENCY_LABELS) as Frequency[]
).map((value) => ({ value, label: FREQUENCY_LABELS[value] }));

/** « Tous les mois » (ou « tous les mois » en milieu de phrase). */
export function frequencyLabel(frequency: Frequency, lowercase = false): string {
  const label = FREQUENCY_LABELS[frequency];
  return lowercase ? label.charAt(0).toLowerCase() + label.slice(1) : label;
}

/** Équivalent mensuel d'un montant : hebdo × 52/12, mensuel × 1, trimestriel ÷ 3, annuel ÷ 12. */
export function monthlyEquivalent(amount: Millimes, frequency: Frequency): Millimes {
  switch (frequency) {
    case 'WEEKLY':
      return Math.round((amount * 52) / 12);
    case 'MONTHLY':
      return amount;
    case 'QUARTERLY':
      return Math.round(amount / 3);
    case 'YEARLY':
      return Math.round(amount / 12);
  }
}

/** Une règle compte si elle est active et n'est pas terminée à la date du jour. */
export function isRuleCurrent(rule: RecurringRule, today: ISODate): boolean {
  return rule.active && (rule.endDate === null || rule.endDate >= today);
}

export interface MonthlyTotals {
  expense: Millimes;
  income: Millimes;
  /** income − expense */
  net: Millimes;
  activeCount: number;
}

export function monthlyTotals(rules: readonly RecurringRule[], today: ISODate): MonthlyTotals {
  let expense = 0;
  let income = 0;
  let activeCount = 0;
  for (const rule of rules) {
    if (!isRuleCurrent(rule, today)) continue;
    activeCount++;
    const m = monthlyEquivalent(rule.amount, rule.frequency);
    if (rule.type === 'EXPENSE') expense += m;
    else income += m;
  }
  return { expense, income, net: income - expense, activeCount };
}

/** k-ième échéance à partir de `anchor` (k = 0 → `anchor`), sans dérive de fin de mois. */
export function occurrenceAt(anchor: ISODate, frequency: Frequency, k: number): ISODate {
  switch (frequency) {
    case 'WEEKLY':
      return addDays(anchor, 7 * k);
    case 'MONTHLY':
      return addMonths(anchor, k);
    case 'QUARTERLY':
      return addMonths(anchor, 3 * k);
    case 'YEARLY':
      return addMonths(anchor, 12 * k);
  }
}

export interface UpcomingItem {
  rule: RecurringRule;
  date: ISODate;
  /** Échéance passée non encore enregistrée */
  overdue: boolean;
}

const MAX_OCCURRENCES_PER_RULE = 60;

/**
 * Échéances des règles actives jusqu'à `today + days` (inclus), triées par date puis libellé.
 * Une échéance passée (règle sans création automatique) n'apparaît qu'une fois, marquée en retard.
 */
export function upcomingOccurrences(
  rules: readonly RecurringRule[],
  today: ISODate,
  days = 30,
): UpcomingItem[] {
  const horizon = addDays(today, days);
  const out: UpcomingItem[] = [];
  for (const rule of rules) {
    if (!isRuleCurrent(rule, today)) continue;
    for (let k = 0; k < MAX_OCCURRENCES_PER_RULE; k++) {
      const date = occurrenceAt(rule.nextDate, rule.frequency, k);
      if (date > horizon || (rule.endDate !== null && date > rule.endDate)) break;
      if (date < today) {
        if (k === 0) out.push({ rule, date, overdue: true });
        continue;
      }
      out.push({ rule, date, overdue: false });
    }
  }
  return out.sort((a, b) =>
    a.date === b.date ? a.rule.label.localeCompare(b.rule.label, 'fr') : a.date < b.date ? -1 : 1,
  );
}

/** « aujourd'hui », « demain », « dans 5 jours », « hier », « il y a 3 jours ». */
export function relativeDueFR(date: ISODate, today: ISODate): string {
  const d = diffDays(today, date);
  if (d === 0) return 'aujourd’hui';
  if (d === 1) return 'demain';
  if (d === -1) return 'hier';
  return d > 1 ? `dans ${d} jours` : `il y a ${-d} jours`;
}

/** « dans 5 jours · 3 mars » (l'année est ajoutée si elle diffère de l'année en cours). */
export function dueLabelFR(date: ISODate, today: ISODate): string {
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return `${relativeDueFR(date, today)} · ${formatDateFR(date, sameYear ? 'dayMonth' : 'long')}`;
}

/** Règles actives d'abord, puis par prochaine échéance, puis par libellé. */
export function sortRules(rules: readonly RecurringRule[]): RecurringRule[] {
  return [...rules].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.nextDate !== b.nextDate) return a.nextDate < b.nextDate ? -1 : 1;
    return a.label.localeCompare(b.label, 'fr');
  });
}

const DOMAIN_SUFFIX_RE = /\.(?:com|net|org|io|tn|fr|co)\b/giu;

/**
 * Libellé lisible d'une suggestion détectée dans un libellé bancaire brut : sans suffixe de
 * domaine, en casse de titre s'il était tout en majuscules (« NETFLIX.COM » → « Netflix »).
 * Un libellé déjà en casse mixte est seulement débarrassé du domaine.
 */
export function cleanSuggestionLabel(raw: string): string {
  const stripped = raw.replace(DOMAIN_SUFFIX_RE, '').replace(/\s+/g, ' ').trim();
  if (!stripped) return raw.trim();
  const hasLower = /\p{Ll}/u.test(stripped);
  if (hasLower) return stripped;
  return stripped
    .toLocaleLowerCase('fr')
    .replace(
      /(^|[\s'’\-/])(\p{L})/gu,
      (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase('fr'),
    )
    .replace(/(?<=\s)(De|Du|Des|La|Le|Les|Et|À|Au|Aux)(?=\s)/gu, (w) => w.toLocaleLowerCase('fr'));
}
