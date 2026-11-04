/**
 * Types du moteur IA local. Tout est pur, sérialisable, en millimes entiers et dates ISO.
 * Règle : modifications ADDITIVES uniquement (ne jamais casser une signature existante).
 */
import type { Millimes } from '../money';
import type { DateRange, ISODate, YearMonth } from '../dates';
import type {
  BudgetProgress,
  Category,
  CategoryKind,
  Frequency,
  GoalProgress,
  MonthTotals,
  RecurringRule,
  Severity,
  TransactionType,
} from '../types';

/** Vue minimale d'une transaction pour les algorithmes. */
export interface AiTransaction {
  id: string;
  date: ISODate;
  /** Positif */
  amount: Millimes;
  type: TransactionType;
  label: string;
  categoryId: string | null;
  accountId: string;
  recurringId: string | null;
}

export interface AiCategory {
  id: string;
  name: string;
  kind: CategoryKind;
}

// ───────────────────────── Catégorisation ─────────────────────────

export interface TrainingSample {
  label: string;
  amount: Millimes;
  type: TransactionType;
  categoryId: string;
}

export interface CategorizeInput {
  label: string;
  amount: Millimes;
  type: TransactionType;
}

/** Modèle naïf bayésien sérialisable (persisté en JSON par utilisateur, validé par Zod au chargement). */
export interface CategorizerModel {
  version: number;
  /** Lissage de Laplace */
  alpha: number;
  /** Nombre de documents par catégorie */
  docCount: Record<string, number>;
  /** Comptes de tokens par catégorie */
  tokenCount: Record<string, Record<string, number>>;
  /** Total de tokens par catégorie */
  totalTokens: Record<string, number>;
  /** Taille du vocabulaire */
  vocabularySize: number;
  /** Clé marchand normalisée → catégorie (issue des corrections, prioritaire) */
  merchantMap: Record<string, string>;
  /** Nombre total d'échantillons */
  sampleCount: number;
}

export type PredictionSource = 'MERCHANT' | 'MODEL' | 'RULE';

export interface CategoryPrediction {
  categoryId: string;
  /** 0..1 */
  confidence: number;
  source: PredictionSource;
  alternatives: { categoryId: string; confidence: number }[];
}

// ───────────────────────── Saisie en langage naturel ─────────────────────────

export interface ParseEntryContext {
  today: ISODate;
  categories: AiCategory[];
  accounts: { id: string; name: string; type: string }[];
  model: CategorizerModel | null;
}

export interface ParsedEntry {
  amount: Millimes;
  type: Exclude<TransactionType, 'TRANSFER'>;
  date: ISODate;
  label: string;
  categoryId: string | null;
  categoryConfidence: number | null;
  /** Compte détecté (« en espèces », « par carte »…) */
  accountId: string | null;
  tags: string[];
  /** Avertissements en français (ex. « Montant inhabituel ») */
  warnings: string[];
}

export type ParseEntryResult =
  { ok: true; entry: ParsedEntry } | { ok: false; message: string; examples: string[] };

// ───────────────────────── Anomalies ─────────────────────────

export type AnomalyKind = 'UNUSUAL_AMOUNT' | 'DUPLICATE' | 'PRICE_INCREASE';

export interface AnomalyInput {
  today: ISODate;
  /** Historique (idéalement 6–12 mois) */
  transactions: AiTransaction[];
  categories: AiCategory[];
  recurring: RecurringRule[];
  /** Clés d'anomalies ignorées par l'utilisateur */
  dismissedKeys: string[];
  /** Ne signaler que les transactions à partir de cette date (défaut : today − 45 j) */
  since?: ISODate;
}

export interface Anomaly {
  /** Clé stable pour « ignorer » */
  key: string;
  kind: AnomalyKind;
  severity: Severity;
  transactionIds: string[];
  title: string;
  message: string;
  actualAmount: Millimes;
  expectedAmount: Millimes | null;
  /** Score (z robuste, ratio…) */
  score: number;
  date: ISODate;
}

// ───────────────────────── Récurrences détectées ─────────────────────────

export interface RecurringDetectInput {
  today: ISODate;
  transactions: AiTransaction[];
  /** Règles existantes (pour ne pas re-suggérer) */
  existing: RecurringRule[];
}

export interface RecurringCandidate {
  key: string;
  label: string;
  merchantKey: string;
  type: Exclude<TransactionType, 'TRANSFER'>;
  amount: Millimes;
  frequency: Frequency;
  nextDate: ISODate;
  categoryId: string | null;
  accountId: string;
  occurrences: number;
  confidence: number;
  transactionIds: string[];
}

// ───────────────────────── Prévisions ─────────────────────────

export interface ForecastInput {
  today: ISODate;
  /** Solde total actuel (tous comptes non archivés) */
  currentBalance: Millimes;
  /** Historique ≥ 6 mois si possible */
  history: AiTransaction[];
  recurring: RecurringRule[];
}

export interface ForecastPoint {
  date: ISODate;
  expected: Millimes;
  /** Borne basse de l'intervalle à 80 % */
  low: Millimes;
  /** Borne haute de l'intervalle à 80 % */
  high: Millimes;
}

export interface ForecastChartPoint {
  month: YearMonth;
  /** Solde réel de fin de mois (null pour les mois futurs) */
  actual: Millimes | null;
  expected: Millimes | null;
  low: Millimes | null;
  high: Millimes | null;
}

export interface BalanceForecast {
  reliability: 'LOW' | 'MEDIUM' | 'HIGH';
  endOfMonth: ForecastPoint;
  /** Fins des 3 prochains mois */
  months: ForecastPoint[];
  /** 6 mois d'historique + mois courant + 3 mois de prévision, pour le graphique */
  chart: ForecastChartPoint[];
  /** Flux net mensuel estimé (hors récurrences) */
  monthlyNetEstimate: Millimes;
  /** Explication courte en français */
  explanation: string;
}

// ───────────────────────── Suggestions de budgets ─────────────────────────

export interface BudgetSuggestInput {
  today: ISODate;
  transactions: AiTransaction[];
  categories: AiCategory[];
  /** Revenu mensuel moyen (null si inconnu) */
  monthlyIncome: Millimes | null;
}

export interface BudgetSuggestion {
  categoryId: string;
  amount: Millimes;
  /** Ex. « 70e centile de vos 6 derniers mois » */
  basis: string;
}

// ───────────────────────── Assistant ─────────────────────────

export interface ToolFilter {
  range: DateRange;
  type?: 'EXPENSE' | 'INCOME';
  categoryIds?: string[];
  /** Recherche plein texte dans le libellé */
  search?: string;
}

/**
 * Outils typés que l'assistant peut appeler. Implémentés côté serveur
 * (src/server/services/finance-tools.ts), TOUJOURS scopés sur l'utilisateur courant.
 */
export interface FinanceTools {
  sumTransactions(f: ToolFilter): Promise<{ total: Millimes; count: number }>;
  breakdownByCategory(
    f: ToolFilter,
  ): Promise<{ categoryId: string | null; name: string; total: Millimes; count: number }[]>;
  monthlyTotals(f: ToolFilter): Promise<MonthTotals[]>;
  listTransactions(
    f: ToolFilter & { sort: 'AMOUNT_DESC' | 'DATE_DESC'; limit: number },
  ): Promise<AiTransaction[]>;
  topMerchants(
    f: ToolFilter & { limit: number },
  ): Promise<{ label: string; total: Millimes; count: number }[]>;
  budgetStatus(month: YearMonth): Promise<BudgetProgress[]>;
  goals(): Promise<GoalProgress[]>;
  balances(): Promise<{
    total: Millimes;
    accounts: { id: string; name: string; balance: Millimes }[];
  }>;
  forecast(): Promise<BalanceForecast>;
  recurring(): Promise<RecurringRule[]>;
}

export interface AssistantContext {
  today: ISODate;
  categories: AiCategory[];
  accounts: { id: string; name: string }[];
  goals: { id: string; name: string }[];
}

export type AssistantIntent =
  | 'SPENDING_TOTAL'
  | 'INCOME_TOTAL'
  | 'COMPARE_PERIODS'
  | 'TOP_CATEGORIES'
  | 'TOP_MERCHANTS'
  | 'BIGGEST_EXPENSE'
  | 'AVERAGE_SPENDING'
  | 'BUDGET_STATUS'
  | 'BALANCE'
  | 'FORECAST'
  | 'CAN_AFFORD'
  | 'SUBSCRIPTIONS'
  | 'GOAL_PROGRESS'
  | 'SAVINGS_RATE'
  | 'UNKNOWN';

export interface MiniChart {
  kind: 'bar' | 'line' | 'pie';
  title?: string;
  /** Valeurs en millimes */
  data: { label: string; value: Millimes }[];
}

export interface AssistantHighlight {
  label: string;
  value: number;
  format: 'money' | 'percent' | 'number';
}

export interface AssistantAnswer {
  intent: AssistantIntent;
  understood: boolean;
  /** Réponse en français (peut contenir des montants déjà formatés) */
  text: string;
  highlights: AssistantHighlight[];
  chart: MiniChart | null;
  /** Questions de relance / suggestions quand la demande n'est pas comprise */
  suggestions: string[];
  /** Période interprétée */
  period: (DateRange & { label: string }) | null;
  /** Lien vers les transactions correspondantes */
  href: string | null;
}

// ───────────────────────── Résumé mensuel ─────────────────────────

export interface MonthlySummaryInput {
  month: YearMonth;
  today: ISODate;
  /** Transactions du mois ET des 3 mois précédents */
  transactions: AiTransaction[];
  categories: AiCategory[];
  budgets: BudgetProgress[];
  goals: GoalProgress[];
  /** Graine pour varier les gabarits de façon déterministe (ex. userId) */
  seed: string;
}

export interface Recommendation {
  title: string;
  detail: string;
  /** Gain mensuel estimé (null si non chiffrable) */
  impact: Millimes | null;
  href: string | null;
}

export interface MonthlySummary {
  month: YearMonth;
  title: string;
  paragraphs: string[];
  highlights: AssistantHighlight[];
  /** Exactement 3 recommandations (moins seulement si les données manquent) */
  recommendations: Recommendation[];
}

// ───────────────────────── Simulateur « et si » ─────────────────────────

export interface WhatIfInput {
  today: ISODate;
  goal: {
    id: string;
    name: string;
    targetAmount: Millimes;
    savedAmount: Millimes;
    targetDate: ISODate | null;
  };
  /** Historique mensuel (≥ 3 mois idéalement) */
  monthly: MonthTotals[];
  /** Dépense mensuelle moyenne par catégorie */
  categorySpending: { categoryId: string; name: string; monthlyAverage: Millimes }[];
  /** Réductions : percent ∈ [0, 100] */
  adjustments: { categoryId: string; percent: number }[];
  /** Épargne mensuelle supplémentaire (optionnelle) */
  extraMonthlySaving: Millimes;
}

export interface WhatIfResult {
  baselineMonthlySaving: Millimes;
  scenarioMonthlySaving: Millimes;
  /** Date d'atteinte (null si jamais atteinte au rythme donné) */
  baselineDate: ISODate | null;
  scenarioDate: ISODate | null;
  /** Mois gagnés (positif = plus tôt) ; null si non calculable */
  monthsSaved: number | null;
  /** Projection cumulée de l'épargne, mois par mois */
  timeline: { month: YearMonth; baseline: Millimes; scenario: Millimes }[];
  message: string;
}

// ───────────────────────── Score de santé ─────────────────────────

export interface HealthInput {
  today: ISODate;
  /** 6 derniers mois complets (+ mois courant) */
  monthly: MonthTotals[];
  /** Solde total liquide */
  totalBalance: Millimes;
  /** Charges fixes mensuelles (récurrences de dépense) */
  fixedMonthlyCharges: Millimes;
  /** Dépenses mensuelles par groupe 50/30/20 (moyenne) */
  groupSpending: { needs: Millimes; wants: Millimes; savings: Millimes };
  budgets: BudgetProgress[];
  goals: GoalProgress[];
}

export interface HealthComponent {
  key:
    | 'SAVINGS_RATE'
    | 'EMERGENCY_FUND'
    | 'FIXED_CHARGES'
    | 'BUDGET_DISCIPLINE'
    | 'STABILITY'
    | 'TREND'
    | 'GOALS';
  label: string;
  /** 0..100 */
  score: number;
  /** Poids effectif (renormalisé si données manquantes), somme = 1 */
  weight: number;
  explanation: string;
}

export interface HealthScore {
  /** 0..100 */
  score: number;
  grade: 'EXCELLENT' | 'BON' | 'MOYEN' | 'FRAGILE';
  components: HealthComponent[];
  summary: string;
  /** Conseil prioritaire (levier qui rapporte le plus de points) */
  topAdvice: string;
}

export type { Category };
