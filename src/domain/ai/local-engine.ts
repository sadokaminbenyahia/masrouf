/**
 * Implémentation 100 % locale de l'AIEngine : compose les modules purs de src/domain/ai.
 * Aucune API externe, aucune clé, aucun modèle téléchargé.
 */
import type { AIEngine } from './engine';
import {
  categorize,
  CATEGORIZER_VERSION,
  learnCorrection,
  learnCorrections,
  trainCategorizer,
} from './categorizer';
import { merchantKey } from './text';
import { parseEntry } from './nl-entry';
import { detectAnomalies } from './anomalies';
import { detectRecurring } from './recurring-detect';
import { forecastBalance } from './forecast';
import { suggestBudgets } from './budget-suggest';
import { askAssistant, EXAMPLE_QUESTIONS } from './assistant';
import { generateMonthlySummary } from './summary';
import { simulateWhatIf } from './simulator';
import { computeHealthScore } from './health';

export class LocalAIEngine implements AIEngine {
  readonly name = 'masrouf-local-v1';
  readonly categorizerVersion = CATEGORIZER_VERSION;

  merchantKey = merchantKey;

  trainCategorizer = trainCategorizer;
  learnCorrection = learnCorrection;
  learnCorrections = learnCorrections;
  categorize = categorize;
  parseEntry = parseEntry;
  detectAnomalies = detectAnomalies;
  detectRecurring = detectRecurring;
  forecastBalance = forecastBalance;
  suggestBudgets = suggestBudgets;
  ask = askAssistant;
  exampleQuestions = (): string[] => [...EXAMPLE_QUESTIONS];
  monthlySummary = generateMonthlySummary;
  simulateWhatIf = simulateWhatIf;
  healthScore = computeHealthScore;
}

export function createLocalAIEngine(): AIEngine {
  return new LocalAIEngine();
}
