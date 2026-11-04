// Propriétaire : agent K — score de santé financière 0–100 expliqué
import { monthOf } from '../dates';
import { formatMoney } from '../money';
import type { GoalProgress, MonthTotals } from '../types';
import type { HealthComponent, HealthInput, HealthScore } from './types';

type Key = HealthComponent['key'];

export const HEALTH_WEIGHTS: Record<Key, number> = {
  SAVINGS_RATE: 0.25,
  EMERGENCY_FUND: 0.2,
  FIXED_CHARGES: 0.15,
  BUDGET_DISCIPLINE: 0.15,
  STABILITY: 0.1,
  TREND: 0.1,
  GOALS: 0.05,
};

const LABELS: Record<Key, string> = {
  SAVINGS_RATE: "Taux d'épargne",
  EMERGENCY_FUND: "Fonds d'urgence",
  FIXED_CHARGES: 'Charges fixes',
  BUDGET_DISCIPLINE: 'Respect des budgets',
  STABILITY: 'Stabilité des dépenses',
  TREND: 'Tendance sur 3 mois',
  GOALS: 'Progression des objectifs',
};

const ADVICE: Record<Key, string> = {
  SAVINGS_RATE:
    'Mettez de côté une petite somme dès la réception de vos revenus : viser 20 % d’épargne est le levier le plus efficace.',
  EMERGENCY_FUND:
    'Constituez un fonds d’urgence équivalent à 3 à 6 mois de dépenses, en commençant par un versement mensuel régulier.',
  FIXED_CHARGES:
    'Passez en revue vos charges fixes (abonnements, forfaits, contrats) : chaque économie récurrente compte chaque mois.',
  BUDGET_DISCIPLINE:
    'Ajustez les budgets que vous dépassez souvent, ou suivez-les de plus près en cours de mois.',
  STABILITY:
    'Lissez vos grosses dépenses en les anticipant (épargne dédiée) pour éviter les mois très chargés.',
  TREND:
    'Vos dépenses augmentent ces derniers mois : identifiez la catégorie qui progresse le plus pour la freiner.',
  GOALS:
    'Programmez un petit versement mensuel vers vos objectifs pour les faire avancer régulièrement.',
};

/** Interpolation linéaire bornée : x ≤ x0 → y0, x ≥ x1 → y1. */
function lerp(x: number, x0: number, y0: number, x1: number, y1: number): number {
  if (x <= x0) return y0;
  if (x >= x1) return y1;
  return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
}

function clampScore(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.round(Math.min(100, Math.max(0, x)));
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)} %`;
}

/** Mois complets (avant le mois de `today`) ; à défaut, tous les mois fournis. */
function completeMonths(monthly: readonly MonthTotals[], today: string): MonthTotals[] {
  const current = monthOf(today);
  const sorted = [...monthly].sort((a, b) => (a.month < b.month ? -1 : 1));
  const complete = sorted.filter((m) => m.month < current);
  return complete.length > 0 ? complete : sorted;
}

function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Score d'un objectif selon son statut et sa progression. */
function goalScore(g: GoalProgress): number {
  const r = Math.min(1, Math.max(0, g.ratio));
  switch (g.status) {
    case 'COMPLETED':
      return 100;
    case 'ON_TRACK':
      return 70 + 30 * r;
    case 'NO_DEADLINE':
      return 50 + 50 * r;
    case 'AT_RISK':
      return 20 + 30 * r;
    case 'OVERDUE':
      return 20 * r;
  }
}

type Partial0 = Omit<HealthComponent, 'weight'>;

export function computeHealthScore(input: HealthInput): HealthScore {
  const months = completeMonths(input.monthly, input.today);
  const withActivity = months.filter((m) => m.income > 0 || m.expense > 0);
  const totalIncome = withActivity.reduce((s, m) => s + m.income, 0);
  const totalExpense = withActivity.reduce((s, m) => s + m.expense, 0);
  const avgIncome = mean(withActivity.map((m) => m.income));
  const avgExpense = mean(withActivity.map((m) => m.expense));
  const parts: Partial0[] = [];
  const push = (key: Key, raw: number, explanation: string) =>
    parts.push({ key, label: LABELS[key], score: clampScore(raw), explanation });

  // 1. Taux d'épargne : 0 % → 0 ; ≥ 20 % → 100.
  if (totalIncome > 0) {
    const rate = (totalIncome - totalExpense) / totalIncome;
    push(
      'SAVINGS_RATE',
      lerp(rate, 0, 0, 0.2, 100),
      rate >= 0
        ? `Vous épargnez ${pct(rate)} de vos revenus (repère : 20 %).`
        : `Vos dépenses dépassent vos revenus de ${pct(-rate)} : votre épargne est négative.`,
    );
  }

  // 2. Fonds d'urgence : 0 → 0 ; 3 mois → 60 ; 6 mois → 100.
  if (avgExpense > 0) {
    const cover = input.totalBalance / avgExpense;
    const score = cover <= 3 ? lerp(cover, 0, 0, 3, 60) : lerp(cover, 3, 60, 6, 100);
    const shown = Math.max(0, Math.round(cover * 10) / 10);
    push(
      'EMERGENCY_FUND',
      score,
      `Votre solde (${formatMoney(input.totalBalance, { decimals: 0 })}) couvre ${String(shown).replace('.', ',')} mois de dépenses (repère : 3 à 6 mois).`,
    );
  }

  // 3. Charges fixes / revenu : ≤ 35 % → 100 ; ≥ 70 % → 0.
  if (avgIncome > 0) {
    const ratio = input.fixedMonthlyCharges / avgIncome;
    push(
      'FIXED_CHARGES',
      lerp(ratio, 0.35, 100, 0.7, 0),
      `Vos charges fixes (${formatMoney(input.fixedMonthlyCharges, { decimals: 0 })} par mois) représentent ${pct(ratio)} de vos revenus (repère : 35 % au plus).`,
    );
  }

  // 4. Respect des budgets : part des budgets non dépassés.
  if (input.budgets.length > 0) {
    const ok = input.budgets.filter((b) => b.level !== 'EXCEEDED').length;
    const n = input.budgets.length;
    push(
      'BUDGET_DISCIPLINE',
      (ok / n) * 100,
      ok === n
        ? `Aucun de vos ${n} budgets n'est dépassé.`
        : `${ok} budget${ok > 1 ? 's' : ''} sur ${n} respecté${ok > 1 ? 's' : ''} ce mois-ci.`,
    );
  }

  // 5. Stabilité : coefficient de variation des dépenses mensuelles ≤ 0,1 → 100 ; ≥ 0,5 → 0.
  const expenses = withActivity.map((m) => m.expense);
  if (expenses.length >= 3 && avgExpense > 0) {
    const variance = mean(expenses.map((e) => (e - avgExpense) ** 2));
    const cv = Math.sqrt(variance) / avgExpense;
    push(
      'STABILITY',
      lerp(cv, 0.1, 100, 0.5, 0),
      cv <= 0.1
        ? 'Vos dépenses mensuelles sont très régulières.'
        : `Vos dépenses varient de ${pct(cv)} en moyenne d'un mois à l'autre.`,
    );
  }

  // 6. Tendance sur les 3 derniers mois complets : baisse ≥ 5 % → 100 ; hausse ≥ 20 % → 0.
  const last3 = expenses.slice(-3);
  const first = last3[0] ?? 0;
  const last = last3[last3.length - 1] ?? 0;
  if (last3.length === 3 && first > 0) {
    const change = (last - first) / first;
    push(
      'TREND',
      lerp(change, -0.05, 100, 0.2, 0),
      change <= 0
        ? `Vos dépenses sont en baisse de ${pct(-change)} sur 3 mois.`
        : `Vos dépenses sont en hausse de ${pct(change)} sur 3 mois.`,
    );
  }

  // 7. Objectifs.
  if (input.goals.length > 0) {
    const score = mean(input.goals.map(goalScore));
    const done = input.goals.filter((g) => g.status === 'COMPLETED').length;
    const late = input.goals.filter((g) => g.status === 'AT_RISK' || g.status === 'OVERDUE').length;
    push(
      'GOALS',
      score,
      late > 0
        ? `${late} objectif${late > 1 ? 's' : ''} en retard sur ${input.goals.length}.`
        : done > 0
          ? `${done} objectif${done > 1 ? 's' : ''} atteint${done > 1 ? 's' : ''} sur ${input.goals.length}.`
          : `Vos ${input.goals.length > 1 ? `${input.goals.length} objectifs avancent` : 'objectif avance'} normalement.`,
    );
  }

  if (parts.length === 0) {
    return {
      score: 50,
      grade: 'MOYEN',
      components: [],
      summary:
        'Pas encore assez de données pour évaluer votre santé financière. Ajoutez vos revenus et dépenses pour obtenir un score.',
      topAdvice: 'Enregistrez vos transactions pendant quelques semaines pour obtenir un premier score.',
    };
  }

  const totalWeight = parts.reduce((s, p) => s + HEALTH_WEIGHTS[p.key], 0);
  const components: HealthComponent[] = parts.map((p) => ({
    ...p,
    weight: HEALTH_WEIGHTS[p.key] / totalWeight,
  }));
  const score = clampScore(components.reduce((s, c) => s + c.score * c.weight, 0));
  const grade: HealthScore['grade'] =
    score >= 80 ? 'EXCELLENT' : score >= 60 ? 'BON' : score >= 40 ? 'MOYEN' : 'FRAGILE';

  // Levier prioritaire : le plus de points pondérés à gagner.
  let lever: HealthComponent | null = null;
  for (const c of components) {
    const gain = (100 - c.score) * c.weight;
    if (gain > 0 && (!lever || gain > (100 - lever.score) * lever.weight)) lever = c;
  }
  const strongest = [...components].sort((a, b) => b.score - a.score || b.weight - a.weight)[0];
  const gradeText: Record<HealthScore['grade'], string> = {
    EXCELLENT: 'excellente',
    BON: 'bonne',
    MOYEN: 'moyenne',
    FRAGILE: 'fragile',
  };
  let summary = `Votre santé financière est ${gradeText[grade]} (${score}/100).`;
  if (strongest) summary += ` Point fort : ${strongest.label.toLowerCase()}.`;
  if (lever && lever.key !== strongest?.key) summary += ` À améliorer : ${lever.label.toLowerCase()}.`;

  return {
    score,
    grade,
    components,
    summary,
    topAdvice: lever
      ? ADVICE[lever.key]
      : 'Tous vos indicateurs sont au vert : continuez ainsi et pensez à faire grandir vos objectifs.',
  };
}
