/**
 * Conseils (pur) : règle 50/30/20, catégories en hausse, abonnements oubliés.
 * Chaque conseil a une `key` stable, que l'utilisateur peut ignorer.
 */
import type { RecurringCandidate } from './ai/types';
import { averageMillimes, type CategoryMonthSum, type CategorySum } from './aggregations';
import { normalizeForHash } from './csv/hash';
import {
  addMonthsYM,
  diffDays,
  diffMonthsYM,
  formatMonthFR,
  monthEnd,
  monthOf,
  monthStart,
  type ISODate,
  type YearMonth,
} from './dates';
import { formatMoney, type Millimes } from './money';
import { savedAmount, savingsRate } from './savings';
import type { Category, Frequency, Insight, RecurringRule, Severity } from './types';

export const RULE_NEEDS_MAX = 0.5;
export const RULE_WANTS_MAX = 0.3;
export const RULE_SAVINGS_MIN = 0.2;
/** Hausse minimale par rapport à la moyenne des 3 mois précédents */
export const SPIKE_RATIO = 1.3;
/** Écart minimal (30 DT) */
export const SPIKE_MIN_DELTA: Millimes = 30_000;
/** Ancienneté minimale d'un abonnement « oublié » (≈ 3 mois) */
export const FORGOTTEN_MIN_DAYS = 80;

const PCT = (ratio: number) => `${Math.round(ratio * 100)} %`;
const DT = (m: Millimes) => formatMoney(m, { decimals: 0 });

export interface GroupSpending {
  needs: Millimes;
  wants: Millimes;
  savings: Millimes;
  /** Dépenses non catégorisées (ou catégorie inconnue) */
  other: Millimes;
}

/** Dépenses par groupe 50/30/20 à partir des sommes par catégorie. */
export function groupSpending(
  sums: readonly CategorySum[],
  categories: ReadonlyMap<string, Category>,
): GroupSpending {
  const out: GroupSpending = { needs: 0, wants: 0, savings: 0, other: 0 };
  for (const s of sums) {
    const c = s.categoryId === null ? undefined : categories.get(s.categoryId);
    if (!c || c.kind !== 'EXPENSE') out.other += s.amount;
    else if (c.group === 'NEEDS') out.needs += s.amount;
    else if (c.group === 'WANTS') out.wants += s.amount;
    else if (c.group === 'SAVINGS') out.savings += s.amount;
    else out.other += s.amount;
  }
  return out;
}

export interface RuleMonthInput {
  month: YearMonth;
  income: Millimes;
  /** Dépenses totales du mois (virements exclus) */
  expense: Millimes;
  /** Dépenses du mois par catégorie */
  byCategory: readonly CategorySum[];
}

/** Règle 50/30/20 : besoins ≤ 50 %, envies ≤ 30 %, épargne ≥ 20 % du revenu du mois. */
export function rule503020Insights(
  input: RuleMonthInput,
  categories: ReadonlyMap<string, Category>,
): Insight[] {
  if (input.income <= 0) return [];
  const g = groupSpending(input.byCategory, categories);
  const needs = g.needs / input.income;
  const wants = g.wants / input.income;
  const totals = { income: input.income, expense: input.expense, savingsGroupExpense: g.savings };
  const savingsAmount = savedAmount(totals);
  const savings = savingsRate(totals) ?? 0;
  const label = formatMonthFR(input.month);
  const out: Insight[] = [];

  if (needs > RULE_NEEDS_MAX) {
    out.push({
      key: `rule-50-30-20:needs:${input.month}`,
      kind: 'RULE_50_30_20',
      severity: 'WARNING',
      title: `Besoins : ${PCT(needs)} de vos revenus`,
      message: `En ${label}, vos dépenses essentielles (logement, courses, factures…) représentent ${PCT(needs)} de vos revenus. La règle 50/30/20 recommande de rester sous 50 %.`,
    });
  }
  if (wants > RULE_WANTS_MAX) {
    const excess = g.wants - Math.round(input.income * RULE_WANTS_MAX);
    out.push({
      key: `rule-50-30-20:wants:${input.month}`,
      kind: 'RULE_50_30_20',
      severity: 'WARNING',
      title: `Envies : ${PCT(wants)} de vos revenus`,
      message: `En ${label}, vos dépenses plaisir (restaurants, cafés, loisirs…) représentent ${PCT(wants)} de vos revenus. Les réduire de ${DT(excess)} vous ramènerait à 30 %.`,
    });
  }
  if (savings < RULE_SAVINGS_MIN) {
    const target = Math.round(input.income * RULE_SAVINGS_MIN);
    out.push({
      key: `rule-50-30-20:savings:${input.month}`,
      kind: 'SAVINGS_RATE',
      severity: savings < 0 ? 'DANGER' : 'WARNING',
      title: `Épargne : ${PCT(savings)} de vos revenus`,
      message:
        savings < 0
          ? `En ${label}, vos dépenses ont dépassé vos revenus de ${DT(-savingsAmount)}. L'objectif est d'épargner 20 %, soit ${DT(target)} par mois.`
          : `En ${label}, vous avez mis de côté ${DT(savingsAmount)}. L'objectif de 20 % correspond à ${DT(target)} par mois.`,
    });
  }
  if (out.length === 0) {
    out.push({
      key: `rule-50-30-20:ok:${input.month}`,
      kind: 'RULE_50_30_20',
      severity: 'SUCCESS',
      title: 'Règle 50/30/20 respectée',
      message: `En ${label} : besoins ${PCT(needs)}, envies ${PCT(wants)}, épargne ${PCT(savings)} de vos revenus. Bel équilibre !`,
    });
  }
  return out;
}

/** Moyenne des seuls mois non nuls (dépense « habituelle » d'un mois où la catégorie sert). */
export function activeMonthsAverage(values: readonly Millimes[]): Millimes {
  const nonZero = values.filter((v) => v > 0);
  return nonZero.length === 0 ? 0 : averageMillimes(nonZero);
}

/**
 * Catégories dont la dépense du mois dépasse de 30 % (et 30 DT) la moyenne des 3 mois
 * précédents ET la dépense habituelle des mois actifs des 6 derniers mois (factures
 * bimestrielles ou trimestrielles non signalées comme une hausse).
 */
export function categorySpikeInsights(
  month: YearMonth,
  sums: readonly CategoryMonthSum[],
  categories: ReadonlyMap<string, Category>,
): Insight[] {
  const amountOf = new Map<string, Millimes>();
  for (const s of sums) {
    if (s.categoryId === null) continue;
    const key = `${s.categoryId}|${s.month}`;
    amountOf.set(key, (amountOf.get(key) ?? 0) + s.amount);
  }
  const previous = [1, 2, 3].map((i) => addMonthsYM(month, -i));
  const previous6 = [1, 2, 3, 4, 5, 6].map((i) => addMonthsYM(month, -i));
  const out: { insight: Insight; delta: Millimes }[] = [];
  for (const c of categories.values()) {
    if (c.kind !== 'EXPENSE' || c.group === 'SAVINGS') continue;
    const current = amountOf.get(`${c.id}|${month}`) ?? 0;
    const avg = averageMillimes(previous.map((m) => amountOf.get(`${c.id}|${m}`) ?? 0));
    if (avg <= 0) continue;
    const delta = current - avg;
    if (current < avg * SPIKE_RATIO || delta < SPIKE_MIN_DELTA) continue;
    // Facture périodique non mensuelle (bimestrielle, trimestrielle…) : la hausse doit aussi
    // dépasser la dépense habituelle des mois où la catégorie est utilisée (6 derniers mois).
    const active = activeMonthsAverage(previous6.map((m) => amountOf.get(`${c.id}|${m}`) ?? 0));
    if (current < active * SPIKE_RATIO || current - active < SPIKE_MIN_DELTA) continue;
    out.push({
      delta,
      insight: {
        key: `category-spike:${c.id}:${month}`,
        kind: 'CATEGORY_SPIKE',
        severity: 'WARNING',
        title: `${c.name} : +${PCT(delta / avg)}`,
        message: `Vous avez dépensé ${DT(current)} en « ${c.name} » en ${formatMonthFR(month)}, contre ${DT(avg)} en moyenne sur les 3 mois précédents.`,
        categoryId: c.id,
        href: `/transactions?categoryId=${encodeURIComponent(c.id)}&from=${monthStart(month)}&to=${monthEnd(month)}`,
      },
    });
  }
  return out.sort((a, b) => b.delta - a.delta).map((x) => x.insight);
}

const FREQUENCY_FR: Record<Frequency, string> = {
  WEEKLY: 'chaque semaine',
  MONTHLY: 'chaque mois',
  QUARTERLY: 'chaque trimestre',
  YEARLY: 'chaque année',
};

/** Une règle existante correspond-elle au paiement détecté ? */
export function matchesExistingRule(
  candidate: Pick<RecurringCandidate, 'merchantKey' | 'label' | 'type' | 'amount' | 'categoryId'>,
  rule: Pick<RecurringRule, 'label' | 'type' | 'amount' | 'categoryId'>,
): boolean {
  if (rule.type !== candidate.type) return false;
  const ruleLabel = normalizeForHash(rule.label);
  const keys = [normalizeForHash(candidate.merchantKey), normalizeForHash(candidate.label)].filter(
    (k) => k !== '',
  );
  if (ruleLabel !== '' && keys.some((k) => ruleLabel.includes(k) || k.includes(ruleLabel))) {
    return true;
  }
  const close = Math.abs(rule.amount - candidate.amount) <= Math.round(candidate.amount * 0.05);
  return candidate.categoryId !== null && rule.categoryId === candidate.categoryId && close;
}

export interface ForgottenSubscriptionInput {
  today: ISODate;
  candidates: readonly RecurringCandidate[];
  rules: readonly RecurringRule[];
  /** Date et règle liée des transactions citées par les candidats */
  transactions: ReadonlyMap<string, { date: ISODate; recurringId: string | null }>;
}

/** Paiements récurrents détectés, sans règle correspondante, actifs depuis ≈ 3 mois. */
export function forgottenSubscriptionInsights(input: ForgottenSubscriptionInput): Insight[] {
  const out: Insight[] = [];
  const seen = new Set<string>();
  for (const c of input.candidates) {
    if (c.type !== 'EXPENSE') continue;
    const txs = c.transactionIds
      .map((id) => input.transactions.get(id))
      .filter((t) => t !== undefined);
    if (txs.some((t) => t.recurringId !== null)) continue;
    if (input.rules.some((r) => matchesExistingRule(c, r))) continue;
    const first = txs.reduce<ISODate | null>(
      (min, t) => (min === null || t.date < min ? t.date : min),
      null,
    );
    if (first === null || diffDays(first, input.today) < FORGOTTEN_MIN_DAYS) continue;
    const key = `forgotten-subscription:${c.merchantKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const months = Math.max(1, diffMonthsYM(monthOf(first), monthOf(input.today)));
    out.push({
      key,
      kind: 'FORGOTTEN_SUBSCRIPTION',
      severity: 'INFO',
      title: `Abonnement non suivi : ${c.label}`,
      message: `Environ ${DT(c.amount)} prélevés ${FREQUENCY_FR[c.frequency]} depuis ${months} mois, sans dépense récurrente associée. Ajoutez-le à vos récurrents pour le suivre, ou résiliez-le s'il ne vous sert plus.`,
      ...(c.categoryId !== null ? { categoryId: c.categoryId } : {}),
      href: '/recurrents',
    });
  }
  return out;
}

const SEVERITY_ORDER: Record<Severity, number> = { DANGER: 0, WARNING: 1, INFO: 2, SUCCESS: 3 };

export interface InsightsInput {
  today: ISODate;
  categories: readonly Category[];
  /** Mois analysé pour la règle 50/30/20 (idéalement le dernier mois complet) ; null pour ignorer */
  ruleMonth: RuleMonthInput | null;
  /** Mois analysé pour les hausses de catégorie */
  spikeMonth: YearMonth;
  /** Dépenses par (catégorie, mois) : `spikeMonth` et les 3 mois précédents */
  categoryMonthly: readonly CategoryMonthSum[];
  forgotten: Omit<ForgottenSubscriptionInput, 'today'> | null;
  dismissedKeys: readonly string[];
}

/** Tous les conseils, sans ceux ignorés, triés par gravité. */
export function computeInsights(input: InsightsInput): Insight[] {
  const categories = new Map(input.categories.map((c) => [c.id, c]));
  const all = [
    ...(input.ruleMonth ? rule503020Insights(input.ruleMonth, categories) : []),
    ...categorySpikeInsights(input.spikeMonth, input.categoryMonthly, categories),
    ...(input.forgotten
      ? forgottenSubscriptionInsights({
          ...input.forgotten,
          // Un versement d'épargne régulier n'est pas un abonnement.
          candidates: input.forgotten.candidates.filter(
            (c) => c.categoryId === null || categories.get(c.categoryId)?.group !== 'SAVINGS',
          ),
          today: input.today,
        })
      : []),
  ];
  const dismissed = new Set(input.dismissedKeys);
  return all
    .filter((i) => !dismissed.has(i.key))
    .map((insight, index) => ({ insight, index }))
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.insight.severity] - SEVERITY_ORDER[b.insight.severity] ||
        a.index - b.index,
    )
    .map((x) => x.insight);
}
