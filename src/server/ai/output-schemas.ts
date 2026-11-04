// Propriétaire : agent J. Schémas Zod des sorties du moteur IA (et du modèle persisté) :
// ai.service valide CHAQUE sortie avant de la renvoyer. Montants : entiers (millimes).
import 'server-only';
import { z } from 'zod';
import type {
  Anomaly,
  AssistantAnswer,
  BalanceForecast,
  BudgetSuggestion,
  CategorizerModel,
  CategoryPrediction,
  HealthScore,
  MonthlySummary,
  ParseEntryResult,
  RecurringCandidate,
  WhatIfResult,
} from '@/domain/ai/types';
import { FREQUENCIES } from '@/domain/types';
import { isoDateSchema, yearMonthSchema } from '@/lib/schemas/common';

const money = z.number().int();
const finite = z.number().refine(Number.isFinite, 'Nombre invalide.');
const nonNegative = finite.refine((n) => n >= 0, 'Nombre négatif.');
const probability = z.number().min(0).max(1);
const id = z.string().min(1);
const text = z.string();
const severity = z.enum(['INFO', 'SUCCESS', 'WARNING', 'DANGER']);
const flowType = z.enum(['EXPENSE', 'INCOME']);
const frequency = z.enum(FREQUENCIES);

// ───────────────────────── Catégorisation ─────────────────────────

const counts = z.record(z.string(), nonNegative);

export const categorizerModelSchema: z.ZodType<CategorizerModel> = z.object({
  version: z.number().int().min(0),
  alpha: z.number().positive(),
  docCount: counts,
  tokenCount: z.record(z.string(), counts),
  totalTokens: counts,
  vocabularySize: z.number().int().min(0),
  merchantMap: z.record(z.string(), id),
  sampleCount: z.number().int().min(0),
});

/** Lecture tolérante de la seule table marchand d'un ancien modèle (conservée au réentraînement). */
export const legacyMerchantMapSchema = z.object({ merchantMap: z.record(z.string(), id) });

export const categoryPredictionSchema: z.ZodType<CategoryPrediction> = z.object({
  categoryId: id,
  confidence: probability,
  source: z.enum(['MERCHANT', 'MODEL', 'RULE']),
  alternatives: z.array(z.object({ categoryId: id, confidence: probability })),
});
export const nullablePredictionSchema = categoryPredictionSchema.nullable();
export const predictionListSchema = z.array(nullablePredictionSchema);

// ───────────────────────── Saisie en langage naturel ─────────────────────────

export const parseEntryResultSchema: z.ZodType<ParseEntryResult> = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    entry: z.object({
      amount: money.positive(),
      type: flowType,
      date: isoDateSchema,
      label: z.string().min(1),
      categoryId: id.nullable(),
      categoryConfidence: probability.nullable(),
      accountId: id.nullable(),
      tags: z.array(z.string()),
      warnings: z.array(text),
    }),
  }),
  z.object({ ok: z.literal(false), message: text, examples: z.array(text) }),
]);

// ───────────────────────── Anomalies et récurrences ─────────────────────────

export const anomaliesSchema: z.ZodType<Anomaly[]> = z.array(
  z.object({
    key: z.string().min(1),
    kind: z.enum(['UNUSUAL_AMOUNT', 'DUPLICATE', 'PRICE_INCREASE']),
    severity,
    transactionIds: z.array(id),
    title: text,
    message: text,
    actualAmount: money,
    expectedAmount: money.nullable(),
    score: finite,
    date: isoDateSchema,
  }),
);

export const recurringCandidatesSchema: z.ZodType<RecurringCandidate[]> = z.array(
  z.object({
    key: z.string().min(1),
    label: text,
    merchantKey: text,
    type: flowType,
    amount: money.positive(),
    frequency,
    nextDate: isoDateSchema,
    categoryId: id.nullable(),
    accountId: id,
    occurrences: z.number().int().min(1),
    confidence: probability,
    transactionIds: z.array(id),
  }),
);

// ───────────────────────── Prévisions et budgets ─────────────────────────

const forecastPoint = z
  .object({ date: isoDateSchema, expected: money, low: money, high: money })
  .refine((p) => p.low <= p.expected && p.expected <= p.high, 'Intervalle incohérent.');

export const balanceForecastSchema: z.ZodType<BalanceForecast> = z.object({
  reliability: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  endOfMonth: forecastPoint,
  months: z.array(forecastPoint),
  chart: z.array(
    z.object({
      month: yearMonthSchema,
      actual: money.nullable(),
      expected: money.nullable(),
      low: money.nullable(),
      high: money.nullable(),
    }),
  ),
  monthlyNetEstimate: money,
  explanation: text,
});

export const budgetSuggestionsSchema: z.ZodType<BudgetSuggestion[]> = z.array(
  z.object({ categoryId: id, amount: money.positive(), basis: text }),
);

// ───────────────────────── Assistant, résumé, simulateur, santé ─────────────────────────

const highlight = z.object({
  label: text,
  value: finite,
  format: z.enum(['money', 'percent', 'number']),
});

export const assistantAnswerSchema: z.ZodType<AssistantAnswer> = z.object({
  intent: z.enum([
    'SPENDING_TOTAL',
    'INCOME_TOTAL',
    'COMPARE_PERIODS',
    'TOP_CATEGORIES',
    'TOP_MERCHANTS',
    'BIGGEST_EXPENSE',
    'AVERAGE_SPENDING',
    'BUDGET_STATUS',
    'BALANCE',
    'FORECAST',
    'CAN_AFFORD',
    'SUBSCRIPTIONS',
    'GOAL_PROGRESS',
    'SAVINGS_RATE',
    'UNKNOWN',
  ]),
  understood: z.boolean(),
  text,
  highlights: z.array(highlight),
  chart: z
    .object({
      kind: z.enum(['bar', 'line', 'pie']),
      title: text.optional(),
      data: z.array(z.object({ label: text, value: money })),
    })
    .nullable(),
  suggestions: z.array(text),
  period: z.object({ from: isoDateSchema, to: isoDateSchema, label: text }).nullable(),
  href: text.nullable(),
});

export const monthlySummarySchema: z.ZodType<MonthlySummary> = z.object({
  month: yearMonthSchema,
  title: text,
  paragraphs: z.array(text),
  highlights: z.array(highlight),
  recommendations: z.array(
    z.object({ title: text, detail: text, impact: money.nullable(), href: text.nullable() }),
  ),
});

export const whatIfResultSchema: z.ZodType<WhatIfResult> = z.object({
  baselineMonthlySaving: money,
  scenarioMonthlySaving: money,
  baselineDate: isoDateSchema.nullable(),
  scenarioDate: isoDateSchema.nullable(),
  monthsSaved: finite.nullable(),
  timeline: z.array(z.object({ month: yearMonthSchema, baseline: money, scenario: money })),
  message: text,
});

export const healthScoreSchema: z.ZodType<HealthScore> = z.object({
  score: z.number().min(0).max(100),
  grade: z.enum(['EXCELLENT', 'BON', 'MOYEN', 'FRAGILE']),
  components: z.array(
    z.object({
      key: z.enum([
        'SAVINGS_RATE',
        'EMERGENCY_FUND',
        'FIXED_CHARGES',
        'BUDGET_DISCIPLINE',
        'STABILITY',
        'TREND',
        'GOALS',
      ]),
      label: text,
      score: z.number().min(0).max(100),
      weight: probability,
      explanation: text,
    }),
  ),
  summary: text,
  topAdvice: text,
});
