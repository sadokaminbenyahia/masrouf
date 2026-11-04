/**
 * Périodes prédéfinies (sélecteur de période, filtres, graphiques).
 */
import {
  addDays,
  addMonthsYM,
  lastMonths,
  monthEnd,
  monthOf,
  monthStart,
  quarterStart,
  yearStart,
  type DateRange,
  type ISODate,
} from './dates';

export const PERIOD_PRESETS = [
  'THIS_MONTH',
  'LAST_MONTH',
  'LAST_3_MONTHS',
  'LAST_6_MONTHS',
  'THIS_QUARTER',
  'THIS_YEAR',
  'LAST_12_MONTHS',
  'CUSTOM',
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  THIS_MONTH: 'Ce mois',
  LAST_MONTH: 'Mois dernier',
  LAST_3_MONTHS: '3 mois',
  LAST_6_MONTHS: '6 mois',
  THIS_QUARTER: 'Ce trimestre',
  THIS_YEAR: 'Cette année',
  LAST_12_MONTHS: '12 mois',
  CUSTOM: 'Personnalisé',
};

export interface Period {
  preset: PeriodPreset;
  range: DateRange;
}

/** Résout un preset en intervalle inclusif. `custom` est requis pour CUSTOM. */
export function resolvePeriod(preset: PeriodPreset, today: ISODate, custom?: DateRange): DateRange {
  const ym = monthOf(today);
  switch (preset) {
    case 'THIS_MONTH':
      return { from: monthStart(ym), to: monthEnd(ym) };
    case 'LAST_MONTH': {
      const prev = addMonthsYM(ym, -1);
      return { from: monthStart(prev), to: monthEnd(prev) };
    }
    case 'LAST_3_MONTHS':
      return { from: monthStart(lastMonths(today, 3)[0] ?? ym), to: monthEnd(ym) };
    case 'LAST_6_MONTHS':
      return { from: monthStart(lastMonths(today, 6)[0] ?? ym), to: monthEnd(ym) };
    case 'THIS_QUARTER':
      return {
        from: quarterStart(today),
        to: addDays(monthStart(addMonthsYM(monthOf(quarterStart(today)), 3)), -1),
      };
    case 'THIS_YEAR':
      return { from: yearStart(today), to: `${today.slice(0, 4)}-12-31` };
    case 'LAST_12_MONTHS':
      return { from: monthStart(lastMonths(today, 12)[0] ?? ym), to: monthEnd(ym) };
    case 'CUSTOM':
      return custom ?? { from: monthStart(ym), to: monthEnd(ym) };
  }
}
