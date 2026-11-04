/**
 * Calculs PURS des indicateurs du tableau de bord (variations, libellés, état vide).
 */
import {
  addMonthsYM,
  daysInMonth,
  formatMonthFR,
  parseISODate,
  type ISODate,
} from '@/domain/dates';
import type { DashboardData } from '@/domain/types';
import { formatPercent } from '@/components/charts/format';

export type Trend = 'up' | 'down' | 'flat';
/** Pour une dépense, une hausse est défavorable. */
export type Tone = 'good' | 'bad' | 'neutral';

export interface ChangeDescription {
  trend: Trend;
  tone: Tone;
  /** « +12 % » */
  percent: string;
  /** « +12 % vs octobre » */
  text: string;
  /** Phrase complète pour les lecteurs d'écran */
  srText: string;
}

/** En dessous de 0,5 %, la variation est considérée comme stable. */
const FLAT_THRESHOLD = 0.005;

/**
 * Décrit la variation des dépenses par rapport à la période de comparaison.
 * `change` = (dépenses − dépenses de référence) / dépenses de référence, null sans référence.
 * `comparisonLabel` (service : « vs 1–4 octobre » à mi-mois, « vs octobre » sinon) évite de
 * comparer quelques jours à un mois complet ; à défaut, le mois précédent est cité.
 */
export function describeExpenseChange(
  change: number | null,
  month: string,
  comparisonLabel?: string,
): ChangeDescription | null {
  if (change === null || !Number.isFinite(change)) return null;
  const label = comparisonLabel?.trim();
  const previous = formatMonthFR(addMonthsYM(month, -1), 'monthOnly');
  const period = label ? label.replace(/^vs\s+/, '') : previous;
  const reference = label ? `(comparaison : ${period})` : `par rapport à ${previous}`;
  const trend: Trend = Math.abs(change) < FLAT_THRESHOLD ? 'flat' : change > 0 ? 'up' : 'down';
  const percent = trend === 'flat' ? formatPercent(0) : formatPercent(change, { signed: true });
  const tone: Tone = trend === 'flat' ? 'neutral' : trend === 'up' ? 'bad' : 'good';
  const text = `${percent} vs ${period}`;
  const srText =
    trend === 'flat'
      ? `Dépenses stables ${reference}.`
      : trend === 'up'
        ? `Dépenses en hausse de ${formatPercent(change)} ${reference}.`
        : `Dépenses en baisse de ${formatPercent(Math.abs(change))} ${reference}.`;
  return { trend, tone, percent, text, srText };
}

/** Jours restants dans le mois, aujourd'hui inclus. */
export function daysLeftInMonth(today: ISODate): number {
  const { year, month, day } = parseISODate(today);
  return daysInMonth(year, month) - day + 1;
}

/** Aucune transaction enregistrée, tous comptes confondus : on affiche l'état vide global. */
export function isDashboardEmpty(data: Pick<DashboardData, 'accounts' | 'monthly'>): boolean {
  const noTx = data.accounts.every((a) => a.transactionCount === 0);
  const noFlows = data.monthly.every((m) => m.income === 0 && m.expense === 0);
  return noTx && noFlows;
}
