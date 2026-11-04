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
 * Décrit la variation des dépenses par rapport au mois précédent.
 * `change` = (dépenses − dépenses précédentes) / dépenses précédentes, null sans référence.
 */
export function describeExpenseChange(
  change: number | null,
  month: string,
): ChangeDescription | null {
  if (change === null || !Number.isFinite(change)) return null;
  const previous = formatMonthFR(addMonthsYM(month, -1), 'monthOnly');
  const trend: Trend = Math.abs(change) < FLAT_THRESHOLD ? 'flat' : change > 0 ? 'up' : 'down';
  const percent = trend === 'flat' ? formatPercent(0) : formatPercent(change, { signed: true });
  const tone: Tone = trend === 'flat' ? 'neutral' : trend === 'up' ? 'bad' : 'good';
  const text = `${percent} vs ${previous}`;
  const srText =
    trend === 'flat'
      ? `Dépenses stables par rapport à ${previous}.`
      : trend === 'up'
        ? `Dépenses en hausse de ${formatPercent(change)} par rapport à ${previous}.`
        : `Dépenses en baisse de ${formatPercent(Math.abs(change))} par rapport à ${previous}.`;
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
