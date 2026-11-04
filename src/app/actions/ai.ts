'use server';
// Propriétaire : agent J (fichier fin : validation + délégation à ai.service, qui applique le rate limiting)
import type { ActionResult } from '@/domain/result';
import type {
  Anomaly,
  AssistantAnswer,
  BalanceForecast,
  BudgetSuggestion,
  CategoryPrediction,
  HealthScore,
  MonthlySummary,
  ParseEntryResult,
  RecurringCandidate,
  WhatIfResult,
} from '@/domain/ai/types';
import {
  askInputSchema,
  dismissInputSchema,
  monthlySummaryInputSchema,
  parseEntryInputSchema,
  suggestCategoryInputSchema,
  whatIfInputSchema,
  type WhatIfActionInput,
} from '@/lib/schemas/ai';
import { authedAction, validatedAction } from '@/server/actions/safe-action';
import * as ai from '@/server/services/ai.service';
import { revalidateApp } from './_revalidate';

export async function parseEntryAction(text: string): Promise<ActionResult<ParseEntryResult>> {
  return validatedAction(parseEntryInputSchema, { text }, (d, userId) =>
    ai.parseNaturalEntry(userId, d.text),
  );
}

export async function suggestCategoryAction(input: {
  label: string;
  amount: number;
  type: 'EXPENSE' | 'INCOME';
}): Promise<ActionResult<CategoryPrediction | null>> {
  return validatedAction(suggestCategoryInputSchema, input, (d, userId) =>
    ai.predictCategory(userId, d),
  );
}

export async function getAnomaliesAction(): Promise<ActionResult<Anomaly[]>> {
  return authedAction((userId) => ai.getAnomalies(userId));
}

export async function dismissInsightAction(key: string): Promise<ActionResult<void>> {
  const r = await validatedAction(dismissInputSchema, { key }, (d, userId) =>
    ai.dismissInsight(userId, d.key),
  );
  if (r.ok) revalidateApp();
  return r;
}

export async function getForecastAction(): Promise<ActionResult<BalanceForecast>> {
  return authedAction((userId) => ai.getForecast(userId));
}

export async function getRecurringSuggestionsAction(): Promise<ActionResult<RecurringCandidate[]>> {
  return authedAction((userId) => ai.getRecurringSuggestions(userId));
}

export async function getBudgetSuggestionsAction(): Promise<ActionResult<BudgetSuggestion[]>> {
  return authedAction((userId) => ai.getBudgetSuggestions(userId));
}

export async function askAssistantAction(question: string): Promise<ActionResult<AssistantAnswer>> {
  return validatedAction(askInputSchema, { question }, (d, userId) =>
    ai.askAssistant(userId, d.question),
  );
}

export async function getMonthlySummaryAction(
  month: string,
): Promise<ActionResult<MonthlySummary>> {
  return validatedAction(monthlySummaryInputSchema, { month }, (d, userId) =>
    ai.getMonthlySummary(userId, d.month),
  );
}

export async function simulateWhatIfAction(
  input: WhatIfActionInput,
): Promise<ActionResult<WhatIfResult>> {
  return validatedAction(whatIfInputSchema, input, (d, userId) => ai.simulateWhatIf(userId, d));
}

export async function getHealthScoreAction(): Promise<ActionResult<HealthScore>> {
  return authedAction((userId) => ai.getHealthScore(userId));
}
