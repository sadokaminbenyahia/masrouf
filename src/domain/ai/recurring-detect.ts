// Propriétaire : agent J. Détection automatique des dépenses et revenus récurrents dans
// l'historique (AI-DESIGN §4).
import { addDays, addMonths, diffDays, type ISODate } from '../dates';
import type { Frequency, RecurringRule } from '../types';
import { coefficientOfVariation, mad, median } from './stats';
import { jaccard, merchantKey, normalizeLabel, tokenize } from './text';
import type { AiTransaction, RecurringCandidate, RecurringDetectInput } from './types';

/** Période nominale de chaque fréquence, en jours. */
export const FREQUENCY_DAYS: Record<Frequency, number> = {
  WEEKLY: 7,
  MONTHLY: 30,
  QUARTERLY: 91,
  YEARLY: 365,
};

const MIN_OCCURRENCES = 3;
const MIN_REGULARITY = 0.7;
const AMOUNT_CLUSTER_TOLERANCE = 0.15;
const MAX_CV = 0.15;
const MAX_CV_BILLS = 0.4;
const BILL_TOKENS = new Set(['steg', 'sonede', 'electricite', 'eau', 'gaz', 'facture']);

/** Rattache une période médiane (en jours) à une fréquence ; null si aucune ne convient. */
export function classifyPeriod(days: number): Frequency | null {
  if (days >= 5 && days <= 9) return 'WEEKLY';
  if (days >= 27 && days <= 33) return 'MONTHLY';
  if (days >= 84 && days <= 98) return 'QUARTERLY';
  if (days >= 350 && days <= 380) return 'YEARLY';
  return null;
}

/** k-ième échéance après `date` (k ≥ 0) pour une fréquence donnée. */
export function addPeriod(date: ISODate, frequency: Frequency, k = 1): ISODate {
  switch (frequency) {
    case 'WEEKLY':
      return addDays(date, 7 * k);
    case 'MONTHLY':
      return addMonths(date, k);
    case 'QUARTERLY':
      return addMonths(date, 3 * k);
    case 'YEARLY':
      return addMonths(date, 12 * k);
  }
}

/** Facture à montant variable (STEG, SONEDE…) : tolérance plus large sur les montants. */
export function isBillLabel(label: string): boolean {
  const raw = normalizeLabel(label).split(' ');
  return raw.some((t) => BILL_TOKENS.has(t));
}

/** Une série détectée : transactions régulières d'un même marchand et d'un même montant. */
export interface DetectedSeries {
  merchantKey: string;
  type: 'EXPENSE' | 'INCOME';
  frequency: Frequency;
  /** Triées par date croissante */
  transactions: AiTransaction[];
  regularity: number;
  cv: number;
  bill: boolean;
}

function clusterByAmount(txs: AiTransaction[], bill: boolean): AiTransaction[][] {
  if (bill) return [txs];
  const sorted = [...txs].sort((a, b) => a.amount - b.amount);
  const clusters: AiTransaction[][] = [];
  let current: AiTransaction[] = [];
  let base = 0;
  for (const t of sorted) {
    if (current.length === 0 || t.amount <= base * (1 + AMOUNT_CLUSTER_TOLERANCE)) {
      if (current.length === 0) base = t.amount;
      current.push(t);
    } else {
      clusters.push(current);
      current = [t];
      base = t.amount;
    }
  }
  if (current.length > 0) clusters.push(current);
  return clusters;
}

function analyseCluster(
  mk: string,
  type: 'EXPENSE' | 'INCOME',
  cluster: AiTransaction[],
  bill: boolean,
): DetectedSeries | null {
  const txs = [...cluster].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)));
  const dates = [...new Set(txs.map((t) => t.date))];
  if (dates.length < MIN_OCCURRENCES) return null;
  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) intervals.push(diffDays(dates[i - 1] ?? '', dates[i] ?? ''));
  const m = median(intervals);
  if (m <= 0) return null;
  const regularity = 1 - mad(intervals) / m;
  if (regularity < MIN_REGULARITY) return null;
  const frequency = classifyPeriod(m);
  if (frequency === null) return null;
  const cv = coefficientOfVariation(txs.map((t) => t.amount));
  if (cv >= (bill ? MAX_CV_BILLS : MAX_CV)) return null;
  return { merchantKey: mk, type, frequency, transactions: txs, regularity, cv, bill };
}

/**
 * Toutes les séries régulières de l'historique (y compris celles déjà couvertes par une règle).
 * Groupement par marchand, puis par grappe de montants (±15 %), régularité ≥ 0,7.
 */
export function detectSeries(transactions: readonly AiTransaction[]): DetectedSeries[] {
  const groups = new Map<string, { mk: string; type: 'EXPENSE' | 'INCOME'; txs: AiTransaction[] }>();
  for (const t of transactions) {
    if (t.type === 'TRANSFER' || t.amount <= 0) continue;
    const mk = merchantKey(t.label);
    if (mk === '') continue;
    const key = `${t.type}|${mk}`;
    const g = groups.get(key);
    if (g) g.txs.push(t);
    else groups.set(key, { mk, type: t.type, txs: [t] });
  }
  const out: DetectedSeries[] = [];
  for (const g of [...groups.values()].sort((a, b) => a.mk.localeCompare(b.mk) || a.type.localeCompare(b.type))) {
    if (g.txs.length < MIN_OCCURRENCES) continue;
    const bill = g.txs.some((t) => isBillLabel(t.label));
    for (const cluster of clusterByAmount(g.txs, bill)) {
      const s = analyseCluster(g.mk, g.type, cluster, bill);
      if (s) out.push(s);
    }
  }
  return out;
}

type RuleTarget = Pick<AiTransaction, 'label' | 'type' | 'recurringId'>;

interface LabelKeys {
  merchant: string;
  normalized: string;
  tokens: string[];
}

const labelKeys = (label: string): LabelKeys => ({
  merchant: merchantKey(label),
  normalized: normalizeLabel(label),
  tokens: tokenize(label),
});

function labelsMatch(rule: LabelKeys, tx: LabelKeys): boolean {
  if (rule.merchant !== '' && rule.merchant === tx.merchant) return true;
  if (rule.normalized !== '' && rule.normalized === tx.normalized) return true;
  // Tous les mots de la règle figurent dans le libellé (« Loyer » ⊂ « Loyer novembre »).
  if (rule.tokens.length > 0 && rule.tokens.every((t) => tx.tokens.includes(t))) return true;
  return jaccard(rule.tokens, tx.tokens) >= 0.6;
}

/**
 * Prépare un test « cette transaction correspond-elle à une règle récurrente ? » (même règle
 * via `recurringId`, ou même libellé : clé marchand, libellé normalisé, mots de la règle inclus
 * ou Jaccard ≥ 0,6). Les clés des règles sont calculées une seule fois.
 */
export function ruleMatcher(rules: readonly RecurringRule[]): (t: RuleTarget) => boolean {
  const ids = new Set(rules.map((r) => r.id));
  const keyed = rules.map((r) => ({ type: r.type, keys: labelKeys(r.label) }));
  return (t) => {
    if (t.recurringId !== null && ids.has(t.recurringId)) return true;
    const candidates = keyed.filter((r) => r.type === t.type);
    if (candidates.length === 0) return false;
    const keys = labelKeys(t.label);
    return candidates.some((r) => labelsMatch(r.keys, keys));
  };
}

/** Une transaction correspond-elle à une règle récurrente (même règle ou même libellé) ? */
export function matchesRule(t: RuleTarget, rules: readonly RecurringRule[]): boolean {
  return ruleMatcher(rules)(t);
}

function isCovered(series: DetectedSeries, rules: readonly RecurringRule[]): boolean {
  const withRule = series.transactions.filter((t) => t.recurringId !== null).length;
  if (withRule * 2 >= series.transactions.length) return true;
  const last = series.transactions[series.transactions.length - 1];
  return last ? matchesRule(last, rules) : false;
}

function mostFrequent(values: readonly (string | null)[]): string | null {
  const counts = new Map<string, number>();
  let best: string | null = null;
  let bestCount = 0;
  for (const v of values) {
    if (v === null) continue;
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

/**
 * Suggestions de récurrences : séries régulières (≥ 3 occurrences, période hebdomadaire,
 * mensuelle, trimestrielle ou annuelle), encore actives, non couvertes par une règle existante.
 * Les séries bimestrielles (STEG) sont ignorées. `nextDate` = dernière date + période,
 * reportée d'une période tant qu'elle est passée.
 */
export function detectRecurring(input: RecurringDetectInput): RecurringCandidate[] {
  const out: RecurringCandidate[] = [];
  const usedKeys = new Set<string>();
  for (const s of detectSeries(input.transactions.filter((t) => t.date <= input.today))) {
    const last = s.transactions[s.transactions.length - 1];
    if (!last) continue;
    const period = FREQUENCY_DAYS[s.frequency];
    if (diffDays(last.date, input.today) > period * 1.5 + 5) continue;
    if (isCovered(s, input.existing)) continue;

    let nextDate = addPeriod(last.date, s.frequency);
    for (let k = 2; nextDate < input.today && k < 60; k++) nextDate = addPeriod(last.date, s.frequency, k);

    const amounts = s.transactions.map((t) => t.amount);
    const amount = s.bill ? Math.round(median(amounts)) : last.amount;
    const occurrences = new Set(s.transactions.map((t) => t.date)).size;
    const cvScore = 1 - s.cv / (s.bill ? MAX_CV_BILLS : MAX_CV);
    const confidence =
      Math.round(
        Math.min(0.99, 0.5 * s.regularity + 0.3 * cvScore + 0.2 * Math.min(occurrences, 12) / 12) * 100,
      ) / 100;

    let key = `recurring:${s.type}:${s.merchantKey}:${s.frequency}`;
    for (let i = 2; usedKeys.has(key); i++) key = `recurring:${s.type}:${s.merchantKey}:${s.frequency}:${i}`;
    usedKeys.add(key);

    out.push({
      key,
      label: last.label,
      merchantKey: s.merchantKey,
      type: s.type,
      amount,
      frequency: s.frequency,
      nextDate,
      categoryId: mostFrequent(s.transactions.map((t) => t.categoryId)),
      accountId: mostFrequent(s.transactions.map((t) => t.accountId)) ?? last.accountId,
      occurrences,
      confidence,
      transactionIds: s.transactions.map((t) => t.id),
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence || a.key.localeCompare(b.key));
}
