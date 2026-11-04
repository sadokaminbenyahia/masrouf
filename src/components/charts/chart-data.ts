/**
 * Préparation PURE des données de graphiques (testée). Les séries restent en millimes :
 * le formatage a lieu dans les tickFormatter / infobulles via formatMoney ou <Money>.
 */
import { formatMonthFR, type ISODate, type YearMonth } from '@/domain/dates';
import type { Millimes } from '@/domain/money';
import type { BalanceForecast, ForecastChartPoint } from '@/domain/ai/types';
import { averageSavingsRate, savingsRate, withSavingsGroup } from '@/domain/savings';
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

// ───────────────────────── Graduations ─────────────────────────

export interface NiceTicksOptions {
  /** Plus petit pas autorisé, dans l'unité des données (ex. 1000 millimes = 1 DT, 0.1 = 10 %) */
  unit: number;
  /** Nombre maximal de graduations (défaut 6) */
  maxTicks?: number;
  /** Autorise les pas en « 2,5 » (25, 250…) ; défaut true */
  allowQuarter?: boolean;
}

/** Pas « ronds » successifs, en multiples entiers de l'unité : 1, 2, 5, 10, 20, (25), 50, 100… */
function* niceSteps(allowQuarter: boolean): Generator<number> {
  for (let magnitude = 1; magnitude <= 1e12; magnitude *= 10) {
    yield magnitude;
    yield 2 * magnitude;
    if (allowQuarter && magnitude >= 10) yield 2.5 * magnitude;
    yield 5 * magnitude;
  }
}

/**
 * Graduations rondes couvrant [min, max] : multiples d'un pas « rond » de l'unité, la première
 * ≤ min et la dernière ≥ max. Sert à la fois de `ticks` et de `domain` recharts, pour éviter les
 * graduations du type « 1,1 k DT » ou « 27 % ».
 */
export function niceTicks(min: number, max: number, options: NiceTicksOptions): number[] {
  const { unit, maxTicks = 6, allowQuarter = true } = options;
  let lo = Math.min(min, max) / unit;
  let hi = Math.max(min, max) / unit;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0];
  if (lo === hi) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
    if (lo === hi) hi = lo + 1;
  }
  const clean = (v: number) => Number((v * unit).toFixed(10));
  for (const step of niceSteps(allowQuarter)) {
    const first = Math.floor(lo / step) * step;
    const last = Math.ceil(hi / step) * step;
    const count = Math.round((last - first) / step) + 1;
    if (count <= maxTicks) {
      return Array.from({ length: count }, (_, i) => clean(first + i * step));
    }
  }
  return [clean(lo), clean(hi)];
}

/** Bornes [min, max] d'une liste de valeurs (les null sont ignorés). */
export function extent(values: readonly (number | null)[]): [number, number] | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min <= max ? [min, max] : null;
}

/** Graduations monétaires (millimes), au dinar près au minimum. */
export function moneyTicks(values: readonly (number | null)[], includeZero = true): number[] {
  const e = extent(includeZero ? [...values, 0] : values) ?? [0, 0];
  return niceTicks(e[0], e[1], { unit: 1000, maxTicks: 6 });
}

// ───────────────────────── Revenus / dépenses mensuels ─────────────────────────

/**
 * Retire les mois vides (ni revenu ni dépense) qui précèdent le premier mois avec des données :
 * un nouvel utilisateur ne voit pas de faux « 0 DT » sur les mois où il n'utilisait pas l'app.
 */
export function trimLeadingEmptyMonths<T extends Pick<MonthTotals, 'month' | 'income' | 'expense'>>(
  months: readonly T[],
): T[] {
  const sorted = [...months].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  const first = sorted.findIndex((m) => m.income !== 0 || m.expense !== 0);
  return first === -1 ? [] : sorted.slice(first);
}

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
  /** Épargne / revenus (domaine) ; null si aucun revenu ou mois en cours */
  rate: number | null;
  /** Mois en cours (partiel) : exclu de la courbe */
  partial: boolean;
}

/**
 * Taux d'épargne par mois, à partir du premier mois avec des données, selon la définition
 * unique du domaine (`src/domain/savings.ts` : les versements vers le groupe « Épargne » ne
 * réduisent pas le taux ; `groupSpendingByMonth` les fournit, 0 à défaut).
 * Le mois en cours (`currentMonth`), incomplet, est marqué `partial` et sans taux : ses revenus
 * (salaire déjà versé, dépenses à venir) donneraient un taux trompeur.
 */
export function computeSavingsRates(
  months: readonly MonthTotals[],
  currentMonth?: YearMonth,
  groupSpendingByMonth: ReadonlyMap<YearMonth, Millimes> = new Map(),
): SavingsRateDatum[] {
  const trimmed = trimLeadingEmptyMonths(months);
  const totals = new Map(withSavingsGroup(trimmed, groupSpendingByMonth).map((m) => [m.month, m]));
  return prepareMonthlyBars(trimmed).map((d) => {
    const partial = d.month === currentMonth;
    const t = totals.get(d.month);
    return {
      month: d.month,
      label: d.label,
      longLabel: d.longLabel,
      rate: partial || !t ? null : savingsRate(t),
      partial,
    };
  });
}

/** Graduations en % entiers, par pas de 10 % au minimum ; inclut 0 et le repère de 20 %. */
export function savingsRateTicks(data: readonly SavingsRateDatum[], target: number): number[] {
  const e = extent([...data.map((d) => d.rate), 0, target + 0.1]) ?? [0, target + 0.1];
  return niceTicks(e[0], e[1], { unit: 0.1, maxTicks: 7, allowQuarter: false });
}

/**
 * Taux d'épargne moyen des mois complets (Σ épargne / Σ revenus, définition du domaine) : le
 * mois en cours est exclu, comme sur la courbe. null sans revenu.
 */
export function periodSavingsRate(
  months: readonly MonthTotals[],
  today: ISODate,
  groupSpendingByMonth: ReadonlyMap<YearMonth, Millimes> = new Map(),
): number | null {
  return averageSavingsRate(withSavingsGroup(months, groupSpendingByMonth), { today });
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
  /** Clé unique (le point « aujourd'hui » partage le mois courant) */
  key: string;
  month: YearMonth;
  /** Point du solde du jour (mois courant en cours) */
  today: boolean;
  label: string;
  longLabel: string;
  actual: Millimes | null;
  expected: Millimes | null;
  low: Millimes | null;
  high: Millimes | null;
  /** Bande de l'intervalle de confiance [bas, haut] (aire « range » recharts) */
  band: [Millimes, Millimes] | null;
}

export const TODAY_LABEL = 'auj.';

/**
 * Prépare les points du graphique de prévision :
 *  - la prévision (pointillés + bande) ne commence qu'au dernier solde réel ;
 *  - si ce dernier point réel est le mois courant et porte aussi la prévision de fin de mois
 *    (solde du jour + solde attendu), il est dédoublé : un point « auj. » (solde réel du jour,
 *    départ de la prévision) puis le point de fin de mois prévu ;
 *  - sinon, le dernier point réel reçoit expected = actual (et une bande de largeur nulle)
 *    pour que la ligne pointillée en parte.
 */
export function prepareForecastData(chart: readonly ForecastChartPoint[]): ForecastDatum[] {
  const sorted = [...chart].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  const band = (low: Millimes | null, high: Millimes | null): [Millimes, Millimes] | null =>
    low !== null && high !== null ? [Math.min(low, high), Math.max(low, high)] : null;
  const datum = (p: ForecastChartPoint): ForecastDatum => ({
    key: p.month,
    month: p.month,
    today: false,
    label: formatMonthFR(p.month, 'short'),
    longLabel: formatMonthFR(p.month, 'long'),
    actual: p.actual,
    expected: p.expected,
    low: p.low,
    high: p.high,
    band: band(p.low, p.high),
  });

  let lastActual = -1;
  for (let i = 0; i < sorted.length; i++) if (sorted[i]?.actual !== null) lastActual = i;

  const out: ForecastDatum[] = [];
  sorted.forEach((p, i) => {
    const d = datum(p);
    if (i < lastActual) {
      // Avant le dernier solde réel : pas de prévision (évite un pointillé sous la ligne pleine)
      d.expected = null;
      d.low = null;
      d.high = null;
      d.band = null;
      out.push(d);
      return;
    }
    if (i === lastActual && d.actual !== null && d.expected !== null && d.expected !== d.actual) {
      const actual = d.actual;
      out.push({
        ...d,
        key: `${p.month}-today`,
        today: true,
        label: TODAY_LABEL,
        longLabel: "Aujourd'hui",
        expected: actual,
        low: null,
        high: null,
        band: [actual, actual],
      });
      out.push({ ...d, actual: null });
      return;
    }
    out.push(d);
  });

  const anchorIndex = out.findLastIndex((d) => d.actual !== null);
  const anchor = out[anchorIndex];
  const next = out[anchorIndex + 1];
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

/**
 * Vrai si la prévision repose sur un historique réel (au moins un solde réel non nul). Sinon
 * (nouvel utilisateur), le graphique n'aurait qu'une ligne plate à 0 DT inventée.
 */
export function forecastHasHistory(forecast: Pick<BalanceForecast, 'chart'>): boolean {
  return forecast.chart.some((p) => p.actual !== null && p.actual !== 0);
}

/** Prévision sans données : fiabilité faible et aucun historique réel. */
export function forecastIsEmpty(forecast: Pick<BalanceForecast, 'chart' | 'reliability'>): boolean {
  return forecast.reliability === 'LOW' && !forecastHasHistory(forecast);
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
