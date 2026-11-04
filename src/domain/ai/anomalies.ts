// Propriétaire : agent J. Détection d'anomalies (AI-DESIGN §3) : dépense inhabituelle
// (z robuste sur log(montant), repli IQR), doublon suspect, hausse d'abonnement.
import { addDays, addMonths, diffDays, monthOf } from '../dates';
import { formatMoney } from '../money';
import type { Severity } from '../types';
import { detectSeries, ruleMatcher } from './recurring-detect';
import { mad, median, quantileSorted } from './stats';
import { merchantKey } from './text';
import type { AiTransaction, Anomaly, AnomalyInput } from './types';

const Z_THRESHOLD = 3.5;
const MIN_UNUSUAL = 20_000;
const MIN_ROBUST_SAMPLES = 8;
const MIN_IQR_SAMPLES = 4;
const DUPLICATE_WINDOW_DAYS = 2;
/** En dessous de ce montant (cafés, pain…), un doublon doit tomber le même jour. */
const SMALL_AMOUNT = 10_000;
const PRICE_INCREASE_RATIO = 1.05;
const PRICE_INCREASE_MIN = 1_000;
const DEFAULT_LOOKBACK_DAYS = 45;

const money = (m: number) => formatMoney(m);

function byDateThenId(a: AiTransaction, b: AiTransaction): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id);
}

function removeOnce(sorted: readonly number[], value: number): number[] {
  const i = sorted.indexOf(value);
  return i < 0 ? [...sorted] : [...sorted.slice(0, i), ...sorted.slice(i + 1)];
}

function medianSorted(sorted: readonly number[]): number {
  return quantileSorted(sorted, 0.5);
}

function unusualAmounts(
  input: AnomalyInput,
  expenses: AiTransaction[],
  since: string,
  categoryName: (id: string | null) => string,
): Anomaly[] {
  const out: Anomaly[] = [];
  const globalMedian = median(expenses.map((t) => t.amount));
  const isRecurring = ruleMatcher(input.recurring);
  const byCategory = new Map<string, AiTransaction[]>();
  for (const t of expenses) {
    const key = t.categoryId ?? '__none__';
    const list = byCategory.get(key);
    if (list) list.push(t);
    else byCategory.set(key, [t]);
  }
  for (const list of byCategory.values()) {
    const sortedAmounts = list.map((t) => t.amount).sort((a, b) => a - b);
    // Statistiques robustes calculées une fois par catégorie : la médiane et le MAD sont
    // peu sensibles à la valeur évaluée, inutile de l'exclure.
    const logs = sortedAmounts.map((v) => Math.log(v));
    const logMedian = medianSorted(logs);
    const logMad = mad(logs);
    for (const t of list) {
      if (t.date < since || t.date > input.today || t.amount < MIN_UNUSUAL) continue;
      if (t.recurringId !== null || isRecurring(t)) continue;
      const n = list.length - 1;
      let flagged = false;
      let score = 0;
      let expected: number | null = null;
      if (n >= MIN_ROBUST_SAMPLES && logMad > 0) {
        score = (0.6745 * (Math.log(t.amount) - logMedian)) / logMad;
        flagged = score > Z_THRESHOLD;
        expected = Math.round(Math.exp(logMedian));
      } else if (n >= MIN_IQR_SAMPLES) {
        // Repli IQR, sur les autres dépenses de la catégorie.
        const ref = removeOnce(sortedAmounts, t.amount);
        const refMedian = medianSorted(ref);
        const q1 = quantileSorted(ref, 0.25);
        const q3 = quantileSorted(ref, 0.75);
        flagged = t.amount > q3 + 1.5 * (q3 - q1) && t.amount >= 2 * refMedian;
        score = refMedian > 0 ? t.amount / refMedian : 0;
        expected = Math.round(refMedian);
      } else {
        flagged = globalMedian > 0 && t.amount > 3 * globalMedian;
        score = globalMedian > 0 ? t.amount / globalMedian : 0;
      }
      if (!flagged) continue;
      const ratio = expected !== null && expected > 0 ? t.amount / expected : score;
      const severity: Severity = ratio >= 5 ? 'DANGER' : 'WARNING';
      const name = categoryName(t.categoryId);
      out.push({
        key: `anomaly:unusual:${t.id}`,
        kind: 'UNUSUAL_AMOUNT',
        severity,
        transactionIds: [t.id],
        title: t.categoryId ? `Dépense inhabituelle en ${name}` : 'Dépense inhabituelle',
        message:
          expected !== null
            ? `${money(t.amount)} pour « ${t.label} », alors qu’une dépense ${t.categoryId ? `en ${name} ` : ''}tourne habituellement autour de ${money(expected)}.`
            : `${money(t.amount)} pour « ${t.label} », bien au-dessus de vos dépenses habituelles.`,
        actualAmount: t.amount,
        expectedAmount: expected,
        score: Math.round(score * 100) / 100,
        date: t.date,
      });
    }
  }
  return out;
}

function duplicates(input: AnomalyInput, txs: AiTransaction[], since: string): Anomaly[] {
  const groups = new Map<string, AiTransaction[]>();
  for (const t of txs) {
    if (t.type === 'TRANSFER' || t.recurringId !== null) continue;
    const mk = merchantKey(t.label);
    if (mk === '') continue;
    const key = `${t.type}|${mk}|${t.amount}`;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }
  const out: Anomaly[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort(byDateThenId);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1];
      const b = list[i];
      if (!a || !b || a.id === b.id) continue;
      if (b.date < since || b.date > input.today) continue;
      const gap = diffDays(a.date, b.date);
      const window = b.amount < SMALL_AMOUNT ? 0 : DUPLICATE_WINDOW_DAYS;
      if (gap > window) continue;
      const [idA, idB] = [a.id, b.id].sort();
      out.push({
        key: `anomaly:duplicate:${idA}:${idB}`,
        kind: 'DUPLICATE',
        severity: 'WARNING',
        transactionIds: [idA ?? a.id, idB ?? b.id],
        title: 'Doublon possible',
        message:
          gap === 0
            ? `« ${b.label} » apparaît deux fois le même jour pour ${money(b.amount)}.`
            : `« ${b.label} » apparaît deux fois à ${gap} jour${gap > 1 ? 's' : ''} d’intervalle pour ${money(b.amount)}.`,
        actualAmount: b.amount,
        expectedAmount: null,
        score: 1,
        date: b.date,
      });
    }
  }
  return out;
}

function priceIncreases(input: AnomalyInput, expenses: AiTransaction[], since: string): Anomaly[] {
  const series: AiTransaction[][] = [];
  const byRule = new Map<string, AiTransaction[]>();
  for (const t of expenses) {
    if (t.recurringId === null) continue;
    const list = byRule.get(t.recurringId);
    if (list) list.push(t);
    else byRule.set(t.recurringId, [t]);
  }
  series.push(...byRule.values());
  for (const s of detectSeries(expenses)) if (!s.bill) series.push(s.transactions);

  const out = new Map<string, Anomaly>();
  for (const raw of series) {
    const list = [...raw].sort(byDateThenId);
    if (list.length < 4) continue;
    const last = list[list.length - 1];
    if (!last || last.date < since || last.date > input.today) continue;
    const previous = list.slice(-4, -1).map((t) => t.amount);
    const ref = median(previous);
    if (!(last.amount > ref * PRICE_INCREASE_RATIO && last.amount - ref >= PRICE_INCREASE_MIN)) continue;
    const mk = merchantKey(last.label);
    const key = `anomaly:price:${mk}:${monthOf(last.date)}`;
    if (out.has(key)) continue;
    const pct = Math.round(((last.amount - ref) / ref) * 100);
    out.set(key, {
      key,
      kind: 'PRICE_INCREASE',
      severity: pct >= 20 ? 'WARNING' : 'INFO',
      transactionIds: list.slice(-4).map((t) => t.id),
      title: `Hausse de prix : ${last.label}`,
      message: `« ${last.label} » passe de ${money(Math.round(ref))} à ${money(last.amount)} (+${pct} %).`,
      actualAmount: last.amount,
      expectedAmount: Math.round(ref),
      score: Math.round((last.amount / ref) * 100) / 100,
      date: last.date,
    });
  }
  return [...out.values()];
}

const SEVERITY_ORDER: Record<Severity, number> = { DANGER: 0, WARNING: 1, INFO: 2, SUCCESS: 3 };

/**
 * Anomalies récentes (depuis `since`, défaut today − 45 j), calculées sur l'historique fourni
 * (6 derniers mois pour les dépenses inhabituelles). Les virements sont exclus ; les clés
 * ignorées par l'utilisateur sont filtrées. Tri : date décroissante, puis gravité.
 */
export function detectAnomalies(input: AnomalyInput): Anomaly[] {
  const since = input.since ?? addDays(input.today, -DEFAULT_LOOKBACK_DAYS);
  const sixMonthsAgo = addMonths(input.today, -6);
  const txs = input.transactions.filter((t) => t.date <= input.today && t.amount > 0);
  const expenses = txs.filter((t) => t.type === 'EXPENSE');
  const recentExpenses = expenses.filter((t) => t.date >= sixMonthsAgo);
  const names = new Map(input.categories.map((c) => [c.id, c.name]));
  const categoryName = (id: string | null) => (id ? (names.get(id) ?? 'cette catégorie') : 'Sans catégorie');

  const dismissed = new Set(input.dismissedKeys);
  const all = [
    ...unusualAmounts(input, recentExpenses, since, categoryName),
    ...duplicates(input, txs, since),
    ...priceIncreases(input, expenses, since),
  ];
  const seen = new Set<string>();
  return all
    .filter((a) => {
      if (dismissed.has(a.key) || seen.has(a.key)) return false;
      seen.add(a.key);
      return true;
    })
    .sort(
      (a, b) =>
        (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) ||
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        a.key.localeCompare(b.key),
    );
}
