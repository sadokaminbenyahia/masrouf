// Propriétaire : agent K — implémentation serveur des outils typés de l'assistant (scopés userId)
import 'server-only';
import type { BalanceForecast, FinanceTools } from '@/domain/ai/types';
import { notImplemented } from './_stub';

/**
 * `deps` est injecté par ai.service (évite le cycle ai.service ↔ finance-tools).
 * Lectures de transactions via src/server/repositories/assistant.repo.ts (agent K).
 */
export interface FinanceToolsDeps {
  forecast: () => Promise<BalanceForecast>;
}

export function createFinanceTools(_userId: string, _deps: FinanceToolsDeps): FinanceTools {
  return notImplemented('createFinanceTools');
}
