// Propriétaire : agent J. NE DOIT PAS importer transactions.service ni import.service (cycle).
import 'server-only';
import type { YearMonth } from '@/domain/dates';
import type { Result } from '@/domain/result';
import type {
  Anomaly,
  AssistantAnswer,
  BalanceForecast,
  BudgetSuggestion,
  CategorizeInput,
  CategoryPrediction,
  HealthScore,
  MonthlySummary,
  ParseEntryResult,
  RecurringCandidate,
  TrainingSample,
  WhatIfResult,
} from '@/domain/ai/types';
import type { WhatIfActionData } from '@/lib/schemas/ai';
import { notImplemented } from './_stub';

/** Seuil de confiance minimal pour appliquer automatiquement une catégorie. */
export const AUTO_CATEGORIZE_THRESHOLD = 0.55;

export async function predictCategory(
  _userId: string,
  _input: CategorizeInput,
): Promise<Result<CategoryPrediction | null>> {
  return notImplemented('predictCategory');
}
export async function predictCategories(
  _userId: string,
  _inputs: CategorizeInput[],
): Promise<Result<(CategoryPrediction | null)[]>> {
  return notImplemented('predictCategories');
}
export async function learnFromCorrection(
  _userId: string,
  _sample: TrainingSample,
  _previousCategoryId: string | null,
): Promise<Result<void>> {
  return notImplemented('learnFromCorrection');
}
/** Réentraîne entièrement le modèle (après import massif, seed…). */
export async function retrainCategorizer(_userId: string): Promise<Result<{ samples: number }>> {
  return notImplemented('retrainCategorizer');
}
export async function parseNaturalEntry(
  _userId: string,
  _text: string,
): Promise<Result<ParseEntryResult>> {
  return notImplemented('parseNaturalEntry');
}
export async function getAnomalies(_userId: string): Promise<Result<Anomaly[]>> {
  return notImplemented('getAnomalies');
}
export async function dismissInsight(_userId: string, _key: string): Promise<Result<void>> {
  return notImplemented('dismissInsight');
}
export async function getForecast(_userId: string): Promise<Result<BalanceForecast>> {
  return notImplemented('getForecast');
}
export async function getRecurringSuggestions(
  _userId: string,
): Promise<Result<RecurringCandidate[]>> {
  return notImplemented('getRecurringSuggestions');
}
export async function getBudgetSuggestions(_userId: string): Promise<Result<BudgetSuggestion[]>> {
  return notImplemented('getBudgetSuggestions');
}
export async function askAssistant(
  _userId: string,
  _question: string,
): Promise<Result<AssistantAnswer>> {
  return notImplemented('askAssistant');
}
export async function getExampleQuestions(): Promise<string[]> {
  return notImplemented('getExampleQuestions');
}
export async function getMonthlySummary(
  _userId: string,
  _month: YearMonth,
): Promise<Result<MonthlySummary>> {
  return notImplemented('getMonthlySummary');
}
export async function simulateWhatIf(
  _userId: string,
  _input: WhatIfActionData,
): Promise<Result<WhatIfResult>> {
  return notImplemented('simulateWhatIf');
}
export async function getHealthScore(_userId: string): Promise<Result<HealthScore>> {
  return notImplemented('getHealthScore');
}
