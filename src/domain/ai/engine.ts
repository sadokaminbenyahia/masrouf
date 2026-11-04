/**
 * Interface unique du moteur IA. L'application ne dépend QUE de cette interface ;
 * l'implémentation actuelle est 100 % locale (LocalAIEngine, src/domain/ai/local-engine.ts),
 * sans API externe, sans clé et sans modèle à télécharger.
 */
import type {
  AnomalyInput,
  Anomaly,
  AiCategory,
  AssistantAnswer,
  AssistantContext,
  BalanceForecast,
  BudgetSuggestInput,
  BudgetSuggestion,
  CategorizeInput,
  CategorizerModel,
  CategoryPrediction,
  FinanceTools,
  ForecastInput,
  HealthInput,
  HealthScore,
  MonthlySummary,
  MonthlySummaryInput,
  ParseEntryContext,
  ParseEntryResult,
  RecurringCandidate,
  RecurringDetectInput,
  TrainingSample,
  WhatIfInput,
  WhatIfResult,
} from './types';

export interface AIEngine {
  readonly name: string;
  /** Version du format de CategorizerModel (réentraînement si elle change). */
  readonly categorizerVersion: number;

  /** Clé marchand normalisée d'un libellé bancaire (« PAIEMENT CB CARREFOUR 12/03 » → « carrefour »). */
  merchantKey(label: string): string;

  /** Entraîne un classifieur à partir des transactions catégorisées par l'utilisateur. */
  trainCategorizer(samples: TrainingSample[]): CategorizerModel;
  /** Apprend une correction (immuable : renvoie un nouveau modèle). */
  learnCorrection(
    model: CategorizerModel,
    sample: TrainingSample,
    previousCategoryId: string | null,
  ): CategorizerModel;
  /**
   * Apprend un lot de corrections (immuable : une seule copie de travail, renvoie un nouveau
   * modèle). Préféré à des appels répétés de `learnCorrection` pour les opérations de masse.
   */
  learnCorrections(
    model: CategorizerModel,
    samples: readonly { sample: TrainingSample; previousCategoryId: string | null }[],
  ): CategorizerModel;
  /** Prédit une catégorie (null si aucune n'est assez probable). `model` null = règles de démarrage. */
  categorize(
    model: CategorizerModel | null,
    input: CategorizeInput,
    categories: AiCategory[],
  ): CategoryPrediction | null;

  /** « café 3,500 hier » → transaction structurée. */
  parseEntry(text: string, ctx: ParseEntryContext): ParseEntryResult;

  detectAnomalies(input: AnomalyInput): Anomaly[];
  detectRecurring(input: RecurringDetectInput): RecurringCandidate[];
  forecastBalance(input: ForecastInput): BalanceForecast;
  suggestBudgets(input: BudgetSuggestInput): BudgetSuggestion[];

  /** Assistant : intention + extraction d'entités, puis appel des outils typés. */
  ask(question: string, ctx: AssistantContext, tools: FinanceTools): Promise<AssistantAnswer>;
  /** Questions d'exemple pour l'assistant. */
  exampleQuestions(): string[];

  monthlySummary(input: MonthlySummaryInput): MonthlySummary;
  simulateWhatIf(input: WhatIfInput): WhatIfResult;
  healthScore(input: HealthInput): HealthScore;
}
