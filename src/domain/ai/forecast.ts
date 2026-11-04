// Propriétaire : agent J. Prévision du solde (AI-DESIGN §5) : récurrences déterministes +
// flux variable (moyenne exponentielle, régression linéaire, saisonnalité) + intervalle à 80 %.
import {
  addDays,
  addMonthsYM,
  diffDays,
  diffMonthsYM,
  listMonths,
  maxISO,
  monthEnd,
  monthOf,
  monthStart,
  parseISODate,
  type ISODate,
  type YearMonth,
} from '../dates';
import type { Millimes } from '../money';
import type { RecurringRule } from '../types';
import { addPeriod, matchesRule } from './recurring-detect';
import { clamp, ewma, linearRegression, mean, stdDev } from './stats';
import type {
  AiTransaction,
  BalanceForecast,
  ForecastChartPoint,
  ForecastInput,
  ForecastPoint,
} from './types';

/** Quantile normal pour un intervalle bilatéral à 80 %. */
const Z80 = 1.28;
const DAILY_WINDOW = 90;
const HALF_LIFE_DAYS = 30;
const HORIZON_MONTHS = 3;
const HISTORY_CHART_MONTHS = 6;
const MAX_REGRESSION_MONTHS = 12;
const MAX_SERIES_MONTHS = 24;
const MIN_HISTORY_DAYS = 30;

/**
 * Mois complets d'historique (du plus ancien au plus récent), au plus `max`, se terminant au
 * mois précédant `today`. Le premier mois de données compte s'il commence avant le 8.
 */
export function completeHistoryMonths(
  today: ISODate,
  firstDate: ISODate | null,
  max: number,
): YearMonth[] {
  if (firstDate === null || max <= 0) return [];
  const current = monthOf(today);
  const last = addMonthsYM(current, -1);
  const firstMonth = monthOf(firstDate);
  const firstComplete =
    parseISODate(firstDate).day <= 7 ? firstMonth : addMonthsYM(firstMonth, 1);
  const earliest = addMonthsYM(current, -max);
  const from = diffMonthsYM(earliest, firstComplete) > 0 ? firstComplete : earliest;
  if (diffMonthsYM(from, last) < 0) return [];
  return listMonths(from, last);
}

const signed = (t: Pick<AiTransaction, 'type' | 'amount'>) =>
  t.type === 'INCOME' ? t.amount : t.type === 'EXPENSE' ? -t.amount : 0;

/** Somme signée des échéances des règles actives entre deux dates incluses. */
export function recurringBetween(
  rules: readonly RecurringRule[],
  from: ISODate,
  to: ISODate,
): { total: Millimes; count: number } {
  let total = 0;
  let count = 0;
  for (const r of rules) {
    if (!r.active) continue;
    for (let k = 0; k < 400; k++) {
      const d = addPeriod(r.nextDate, r.frequency, k);
      if (d > to || (r.endDate !== null && d > r.endDate)) break;
      if (d < from) continue;
      total += r.type === 'INCOME' ? r.amount : -r.amount;
      count++;
    }
  }
  return { total, count };
}

function point(date: ISODate, expected: number, halfWidth: number): ForecastPoint {
  const e = Math.round(expected);
  const h = Math.max(0, Math.round(halfWidth));
  return { date, expected: e, low: e - h, high: e + h };
}

/**
 * Prévision du solde total : fin du mois courant puis fins des 3 mois suivants, avec un
 * intervalle à 80 % (low ≤ expected ≤ high), et un graphique de 6 mois réels reconstitués
 * à rebours depuis le solde actuel + mois courant + 3 mois prévus. Montants entiers.
 */
export function forecastBalance(input: ForecastInput): BalanceForecast {
  const { today, currentBalance } = input;
  const current = monthOf(today);
  const activeRules = input.recurring.filter((r) => r.active);
  const history = input.history.filter((t) => t.type !== 'TRANSFER' && t.date <= today);
  const variable = history.filter((t) => !matchesRule(t, activeRules));

  let firstDate: ISODate | null = null;
  for (const t of history) if (firstDate === null || t.date < firstDate) firstDate = t.date;
  const spanDays = firstDate === null ? 0 : diffDays(firstDate, today) + 1;
  const enoughHistory = spanDays >= MIN_HISTORY_DAYS;

  // ── Flux variable journalier (90 derniers jours, moyenne exponentielle, demi-vie 30 j)
  const windowStart =
    firstDate === null ? today : maxISO(firstDate, addDays(today, -(DAILY_WINDOW - 1)));
  const windowDays = diffDays(windowStart, today) + 1;
  const daily = new Array<number>(Math.max(windowDays, 0)).fill(0);
  for (const t of variable) {
    if (t.date < windowStart) continue;
    const i = diffDays(windowStart, t.date);
    daily[i] = (daily[i] ?? 0) + signed(t);
  }
  const r = enoughHistory ? ewma(daily, HALF_LIFE_DAYS) : 0;
  const sigmaDaily = stdDev(daily);

  // ── Fin du mois courant
  const end = monthEnd(current);
  const daysLeft = diffDays(today, end);
  const recCurrent = recurringBetween(activeRules, monthStart(current), end);
  const eomExpected = currentBalance + recCurrent.total + r * daysLeft;
  const eomSd = sigmaDaily * Math.sqrt(daysLeft);
  const endOfMonth = point(end, eomExpected, Z80 * eomSd);

  // ── Série mensuelle du flux variable net (mois complets)
  const months = completeHistoryMonths(today, firstDate, MAX_SERIES_MONTHS);
  const monthIndex = new Map(months.map((m, i) => [m, i]));
  const series = months.map(() => 0);
  let expenseVolume = 0;
  for (const t of variable) {
    const i = monthIndex.get(monthOf(t.date));
    if (i === undefined) continue;
    series[i] = (series[i] ?? 0) + signed(t);
    if (t.type === 'EXPENSE') expenseVolume += t.amount;
  }
  const n = series.length;
  const regN = Math.min(n, MAX_REGRESSION_MONTHS);
  const regStart = n - regN;
  const xs = Array.from({ length: regN }, (_, i) => regStart + i);
  const ys = series.slice(regStart);

  let predict: (h: number) => number;
  let sigmaMonthly: number;
  let method: 'trend' | 'mean' | 'daily' | 'none';
  if (!enoughHistory) {
    method = 'none';
    predict = () => 0;
    sigmaMonthly = sigmaDaily * Math.sqrt(30);
  } else if (regN >= 6) {
    method = 'trend';
    const fit = linearRegression(xs, ys);
    const fitted = (x: number) => fit.intercept + fit.slope * x;
    predict = (h: number) => {
      const x = n + h;
      let value = fitted(x);
      // Saisonnalité multiplicative à partir de 13 mois : rapport au même mois l'an passé.
      const past = x - 12;
      const observed = series[past];
      if (n >= 13 && observed !== undefined) {
        const base = fitted(past);
        if (Math.abs(base) >= 1000 && Math.sign(base) === Math.sign(observed)) {
          value *= clamp(observed / base, 0.5, 1.5);
        }
      }
      return value;
    };
    sigmaMonthly = fit.residualStd;
  } else if (regN >= 3) {
    method = 'mean';
    const m = mean(ys);
    predict = () => m;
    sigmaMonthly = stdDev(ys) * Math.sqrt(6 / regN);
  } else {
    method = 'daily';
    predict = () => r * 30;
    sigmaMonthly = sigmaDaily * Math.sqrt(30) * Math.sqrt(6 / Math.max(regN, 1));
  }

  const monthsOut: ForecastPoint[] = [];
  let balance = eomExpected;
  for (let h = 1; h <= HORIZON_MONTHS; h++) {
    const ym = addMonthsYM(current, h);
    const rec = recurringBetween(activeRules, monthStart(ym), monthEnd(ym));
    balance += predict(h) + rec.total;
    const sd = Math.sqrt(eomSd * eomSd + sigmaMonthly * sigmaMonthly * h);
    monthsOut.push(point(monthEnd(ym), balance, Z80 * sd));
  }

  // ── Fiabilité
  const meanExpense = n > 0 ? expenseVolume / n : 0;
  let reliability: BalanceForecast['reliability'] = 'LOW';
  if (enoughHistory && regN >= 3) reliability = 'MEDIUM';
  if (enoughHistory && regN >= 6 && sigmaMonthly <= 0.15 * Math.max(meanExpense, 1)) {
    reliability = 'HIGH';
  }

  // ── Graphique : soldes réels reconstitués à rebours
  const chart: ForecastChartPoint[] = [];
  const pastMonths = listMonths(addMonthsYM(current, -HISTORY_CHART_MONTHS), addMonthsYM(current, -1));
  const sortedDesc = [...history].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (const ym of pastMonths) {
    const cutoff = monthEnd(ym);
    let after = 0;
    for (const t of sortedDesc) {
      if (t.date <= cutoff) break;
      after += signed(t);
    }
    const actual = Math.round(currentBalance - after);
    const isLast = ym === pastMonths[pastMonths.length - 1];
    chart.push({
      month: ym,
      actual,
      expected: isLast ? actual : null,
      low: isLast ? actual : null,
      high: isLast ? actual : null,
    });
  }
  for (const [ym, p] of [
    [current, endOfMonth] as const,
    ...monthsOut.map((p, i) => [addMonthsYM(current, i + 1), p] as const),
  ]) {
    chart.push({ month: ym, actual: null, expected: p.expected, low: p.low, high: p.high });
  }

  const monthlyNetEstimate = Math.round(method === 'none' ? 0 : predict(1));
  const ruleCount = activeRules.length;
  const basis =
    method === 'none'
      ? 'Historique trop court : la prévision ne tient compte que de vos opérations récurrentes'
      : method === 'daily'
        ? `Prévision fondée sur votre rythme de dépenses des ${Math.min(windowDays, DAILY_WINDOW)} derniers jours`
        : `Prévision fondée sur ${n} mois d’historique${method === 'trend' ? ' et leur tendance' : ''}`;
  const rules =
    ruleCount === 0
      ? ''
      : ` et ${ruleCount} opération${ruleCount > 1 ? 's' : ''} récurrente${ruleCount > 1 ? 's' : ''}`;
  const explanation = `${basis}${method === 'none' ? '' : rules}. Intervalle de confiance à 80 %.`;

  return {
    reliability,
    endOfMonth,
    months: monthsOut,
    chart,
    monthlyNetEstimate,
    explanation,
  };
}
