// Propriétaire : agent J — classifieur naïf bayésien multinomial + règles de démarrage
import { notImplemented } from './_stub';
import type {
  AiCategory,
  CategorizeInput,
  CategorizerModel,
  CategoryPrediction,
  TrainingSample,
} from './types';

export const CATEGORIZER_VERSION = 1;

export function trainCategorizer(_samples: TrainingSample[]): CategorizerModel {
  return notImplemented('trainCategorizer');
}
export function learnCorrection(
  _model: CategorizerModel,
  _sample: TrainingSample,
  _previousCategoryId: string | null,
): CategorizerModel {
  return notImplemented('learnCorrection');
}
export function categorize(
  _model: CategorizerModel | null,
  _input: CategorizeInput,
  _categories: AiCategory[],
): CategoryPrediction | null {
  return notImplemented('categorize');
}
