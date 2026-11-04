/**
 * Préparation PURE des données de graphiques (testée). Les séries restent en millimes :
 * le formatage a lieu dans les tickFormatter / infobulles via formatMoney ou <Money>.
 */
import { formatMonthFR, type YearMonth } from '@/domain/dates';
import type { Millimes } from '@/domain/money';
import type { BalanceForecast, ForecastChartPoint } from '@/domain/ai/types';
import type { CategorySlice, MonthTotals } from '@/domain/types';
import { categoryColor, OTHER_COLOR } from './colors';
import { formatPercent } from './format';

/** Formateur de montant injecté (permet de masquer les montants en mode discret). */
export type MoneyText = (m: Millimes) => string;

// ───────────────────────── Répartition par catégorie ─────────────────────────

export interface DonutDatum {
  /** Clé stable : id de catégorie, « uncategorized » ou « other » */
  key: string;
  /** Tranche d'origine ; null pour le regroupement « Autres » */
  slice: CategorySlice | null;
  name: string;
  amount: Millimes;
  /** Part du total (0..1) */
  share: number;
  color: string;
  icon: string;
}

export const UNCATEGORIZED_KEY = 'uncategorized';
export const OTHER_KEY = 'other';

/** Total des tranches (en millimes). */
export function slicesTotal(slices: readonly CategorySlice[]): Millimes {
  let total = 0;
  for (const s of slices) total += s.amount;
  return total;
}

/**
 * Trie les tranches par montant décroissant, écarte les montants nuls et regroupe au-delà de
 * `maxSlices` dans « Autres » (8 couleurs au maximum, jamais de couleur générée).
 * La couleur suit la catégorie (et non son rang) : l'index de palette de repli est celui de la
 * tranche dans la liste d'origine.
 */
export function prepareDonutData(slices: readonly CategorySlice[], maxSlices = 7): DonutDatum[] {
  const total = slicesTotal(slices);
  const indexed = slices
    .map((slice, index) => ({ slice, index }))
    .filter(({ slice }) => slice.amount > 0)
    .sort((a, b) => b.slice.amount - a.slice.amount);
  const shareOf = (s: CategorySlice) => (total > 0 ? s.amount / total : s.share);
  const toDatum = ({ slice, index }: { slice: CategorySlice; index: number }): DonutDatum => ({
    key: slice.categoryId ?? UNCATEGORIZED_KEY,
    slice,
    name: slice.name,
    amount: slice.amount,
    share: shareOf(slice),
    color: categoryColor(slice.color, index),
    icon: slice.icon,
  });
  if (indexed.length <= maxSlices + 1) return indexed.map(toDatum);
  const head = indexed.slice(0, maxSlices).map(toDatum);
  const rest = indexed.slice(maxSlices);
  let restAmount = 0;
  for (const r of rest) restAmount += r.slice.amount;
  head.push({
    key: OTHER_KEY,
    slice: null,
    name: `Autres (${rest.length})`,
    amount: restAmount,
    share: total > 0 ? restAmount / total : 0,
    color: OTHER_COLOR,
    icon: 'Tag',
  });
  return head;
}

/** Résumé textuel (aria-label) de la répartition. */
export function describeBreakdown(data: readonly DonutDatum[], money: MoneyText): string {
  if (data.length === 0) return 'Répartition des dépenses : aucune dépense sur la période.';
  let total = 0;
  for (const d of data) total += d.amount;
  const parts = data
    .slice(0, 5)
    .map((d) => `${d.name} ${formatPercent(d.share)} (${money(d.amount)})`)
    .join(', ');
  const more = data.length > 5 ? `, et ${data.length - 5} autre(s)` : '';
  return `Répartition des dépenses, total ${money(total)} : ${parts}${more}.`;
}

// ───────────────────────── Revenus / dépenses mensuels ─────────────────────────

export interface MonthlyBarDatum {
  month: YearMonth;
  /** « nov. 26 » */
  label: string;
  /** « novembre 2026 » */
  longLabel: string;
  income: Millimes;
  expense: Millimes;
  net: Millimes;
}

export function prepareMonthlyBars(months: readonly MonthTotals[]): MonthlyBarDatum[] {
  return [...months]
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
    .map((m) => ({
      month: m.month,
      label: formatMonthFR(m.month, 'short'),
      longLabel: formatMonthFR(m.month, 'long'),
      income: m.income,
      expense: m.expense,
      net: m.net,
    }));
}

export function describeMonthly(data: readonly MonthlyBarDatum[], money: MoneyText): string {
  const first = data[0];
  const last = data[data.length - 1];
  if (!first || !last) return 'Revenus et dépenses mensuels : aucune donnée.';
  let peak = first;
  let incomeSum = 0;
  let expenseSum = 0;
  for (const d of data) {
    if (d.expense > peak.expense) peak = d;
    incomeSum += d.income;
    expenseSum += d.expense;
  }
  const n = data.length;
  return (
    `Revenus et dépenses de ${first.longLabel} à ${last.longLabel}. ` +
    `Moyenne mensuelle : revenus ${money(Math.round(incomeSum / n))}, ` +
    `dépenses ${money(Math.round(expenseSum / n))}. ` +
    `Mois le plus dépensier : ${peak.longLabel} (${money(peak.expense)}). ` +
    `Dernier mois : solde net ${money(last.net)}.`
  );
}

// ───────────────────────── Taux d'épargne ─────────────────────────

export interface SavingsRateDatum {
  month: YearMonth;
  label: string;
  longLabel: string;
  /** (revenus − dépenses) / revenus ; null si aucun revenu */
  rate: number | null;
}

/** Taux d'épargne d'un mois : net / revenus, null si les revenus sont nuls. */
export function savingsRate(m: Pick<MonthTotals, 'income' | 'net'>): number | null {
  return m.income > 0 ? m.net / m.income : null;
}

export function computeSavingsRates(months: readonly MonthTotals[]): SavingsRateDatum[] {
  return prepareMonthlyBars(months).map((d) => ({
    month: d.month,
    label: d.label,
    longLabel: d.longLabel,
    rate: savingsRate(d),
  }));
}

/** Taux d'épargne global de la période (Σ net / Σ revenus) ; null sans revenu. */
export function averageSavingsRate(months: readonly MonthTotals[]): number | null {
  let income = 0;
  let net = 0;
  for (const m of months) {
    if (m.income <= 0) continue;
    income += m.income;
    net += m.net;
  }
  return income > 0 ? net / income : null;
}

export function describeSavingsRates(data: readonly SavingsRateDatum[]): string {
  const known = data.filter((d): d is SavingsRateDatum & { rate: number } => d.rate !== null);
  const first = known[0];
  const last = known[known.length - 1];
  if (!first || !last) return "Taux d'épargne mensuel : aucun revenu sur la période.";
  let best = first;
  let worst = first;
  for (const d of known) {
    if (d.rate > best.rate) best = d;
    if (d.rate < worst.rate) worst = d;
  }
  return (
    `Taux d'épargne mensuel de ${first.longLabel} à ${last.longLabel}. ` +
    `Dernier mois : ${formatPercent(last.rate)}. ` +
    `Meilleur mois : ${best.longLabel} (${formatPercent(best.rate)}), ` +
    `plus faible : ${worst.longLabel} (${formatPercent(worst.rate)}). Repère : 20 %.`
  );
}

// ───────────────────────── Prévision du solde ─────────────────────────

export interface ForecastDatum {
  month: YearMonth;
  label: string;
  longLabel: string;
  actual: Millimes | null;
  expected: Millimes | null;
  low: Millimes | null;
  high: Millimes | null;
  /** Bande de l'intervalle de confiance [bas, haut] (aire « range » recharts) */
  band: [Millimes, Millimes] | null;
}

/**
 * Prépare les points du graphique de prévision. Pour que la ligne pointillée parte du dernier
 * solde réel, le dernier point réel reçoit expected = actual (et une bande de largeur nulle)
 * lorsqu'il n'a pas de prévision propre.
 */
export function prepareForecastData(chart: readonly ForecastChartPoint[]): ForecastDatum[] {
  const sorted = [...chart].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  const out: ForecastDatum[] = sorted.map((p) => {
    const low = p.low;
    const high = p.high;
    return {
      month: p.month,
      label: formatMonthFR(p.month, 'short'),
      longLabel: formatMonthFR(p.month, 'long'),
      actual: p.actual,
      expected: p.expected,
      low,
      high,
      band: low !== null && high !== null ? [Math.min(low, high), Math.max(low, high)] : null,
    };
  });
  let lastActual = -1;
  for (let i = 0; i < out.length; i++) if (out[i]?.actual !== null) lastActual = i;
  const anchor = out[lastActual];
  const next = out[lastActual + 1];
  if (
    anchor &&
    anchor.actual !== null &&
    anchor.expected === null &&
    next &&
    next.expected !== null
  ) {
    anchor.expected = anchor.actual;
    anchor.band ??= [anchor.actual, anchor.actual];
  }
  return out;
}

/** Vrai si le solde prévu (ou la borne basse de l'intervalle) passe sous zéro. */
export function forecastMayGoNegative(forecast: BalanceForecast): boolean {
  const points = [forecast.endOfMonth, ...forecast.months];
  if (points.some((p) => p.expected < 0 || p.low < 0)) return true;
  return forecast.chart.some(
    (p) => (p.expected !== null && p.expected < 0) || (p.low !== null && p.low < 0),
  );
}

export const RELIABILITY_LABELS: Record<BalanceForecast['reliability'], string> = {
  LOW: 'Fiabilité faible',
  MEDIUM: 'Fiabilité moyenne',
  HIGH: 'Fiabilité élevée',
};

export function describeForecast(forecast: BalanceForecast, money: MoneyText): string {
  const eom = forecast.endOfMonth;
  const lastMonth = forecast.months[forecast.months.length - 1];
  const horizon = lastMonth
    ? ` À trois mois : ${money(lastMonth.expected)} (entre ${money(lastMonth.low)} et ${money(lastMonth.high)}).`
    : '';
  return (
    `Prévision du solde. Fin du mois : ${money(eom.expected)}, ` +
    `intervalle de confiance à 80 % entre ${money(eom.low)} et ${money(eom.high)}.${horizon} ` +
    `${RELIABILITY_LABELS[forecast.reliability]}.`
  );
}
